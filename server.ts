import express, { type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import config, { isDiscordConfigured } from './src/config/config.ts';
import prisma from './src/database/prisma.ts';
import { startDiscordBot, stopDiscordBot, isBotOnline, getBotClient } from './src/bot/client.ts';
import VerificationService from './src/services/verificationService.ts';
import ReferralService from './src/services/referralService.ts';
import XpService from './src/services/xpService.ts';
import LeaderboardService from './src/services/leaderboardService.ts';
import InviteService from './src/services/inviteService.ts';
import GoogleWorkspaceService from './src/services/googleWorkspaceService.ts';
import Logger from './src/utils/logger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Real-time Server-Sent Events (SSE) Subscribers
const sseClients = new Set<Response>();

export function broadcastRealtimeEvent(type: string, data: any = {}) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Real-time SSE Stream
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 2. Health & Status
  app.get('/api/status', async (req, res) => {
    try {
      const [userCount, referralCount, txCount, pendingCount, validCount, sheetSetting] = await Promise.all([
        prisma.user.count(),
        prisma.referral.count(),
        prisma.xPTransaction.count(),
        prisma.referral.count({ where: { status: 'PENDING' } }),
        prisma.referral.count({ where: { status: 'VALID' } }),
        prisma.systemSetting.findUnique({ where: { key: 'google_spreadsheet_id' } }),
      ]);

      const client = getBotClient();

      res.json({
        ok: true,
        botOnline: isBotOnline(),
        botUser: client?.user ? { tag: client.user.tag, id: client.user.id } : null,
        discordConfigured: isDiscordConfigured(),
        guilds: client ? Array.from(client.guilds.cache.values()).map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount })) : [],
        config: {
          xpVerification: config.xpVerification,
          xpReferral: config.xpReferral,
          guildId: config.discordGuildId || 'Not set',
          newMemberRoleId: config.newMemberRoleId || 'Not set',
          communityMemberRoleId: config.communityMemberRoleId || 'Not set',
          botLogChannelId: config.botLogChannelId || 'Not set',
        },
        counts: {
          users: userCount,
          referrals: referralCount,
          transactions: txCount,
          pendingReferrals: pendingCount,
          validReferrals: validCount,
        },
        googleSheet: {
          linked: Boolean(sheetSetting?.value),
          spreadsheetId: sheetSetting?.value || null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Bot start/stop control
  app.post('/api/bot/start', async (req, res) => {
    try {
      if (!isDiscordConfigured()) {
        return res.status(400).json({
          ok: false,
          error: 'DISCORD_TOKEN is missing or empty. Please add your token in .env or the Secrets panel.',
        });
      }
      await startDiscordBot();
      broadcastRealtimeEvent('BOT_STATUS', { online: true });
      res.json({ ok: true, message: 'Discord bot started successfully.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/bot/stop', async (req, res) => {
    try {
      await stopDiscordBot();
      broadcastRealtimeEvent('BOT_STATUS', { online: false });
      res.json({ ok: true, message: 'Discord bot stopped.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Get active Discord guild channels
  app.get('/api/bot/channels', async (req, res) => {
    try {
      const client = getBotClient();
      if (!client || !config.discordGuildId) {
        return res.json({ channels: [] });
      }
      const guild = client.guilds.cache.get(config.discordGuildId);
      if (!guild) return res.json({ channels: [] });

      const channels = Array.from(guild.channels.cache.values())
        .filter((c: any) => c.isTextBased && c.isTextBased())
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          parent: c.parent?.name || null,
        }));

      res.json({ channels });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Post Verification button embed into a specified channel
  app.post('/api/bot/post-verify-embed', async (req, res) => {
    try {
      const { channelId } = req.body;
      const client = getBotClient();
      if (!client) return res.status(400).json({ error: 'Discord bot is not currently online.' });

      if (!channelId) {
        return res.status(400).json({ error: 'channelId is required.' });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        return res.status(400).json({ error: 'Invalid or unreachable text channel.' });
      }

      const { createVerificationButtonRow } = await import('./src/commands/verify.ts');
      const { EmbedBuilder } = await import('discord.js');

      const guild = (channel as any).guild;

      const embed = new EmbedBuilder()
        .setTitle('🛡️ UPRISE COMMUNITY VERIFICATION')
        .setColor(0x4f46e5)
        .setDescription(
          `Welcome to **UPRISE**!\n\n` +
          `To unlock full community access, claim your **+100 XP** welcome bonus, and receive the **@Community Member** role:\n\n` +
          `👉 Click the **[ VERIFY ]** button below or run \`/verify\`.\n\n` +
          `• **If you were invited:** Your inviter will receive **+250 XP**!\n` +
          `• **Anti-Fraud Guard:** Leaves before verification cancel pending rewards.`
        )
        .setThumbnail(guild?.iconURL() || client.user?.displayAvatarURL() || null)
        .setFooter({ text: 'UPRISE Security & Attribution Gateway' })
        .setTimestamp(new Date());

      const row = createVerificationButtonRow();
      await (channel as any).send({ embeds: [embed], components: [row] });

      await Logger.log({
        type: 'ADMIN',
        title: 'Verification Embed Deployed',
        message: `Posted [ VERIFY ] button embed in #${(channel as any).name} (${channel.id}).`,
      });

      res.json({ ok: true, message: `Verification button posted in #${(channel as any).name}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Post interactive leaderboard embed into a specified channel
  app.post('/api/bot/post-leaderboard-embed', async (req, res) => {
    try {
      const { channelId } = req.body;
      const client = getBotClient();
      if (!client) return res.status(400).json({ error: 'Discord bot is not currently online.' });

      if (!channelId) {
        return res.status(400).json({ error: 'channelId is required.' });
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        return res.status(400).json({ error: 'Invalid or unreachable text channel.' });
      }

      await LeaderboardService.updateChannelLeaderboard(client);

      res.json({ ok: true, message: `Leaderboard updated in #${(channel as any).name}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. System Settings (Google Spreadsheet Link & App Config)
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await prisma.systemSetting.findMany();
      const settingsMap: Record<string, string> = {};
      for (const s of settings) {
        settingsMap[s.key] = s.value;
      }
      res.json(settingsMap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Key is required' });

      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: value || '' },
        create: { key, value: value || '' },
      });

      broadcastRealtimeEvent('SETTINGS_UPDATED', { key, value });
      res.json({ ok: true, key, value });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. MEMBERS MANAGEMENT (Full Real CRUD + Discord Guild Live Sync)
  app.get('/api/members', async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        orderBy: [{ xp: 'desc' }, { createdAt: 'desc' }],
        include: {
          referralReceived: {
            include: { inviter: true },
          },
          _count: {
            select: { referralsGiven: true, xpTransactions: true },
          },
        },
      });

      // Fetch live Discord guild members if bot is online
      const client = getBotClient();
      let discordGuildMembers: Array<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        roles: string[];
        isBot: boolean;
        inDatabase: boolean;
      }> = [];

      if (client && config.discordGuildId) {
        const guild = client.guilds.cache.get(config.discordGuildId);
        if (guild) {
          try {
            const fetched = await guild.members.fetch({ limit: 100 });
            const dbIds = new Set(users.map(u => u.discordId));
            discordGuildMembers = fetched.map(m => ({
              id: m.id,
              username: m.user.username,
              displayName: m.displayName,
              avatarUrl: m.user.displayAvatarURL({ size: 64 }),
              roles: Array.from(m.roles.cache.values()).map(r => r.name).filter(n => n !== '@everyone'),
              isBot: m.user.bot,
              inDatabase: dbIds.has(m.id),
            }));
          } catch (e: any) {
            console.warn('[Members API] Failed to fetch guild members:', e.message);
          }
        }
      }

      res.json({ users, discordGuildMembers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create member manually
  app.post('/api/members', async (req, res) => {
    try {
      const { discordId, username, fullName, email, xp } = req.body;
      if (!discordId || !username) {
        return res.status(400).json({ error: 'discordId and username are required' });
      }

      const initialXp = parseInt(xp || '0', 10);

      const existing = await prisma.user.findUnique({ where: { discordId } });
      if (existing) {
        return res.status(400).json({ error: 'A member with this Discord ID already exists' });
      }

      const user = await prisma.user.create({
        data: {
          discordId,
          username,
          fullName: fullName || null,
          email: email || null,
          xp: initialXp,
          verifiedAt: initialXp > 0 ? new Date() : null,
        },
      });

      if (initialXp > 0) {
        await prisma.xPTransaction.create({
          data: {
            userId: user.id,
            amount: initialXp,
            reason: 'ADMIN_MANUAL_REGISTRATION',
          },
        });
      }

      await Logger.log({
        type: 'ADMIN',
        title: 'Member Added Manually',
        message: `Registered @${username} (${discordId}) with ${initialXp} XP.`,
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('MEMBER_CREATED', user);

      res.json({ ok: true, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update member
  app.put('/api/members/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { username, fullName, email, xp } = req.body;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ error: 'User not found' });

      const newXp = xp !== undefined ? parseInt(xp, 10) : user.xp;
      const xpDiff = newXp - user.xp;

      const updated = await prisma.user.update({
        where: { id },
        data: {
          username: username || user.username,
          fullName: fullName !== undefined ? fullName : user.fullName,
          email: email !== undefined ? email : user.email,
          xp: newXp,
        },
      });

      if (xpDiff !== 0) {
        await prisma.xPTransaction.create({
          data: {
            userId: user.id,
            amount: xpDiff,
            reason: 'ADMIN_MANUAL_ADJUSTMENT',
          },
        });

        await Logger.log({
          type: 'ADMIN',
          title: 'Member XP Updated',
          message: `Updated @${updated.username}: ${user.xp} -> ${newXp} XP (${xpDiff > 0 ? '+' : ''}${xpDiff} XP)`,
        });

        LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      }

      broadcastRealtimeEvent('MEMBER_UPDATED', updated);
      res.json({ ok: true, user: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete / Remove member
  app.delete('/api/members/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          referralReceived: { include: { inviter: true } },
          referralsGiven: true,
        },
      });

      if (!user) return res.status(404).json({ error: 'User not found' });

      // If user had a valid referral, deduct 250 XP penalty from inviter
      if (user.referralReceived && user.referralReceived.status === 'VALID' && user.referralReceived.inviter) {
        const inviter = user.referralReceived.inviter;
        const penalty = Math.min(250, inviter.xp);
        if (penalty > 0) {
          await XpService.awardXp({
            userId: inviter.id,
            amount: -penalty,
            reason: 'REFERRAL_REMOVED_PENALTY',
            referralId: user.referralReceived.id,
          });
        }
      }

      await prisma.user.delete({ where: { id } });

      await Logger.log({
        type: 'ADMIN',
        title: 'Member Removed',
        message: `Deleted member @${user.username} (${user.discordId}) from database.`,
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('MEMBER_DELETED', { id, username: user.username });

      res.json({ ok: true, message: `Member ${user.username} deleted successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. REFERRALS MANAGEMENT (Full Real CRUD)
  app.get('/api/referrals', async (req, res) => {
    try {
      const referrals = await prisma.referral.findMany({
        orderBy: { joinedAt: 'desc' },
        include: {
          inviter: true,
          invitee: true,
        },
      });
      res.json(referrals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create referral manually
  app.post('/api/referrals', async (req, res) => {
    try {
      const { inviterId, inviteeId, inviteCode, status } = req.body;
      if (!inviteeId) return res.status(400).json({ error: 'inviteeId is required' });

      const existing = await prisma.referral.findUnique({ where: { inviteeId } });
      if (existing) {
        return res.status(400).json({ error: 'This invitee already has a referral record.' });
      }

      const referralStatus = status || 'PENDING';
      const now = new Date();

      const referral = await prisma.referral.create({
        data: {
          inviterId: inviterId || null,
          inviteeId,
          inviteCode: inviteCode || null,
          status: referralStatus,
          joinedAt: now,
          verifiedAt: referralStatus === 'VALID' ? now : null,
          rewardedAt: referralStatus === 'VALID' ? now : null,
        },
        include: { inviter: true, invitee: true },
      });

      // If created directly as VALID and has inviter, award referral XP to inviter
      if (referralStatus === 'VALID' && inviterId) {
        await XpService.awardXp({
          userId: inviterId,
          amount: config.xpReferral,
          reason: 'SUCCESSFUL_REFERRAL',
          referralId: referral.id,
        });
      }

      await Logger.log({
        type: 'ADMIN',
        title: 'Referral Created Manually',
        message: `Created referral: Inviter ${referral.inviter?.username || 'Direct'} -> Invitee ${referral.invitee.username} [Status: ${referralStatus}]`,
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('REFERRAL_CREATED', referral);

      res.json({ ok: true, referral });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update referral (change status: VALID, PENDING, INVALID)
  app.put('/api/referrals/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['VALID', 'PENDING', 'INVALID'].includes(status)) {
        return res.status(400).json({ error: 'Status must be VALID, PENDING, or INVALID' });
      }

      const referral = await prisma.referral.findUnique({
        where: { id },
        include: { inviter: true, invitee: true },
      });

      if (!referral) return res.status(404).json({ error: 'Referral not found' });

      const oldStatus = referral.status;
      const now = new Date();

      // If transitioning to VALID from PENDING or INVALID: award inviter +250 XP
      if (status === 'VALID' && oldStatus !== 'VALID' && referral.inviterId) {
        await XpService.awardXp({
          userId: referral.inviterId,
          amount: config.xpReferral,
          reason: 'SUCCESSFUL_REFERRAL',
          referralId: referral.id,
        });
      }

      // If transitioning from VALID to INVALID or PENDING: deduct 250 XP from inviter
      if (oldStatus === 'VALID' && status !== 'VALID' && referral.inviterId) {
        const inviter = await prisma.user.findUnique({ where: { id: referral.inviterId } });
        if (inviter && inviter.xp > 0) {
          const deduction = Math.min(config.xpReferral, inviter.xp);
          await XpService.awardXp({
            userId: referral.inviterId,
            amount: -deduction,
            reason: 'REFERRAL_REVOKED_PENALTY',
            referralId: referral.id,
          });
        }
      }

      const updated = await prisma.referral.update({
        where: { id },
        data: {
          status,
          verifiedAt: status === 'VALID' ? (referral.verifiedAt || now) : null,
          rewardedAt: status === 'VALID' ? (referral.rewardedAt || now) : null,
        },
        include: { inviter: true, invitee: true },
      });

      await Logger.log({
        type: 'ADMIN',
        title: 'Referral Status Changed',
        message: `Referral ${referral.invitee.username}: ${oldStatus} -> ${status}`,
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('REFERRAL_UPDATED', updated);

      res.json({ ok: true, referral: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete referral
  app.delete('/api/referrals/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const referral = await prisma.referral.findUnique({
        where: { id },
        include: { inviter: true, invitee: true },
      });

      if (!referral) return res.status(404).json({ error: 'Referral not found' });

      // If was VALID, deduct inviter referral bonus
      if (referral.status === 'VALID' && referral.inviterId) {
        const inviter = await prisma.user.findUnique({ where: { id: referral.inviterId } });
        if (inviter && inviter.xp > 0) {
          const deduct = Math.min(config.xpReferral, inviter.xp);
          await XpService.awardXp({
            userId: referral.inviterId,
            amount: -deduct,
            reason: 'REFERRAL_DELETED_MANUAL',
            referralId: referral.id,
          });
        }
      }

      await prisma.referral.delete({ where: { id } });

      await Logger.log({
        type: 'ADMIN',
        title: 'Referral Deleted',
        message: `Deleted referral between @${referral.inviter?.username || 'Direct'} and @${referral.invitee.username}.`,
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('REFERRAL_DELETED', { id });

      res.json({ ok: true, message: 'Referral deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. REAL DISCORD INVITES & TRACKED CODES
  app.get('/api/invites', async (req, res) => {
    try {
      const tracked = await prisma.trackedInvite.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      const client = getBotClient();
      let discordInvites: Array<{
        code: string;
        uses: number;
        maxUses: number | null;
        inviterTag: string | null;
        inviterId: string | null;
        url: string;
        channelName: string | null;
      }> = [];

      if (client && config.discordGuildId) {
        const guild = client.guilds.cache.get(config.discordGuildId);
        if (guild) {
          try {
            const fetched = await guild.invites.fetch();
            discordInvites = fetched.map(inv => ({
              code: inv.code,
              uses: inv.uses || 0,
              maxUses: inv.maxUses || null,
              inviterTag: inv.inviter?.tag || null,
              inviterId: inv.inviter?.id || null,
              url: inv.url,
              channelName: inv.channel?.name || null,
            }));
          } catch (e: any) {
            console.warn('[Invites API] Failed to fetch guild invites:', e.message);
          }
        }
      }

      res.json({ tracked, discordInvites });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create invite (registers in DB and creates Discord invite if channel available)
  app.post('/api/invites', async (req, res) => {
    try {
      const { code, inviterDiscordId, createOnDiscord } = req.body;
      let finalCode = code?.trim();

      const client = getBotClient();
      if (createOnDiscord && client && config.discordGuildId) {
        const guild = client.guilds.cache.get(config.discordGuildId);
        if (guild) {
          const channel = guild.channels.cache.find(c => c.isTextBased());
          if (channel && 'createInvite' in channel) {
            const invite = await (channel as any).createInvite({
              maxAge: 0, // Never expires
              maxUses: 0, // Unlimited
              unique: true,
            });
            finalCode = invite.code;
          }
        }
      }

      if (!finalCode) {
        finalCode = `uprise-${Math.random().toString(36).substring(2, 7)}`;
      }

      const invite = await prisma.trackedInvite.upsert({
        where: { code: finalCode },
        update: { inviterDiscordId: inviterDiscordId || null },
        create: { code: finalCode, inviterDiscordId: inviterDiscordId || null, uses: 0 },
      });

      await Logger.log({
        type: 'ADMIN',
        title: 'Invite Code Registered',
        message: `Registered invite code '${finalCode}' mapped to inviter ${inviterDiscordId || 'Direct'}`,
      });

      broadcastRealtimeEvent('INVITE_CREATED', invite);
      res.json({ ok: true, invite });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete invite
  app.delete('/api/invites/:code', async (req, res) => {
    try {
      const { code } = req.params;

      // Try deleting from Discord guild if exists
      const client = getBotClient();
      if (client && config.discordGuildId) {
        const guild = client.guilds.cache.get(config.discordGuildId);
        if (guild) {
          try {
            const fetched = await guild.invites.fetch();
            const inv = fetched.find(i => i.code === code);
            if (inv) await inv.delete();
          } catch {}
        }
      }

      await prisma.trackedInvite.deleteMany({ where: { code } });
      broadcastRealtimeEvent('INVITE_DELETED', { code });

      res.json({ ok: true, message: `Invite code ${code} deleted.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. VERIFICATION FORM & EMAIL OTP WORKFLOW
  // Send OTP
  app.post('/api/verify/send-otp', async (req, res) => {
    try {
      const { email, fullName, discordId, username } = req.body;
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }

      // Generate secure 6-digit numeric OTP code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store in DB
      await prisma.oTPVerification.create({
        data: {
          email,
          otp: otpCode,
          fullName: fullName || null,
          discordId: discordId || null,
          expiresAt,
          verified: false,
        },
      });

      // If client provided Google access token via Authorization header, send email via Gmail API!
      const authHeader = req.headers.authorization;
      let emailSent = false;
      let gmailError = null;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          await GoogleWorkspaceService.sendOtpEmail(token, email, otpCode, fullName);
          emailSent = true;
        } catch (e: any) {
          gmailError = e.message;
        }
      }

      await Logger.log({
        type: 'VERIFICATION',
        title: 'Verification OTP Generated',
        message: `Sent OTP code to ${email} for @${username || discordId || 'New Member'}. (Email sent via Gmail: ${emailSent})`,
      });

      res.json({
        ok: true,
        message: emailSent
          ? `Verification code successfully sent to ${email}!`
          : `Verification code generated! (Enter code: ${otpCode})`,
        email,
        emailSent,
        // Provided for UI testing and immediate verification convenience
        otpPreview: otpCode,
        gmailError,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Confirm OTP and complete verification
  app.post('/api/verify/confirm-otp', async (req, res) => {
    try {
      const { email, otp, discordId, username, fullName } = req.body;

      if (!email || !otp || !discordId) {
        return res.status(400).json({ error: 'email, otp, and discordId are required' });
      }

      // Find matching OTP record
      const otpRecord = await prisma.oTPVerification.findFirst({
        where: {
          email,
          otp: otp.trim(),
          verified: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otpRecord) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid or expired verification code. Please request a new code.',
        });
      }

      // Mark OTP record as verified
      await prisma.oTPVerification.update({
        where: { id: otpRecord.id },
        data: { verified: true },
      });

      // Extract Google access token from Authorization header if present
      const authHeader = req.headers.authorization;
      const googleAccessToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

      // Find GuildMember in Discord if bot is online
      const client = getBotClient();
      let guildMember = null;
      if (client && config.discordGuildId) {
        const guild = client.guilds.cache.get(config.discordGuildId);
        if (guild) {
          guildMember = await guild.members.fetch(discordId).catch(() => null);
        }
      }

      // Execute verification pipeline with full name and email
      const verifyResult = await VerificationService.verifyMember({
        discordId,
        username: username || guildMember?.user?.username || `User_${discordId.slice(-4)}`,
        fullName: fullName || otpRecord.fullName || null,
        email,
        guildMember,
        googleAccessToken,
      });

      broadcastRealtimeEvent('MEMBER_VERIFIED', verifyResult);

      res.json({
        ok: true,
        verifyResult,
        message: 'Account successfully verified! +100 XP awarded and roles updated.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. GOOGLE SHEETS SYNC ENDPOINTS
  // Create spreadsheet
  app.post('/api/sheets/create', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Google Access Token is required in Authorization header' });
      }
      const token = authHeader.substring(7);

      const sheet = await GoogleWorkspaceService.createCommunitySpreadsheet(token);

      // Save spreadsheet ID in settings
      await prisma.systemSetting.upsert({
        where: { key: 'google_spreadsheet_id' },
        update: { value: sheet.id },
        create: { key: 'google_spreadsheet_id', value: sheet.id },
      });

      await prisma.systemSetting.upsert({
        where: { key: 'google_spreadsheet_url' },
        update: { value: sheet.url },
        create: { key: 'google_spreadsheet_url', value: sheet.url },
      });

      await Logger.log({
        type: 'ADMIN',
        title: 'Google Spreadsheet Created',
        message: `Linked Google Sheet: ${sheet.url}`,
      });

      broadcastRealtimeEvent('SETTINGS_UPDATED', { key: 'google_spreadsheet_id', value: sheet.id });

      res.json({ ok: true, sheet });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sync all database data into Google Sheet
  app.post('/api/sheets/sync', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Google Access Token is required in Authorization header' });
      }
      const token = authHeader.substring(7);

      const sheetSetting = await prisma.systemSetting.findUnique({
        where: { key: 'google_spreadsheet_id' },
      });

      if (!sheetSetting?.value) {
        return res.status(400).json({ error: 'No Google Spreadsheet is currently linked. Create or link one first.' });
      }

      const spreadsheetId = sheetSetting.value;

      // 1. Fetch all users
      const users = await prisma.user.findMany({
        include: {
          referralReceived: { include: { inviter: true } },
        },
      });

      const memberRows = users.map(u => ({
        verifiedAt: u.verifiedAt ? u.verifiedAt.toISOString() : '',
        fullName: u.fullName || '',
        email: u.email || '',
        username: u.username,
        discordId: u.discordId,
        inviterUsername: u.referralReceived?.inviter?.username || 'Direct',
        inviterDiscordId: u.referralReceived?.inviter?.discordId || '',
        inviteCode: u.referralReceived?.inviteCode || '',
        xpEarned: u.xp,
        status: u.verifiedAt ? 'VERIFIED' : 'UNVERIFIED',
      }));

      // 2. Fetch all referrals
      const referrals = await prisma.referral.findMany({
        include: { inviter: true, invitee: true },
        orderBy: { joinedAt: 'desc' },
      });

      const referralRows = referrals.map(r => ({
        id: r.id,
        inviterDiscordId: r.inviter?.discordId || '',
        inviterUsername: r.inviter?.username || 'Direct',
        inviteeDiscordId: r.invitee.discordId,
        inviteeUsername: r.invitee.username,
        inviteCode: r.inviteCode || '',
        status: r.status,
        joinedAt: r.joinedAt.toISOString(),
        verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : 'Pending',
      }));

      // 3. Fetch all XP transactions
      const transactions = await prisma.xPTransaction.findMany({
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });

      const txRows = transactions.map(t => ({
        id: t.id,
        discordId: t.user.discordId,
        username: t.user.username,
        amount: t.amount,
        reason: t.reason,
        createdAt: t.createdAt.toISOString(),
      }));

      const syncResult = await GoogleWorkspaceService.syncAllData(
        token,
        spreadsheetId,
        memberRows,
        referralRows,
        txRows
      );

      await Logger.log({
        type: 'ADMIN',
        title: 'Google Sheet Synchronized',
        message: `Pushed ${syncResult.membersCount} members, ${syncResult.referralsCount} referrals, and ${syncResult.transactionsCount} XP transactions to Google Sheets.`,
      });

      res.json({ ok: true, syncResult, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. LEADERBOARD
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = parseInt(req.query.pageSize as string, 10) || 10;
      const data = await LeaderboardService.getGlobalLeaderboard(page, pageSize);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. XP TRANSACTIONS LEDGER
  app.get('/api/transactions', async (req, res) => {
    try {
      const transactions = await XpService.getAllTransactions(100);
      res.json(transactions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin manual XP adjustment
  app.post('/api/transactions/adjust', async (req, res) => {
    try {
      const { discordId, amount, reason } = req.body;
      if (!discordId || amount === undefined) {
        return res.status(400).json({ error: 'discordId and amount are required' });
      }

      const numAmount = parseInt(amount, 10);
      const user = await prisma.user.findUnique({ where: { discordId } });
      if (!user) return res.status(404).json({ error: 'Member not found' });

      const result = await XpService.awardXp({
        userId: user.id,
        amount: numAmount,
        reason: reason || 'ADMIN_MANUAL_ADJUSTMENT',
      });

      LeaderboardService.updateChannelLeaderboard(getBotClient()).catch(() => {});
      broadcastRealtimeEvent('MEMBER_UPDATED', result.user);

      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. BOT LOGS FEED
  app.get('/api/logs', async (req, res) => {
    try {
      const logs = await prisma.botLog.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = config.port || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 UPRISE Server running at http://0.0.0.0:${port}`);

    // If discord token is set, boot bot automatically
    if (isDiscordConfigured()) {
      startDiscordBot().catch((e) => {
        console.warn('[UPRISE Bot] Startup on server launch failed:', e.message);
      });
    }
  });
}

startServer().catch((err) => {
  console.error('Fatal server boot error:', err);
  process.exit(1);
});

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import config, { isDiscordConfigured } from './src/config/config.js';
import prisma from './src/database/prisma.js';
import { startDiscordBot, stopDiscordBot, isBotOnline, getBotClient } from './src/bot/client.js';
import VerificationService from './src/services/verificationService.js';
import ReferralService from './src/services/referralService.js';
import XpService from './src/services/xpService.js';
import LeaderboardService from './src/services/leaderboardService.js';
import InviteService from './src/services/inviteService.js';
import Logger from './src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Health & Status
  app.get('/api/status', async (req, res) => {
    try {
      const [userCount, referralCount, txCount, pendingCount, validCount] = await Promise.all([
        prisma.user.count(),
        prisma.referral.count(),
        prisma.xPTransaction.count(),
        prisma.referral.count({ where: { status: 'PENDING' } }),
        prisma.referral.count({ where: { status: 'VALID' } }),
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
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 2. Bot start/stop control
  app.post('/api/bot/start', async (req, res) => {
    try {
      if (!isDiscordConfigured()) {
        return res.status(400).json({
          ok: false,
          error: 'DISCORD_TOKEN is missing or empty. Please add your token in .env or the Secrets panel.',
        });
      }
      await startDiscordBot();
      res.json({ ok: true, message: 'Discord bot started successfully.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.post('/api/bot/stop', async (req, res) => {
    try {
      await stopDiscordBot();
      res.json({ ok: true, message: 'Discord bot stopped.' });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 3. Leaderboard
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

  // 4. Users list
  app.get('/api/users', async (req, res) => {
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
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Referrals list & stats
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

  // 6. Full XP Ledger (XPTransactions)
  app.get('/api/transactions', async (req, res) => {
    try {
      const transactions = await XpService.getAllTransactions(100);
      res.json(transactions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Tracked Invites
  app.get('/api/invites', async (req, res) => {
    try {
      const invites = await prisma.trackedInvite.findMany({
        orderBy: { updatedAt: 'desc' },
      });
      res.json(invites);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/invites', async (req, res) => {
    try {
      const { code, inviterDiscordId } = req.body;
      if (!code) return res.status(400).json({ error: 'Invite code is required' });
      const invite = await InviteService.registerSimulatedInvite(code, inviterDiscordId || null);
      res.json(invite);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Bot Logs (#bot-logs audit feed)
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

  // 9. Interactive Simulator Endpoints
  // Simulate member join via invite
  app.post('/api/simulate/join', async (req, res) => {
    try {
      const { inviteeDiscordId, inviteeUsername, inviteCode, isDirectJoin } = req.body;

      if (!inviteeDiscordId || !inviteeUsername) {
        return res.status(400).json({ error: 'inviteeDiscordId and inviteeUsername are required' });
      }

      let inviterDiscordId: string | null = null;
      let inviterUsername: string | null = null;

      if (!isDirectJoin && inviteCode) {
        // Look up invite code
        const invite = await prisma.trackedInvite.findUnique({
          where: { code: inviteCode },
        });

        if (invite) {
          // Increment usage counter
          await InviteService.incrementInviteUsage(inviteCode);
          inviterDiscordId = invite.inviterDiscordId;

          if (inviterDiscordId) {
            const inviter = await prisma.user.findUnique({
              where: { discordId: inviterDiscordId },
            });
            inviterUsername = inviter?.username || null;
          }
        }
      }

      const referral = await ReferralService.recordMemberJoin({
        inviteeDiscordId,
        inviteeUsername,
        inviterDiscordId,
        inviterUsername,
        inviteCode: isDirectJoin ? null : inviteCode,
      });

      res.json({
        ok: true,
        referral,
        message: inviterDiscordId
          ? `Joined using invite ${inviteCode} by ${inviterUsername || inviterDiscordId}. Referral status: PENDING.`
          : 'Joined directly (no inviter). Referral status: PENDING.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Simulate member clicking [ VERIFY ] button or executing /verify
  app.post('/api/simulate/verify', async (req, res) => {
    try {
      const { discordId, username } = req.body;
      if (!discordId) return res.status(400).json({ error: 'discordId is required' });

      const result = await VerificationService.verifyMember({
        discordId,
        username: username || `User_${discordId.slice(-4)}`,
      });

      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Simulate member leaving before verification
  app.post('/api/simulate/leave', async (req, res) => {
    try {
      const { discordId, username } = req.body;
      if (!discordId) return res.status(400).json({ error: 'discordId is required' });

      const result = await ReferralService.handleMemberLeave(discordId, username || 'Member');
      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Simulate staff manual XP adjustment (/admin-xp)
  app.post('/api/simulate/admin-xp', async (req, res) => {
    try {
      const { discordId, amount, reason, adminUsername } = req.body;
      if (!discordId || amount === undefined || !reason) {
        return res.status(400).json({ error: 'discordId, amount, and reason are required' });
      }

      const result = await XpService.adminAdjustXp(
        discordId,
        parseInt(amount, 10),
        reason,
        adminUsername || 'Founder'
      );

      res.json({ ok: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Seed sample community data
  app.post('/api/seed', async (req, res) => {
    try {
      // 1. Create Founder / Anurag
      const anurag = await XpService.getOrCreateUser('1001', 'Anurag');
      await prisma.user.update({
        where: { id: anurag.id },
        data: { xp: 2450 },
      });
      // Initial transaction
      await prisma.xPTransaction.create({
        data: {
          userId: anurag.id,
          amount: 2450,
          reason: 'COMMUNITY_FOUNDER_GRANT',
        },
      });

      // 2. Create Priya
      const priya = await XpService.getOrCreateUser('1002', 'Priya');
      await prisma.user.update({
        where: { id: priya.id },
        data: { xp: 2100 },
      });
      await prisma.xPTransaction.create({
        data: {
          userId: priya.id,
          amount: 2100,
          reason: 'FOUNDING_MEMBER_GRANT',
        },
      });

      // 3. Create Rahul
      const rahul = await XpService.getOrCreateUser('1003', 'Rahul');
      await prisma.user.update({
        where: { id: rahul.id },
        data: { xp: 1850 },
      });
      await prisma.xPTransaction.create({
        data: {
          userId: rahul.id,
          amount: 1850,
          reason: 'EARLY_CONTRIBUTOR_GRANT',
        },
      });

      // 4. Create sample invite codes
      await prisma.trackedInvite.upsert({
        where: { code: 'uprise-anurag' },
        update: { inviterDiscordId: '1001', uses: 8 },
        create: { code: 'uprise-anurag', inviterDiscordId: '1001', uses: 8 },
      });

      await prisma.trackedInvite.upsert({
        where: { code: 'uprise-priya' },
        update: { inviterDiscordId: '1002', uses: 5 },
        create: { code: 'uprise-priya', inviterDiscordId: '1002', uses: 5 },
      });

      await Logger.log({
        type: 'ADMIN',
        title: 'Initial Seed Loaded',
        message: 'Loaded sample community members: Anurag, Priya, Rahul and tracked invite codes.',
      });

      res.json({ ok: true, message: 'Seeded successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reset database test data
  app.post('/api/simulate/reset', async (req, res) => {
    try {
      await prisma.xPTransaction.deleteMany();
      await prisma.referral.deleteMany();
      await prisma.user.deleteMany();
      await prisma.trackedInvite.deleteMany();
      await prisma.botLog.deleteMany();

      res.json({ ok: true, message: 'Database reset successfully' });
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

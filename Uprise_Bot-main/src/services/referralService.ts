import { EmbedBuilder, Guild } from 'discord.js';
import prisma from '../database/prisma.ts';
import XpService from './xpService.ts';
import LeaderboardService from './leaderboardService.ts';
import Logger from '../utils/logger.ts';
import config from '../config/config.ts';

export interface CreatePendingReferralInput {
  inviteeDiscordId: string;
  inviteeUsername: string;
  inviterDiscordId?: string | null;
  inviterUsername?: string | null;
  inviteCode?: string | null;
  isBot?: boolean;
}

export class ReferralService {
  /**
   * Records member join and sets up a PENDING referral if an inviter was detected.
   * Enforces bot checks, self-referral checks, and idempotency.
   */
  public static async recordMemberJoin(input: CreatePendingReferralInput) {
    const { inviteeDiscordId, inviteeUsername, inviterDiscordId, inviterUsername, inviteCode, isBot } = input;

    // 1. Guard against bot accounts
    if (isBot) {
      console.log(`[ReferralService] Skipping referral record for bot account: ${inviteeUsername} (${inviteeDiscordId})`);
      return null;
    }

    // 2. Ensure invitee user exists in database
    const invitee = await XpService.getOrCreateUser(inviteeDiscordId, inviteeUsername);

    // 3. Check if invitee already has a referral record
    const existingReferral = await prisma.referral.findUnique({
      where: { inviteeId: invitee.id },
      include: { inviter: true },
    });

    // 4. Handle self-referral attempt
    let inviterUser = null;
    if (inviterDiscordId) {
      if (inviterDiscordId === inviteeDiscordId) {
        console.warn(`[ReferralService] Self-referral detected: ${inviteeUsername} attempted to invite themselves.`);
        await Logger.log({
          type: 'INVITE_DETECTED',
          title: 'Self-Referral Blocked',
          message: `${inviteeUsername} joined using their own invite (${inviteCode || 'N/A'}). No referral will be credited.`,
          metadata: {
            invitee: inviteeUsername,
            discordId: inviteeDiscordId,
            inviteCode: inviteCode || 'N/A',
          },
        });
        inviterUser = null; // Do not link inviter
      } else {
        // Ensure inviter exists
        inviterUser = await XpService.getOrCreateUser(
          inviterDiscordId,
          inviterUsername || `DiscordUser_${inviterDiscordId.slice(-4)}`
        );
      }
    }

    if (existingReferral) {
      if (existingReferral.status === 'INVALID') {
        // Member left previously and has rejoined: reset referral to PENDING for re-verification!
        const updatedReferral = await prisma.referral.update({
          where: { id: existingReferral.id },
          data: {
            inviterId: inviterUser ? inviterUser.id : existingReferral.inviterId,
            inviteCode: inviteCode || existingReferral.inviteCode,
            status: 'PENDING',
            joinedAt: new Date(),
            verifiedAt: null,
            rewardedAt: null,
          },
          include: {
            inviter: true,
            invitee: true,
          },
        });

        await Logger.log({
          type: 'JOIN',
          title: 'Member Rejoined (Re-verification Required)',
          message: `**@${invitee.username}** rejoined the server. Status set to **PENDING**. Member must click [ VERIFY ] to reverify.`,
          metadata: {
            invitee: invitee.username,
            inviteeDiscordId,
            inviter: inviterUser?.username || 'None',
            status: 'PENDING',
          },
        });

        return updatedReferral;
      }
      console.log(`[ReferralService] Invitee ${inviteeUsername} already has referral record (status: ${existingReferral.status})`);
      return existingReferral;
    }

    // 5. Create PENDING referral record
    const referral = await prisma.referral.create({
      data: {
        inviteeId: invitee.id,
        inviterId: inviterUser ? inviterUser.id : null,
        inviteCode: inviteCode || null,
        status: 'PENDING',
        joinedAt: new Date(),
      },
      include: {
        inviter: true,
        invitee: true,
      },
    });

    await Logger.log({
      type: 'REFERRAL_CREATED',
      title: 'New Member & Pending Referral',
      message: inviterUser
        ? `Inviter: @${inviterUser.username} | Invitee: @${invitee.username} | Invite: ${inviteCode || 'N/A'} (Status: PENDING)`
        : `Member @${invitee.username} joined (Direct/Unknown Inviter). Status: PENDING verification.`,
      metadata: {
        invitee: invitee.username,
        inviteeDiscordId,
        inviter: inviterUser?.username || 'Unknown / None',
        inviterDiscordId: inviterUser?.discordId || 'None',
        inviteCode: inviteCode || 'None',
        status: 'PENDING',
      },
    });

    return referral;
  }

  /**
   * When a user leaves the guild:
   * 1. Deducts 100 XP from the member who left (if they have XP).
   * 2. If they had a pending referral, marks it INVALID.
   * 3. If they had a verified referral, deducts 100 XP penalty from the inviter and updates referral status.
   */
  public static async handleMemberLeave(discordId: string, username: string) {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) return null;

    let memberDeducted = 0;
    let inviterDeducted = 0;
    let inviterUsername: string | null = null;
    let inviterDiscordId: string | null = null;

    // 1. Deduct 100 XP from the member who left
    if (user.xp > 0) {
      const deduct = Math.min(100, user.xp);
      await XpService.awardXp({
        userId: user.id,
        amount: -deduct,
        reason: 'MEMBER_LEFT',
      });
      memberDeducted = deduct;
    }

    // 2. Unverify the leaving user: clear verification so reverification is required on rejoin
    await prisma.xPTransaction.deleteMany({
      where: {
        userId: user.id,
        reason: 'NEW_MEMBER_VERIFICATION',
      },
    });

    // 3. Invalidate any PENDING referral
    const pendingReferral = await prisma.referral.findFirst({
      where: {
        inviteeId: user.id,
        status: 'PENDING',
      },
    });

    if (pendingReferral) {
      await prisma.referral.update({
        where: { id: pendingReferral.id },
        data: { status: 'INVALID' },
      });
    }

    // 3. Check for VALID referral and apply 150 XP leave penalty to inviter as well
    const validReferral = await prisma.referral.findFirst({
      where: {
        inviteeId: user.id,
        status: 'VALID',
        inviterId: { not: null },
      },
      include: {
        inviter: true,
      },
    });

    if (validReferral && validReferral.inviter) {
      const inviter = validReferral.inviter;
      inviterUsername = inviter.username;
      inviterDiscordId = inviter.discordId;

      let newInviterBalance = inviter.xp;

      if (inviter.xp > 0) {
        const deductInviter = Math.min(150, inviter.xp);
        const { user: updatedInviter } = await XpService.awardXp({
          userId: inviter.id,
          amount: -deductInviter,
          reason: 'REFERRAL_LEFT_PENALTY',
          referralId: validReferral.id,
        });
        inviterDeducted = deductInviter;
        newInviterBalance = updatedInviter.xp;
      }

      await prisma.referral.update({
        where: { id: validReferral.id },
        data: { status: 'INVALID' },
      });

      // Privately inform the inviter via Discord DM
      const discordClient = Logger.getDiscordClient();
      if (discordClient && inviterDiscordId) {
        try {
          const discordUser = await discordClient.users.fetch(inviterDiscordId).catch(() => null);
          if (discordUser) {
            const dmEmbed = new EmbedBuilder()
              .setTitle('⚠️ Referral Departure Notice')
              .setColor(0xef4444)
              .setDescription(
                `A member you referred (**@${username}**) has left the server.\n\n` +
                `• **Deduction:** \`-${inviterDeducted} XP\`\n` +
                `• **Current Balance:** \`${newInviterBalance} XP\`\n\n` +
                `*Referral bonuses are adjusted when an invited member leaves the server.*`
              )
              .setTimestamp(new Date())
              .setFooter({ text: 'UPRISE Community System' });

            await discordUser.send({ embeds: [dmEmbed] }).catch((e) => {
              console.warn(`[ReferralService] Could not send private DM to @${inviterUsername}: ${e.message}`);
            });
            console.log(`[ReferralService] Privately notified @${inviterUsername} of -${inviterDeducted} XP referral departure penalty`);
          }
        } catch (dmErr: any) {
          console.warn(`[ReferralService] DM dispatch error:`, dmErr.message);
        }
      }
    }

    await Logger.log({
      type: 'LEAVE',
      title: 'Member Departed (-100 XP)',
      message: `${username} left the server. Member XP: -${memberDeducted} XP.${
        inviterUsername ? ` Inviter @${inviterUsername} penalized: -${inviterDeducted} XP (informed privately via DM).` : ''
      }`,
      metadata: {
        username,
        discordId,
        memberDeducted,
        inviterUsername: inviterUsername || 'None',
        inviterDiscordId: inviterDiscordId || 'None',
        inviterDeducted,
      },
    });

    // Auto-update official leaderboard channel on departure
    LeaderboardService.updateChannelLeaderboard(Logger.getDiscordClient()).catch(() => {});

    return {
      user,
      memberDeducted,
      inviterDeducted,
      inviterUsername,
    };
  }

  /**
   * Proactively audits all active members against current Discord server members.
   * If any user with XP or an active referral has left the server, applies the leave penalty immediately.
   */
  public static async syncDepartedMembers(guild: Guild): Promise<number> {
    let departedCount = 0;
    try {
      const activeUsers = await prisma.user.findMany({
        where: {
          OR: [
            { xp: { gt: 0 } },
            { referralReceived: { status: 'VALID' } },
          ],
        },
      });

      for (const u of activeUsers) {
        const member = await guild.members.fetch(u.discordId).catch(() => null);
        if (!member) {
          console.log(`[ReferralService] Auto-sync detected departed member: ${u.username} (${u.discordId})`);
          await this.handleMemberLeave(u.discordId, u.username);
          departedCount++;
        }
      }
    } catch (err: any) {
      console.warn(`[ReferralService] syncDepartedMembers error: ${err.message}`);
    }
    return departedCount;
  }

  /**
   * Get referral statistics for /referrals command
   */
  public static async getReferralStats(discordId: string) {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      return {
        username: 'Unknown',
        successfulCount: 0,
        pendingCount: 0,
        invalidCount: 0,
        referralXpEarned: 0,
        referrals: [],
      };
    }

    const referrals = await prisma.referral.findMany({
      where: { inviterId: user.id },
      include: {
        invitee: { select: { username: true, discordId: true, xp: true } },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const successfulCount = referrals.filter((r) => r.status === 'VALID').length;
    const pendingCount = referrals.filter((r) => r.status === 'PENDING').length;
    const invalidCount = referrals.filter((r) => r.status === 'INVALID').length;

    // Calculate referral XP directly from XP transactions ledger for absolute auditability
    const referralTransactions = await prisma.xPTransaction.findMany({
      where: {
        userId: user.id,
        reason: 'SUCCESSFUL_REFERRAL',
      },
    });

    const referralXpEarned = referralTransactions.reduce((acc, curr) => acc + curr.amount, 0);

    return {
      username: user.username,
      successfulCount,
      pendingCount,
      invalidCount,
      referralXpEarned,
      referrals,
    };
  }

  /**
   * Inspect a referral for admin command (/admin-referral)
   */
  public static async inspectReferral(targetDiscordId: string) {
    const user = await prisma.user.findUnique({
      where: { discordId: targetDiscordId },
    });

    if (!user) {
      return null;
    }

    const asInvitee = await prisma.referral.findUnique({
      where: { inviteeId: user.id },
      include: { inviter: true },
    });

    const asInviterStats = await this.getReferralStats(targetDiscordId);

    return {
      user,
      asInvitee,
      referralsGiven: asInviterStats,
    };
  }
}

export default ReferralService;

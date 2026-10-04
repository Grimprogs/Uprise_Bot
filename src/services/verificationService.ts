import { GuildMember, EmbedBuilder } from 'discord.js';
import prisma from '../database/prisma.ts';
import XpService from './xpService.ts';
import LeaderboardService from './leaderboardService.ts';
import Logger from '../utils/logger.ts';
import config from '../config/config.ts';

export interface VerifyResult {
  success: boolean;
  alreadyVerified: boolean;
  message: string;
  inviteeXpAwarded: number;
  inviterXpAwarded: number;
  inviteeUsername: string;
  inviterUsername?: string | null;
  inviteCode?: string | null;
}

export class VerificationService {
  /**
   * Main verification pipeline.
   * Can be executed by Discord button interaction, /verify slash command, or web simulator.
   * Fully idempotent: will never award XP twice if executed multiple times.
   */
  public static async verifyMember(params: {
    discordId: string;
    username: string;
    guildMember?: GuildMember | null;
  }): Promise<VerifyResult> {
    const { discordId, username, guildMember } = params;

    // 1. Ensure user exists in database
    const user = await XpService.getOrCreateUser(discordId, username);

    // 2. Check if already verified in database (idempotency check)
    // We check if the user has an existing NEW_MEMBER_VERIFICATION XPTransaction
    const existingVerifyTx = await prisma.xPTransaction.findFirst({
      where: {
        userId: user.id,
        reason: 'NEW_MEMBER_VERIFICATION',
      },
    });

    if (existingVerifyTx) {
      console.log(`[VerificationService] User ${username} (${discordId}) already verified.`);
      // Sync Discord roles if guildMember provided, just in case
      await this.syncDiscordRoles(guildMember);

      return {
        success: true,
        alreadyVerified: true,
        message: 'You have already verified your account in UPRISE.',
        inviteeXpAwarded: 0,
        inviterXpAwarded: 0,
        inviteeUsername: user.username,
      };
    }

    // 3. Find referral record (if any) for this invitee
    const referral = await prisma.referral.findUnique({
      where: { inviteeId: user.id },
      include: { inviter: true },
    });

    const now = new Date();
    let inviterXpAwarded = 0;
    let inviterUsername: string | null = null;
    let inviteCode: string | null = referral?.inviteCode || null;

    // 4. Update referral status to VALID atomically
    if (referral && referral.status === 'PENDING') {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'VALID',
          verifiedAt: now,
          rewardedAt: now,
        },
      });

      // If there is an inviter and it's not a self-referral, award referral XP to inviter
      if (referral.inviter && referral.inviter.id !== user.id) {
        inviterUsername = referral.inviter.username;
        const inviterReward = await XpService.awardXp({
          userId: referral.inviter.id,
          amount: config.xpReferral, // Configurable: default 250 XP
          reason: 'SUCCESSFUL_REFERRAL',
          referralId: referral.id,
        });

        if (!inviterReward.duplicated) {
          inviterXpAwarded = config.xpReferral;

          // Send private DM notice to the inviter
          const discordClient = Logger.getDiscordClient();
          if (discordClient && referral.inviter.discordId) {
            try {
              const inviterDiscordUser = await discordClient.users.fetch(referral.inviter.discordId).catch(() => null);
              if (inviterDiscordUser) {
                const dmEmbed = new EmbedBuilder()
                  .setTitle('🎉 Referral Reward Claimed!')
                  .setColor(0x22c55e)
                  .setDescription(
                    `Congratulations! **@${user.username}** has verified their membership using your invite link.\n\n` +
                    `• **Reward Earned:** \`+${config.xpReferral} XP\`\n` +
                    `• **Your New Balance:** \`${inviterReward.user.xp} XP\`\n\n` +
                    `*Keep sharing your invite link to climb the UPRISE leaderboard!*`
                  )
                  .setTimestamp(new Date())
                  .setFooter({ text: 'UPRISE Referral Rewards' });

                await inviterDiscordUser.send({ embeds: [dmEmbed] }).catch(() => {});
              }
            } catch (err: any) {
              console.warn('[VerificationService] Inviter reward DM error:', err.message);
            }
          }
        }
      }
    }

    // 5. Award verification XP to the new verified member (+100 XP configurable)
    const inviteeReward = await XpService.awardXp({
      userId: user.id,
      amount: config.xpVerification, // Configurable: default 100 XP
      reason: 'NEW_MEMBER_VERIFICATION',
      referralId: referral?.id || null,
    });

    const inviteeXpAwarded = inviteeReward.duplicated ? 0 : config.xpVerification;

    // Send private DM notice to the verified member
    if (inviteeXpAwarded > 0) {
      const discordClient = Logger.getDiscordClient();
      if (discordClient && user.discordId) {
        try {
          const memberDiscordUser = await discordClient.users.fetch(user.discordId).catch(() => null);
          if (memberDiscordUser) {
            const memberDmEmbed = new EmbedBuilder()
              .setTitle('✅ Membership Verified!')
              .setColor(0x6366f1)
              .setDescription(
                `Welcome to **UPRISE**, **@${user.username}**!\n\n` +
                `• **Verification Bonus:** \`+${inviteeXpAwarded} XP\`\n` +
                `• **Role Unlocked:** \`@Community Member\`\n` +
                `• **Your Balance:** \`${inviteeReward.user.xp} XP\`\n\n` +
                `*You now have full access to community channels and events!*`
              )
              .setTimestamp(new Date())
              .setFooter({ text: 'UPRISE Community System' });

            await memberDiscordUser.send({ embeds: [memberDmEmbed] }).catch(() => {});
          }
        } catch (err: any) {
          console.warn('[VerificationService] Invitee reward DM error:', err.message);
        }
      }
    }

    // 6. Manage Discord Roles
    await this.syncDiscordRoles(guildMember);

    // 7. Audit log the verification event
    await Logger.log({
      type: 'REFERRAL_VALIDATED',
      title: 'Member Verified & Referral Validated',
      message: inviterUsername
        ? `REFERRAL VERIFIED\nInviter: @${inviterUsername} (+${inviterXpAwarded} XP)\nInvitee: @${user.username} (+${inviteeXpAwarded} XP)`
        : `MEMBER VERIFIED\nMember: @${user.username} (+${inviteeXpAwarded} XP)\nDirect / Unknown inviter`,
      metadata: {
        invitee: user.username,
        inviteeDiscordId: user.discordId,
        inviteeXp: inviteeXpAwarded,
        inviter: inviterUsername || 'None',
        inviterXp: inviterXpAwarded,
        inviteCode: inviteCode || 'Direct Join',
      },
    });

    // 8. Auto-update the official leaderboard channel
    LeaderboardService.updateChannelLeaderboard(Logger.getDiscordClient()).catch(() => {});

    return {
      success: true,
      alreadyVerified: false,
      message: `Welcome to UPRISE! You have verified successfully and received +${inviteeXpAwarded} XP.`,
      inviteeXpAwarded,
      inviterXpAwarded,
      inviteeUsername: user.username,
      inviterUsername,
      inviteCode,
    };
  }

  /**
   * Helper to safely assign Community Member role and remove New Member role
   */
  private static async syncDiscordRoles(guildMember?: GuildMember | null) {
    if (!guildMember) return;

    try {
      if (config.communityMemberRoleId) {
        await guildMember.roles.add(config.communityMemberRoleId).catch((err) => {
          console.warn('[VerificationService] Could not add community role:', err.message);
        });
      }
      if (config.newMemberRoleId) {
        await guildMember.roles.remove(config.newMemberRoleId).catch((err) => {
          console.warn('[VerificationService] Could not remove new member role:', err.message);
        });
      }
    } catch (e: any) {
      console.warn('[VerificationService] Role sync error:', e.message);
    }
  }
}

export default VerificationService;

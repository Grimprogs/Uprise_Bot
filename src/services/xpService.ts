import prisma from '../database/prisma.ts';
import Logger from '../utils/logger.ts';

export interface AwardXpOptions {
  userId: string;
  amount: number;
  reason: string;
  referralId?: string | null;
  adminId?: string;
}

export class XpService {
  /**
   * Atomic XP adjustment with mandatory XPTransaction creation.
   * Never modifies xp without recording an XPTransaction entry in the ledger.
   */
  public static async awardXp(options: AwardXpOptions) {
    const { userId, amount, reason, referralId, adminId } = options;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Fetch current user
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // 2. Prevent duplicate award for same referral and reason unless previously penalized on departure
      if (referralId && reason === 'SUCCESSFUL_REFERRAL') {
        const rewardTxs = await tx.xPTransaction.count({
          where: {
            userId,
            referralId,
            reason: 'SUCCESSFUL_REFERRAL',
          },
        });
        const penaltyTxs = await tx.xPTransaction.count({
          where: {
            userId,
            referralId,
            reason: 'REFERRAL_LEFT_PENALTY',
          },
        });

        if (rewardTxs > penaltyTxs) {
          const existingTx = await tx.xPTransaction.findFirst({
            where: { userId, referralId, reason: 'SUCCESSFUL_REFERRAL' },
            orderBy: { createdAt: 'desc' },
          });
          console.warn(`[XpService] Idempotency guard: User ${userId} already has active reward for referral ${referralId}`);
          return { user, transaction: existingTx!, duplicated: true };
        }
      }

      // 3. Prevent duplicate new member verification award
      if (reason === 'NEW_MEMBER_VERIFICATION') {
        const existingVerifyTx = await tx.xPTransaction.findFirst({
          where: {
            userId,
            reason: 'NEW_MEMBER_VERIFICATION',
          },
        });
        if (existingVerifyTx) {
          console.warn(`[XpService] Idempotency guard: User ${userId} already rewarded for NEW_MEMBER_VERIFICATION`);
          return { user, transaction: existingVerifyTx, duplicated: true };
        }
      }

      // 4. Calculate new balance
      const newXpBalance = Math.max(0, user.xp + amount);

      // 5. Update user XP
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { xp: newXpBalance },
      });

      // 6. Record transaction in XP ledger
      const transaction = await tx.xPTransaction.create({
        data: {
          userId,
          amount,
          reason,
          referralId: referralId || null,
        },
      });

      return { user: updatedUser, transaction, duplicated: false };
    });

    if (!result.duplicated) {
      await Logger.log({
        type: 'XP_AWARDED',
        title: 'XP Awarded',
        message: `${result.user.username} received ${amount >= 0 ? '+' : ''}${amount} XP (${reason}). New balance: ${result.user.xp} XP`,
        metadata: {
          username: result.user.username,
          discordId: result.user.discordId,
          amount,
          reason,
          newTotalXp: result.user.xp,
          referralId: referralId || 'None',
          adminId: adminId || 'System',
        },
      });
    }

    return result;
  }

  /**
   * Find or create user by Discord ID
   */
  public static async getOrCreateUser(discordId: string, username: string) {
    let user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          discordId,
          username,
          xp: 0,
        },
      });
    } else if (user.username !== username) {
      user = await prisma.user.update({
        where: { discordId },
        data: { username },
      });
    }

    return user;
  }

  /**
   * Admin manual adjustment with audit trail
   */
  public static async adminAdjustXp(discordId: string, amount: number, reason: string, adminUsername: string) {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      throw new Error(`User with Discord ID ${discordId} not found`);
    }

    const auditReason = `ADMIN_ADJUSTMENT: ${reason} (by ${adminUsername})`;

    const result = await this.awardXp({
      userId: user.id,
      amount,
      reason: auditReason,
      adminId: adminUsername,
    });

    await Logger.log({
      type: 'ADMIN',
      title: 'Admin XP Adjustment',
      message: `Admin ${adminUsername} adjusted ${user.username}'s XP by ${amount >= 0 ? '+' : ''}${amount} XP. Reason: ${reason}`,
      metadata: {
        admin: adminUsername,
        targetUser: user.username,
        targetDiscordId: user.discordId,
        adjustment: amount,
        finalXp: result.user.xp,
        reason,
      },
    });

    return result;
  }

  /**
   * Get all XP transactions for a user
   */
  public static async getUserTransactions(userId: string) {
    return prisma.xPTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { referral: true },
    });
  }

  /**
   * Get all transactions in system (for audit ledger)
   */
  public static async getAllTransactions(limit: number = 50) {
    return prisma.xPTransaction.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true, discordId: true } },
        referral: true,
      },
    });
  }
}

export default XpService;

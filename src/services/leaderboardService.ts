import prisma from '../database/prisma.js';

export interface LeaderboardEntry {
  rank: number;
  id: string;
  discordId: string;
  username: string;
  xp: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  totalUsers: number;
  totalPages: number;
  currentPage: number;
}

export class LeaderboardService {
  /**
   * Retrieves global leaderboard ordered by total XP descending with pagination
   */
  public static async getGlobalLeaderboard(page: number = 1, pageSize: number = 10): Promise<LeaderboardResult> {
    const validPage = Math.max(1, page);
    const validPageSize = Math.max(1, Math.min(50, pageSize));
    const skip = (validPage - 1) * validPageSize;

    const [totalUsers, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }],
        skip,
        take: validPageSize,
      }),
    ]);

    const entries: LeaderboardEntry[] = users.map((user, index) => ({
      rank: skip + index + 1,
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      xp: user.xp,
    }));

    const totalPages = Math.max(1, Math.ceil(totalUsers / validPageSize));

    return {
      entries,
      totalUsers,
      totalPages,
      currentPage: validPage,
    };
  }

  /**
   * Calculates the exact global rank of a user by Discord ID
   */
  public static async getUserRank(discordId: string) {
    const user = await prisma.user.findUnique({
      where: { discordId },
    });

    if (!user) {
      return null;
    }

    // Rank is 1 + count of users with higher XP (or same XP but created earlier)
    const higherXpCount = await prisma.user.count({
      where: {
        OR: [
          { xp: { gt: user.xp } },
          { AND: [{ xp: user.xp }, { createdAt: { lt: user.createdAt } }] },
        ],
      },
    });

    const rank = higherXpCount + 1;
    const totalUsers = await prisma.user.count();

    return {
      user,
      rank,
      totalUsers,
    };
  }
}

export default LeaderboardService;

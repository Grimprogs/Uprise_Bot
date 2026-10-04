import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../database/prisma.ts';

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

  /**
   * Syncs and updates the permanent leaderboard embed in the #🏆・leaderboard channel
   */
  public static async updateChannelLeaderboard(client?: Client | null): Promise<void> {
    if (!client || !client.user) return;

    try {
      for (const [_, guild] of client.guilds.cache) {
        const lbChannel = guild.channels.cache.find(
          (c) => c.isTextBased() && (c.name.includes('leaderboard') || c.id === '1556027994034937887')
        ) as TextChannel | undefined;

        if (!lbChannel || !lbChannel.isTextBased()) continue;

        // Fetch top 15 members
        const { entries, totalUsers } = await this.getGlobalLeaderboard(1, 15);

        const listContent = entries.length > 0
          ? entries
              .map((entry) => {
                const medal =
                  entry.rank === 1 ? '🥇 ' :
                  entry.rank === 2 ? '🥈 ' :
                  entry.rank === 3 ? '🥉 ' : `${entry.rank}. `;
                return `**${medal}${entry.username}** — \`${entry.xp.toLocaleString()} XP\``;
              })
              .join('\n')
          : '*No active entries yet.*';

        const embed = new EmbedBuilder()
          .setTitle('🏆 UPRISE GLOBAL LEADERBOARD')
          .setColor(0xf59e0b)
          .setDescription(
            `Official server rankings powered by the UPRISE Community Engine.\n\n` +
            `${listContent}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔍 **Check Your Personal Rank & XP**\n` +
            `Run \`/leaderboard\` or \`/xp\` anywhere — your response is **100% private to you**!`
          )
          .setFooter({
            text: `🔄 Live Auto-Updated • Total Members: ${totalUsers} • UPRISE Community`,
          })
          .setTimestamp(new Date());

        const messages = await lbChannel.messages.fetch({ limit: 10 }).catch(() => null);
        const botMsg = messages?.find((m) => m.author.id === client.user!.id);

        if (botMsg) {
          await botMsg.edit({ embeds: [embed] }).catch((err) => {
            console.warn('[LeaderboardService] Failed to edit leaderboard message:', err.message);
          });
        } else {
          await lbChannel.send({ embeds: [embed] }).catch((err) => {
            console.warn('[LeaderboardService] Failed to post leaderboard message:', err.message);
          });
        }
      }
    } catch (err: any) {
      console.warn('[LeaderboardService] Error updating channel leaderboard:', err.message);
    }
  }
}

export default LeaderboardService;

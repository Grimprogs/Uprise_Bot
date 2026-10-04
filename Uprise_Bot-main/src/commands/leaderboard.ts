import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import LeaderboardService from '../services/leaderboardService.ts';
import ReferralService from '../services/referralService.ts';

export const LEADERBOARD_PREV_ID = 'lb_prev';
export const LEADERBOARD_NEXT_ID = 'lb_next';

export function buildLeaderboardEmbed(
  entries: { rank: number; discordId: string; username: string; xp: number }[],
  currentPage: number,
  totalPages: number,
  totalUsers: number,
  callerRankInfo?: { user: { username: string; xp: number }; rank: number; totalUsers: number } | null,
  callerDiscordId?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🏆 UPRISE LEADERBOARD')
    .setColor(0xf59e0b); // Amber gold

  // 1. Prominent Personal Standing Card
  if (callerRankInfo && callerRankInfo.user) {
    const rank = callerRankInfo.rank;
    const xp = callerRankInfo.user.xp;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎖️';

    embed.addFields({
      name: `${medal} YOUR RANKING & XP`,
      value: `**Rank:** \`#${rank}\` of \`${callerRankInfo.totalUsers}\` members\n**Balance:** \`${xp.toLocaleString()} XP\`\n━━━━━━━━━━━━━━━━━━━━━━`,
      inline: false,
    });
  } else {
    embed.addFields({
      name: `🎖️ YOUR RANKING`,
      value: `You are not on the leaderboard yet. Verify your account with \`/verify\` or invite friends to earn points!\n━━━━━━━━━━━━━━━━━━━━━━`,
      inline: false,
    });
  }

  // 2. Main Page Leaderboard Entries
  const isCallerOnThisPage = callerDiscordId
    ? entries.some((e) => e.discordId === callerDiscordId)
    : false;

  let listDescription = entries.length > 0
    ? entries
        .map((entry) => {
          const isCaller = callerDiscordId && entry.discordId === callerDiscordId;
          const medal = entry.rank === 1 ? '🥇 ' : entry.rank === 2 ? '🥈 ' : entry.rank === 3 ? '🥉 ' : `${entry.rank}. `;
          const line = `${medal}**${entry.username}** — ${entry.xp.toLocaleString()} XP`;
          return isCaller ? `👉 __${line}__ *(You)*` : line;
        })
        .join('\n')
    : 'No members on the leaderboard yet.';

  // If caller is NOT on this page but exists on leaderboard, append personal footer callout
  if (!isCallerOnThisPage && callerRankInfo && callerRankInfo.user) {
    listDescription += `\n\n──────────────────────\n👉 **#${callerRankInfo.rank}. You (@${callerRankInfo.user.username})** — \`${callerRankInfo.user.xp.toLocaleString()} XP\``;
  }

  embed.setDescription(listDescription);
  embed.setFooter({
    text: `Page ${currentPage} of ${totalPages} · Total Members: ${totalUsers} · Only you can see this`,
  });
  embed.setTimestamp(new Date());

  return embed;
}

export function buildLeaderboardButtons(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const prevBtn = new ButtonBuilder()
    .setCustomId(`${LEADERBOARD_PREV_ID}_${currentPage}`)
    .setLabel('Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage <= 1);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`${LEADERBOARD_NEXT_ID}_${currentPage}`)
    .setLabel('Next')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage >= totalPages);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
}

export const leaderboardCommand = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the global UPRISE XP leaderboard.')
    .addIntegerOption((option) =>
      option
        .setName('page')
        .setDescription('Leaderboard page number')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // Only caller sees the leaderboard (private ephemeral response)
    await interaction.deferReply({ ephemeral: true });

    // Auto-detect and sync any members who departed before displaying leaderboard
    if (interaction.guild) {
      await ReferralService.syncDepartedMembers(interaction.guild);
    }

    const requestedPage = interaction.options.getInteger('page') || 1;
    const [leaderboardData, callerRankInfo] = await Promise.all([
      LeaderboardService.getGlobalLeaderboard(requestedPage, 10),
      LeaderboardService.getUserRank(interaction.user.id),
    ]);

    const { entries, totalPages, currentPage, totalUsers } = leaderboardData;

    const embed = buildLeaderboardEmbed(
      entries,
      currentPage,
      totalPages,
      totalUsers,
      callerRankInfo,
      interaction.user.id
    );
    const row = buildLeaderboardButtons(currentPage, totalPages);

    await interaction.editReply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });
  },

  async handlePagination(interaction: ButtonInteraction) {
    const customId = interaction.customId;
    const [action, pageStr] = customId.split('_');
    const currentPageNum = parseInt(pageStr, 10) || 1;
    const targetPage = action === 'lb_prev' ? currentPageNum - 1 : currentPageNum + 1;

    const [leaderboardData, callerRankInfo] = await Promise.all([
      LeaderboardService.getGlobalLeaderboard(targetPage, 10),
      LeaderboardService.getUserRank(interaction.user.id),
    ]);

    const { entries, totalPages, currentPage, totalUsers } = leaderboardData;

    const embed = buildLeaderboardEmbed(
      entries,
      currentPage,
      totalPages,
      totalUsers,
      callerRankInfo,
      interaction.user.id
    );
    const row = buildLeaderboardButtons(currentPage, totalPages);

    await interaction.update({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });
  },
};

export default leaderboardCommand;

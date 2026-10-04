import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import LeaderboardService from '../services/leaderboardService.js';
import ReferralService from '../services/referralService.js';

export const LEADERBOARD_PREV_ID = 'lb_prev';
export const LEADERBOARD_NEXT_ID = 'lb_next';

export function buildLeaderboardEmbed(
  entries: { rank: number; username: string; xp: number }[],
  currentPage: number,
  totalPages: number,
  totalUsers: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🏆 UPRISE LEADERBOARD')
    .setColor(0xf59e0b) // Amber gold
    .setDescription(
      entries.length > 0
        ? entries
            .map((entry) => {
              const medal = entry.rank === 1 ? '🥇 ' : entry.rank === 2 ? '🥈 ' : entry.rank === 3 ? '🥉 ' : `${entry.rank}. `;
              return `**${medal}${entry.username}** — ${entry.xp.toLocaleString()} XP`;
            })
            .join('\n')
        : 'No members on the leaderboard yet.'
    )
    .setFooter({
      text: `Page ${currentPage} of ${totalPages} · Total Members: ${totalUsers}`,
    })
    .setTimestamp(new Date());

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
    await interaction.deferReply();

    // Auto-detect and sync any members who departed before displaying leaderboard
    if (interaction.guild) {
      await ReferralService.syncDepartedMembers(interaction.guild);
    }

    const requestedPage = interaction.options.getInteger('page') || 1;
    const { entries, totalPages, currentPage, totalUsers } = await LeaderboardService.getGlobalLeaderboard(
      requestedPage,
      10
    );

    const embed = buildLeaderboardEmbed(entries, currentPage, totalPages, totalUsers);
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

    const { entries, totalPages, currentPage, totalUsers } = await LeaderboardService.getGlobalLeaderboard(
      targetPage,
      10
    );

    const embed = buildLeaderboardEmbed(entries, currentPage, totalPages, totalUsers);
    const row = buildLeaderboardButtons(currentPage, totalPages);

    await interaction.update({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });
  },
};

export default leaderboardCommand;

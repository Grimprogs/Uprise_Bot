import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import LeaderboardService from '../services/leaderboardService.ts';
import XpService from '../services/xpService.ts';

export const xpCommand = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('View your or another member\'s UPRISE XP balance and rank.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Target user to check XP for (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Ensure user exists or fetch rank
    const userRecord = await XpService.getOrCreateUser(targetUser.id, targetUser.username);
    const rankInfo = await LeaderboardService.getUserRank(targetUser.id);

    const rankDisplay = rankInfo ? `#${rankInfo.rank}` : '#--';
    const totalUsers = rankInfo?.totalUsers || 1;

    const embed = new EmbedBuilder()
      .setTitle('UPRISE XP')
      .setColor(0x6366f1) // Indigo
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: 'Member', value: `${targetUser.username}`, inline: true },
        { name: 'Balance', value: `**${userRecord.xp.toLocaleString()} XP**`, inline: true },
        { name: 'Rank', value: `**Rank ${rankDisplay}** of ${totalUsers}`, inline: true }
      )
      .setFooter({ text: 'UPRISE Community Engine' })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};

export default xpCommand;

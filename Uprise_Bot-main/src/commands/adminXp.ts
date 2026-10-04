import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import XpService from '../services/xpService.ts';
import LeaderboardService from '../services/leaderboardService.ts';

export const adminXpCommand = {
  data: new SlashCommandBuilder()
    .setName('admin-xp')
    .setDescription('[STAFF ONLY] Manually adjust a member\'s XP with an audited ledger transaction.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option.setName('user').setDescription('The member whose XP you want to modify').setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName('amount').setDescription('Amount of XP to add (positive) or deduct (negative)').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Mandatory audit reason for manual adjustment').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    // Double-check permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply({
        content: '❌ You lack sufficient staff permissions to execute this command.',
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason', true);

    try {
      // Ensure user exists first
      await XpService.getOrCreateUser(targetUser.id, targetUser.username);

      const result = await XpService.adminAdjustXp(
        targetUser.id,
        amount,
        reason,
        interaction.user.username
      );

      const embed = new EmbedBuilder()
        .setTitle('⚙️ Manual XP Adjustment Processed')
        .setColor(amount >= 0 ? 0x22c55e : 0xef4444)
        .addFields(
          { name: 'Target Member', value: `@${targetUser.username} (${targetUser.id})`, inline: true },
          { name: 'Adjustment', value: `${amount >= 0 ? '+' : ''}${amount.toLocaleString()} XP`, inline: true },
          { name: 'New Total Balance', value: `**${result.user.xp.toLocaleString()} XP**`, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Authorized Staff', value: `@${interaction.user.username}`, inline: true },
          { name: 'Audit Transaction ID', value: `\`${result.transaction.id}\``, inline: true }
        )
        .setFooter({ text: 'All manual adjustments are permanently recorded in SQLite XP ledger' })
        .setTimestamp(new Date());

      await interaction.editReply({ embeds: [embed] });

      // Refresh official leaderboard channel display
      LeaderboardService.updateChannelLeaderboard(interaction.client).catch(() => {});
    } catch (err: any) {
      await interaction.editReply({
        content: `❌ Failed to adjust XP: ${err.message}`,
      });
    }
  },
};

export default adminXpCommand;

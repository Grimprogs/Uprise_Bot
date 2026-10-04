import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import ReferralService from '../services/referralService.ts';

export const referralsCommand = {
  data: new SlashCommandBuilder()
    .setName('referrals')
    .setDescription('View your referral statistics, pending invites, and earned XP.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Target user to check referrals for (defaults to yourself)')
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = await ReferralService.getReferralStats(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`Your UPRISE Referrals`)
      .setDescription(`Referral activity for **@${targetUser.username}**`)
      .setColor(0x3b82f6)
      .addFields(
        { name: 'Successful', value: `**${stats.successfulCount}** verified`, inline: true },
        { name: 'Pending', value: `**${stats.pendingCount}** awaiting verification`, inline: true },
        { name: 'Referral XP', value: `**${stats.referralXpEarned.toLocaleString()} XP**`, inline: true }
      )
      .setFooter({ text: 'UPRISE Referral Engine · XP awarded strictly after verification' })
      .setTimestamp(new Date());

    if (stats.referrals.length > 0) {
      const recentList = stats.referrals
        .slice(0, 5)
        .map((r) => {
          const statusIcon = r.status === 'VALID' ? '✅' : r.status === 'PENDING' ? '⏳' : '❌';
          return `${statusIcon} **@${r.invitee.username}** · ${r.status} (${new Date(r.joinedAt).toLocaleDateString()})`;
        })
        .join('\n');

      embed.addFields({
        name: 'Recent Referrals',
        value: recentList,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default referralsCommand;

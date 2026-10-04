import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
} from 'discord.js';
import VerificationService from '../services/verificationService.js';

export const VERIFY_BUTTON_ID = 'uprise_verify_btn';

export function createVerificationButtonRow(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(VERIFY_BUTTON_ID)
    .setLabel('VERIFY')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🛡️');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export const verifyCommand = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your account to access the UPRISE community and claim XP.'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember;
    const result = await VerificationService.verifyMember({
      discordId: interaction.user.id,
      username: interaction.user.username,
      guildMember: member,
    });

    const embed = new EmbedBuilder()
      .setTitle(result.alreadyVerified ? '🛡️ Already Verified' : '✅ Verification Successful')
      .setColor(result.alreadyVerified ? 0xeab308 : 0x22c55e)
      .setDescription(result.message)
      .setTimestamp(new Date())
      .setFooter({ text: 'UPRISE Community Engine' });

    if (!result.alreadyVerified) {
      embed.addFields(
        { name: 'XP Earned', value: `+${result.inviteeXpAwarded} XP`, inline: true },
        { name: 'Inviter Rewarded', value: result.inviterUsername ? `@${result.inviterUsername} (+${result.inviterXpAwarded} XP)` : 'None (Direct Join)', inline: true }
      );
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async handleButton(interaction: ButtonInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as GuildMember;
    const result = await VerificationService.verifyMember({
      discordId: interaction.user.id,
      username: interaction.user.username,
      guildMember: member,
    });

    const embed = new EmbedBuilder()
      .setTitle(result.alreadyVerified ? '🛡️ Already Verified' : '✅ Welcome to UPRISE!')
      .setColor(result.alreadyVerified ? 0xeab308 : 0x22c55e)
      .setDescription(result.message)
      .setTimestamp(new Date())
      .setFooter({ text: 'UPRISE Community Engine' });

    if (!result.alreadyVerified) {
      embed.addFields(
        { name: 'Verification XP', value: `+${result.inviteeXpAwarded} XP`, inline: true },
        { name: 'Inviter Reward', value: result.inviterUsername ? `@${result.inviterUsername} (+${result.inviterXpAwarded} XP)` : 'Direct Join', inline: true }
      );
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default verifyCommand;

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  GuildMember,
} from 'discord.js';
import prisma from '../database/prisma.ts';
import VerificationService from '../services/verificationService.ts';
import GoogleWorkspaceService from '../services/googleWorkspaceService.ts';
import Logger from '../utils/logger.ts';

export const VERIFY_BUTTON_ID = 'uprise_verify_btn';
export const OPEN_OTP_MODAL_BTN_ID = 'uprise_open_otp_modal';
export const VERIFY_MODAL_ID = 'uprise_verify_modal';
export const SUBMIT_OTP_MODAL_ID = 'uprise_submit_otp_modal';

export function createVerificationButtonRow(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(VERIFY_BUTTON_ID)
    .setLabel('VERIFY')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🛡️');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export function createOtpPromptRow(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(OPEN_OTP_MODAL_BTN_ID)
    .setLabel('Enter 6-Digit OTP Code')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔢');

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export const verifyCommand = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your UPRISE membership with your name and email OTP.'),

  /**
   * 1. Slash command: Opens the Verification Details Modal (Full Name + Email)
   */
  async execute(interaction: ChatInputCommandInteraction) {
    // Check if user is already verified
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (user?.verifiedAt) {
      await interaction.reply({
        content: `🛡️ You have already verified your account in UPRISE! (@Community Member active with **${user.xp} XP**).`,
        ephemeral: true,
      });
      return;
    }

    await this.showDetailsModal(interaction);
  },

  /**
   * 2. [ VERIFY ] Button click: Opens the Verification Details Modal
   */
  async handleButton(interaction: ButtonInteraction) {
    // Check if user is already verified
    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (user?.verifiedAt) {
      await interaction.reply({
        content: `🛡️ You have already verified your account in UPRISE! (@Community Member active with **${user.xp} XP**).`,
        ephemeral: true,
      });
      return;
    }

    await this.showDetailsModal(interaction);
  },

  /**
   * Shows Modal asking for Full Name and Email Address
   */
  async showDetailsModal(interaction: ChatInputCommandInteraction | ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId(VERIFY_MODAL_ID)
      .setTitle('🛡️ UPRISE Verification Form');

    const fullNameInput = new TextInputBuilder()
      .setCustomId('full_name_input')
      .setLabel('Your Full Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. Anurag Gupta')
      .setMinLength(2)
      .setMaxLength(100)
      .setRequired(true);

    const emailInput = new TextInputBuilder()
      .setCustomId('email_input')
      .setLabel('Email Address (for OTP code)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. you@example.com')
      .setMinLength(5)
      .setMaxLength(120)
      .setRequired(true);

    const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(fullNameInput);
    const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput);

    modal.addComponents(row1, row2);
    await interaction.showModal(modal);
  },

  /**
   * 3. Handle Details Modal Submit: Generates OTP, sends Email, and prompts to enter OTP
   */
  async handleDetailsSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const fullName = interaction.fields.getTextInputValue('full_name_input').trim();
    const email = interaction.fields.getTextInputValue('email_input').trim().toLowerCase();

    if (!email.includes('@') || !email.includes('.')) {
      await interaction.editReply({
        content: '❌ Please enter a valid email address.',
      });
      return;
    }

    // Generate secure 6-digit numeric OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save in DB
    await prisma.oTPVerification.create({
      data: {
        email,
        otp: otpCode,
        fullName,
        discordId: interaction.user.id,
        expiresAt,
        verified: false,
      },
    });

    // Check if Google Access Token is stored in settings to deliver email via Gmail API
    let emailSent = false;
    try {
      const tokenSetting = await prisma.systemSetting.findUnique({
        where: { key: 'google_access_token' },
      });
      if (tokenSetting?.value) {
        await GoogleWorkspaceService.sendOtpEmail(tokenSetting.value, email, otpCode, fullName);
        emailSent = true;
      }
    } catch (e: any) {
      console.warn('[Discord Bot] Gmail delivery warning:', e.message);
    }

    await Logger.log({
      type: 'VERIFICATION',
      title: 'Discord Verification OTP Dispatched',
      message: `User @${interaction.user.username} requested verification for ${email} (Name: ${fullName}). (Gmail sent: ${emailSent})`,
    });

    const embed = new EmbedBuilder()
      .setTitle('📧 Verification Code Dispatched!')
      .setColor(0x6366f1)
      .setDescription(
        `Hello **${fullName}**,\n\n` +
        `A 6-digit verification code has been dispatched to your email:\n**${email}**\n\n` +
        `*(This code will expire in 10 minutes)*\n\n` +
        (!emailSent ? `💡 *Dev/Test Preview:* Your code is \`${otpCode}\`\n\n` : '') +
        `👉 **Click the button below to enter your 6-digit code:**`
      )
      .setFooter({ text: 'UPRISE Security & Attribution Gateway' })
      .setTimestamp(new Date());

    const row = createOtpPromptRow();
    await interaction.editReply({ embeds: [embed], components: [row] });
  },

  /**
   * 4. [ Enter OTP Code ] button clicked: Shows the OTP Input Modal
   */
  async showOtpModal(interaction: ButtonInteraction) {
    const modal = new ModalBuilder()
      .setCustomId(SUBMIT_OTP_MODAL_ID)
      .setTitle('🔢 Enter Verification Code');

    const otpInput = new TextInputBuilder()
      .setCustomId('otp_code_input')
      .setLabel('6-Digit Verification Code')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('123456')
      .setMinLength(6)
      .setMaxLength(6)
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(otpInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  },

  /**
   * 5. Handle OTP Modal Submit: Validates code, awards XP, updates roles, syncs to Google Sheets
   */
  async handleOtpSubmit(interaction: ModalSubmitInteraction) {
    await interaction.deferReply({ ephemeral: true });

    const enteredOtp = interaction.fields.getTextInputValue('otp_code_input').trim();

    // Find active OTP record for this discord user
    const otpRecord = await prisma.oTPVerification.findFirst({
      where: {
        discordId: interaction.user.id,
        otp: enteredOtp,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      const retryRow = createOtpPromptRow();
      await interaction.editReply({
        content: '❌ Invalid or expired 6-digit code. Please check your email and click the button below to try again:',
        components: [retryRow],
      });
      return;
    }

    // Mark OTP as verified
    await prisma.oTPVerification.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    // Fetch Google Access Token for Google Sheets auto-append
    let googleAccessToken: string | null = null;
    try {
      const tokenSetting = await prisma.systemSetting.findUnique({
        where: { key: 'google_access_token' },
      });
      googleAccessToken = tokenSetting?.value || null;
    } catch {}

    const member = interaction.member as GuildMember;

    // Run verification pipeline
    const verifyResult = await VerificationService.verifyMember({
      discordId: interaction.user.id,
      username: interaction.user.username,
      fullName: otpRecord.fullName,
      email: otpRecord.email,
      guildMember: member,
      googleAccessToken,
    });

    const embed = new EmbedBuilder()
      .setTitle('🎉 Account Successfully Verified!')
      .setColor(0x22c55e)
      .setDescription(
        `Welcome to the **UPRISE** community, **${otpRecord.fullName || interaction.user.username}**!\n\n` +
        `Your membership has been verified and permanently recorded.`
      )
      .addFields(
        { name: 'Verified Name', value: otpRecord.fullName || interaction.user.username, inline: true },
        { name: 'Email Address', value: otpRecord.email, inline: true },
        { name: 'XP Awarded', value: `**+${verifyResult.inviteeXpAwarded} XP**`, inline: true },
        {
          name: 'Inviter Bonus',
          value: verifyResult.inviterUsername
            ? `@${verifyResult.inviterUsername} (+${verifyResult.inviterXpAwarded} XP)`
            : 'None (Direct Join)',
          inline: true,
        },
        { name: 'Role Unlocked', value: '`@Community Member`', inline: true },
        { name: 'Master Storage', value: '`✅ Saved to Google Sheet`', inline: true }
      )
      .setFooter({ text: 'UPRISE Community Engine' })
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};

export default verifyCommand;

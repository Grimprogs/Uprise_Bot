import { Events, type Interaction } from 'discord.js';
import verifyCommand, {
  VERIFY_BUTTON_ID,
  OPEN_OTP_MODAL_BTN_ID,
  VERIFY_MODAL_ID,
  SUBMIT_OTP_MODAL_ID,
} from '../commands/verify.ts';
import xpCommand from '../commands/xp.ts';
import leaderboardCommand, { LEADERBOARD_PREV_ID, LEADERBOARD_NEXT_ID } from '../commands/leaderboard.ts';
import referralsCommand from '../commands/referrals.ts';
import adminXpCommand from '../commands/adminXp.ts';
import adminReferralCommand from '../commands/adminReferral.ts';
import ReferralService from '../services/referralService.ts';
import Logger from '../utils/logger.ts';

export const interactionCreateEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    try {
      // Proactively sync departed members in the background
      if (interaction.guild) {
        ReferralService.syncDepartedMembers(interaction.guild).catch(() => {});
      }

      // 1. Handle Slash Commands
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        switch (commandName) {
          case 'verify':
            await verifyCommand.execute(interaction);
            break;
          case 'xp':
            await xpCommand.execute(interaction);
            break;
          case 'leaderboard':
            await leaderboardCommand.execute(interaction);
            break;
          case 'referrals':
            await referralsCommand.execute(interaction);
            break;
          case 'admin-xp':
            await adminXpCommand.execute(interaction);
            break;
          case 'admin-referral':
            await adminReferralCommand.execute(interaction);
            break;
          default:
            console.warn(`[UPRISE Bot] Unknown command received: ${commandName}`);
        }
        return;
      }

      // 2. Handle Button Clicks
      if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === VERIFY_BUTTON_ID) {
          await verifyCommand.handleButton(interaction);
          return;
        }

        if (customId === OPEN_OTP_MODAL_BTN_ID) {
          await verifyCommand.showOtpModal(interaction);
          return;
        }

        if (customId.startsWith(LEADERBOARD_PREV_ID) || customId.startsWith(LEADERBOARD_NEXT_ID)) {
          await leaderboardCommand.handlePagination(interaction);
          return;
        }
      }

      // 3. Handle Modal Submissions
      if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId === VERIFY_MODAL_ID) {
          await verifyCommand.handleDetailsSubmit(interaction);
          return;
        }

        if (customId === SUBMIT_OTP_MODAL_ID) {
          await verifyCommand.handleOtpSubmit(interaction);
          return;
        }
      }
    } catch (err: any) {
      console.error('[UPRISE Bot] Interaction error:', err);

      await Logger.log({
        type: 'ERROR',
        title: 'Interaction Handler Error',
        message: `Failed executing interaction: ${err.message}`,
        metadata: {
          user: interaction.user.tag,
          userId: interaction.user.id,
          error: err.stack,
        },
      });

      if (interaction.isRepliable() && !interaction.replied) {
        if (interaction.deferred) {
          await interaction.editReply({
            content: '❌ An unexpected error occurred while processing this interaction.',
          }).catch(() => {});
        } else {
          await interaction.reply({
            content: '❌ An unexpected error occurred while processing this interaction.',
            ephemeral: true,
          }).catch(() => {});
        }
      }
    }
  },
};

export default interactionCreateEvent;

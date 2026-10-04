import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type UserSelectMenuInteraction,
  type VoiceChannel,
} from 'discord.js';
import VoiceChannelService, { VoiceActionError } from '../services/voiceChannelService.ts';
import { humanCount, isRoleLocked } from '../utils/voiceUtils.ts';

export const VC_PANEL_PREFIX = 'uprise_vc:';

const PANEL = {
  lock: `${VC_PANEL_PREFIX}lock`,
  unlock: `${VC_PANEL_PREFIX}unlock`,
  hide: `${VC_PANEL_PREFIX}hide`,
  unhide: `${VC_PANEL_PREFIX}unhide`,
  rename: `${VC_PANEL_PREFIX}rename`,
  limit: `${VC_PANEL_PREFIX}limit`,
  refresh: `${VC_PANEL_PREFIX}refresh`,
  permit: `${VC_PANEL_PREFIX}permit`,
  kick: `${VC_PANEL_PREFIX}kick`,
  transfer: `${VC_PANEL_PREFIX}transfer`,
  renameModal: `${VC_PANEL_PREFIX}rename_modal`,
  limitModal: `${VC_PANEL_PREFIX}limit_modal`,
} as const;

type PanelInteraction = ButtonInteraction<'cached'> | UserSelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>;

function errorText(err: unknown): string {
  if (err instanceof VoiceActionError) return err.message;
  console.error('[vc] Unexpected error:', err);
  return `Something went wrong: ${(err as Error)?.message || 'unknown error'}`;
}

/** Overwrite edits don't update discord.js's cache until the gateway echo arrives; force a fresh read. */
async function refreshed(channel: VoiceChannel): Promise<VoiceChannel> {
  return (await channel.fetch(true).catch(() => channel)) as VoiceChannel;
}

async function buildPanel(channel: VoiceChannel, ownerId: string, notice?: string) {
  channel = await refreshed(channel);
  const locked = isRoleLocked(channel, 'Connect');
  const hidden = isRoleLocked(channel, 'ViewChannel');
  const { remaining, nextAt } = VoiceChannelService.renameStatus(channel.id);

  const embed = new EmbedBuilder()
    .setTitle('🎛️ Voice Channel Control Panel')
    .setColor(0x14b8a6)
    .setDescription(notice ? `${notice}\n​` : null)
    .addFields(
      { name: 'Channel', value: `${channel}`, inline: true },
      { name: 'Owner', value: `<@${ownerId}>`, inline: true },
      { name: 'Members', value: `${humanCount(channel)}${channel.userLimit ? ` / ${channel.userLimit}` : ''}`, inline: true },
      { name: 'Access', value: locked ? '🔒 Locked' : '🔓 Open', inline: true },
      { name: 'Visibility', value: hidden ? '🙈 Hidden' : '👁️ Visible', inline: true },
      {
        name: 'Renames left',
        value: nextAt ? `0 (next <t:${Math.ceil(nextAt.getTime() / 1000)}:R>)` : `${remaining} / 2 per 10 min`,
        inline: true,
      }
    )
    .setFooter({ text: 'Only you can see and use this panel' });

  const accessRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PANEL.lock).setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(locked),
    new ButtonBuilder().setCustomId(PANEL.unlock).setLabel('Unlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary).setDisabled(!locked),
    new ButtonBuilder().setCustomId(PANEL.hide).setLabel('Hide').setEmoji('🙈').setStyle(ButtonStyle.Secondary).setDisabled(hidden),
    new ButtonBuilder().setCustomId(PANEL.unhide).setLabel('Unhide').setEmoji('👁️').setStyle(ButtonStyle.Secondary).setDisabled(!hidden)
  );
  const editRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(PANEL.rename).setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Primary).setDisabled(Boolean(nextAt)),
    new ButtonBuilder().setCustomId(PANEL.limit).setLabel('User Limit').setEmoji('👥').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(PANEL.refresh).setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
  );
  const permitRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(PANEL.permit).setPlaceholder('✅ Permit members to join…').setMinValues(1).setMaxValues(5)
  );
  const kickRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(PANEL.kick).setPlaceholder('⛔ Kick / reject members…').setMinValues(1).setMaxValues(5)
  );
  const transferRow = new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(PANEL.transfer).setPlaceholder('👑 Transfer ownership to…').setMinValues(1).setMaxValues(1)
  );

  return { content: '', embeds: [embed], components: [accessRow, editRow, permitRow, kickRow, transferRow] };
}

async function forEachMember(
  members: Iterable<GuildMember>,
  action: (member: GuildMember) => Promise<string>
): Promise<string> {
  const lines: string[] = [];
  for (const member of members) {
    try {
      lines.push(`✅ ${await action(member)}`);
    } catch (err) {
      lines.push(`❌ ${errorText(err)}`);
    }
  }
  return lines.join('\n') || 'No valid members selected.';
}

export const vcCommand = {
  data: new SlashCommandBuilder()
    .setName('vc')
    .setDescription('Create and manage your own custom voice channel.')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create your own voice channel.')
        .addStringOption((o) => o.setName('name').setDescription("Channel name (default: <you>'s Lounge)").setMaxLength(100))
        .addIntegerOption((o) =>
          o.setName('user_limit').setDescription('Max members (0 = unlimited)').setMinValue(0).setMaxValue(99)
        )
    )
    .addSubcommand((sub) => sub.setName('menu').setDescription('Open the control panel for your voice channel.'))
    .addSubcommand((sub) => sub.setName('lock').setDescription('Stop new members from joining your channel.'))
    .addSubcommand((sub) => sub.setName('unlock').setDescription('Allow members to join your channel again.'))
    .addSubcommand((sub) => sub.setName('hide').setDescription('Hide your channel from the channel list.'))
    .addSubcommand((sub) => sub.setName('unhide').setDescription('Make your channel visible again.'))
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Rename your channel (Discord allows 2 renames per 10 minutes).')
        .addStringOption((o) => o.setName('new_name').setDescription('New channel name').setRequired(true).setMaxLength(100))
    )
    .addSubcommand((sub) =>
      sub
        .setName('limit')
        .setDescription('Set the member cap for your channel.')
        .addIntegerOption((o) =>
          o.setName('number').setDescription('Max members (0 = unlimited)').setRequired(true).setMinValue(0).setMaxValue(99)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('permit')
        .setDescription('Let a member see and join your channel, even when locked or hidden.')
        .addUserOption((o) => o.setName('user').setDescription('Member to permit').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Disconnect a member and block them from rejoining.')
        .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('transfer')
        .setDescription('Hand ownership of your channel to another member.')
        .addUserOption((o) => o.setName('user').setDescription('New owner').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const { guild, member } = interaction;

    try {
      if (sub === 'create') {
        const channel = await VoiceChannelService.createChannel({
          guild,
          owner: member,
          name: interaction.options.getString('name'),
          userLimit: interaction.options.getInteger('user_limit'),
        });

        let note = 'Join it within 2 minutes or it will be removed automatically.';
        if (member.voice.channelId) {
          const moved = await member.voice.setChannel(channel, 'Moved into new custom VC').then(() => true, () => false);
          if (moved) note = "I've moved you in.";
        }
        await interaction.editReply(await buildPanel(channel, member.id, `✅ Created ${channel}. ${note}`));
        return;
      }

      const channel = await VoiceChannelService.requireOwnedChannel(guild, member.id);
      const target = interaction.options.getMember('user');
      if (['permit', 'kick', 'transfer'].includes(sub) && !target) {
        throw new VoiceActionError('That user is not a member of this server.');
      }

      let result: string;
      switch (sub) {
        case 'menu':
          await interaction.editReply(await buildPanel(channel, member.id));
          return;
        case 'lock':
        case 'unlock':
          result = await VoiceChannelService.setAccess(await refreshed(channel), 'Connect', sub === 'lock');
          break;
        case 'hide':
        case 'unhide':
          result = await VoiceChannelService.setAccess(await refreshed(channel), 'ViewChannel', sub === 'hide');
          break;
        case 'rename':
          result = await VoiceChannelService.rename(channel, interaction.options.getString('new_name', true));
          break;
        case 'limit':
          result = await VoiceChannelService.setLimit(channel, interaction.options.getInteger('number', true));
          break;
        case 'permit':
          result = await VoiceChannelService.permit(channel, target!);
          break;
        case 'kick':
          result = await VoiceChannelService.reject(channel, target!, member.id);
          break;
        case 'transfer':
          result = await VoiceChannelService.transfer(channel, member.id, target!);
          break;
        default:
          result = 'Unknown subcommand.';
      }
      await interaction.editReply({ content: `✅ ${result}` });
    } catch (err) {
      await interaction.editReply({ content: `❌ ${errorText(err)}`, embeds: [], components: [] });
    }
  },

  /** Buttons, user-select menus and modals from the /vc menu panel. */
  async handleComponent(interaction: ButtonInteraction | UserSelectMenuInteraction | ModalSubmitInteraction) {
    if (!interaction.inCachedGuild()) return;
    const i = interaction as PanelInteraction;
    const { guild, user } = i;

    // Rename / limit buttons must answer with a modal (no defer allowed first)
    if (i.isButton() && (i.customId === PANEL.rename || i.customId === PANEL.limit)) {
      const channel = await VoiceChannelService.getOwnedChannel(guild, user.id);
      if (!channel) {
        await i.reply({ content: "❌ You don't own a custom voice channel anymore.", ephemeral: true });
        return;
      }
      await i.showModal(i.customId === PANEL.rename ? renameModal(channel) : limitModal(channel));
      return;
    }

    // Everything else edits the panel message in place
    if (i.isModalSubmit() && !i.isFromMessage()) await i.deferReply({ ephemeral: true });
    else await i.deferUpdate();

    let channel: VoiceChannel;
    try {
      channel = await VoiceChannelService.requireOwnedChannel(guild, user.id);
    } catch (err) {
      await i.editReply({ content: `❌ ${errorText(err)}`, embeds: [], components: [] });
      return;
    }

    try {
      let notice: string;
      switch (i.customId) {
        case PANEL.lock:
        case PANEL.unlock:
          notice = await VoiceChannelService.setAccess(await refreshed(channel), 'Connect', i.customId === PANEL.lock);
          break;
        case PANEL.hide:
        case PANEL.unhide:
          notice = await VoiceChannelService.setAccess(await refreshed(channel), 'ViewChannel', i.customId === PANEL.hide);
          break;
        case PANEL.refresh:
          notice = '🔄 Panel refreshed.';
          break;
        case PANEL.renameModal:
          notice = await VoiceChannelService.rename(channel, (i as ModalSubmitInteraction).fields.getTextInputValue('name'));
          break;
        case PANEL.limitModal: {
          const raw = (i as ModalSubmitInteraction).fields.getTextInputValue('limit').trim();
          if (!/^\d{1,2}$/.test(raw)) throw new VoiceActionError('User limit must be a number between 0 and 99.', channel);
          notice = await VoiceChannelService.setLimit(channel, parseInt(raw, 10));
          break;
        }
        case PANEL.permit:
          notice = await forEachMember((i as UserSelectMenuInteraction<'cached'>).members.values(), (m) =>
            VoiceChannelService.permit(channel, m)
          );
          break;
        case PANEL.kick:
          notice = await forEachMember((i as UserSelectMenuInteraction<'cached'>).members.values(), (m) =>
            VoiceChannelService.reject(channel, m, user.id)
          );
          break;
        case PANEL.transfer: {
          const target = (i as UserSelectMenuInteraction<'cached'>).members.first();
          if (!target) throw new VoiceActionError('That user is not a member of this server.', channel);
          const result = await VoiceChannelService.transfer(channel, user.id, target);
          await i.editReply({ content: `✅ ${result}\nYou no longer own this channel, so this panel is closed.`, embeds: [], components: [] });
          return;
        }
        default:
          return;
      }
      // Permit/kick results already carry per-member ✅/❌ markers
      await i.editReply(await buildPanel(channel, user.id, /^[✅❌🔄]/u.test(notice) ? notice : `✅ ${notice}`));
    } catch (err) {
      await i.editReply(await buildPanel(channel, user.id, `❌ ${errorText(err)}`));
    }
  },
};

function renameModal(channel: VoiceChannel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PANEL.renameModal)
    .setTitle('Rename Voice Channel')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New channel name')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setValue(channel.name.slice(0, 100))
          .setRequired(true)
      )
    );
}

function limitModal(channel: VoiceChannel): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PANEL.limitModal)
    .setTitle('Set User Limit')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('limit')
          .setLabel('Max members (0 = unlimited, max 99)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setValue(String(channel.userLimit))
          .setRequired(true)
      )
    );
}

export default vcCommand;

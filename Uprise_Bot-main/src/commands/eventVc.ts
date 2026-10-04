import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import EventChannelService from '../services/eventChannelService.ts';
import { discordTimestamp, parseTimeInput } from '../utils/timeParser.ts';

const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
const TIME_HELP =
  'Use a duration (`30m`, `2h`, `1h30m`), a Discord/Unix timestamp, or ISO (`2026-10-05T18:00+05:30`; no offset = UTC).';

const STATUS_LABEL: Record<string, string> = {
  PENDING: '⏳ Scheduled',
  ACTIVE: '🟢 Live',
};

export const eventVcCommand = {
  data: new SlashCommandBuilder()
    .setName('event-vc')
    .setDescription('[EVENT STAFF] Schedule voice channels that unlock automatically.')
    // Hidden from regular members by default; server admins can also grant the Event Manager
    // role access under Server Settings → Integrations. The runtime check below is authoritative.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a locked event voice channel that opens at the start time.')
        .addStringOption((o) => o.setName('name').setDescription('Channel / event name').setRequired(true).setMaxLength(100))
        .addStringOption((o) =>
          o.setName('start_time').setDescription('When doors open: "now", "30m", "2h", timestamp or ISO date').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('end_time').setDescription('When it closes: duration after start ("2h") or absolute time. Omit = when empty')
        )
        .addIntegerOption((o) => o.setName('limit').setDescription('Max members (0 = unlimited)').setMinValue(0).setMaxValue(99))
        .addBooleanOption((o) => o.setName('hidden').setDescription('Hide the channel until it opens (default: visible but locked)'))
        .addChannelOption((o) =>
          o
            .setName('announce_channel')
            .setDescription('Where to post the "event is live" alert (default: configured channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addRoleOption((o) => o.setName('ping_role').setDescription('Role to ping when the event opens'))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List scheduled and live event channels.'))
    .addSubcommand((sub) =>
      sub
        .setName('cancel')
        .setDescription('Cancel a scheduled or live event and delete its channel.')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('The event voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    if (!EventChannelService.canManageEvents(interaction.member)) {
      await interaction.editReply({ content: '❌ Only Admins and Event Managers can manage event voice channels.' });
      return;
    }

    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'create') await this.create(interaction);
      else if (sub === 'list') await this.list(interaction);
      else if (sub === 'cancel') await this.cancel(interaction);
    } catch (err: any) {
      console.error('[event-vc] Error:', err);
      await interaction.editReply({ content: `❌ ${err.message}` });
    }
  },

  async create(interaction: ChatInputCommandInteraction<'cached'>) {
    const now = new Date();
    const name = interaction.options.getString('name', true).trim();
    const startRaw = interaction.options.getString('start_time', true);
    const endRaw = interaction.options.getString('end_time');

    const startTime = startRaw.trim().toLowerCase() === 'now' ? now : parseTimeInput(startRaw, now);
    if (!startTime) {
      await interaction.editReply({ content: `❌ Couldn't understand start_time \`${startRaw}\`. ${TIME_HELP}` });
      return;
    }
    // Small tolerance so "now"-ish absolute times typed a few seconds late still work
    if (startTime.getTime() < now.getTime() - 60 * 1000) {
      await interaction.editReply({ content: `❌ start_time ${discordTimestamp(startTime)} is in the past.` });
      return;
    }
    if (startTime.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_MS) {
      await interaction.editReply({ content: '❌ Events can be scheduled at most one year ahead.' });
      return;
    }

    // Durations in end_time are relative to the start, e.g. start "18:00" + end "2h"
    const endTime = endRaw ? parseTimeInput(endRaw, startTime) : null;
    if (endRaw && !endTime) {
      await interaction.editReply({ content: `❌ Couldn't understand end_time \`${endRaw}\`. ${TIME_HELP}` });
      return;
    }
    if (endTime && endTime.getTime() <= startTime.getTime()) {
      await interaction.editReply({ content: '❌ end_time must be after start_time.' });
      return;
    }

    const pingRole = interaction.options.getRole('ping_role');
    const { record, channel } = await EventChannelService.createEvent({
      guild: interaction.guild,
      creator: interaction.member,
      name,
      startTime,
      endTime,
      userLimit: interaction.options.getInteger('limit') ?? 0,
      hidden: interaction.options.getBoolean('hidden') ?? false,
      announceChannelId: interaction.options.getChannel('announce_channel')?.id ?? null,
      pingRoleId: pingRole?.id ?? null,
    });

    const embed = new EmbedBuilder()
      .setTitle(record.status === 'ACTIVE' ? '🟢 Event Voice Channel Live' : '📅 Event Voice Channel Scheduled')
      .setColor(0x14b8a6)
      .addFields(
        { name: 'Channel', value: `${channel}`, inline: true },
        { name: 'Status', value: STATUS_LABEL[record.status] || record.status, inline: true },
        { name: 'User Limit', value: record.userLimit ? String(record.userLimit) : 'Unlimited', inline: true },
        { name: 'Opens', value: `${discordTimestamp(startTime)} (${discordTimestamp(startTime, 'R')})`, inline: false },
        {
          name: 'Closes',
          value: endTime ? `${discordTimestamp(endTime)} (${discordTimestamp(endTime, 'R')})` : 'When the channel empties after opening',
          inline: false,
        },
        { name: 'Ping', value: pingRole ? `${pingRole}` : 'None', inline: true },
        { name: 'Visibility before start', value: record.hidden ? '🙈 Hidden' : '👁️ Visible (locked)', inline: true }
      )
      .setFooter({ text: 'Times are shown in your local timezone. You have early access to set up.' });

    await interaction.editReply({ embeds: [embed] });
  },

  async list(interaction: ChatInputCommandInteraction<'cached'>) {
    const events = await EventChannelService.listOpen(interaction.guild.id);
    if (!events.length) {
      await interaction.editReply({ content: 'No scheduled or live event channels.' });
      return;
    }

    const lines = events.map((e) => {
      const timing =
        e.status === 'PENDING'
          ? `opens ${discordTimestamp(e.startTime, 'R')}`
          : e.endTime
            ? `ends ${discordTimestamp(e.endTime, 'R')}`
            : 'ends when empty';
      return `${STATUS_LABEL[e.status] || e.status} **${e.name}** — <#${e.channelId}> · ${timing}`;
    });

    await interaction.editReply({
      embeds: [new EmbedBuilder().setTitle('📅 Event Voice Channels').setColor(0x14b8a6).setDescription(lines.join('\n'))],
    });
  },

  async cancel(interaction: ChatInputCommandInteraction<'cached'>) {
    const channel = interaction.options.getChannel('channel', true);
    const record = await EventChannelService.findOpenByChannel(channel.id);
    if (!record) {
      await interaction.editReply({ content: `❌ ${channel} is not a scheduled or live event channel.` });
      return;
    }

    await EventChannelService.cancelEvent(interaction.client, record, interaction.user.username);
    await interaction.editReply({ content: `✅ Event **${record.name}** cancelled and its channel removed.` });
  },
};

export default eventVcCommand;

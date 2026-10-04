import {
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Client,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';
import type { ScheduledEventChannel } from '@prisma/client';
import prisma from '../database/prisma.ts';
import config from '../config/config.ts';
import Logger from '../utils/logger.ts';
import { discordTimestamp } from '../utils/timeParser.ts';
import {
  denyForRoles,
  fetchVoiceChannel,
  humanCount,
  inheritCategoryOverwrites,
  safeDeleteChannel,
  setRoleAccess,
} from '../utils/voiceUtils.ts';

export type EventStatus = 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

// Events due before the next poll get an exact setTimeout so they open on the second
const PRECISE_TIMER_HORIZON_MS = 35 * 1000;
// Open-ended events (no end_time) that nobody joins are closed after this long
const OPEN_ENDED_IDLE_MS = 60 * 60 * 1000;

const BOT_REQUIRED = [
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.MoveMembers,
];

export class EventChannelService {
  private static timers = new Map<string, NodeJS.Timeout>();

  public static canManageEvents(member: GuildMember): boolean {
    return (
      member.permissions.any([PermissionFlagsBits.ManageEvents, PermissionFlagsBits.ManageGuild]) ||
      Boolean(config.eventManagerRoleId && member.roles.cache.has(config.eventManagerRoleId))
    );
  }

  public static resolveCategory(guild: Guild): CategoryChannel | null {
    const category = config.eventVcCategoryId ? guild.channels.cache.get(config.eventVcCategoryId) : null;
    return category?.type === ChannelType.GuildCategory ? category : null;
  }

  public static async createEvent(params: {
    guild: Guild;
    creator: GuildMember;
    name: string;
    startTime: Date;
    endTime: Date | null;
    userLimit: number;
    hidden: boolean;
    announceChannelId: string | null;
    pingRoleId: string | null;
  }): Promise<{ record: ScheduledEventChannel; channel: VoiceChannel }> {
    const { guild, creator } = params;
    const me = guild.members.me;
    if (!me) throw new Error('Bot member is not available yet, please try again.');

    const parent = this.resolveCategory(guild);
    const missing = (parent ? parent.permissionsFor(me) : me.permissions).missing(BOT_REQUIRED);
    if (missing.length) {
      throw new Error(`I can't create event channels here. Missing permissions: ${missing.join(', ')}.`);
    }

    // Built locked in one API call so nobody can slip in between "create" and "lock"
    const lockBits = PermissionFlagsBits.Connect | (params.hidden ? PermissionFlagsBits.ViewChannel : 0n);
    const overwrites = denyForRoles(
      inheritCategoryOverwrites(parent, me).filter((ow) => ow.id !== me.id && ow.id !== creator.id),
      guild.roles.everyone.id,
      lockBits
    );

    const channel = await guild.channels.create({
      name: params.name,
      type: ChannelType.GuildVoice,
      parent: parent?.id,
      userLimit: params.userLimit,
      reason: `Scheduled event voice channel by ${creator.user.tag}`,
      permissionOverwrites: [
        ...overwrites,
        // The host gets early access to set up before doors open
        { id: creator.id, type: OverwriteType.Member, allow: ['ViewChannel', 'Connect'] },
        { id: me.id, type: OverwriteType.Member, allow: ['ViewChannel', 'Connect', 'ManageChannels', 'MoveMembers'] },
      ],
    });

    let record: ScheduledEventChannel;
    try {
      record = await prisma.scheduledEventChannel.create({
        data: {
          guildId: guild.id,
          channelId: channel.id,
          name: params.name,
          startTime: params.startTime,
          endTime: params.endTime,
          creatorId: creator.id,
          userLimit: params.userLimit,
          hidden: params.hidden,
          announceChannelId: params.announceChannelId,
          pingRoleId: params.pingRoleId,
        },
      });
    } catch (err) {
      await safeDeleteChannel(channel, 'Failed to save scheduled event');
      throw err;
    }

    await Logger.log({
      type: 'VOICE',
      title: 'Event Voice Channel Scheduled',
      message: `@${creator.user.username} scheduled **${params.name}** for ${discordTimestamp(params.startTime)}.`,
      metadata: { channelId: channel.id, eventId: record.id },
    });

    if (params.startTime.getTime() <= Date.now()) {
      await this.openEvent(guild.client, record.id);
    } else {
      this.scheduleTimers(guild.client, record);
    }

    return { record: (await prisma.scheduledEventChannel.findUnique({ where: { id: record.id } })) ?? record, channel };
  }

  /** PENDING → ACTIVE: unlock the channel and announce. Idempotent and safe to call from timers + polls. */
  public static async openEvent(client: Client, id: string) {
    const record = await prisma.scheduledEventChannel.findUnique({ where: { id } });
    if (!record || record.status !== 'PENDING') return;

    // Bot was offline for the whole event window: close it without a misleading "now live" ping
    if (record.endTime && record.endTime.getTime() <= Date.now()) {
      await this.endEvent(client, id, 'Event window passed while the bot was offline');
      return;
    }

    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) return; // retry on next poll

    let channel: VoiceChannel | null;
    try {
      channel = await fetchVoiceChannel(guild, record.channelId);
    } catch {
      return; // transient — retry on next poll
    }
    if (!channel) {
      await prisma.scheduledEventChannel.update({
        where: { id },
        data: { status: 'CANCELLED', channelDeletedAt: new Date() },
      });
      return;
    }

    // Atomic claim so a timer and a poll racing each other only open once
    const claimed = await prisma.scheduledEventChannel.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ACTIVE', openedAt: new Date() },
    });
    if (claimed.count === 0) return;

    try {
      await setRoleAccess(channel, 'Connect', false, `Event "${record.name}" is starting`);
      if (record.hidden) {
        await setRoleAccess(channel, 'ViewChannel', false, `Event "${record.name}" is starting`);
      }
    } catch (err: any) {
      await Logger.log({
        type: 'ERROR',
        title: 'Event Voice Channel Unlock Failed',
        message: `**${record.name}** is due but ${channel} could not be unlocked: ${err.message}`,
      });
      return;
    }

    await this.announce(guild, record, channel);
    await Logger.log({
      type: 'VOICE',
      title: 'Event Voice Channel Opened',
      message: `**${record.name}** is now open in ${channel}.`,
      metadata: { eventId: id },
    });

    if (record.endTime) this.scheduleTimers(client, { ...record, status: 'ACTIVE' });
  }

  /** PENDING/ACTIVE → ENDED: lock the channel, deleting it now if empty or once the last member leaves. */
  public static async endEvent(client: Client, id: string, reason: string) {
    const claimed = await prisma.scheduledEventChannel.updateMany({
      where: { id, status: { in: ['PENDING', 'ACTIVE'] } },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const record = await prisma.scheduledEventChannel.findUnique({ where: { id } });
    if (!record) return;
    this.clearTimersFor(id);

    await Logger.log({
      type: 'VOICE',
      title: 'Event Voice Channel Ended',
      message: `**${record.name}** has ended (${reason}).`,
      metadata: { eventId: id },
    });

    const guild = client.guilds.cache.get(record.guildId);
    if (!guild) return; // the ENDED sweep will finish cleanup later
    await this.closeEndedChannel(guild, record);
  }

  public static async cancelEvent(client: Client, record: ScheduledEventChannel, cancelledBy: string) {
    await prisma.scheduledEventChannel.update({ where: { id: record.id }, data: { status: 'CANCELLED', endedAt: new Date() } });
    this.clearTimersFor(record.id);

    const guild = client.guilds.cache.get(record.guildId);
    const channel = guild ? await fetchVoiceChannel(guild, record.channelId).catch(() => undefined) : undefined;
    if (channel === null || (channel && (await safeDeleteChannel(channel, `Event cancelled by ${cancelledBy}`)))) {
      await prisma.scheduledEventChannel.update({ where: { id: record.id }, data: { channelDeletedAt: new Date() } });
    }

    await Logger.log({
      type: 'VOICE',
      title: 'Event Voice Channel Cancelled',
      message: `**${record.name}** was cancelled by @${cancelledBy}.`,
      metadata: { eventId: record.id },
    });
  }

  /** Voice leave hook: finishes ENDED channels and ends open-ended events once everyone leaves. */
  public static async handleChannelLeft(client: Client, channel: VoiceChannel) {
    if (humanCount(channel) > 0) return;
    const record = await prisma.scheduledEventChannel.findUnique({ where: { channelId: channel.id } });
    if (!record) return;

    if (record.status === 'ENDED' && !record.channelDeletedAt) {
      await this.closeEndedChannel(channel.guild, record);
    } else if (record.status === 'ACTIVE' && !record.endTime) {
      await this.endEvent(client, record.id, 'everyone left');
    }
  }

  public static async onChannelDeleted(channelId: string) {
    const now = new Date();
    await prisma.scheduledEventChannel.updateMany({
      where: { channelId, status: { in: ['PENDING', 'ACTIVE'] } },
      data: { status: 'CANCELLED', endedAt: now },
    });
    await prisma.scheduledEventChannel.updateMany({
      where: { channelId, channelDeletedAt: null },
      data: { channelDeletedAt: now },
    });
  }

  /**
   * Scheduler tick. All state lives in the DB, so this doubles as restart re-hydration:
   * the first tick after boot opens/ends anything that came due while offline and re-arms timers.
   */
  public static async processDue(client: Client) {
    const now = new Date();

    const dueToOpen = await prisma.scheduledEventChannel.findMany({
      where: { status: 'PENDING', startTime: { lte: now } },
    });
    for (const record of dueToOpen) {
      await this.openEvent(client, record.id);
    }

    const dueToEnd = await prisma.scheduledEventChannel.findMany({
      where: { status: { in: ['PENDING', 'ACTIVE'] }, endTime: { lte: now } },
    });
    for (const record of dueToEnd) {
      await this.endEvent(client, record.id, 'scheduled end time reached');
    }

    const idleOpenEnded = await prisma.scheduledEventChannel.findMany({
      where: { status: 'ACTIVE', endTime: null, openedAt: { lte: new Date(now.getTime() - OPEN_ENDED_IDLE_MS) } },
    });
    for (const record of idleOpenEnded) {
      const guild = client.guilds.cache.get(record.guildId);
      const channel = guild ? await fetchVoiceChannel(guild, record.channelId).catch(() => undefined) : undefined;
      if (channel === null || (channel && humanCount(channel) === 0)) {
        await this.endEvent(client, record.id, 'no one joined');
      }
    }

    // Ended channels still waiting for their last member to leave (or missed during downtime)
    const lingering = await prisma.scheduledEventChannel.findMany({
      where: { status: 'ENDED', channelDeletedAt: null },
    });
    for (const record of lingering) {
      const guild = client.guilds.cache.get(record.guildId);
      if (guild) await this.closeEndedChannel(guild, record);
    }

    const horizon = new Date(now.getTime() + PRECISE_TIMER_HORIZON_MS);
    const upcoming = await prisma.scheduledEventChannel.findMany({
      where: {
        OR: [
          { status: 'PENDING', startTime: { gt: now, lte: horizon } },
          { status: { in: ['PENDING', 'ACTIVE'] }, endTime: { gt: now, lte: horizon } },
        ],
      },
    });
    for (const record of upcoming) {
      this.scheduleTimers(client, record);
    }
  }

  public static async listOpen(guildId: string) {
    return prisma.scheduledEventChannel.findMany({
      where: { guildId, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { startTime: 'asc' },
      take: 15,
    });
  }

  public static async findOpenByChannel(channelId: string) {
    return prisma.scheduledEventChannel.findFirst({
      where: { channelId, status: { in: ['PENDING', 'ACTIVE'] } },
    });
  }

  public static clearTimers() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // ───────────────────────────── internals ─────────────────────────────

  private static async closeEndedChannel(guild: Guild, record: ScheduledEventChannel) {
    let channel: VoiceChannel | null;
    try {
      channel = await fetchVoiceChannel(guild, record.channelId);
    } catch {
      return;
    }

    if (!channel) {
      await prisma.scheduledEventChannel.update({ where: { id: record.id }, data: { channelDeletedAt: new Date() } });
      return;
    }

    if (humanCount(channel) === 0) {
      if (await safeDeleteChannel(channel, `Event "${record.name}" ended`)) {
        await prisma.scheduledEventChannel.update({ where: { id: record.id }, data: { channelDeletedAt: new Date() } });
      }
      return;
    }

    // People are still talking: stop new joins and let the voice-leave hook delete it later
    try {
      await setRoleAccess(channel, 'Connect', true, `Event "${record.name}" ended`);
    } catch (err: any) {
      console.warn(`[EventChannelService] Could not lock ended event channel ${channel.id}:`, err.message);
    }
  }

  private static async announce(guild: Guild, record: ScheduledEventChannel, channel: VoiceChannel) {
    const targetId = record.announceChannelId || config.eventAnnounceChannelId;
    if (!targetId) return;

    const target = guild.channels.cache.get(targetId) ?? (await guild.channels.fetch(targetId).catch(() => null));
    if (!target || !target.isTextBased()) {
      console.warn(`[EventChannelService] Announcement channel ${targetId} not found or not text-based.`);
      return;
    }

    const isEveryone = record.pingRoleId === guild.id;
    const content = record.pingRoleId ? (isEveryone ? '@everyone' : `<@&${record.pingRoleId}>`) : undefined;

    const embed = new EmbedBuilder()
      .setTitle(`🔊 ${record.name} is live!`)
      .setColor(0x14b8a6)
      .setDescription(
        `Doors are open — hop into ${channel} now.` +
          (record.endTime ? `\n\nEnds ${discordTimestamp(record.endTime, 'R')}.` : '')
      )
      .setTimestamp(new Date())
      .setFooter({ text: 'UPRISE Events' });

    await target
      .send({
        content,
        embeds: [embed],
        allowedMentions: isEveryone ? { parse: ['everyone'] } : { roles: record.pingRoleId ? [record.pingRoleId] : [] },
      })
      .catch((err: any) => console.warn('[EventChannelService] Announcement failed:', err.message));
  }

  private static scheduleTimers(client: Client, record: ScheduledEventChannel) {
    const now = Date.now();
    if (record.status === 'PENDING' && record.startTime.getTime() - now <= PRECISE_TIMER_HORIZON_MS) {
      this.arm(`${record.id}:open`, record.startTime, () => this.openEvent(client, record.id));
    }
    if (record.endTime && record.endTime.getTime() - now <= PRECISE_TIMER_HORIZON_MS) {
      this.arm(`${record.id}:end`, record.endTime, () => this.endEvent(client, record.id, 'scheduled end time reached'));
    }
  }

  private static arm(key: string, at: Date, fn: () => Promise<void>) {
    if (this.timers.has(key)) return;
    const timer = setTimeout(() => {
      this.timers.delete(key);
      fn().catch((err) => console.warn(`[EventChannelService] Timer ${key} failed:`, err.message));
    }, Math.max(0, at.getTime() - Date.now()));
    this.timers.set(key, timer);
  }

  private static clearTimersFor(id: string) {
    for (const suffix of [':open', ':end']) {
      const timer = this.timers.get(id + suffix);
      if (timer) clearTimeout(timer);
      this.timers.delete(id + suffix);
    }
  }
}

export default EventChannelService;

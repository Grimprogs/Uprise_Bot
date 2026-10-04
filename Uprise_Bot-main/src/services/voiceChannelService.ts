import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  RateLimitError,
  type CategoryChannel,
  type Client,
  type Guild,
  type GuildMember,
  type PermissionsString,
  type VoiceChannel,
} from 'discord.js';
import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.ts';
import config from '../config/config.ts';
import Logger from '../utils/logger.ts';
import {
  fetchVoiceChannel,
  humanCount,
  inheritCategoryOverwrites,
  isRoleLocked,
  missingBotPermissions,
  safeDeleteChannel,
  setRoleAccess,
  type AccessPerm,
} from '../utils/voiceUtils.ts';

/** User-facing failure: the message is safe to show directly in Discord. */
// No constructor parameter properties: `npm start` runs server.ts via Node's native type
// stripping, which rejects them (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX)
export class VoiceActionError extends Error {
  public readonly channel?: VoiceChannel;

  constructor(message: string, channel?: VoiceChannel) {
    super(message);
    this.channel = channel;
  }
}

const OWNER_MANAGE_PERMS = {
  ManageChannels: true,
  MoveMembers: true,
  MuteMembers: true,
  DeafenMembers: true,
} as const;

const OWNER_PERMS = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  Stream: true,
  ...OWNER_MANAGE_PERMS,
} as const;

const BOT_PERMS = {
  ViewChannel: true,
  Connect: true,
  ManageChannels: true,
  MoveMembers: true,
} as const;

const OWNER_ALLOW = Object.keys(OWNER_PERMS) as PermissionsString[];
const BOT_ALLOW = Object.keys(BOT_PERMS) as PermissionsString[];

// The bot can only grant permissions it holds itself, plus Manage Roles to write overwrites
const BOT_REQUIRED_TO_CREATE = new PermissionsBitField([...OWNER_ALLOW, ...BOT_ALLOW, 'ManageRoles']);
const BOT_REQUIRED_TO_EDIT = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles];

// Channels created via /vc create while the owner isn't in voice get this long to be joined
const EMPTY_GRACE_MS = 2 * 60 * 1000;
const HUB_COOLDOWN_MS = 10 * 1000;

// Discord allows 2 name changes per channel per 10 minutes
const RENAME_WINDOW_MS = 10 * 60 * 1000;
const RENAME_MAX = 2;
const renameHistory = new Map<string, number[]>();

const hubCooldowns = new Map<string, number>();
const creatingFor = new Set<string>();

function recentRenames(channelId: string): number[] {
  const cutoff = Date.now() - RENAME_WINDOW_MS;
  const history = (renameHistory.get(channelId) || []).filter((t) => t > cutoff);
  if (history.length) renameHistory.set(channelId, history);
  else renameHistory.delete(channelId);
  return history;
}

function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function assertBotCanEdit(channel: VoiceChannel, extra: bigint[] = []) {
  const missing = missingBotPermissions(channel, [...BOT_REQUIRED_TO_EDIT, ...extra]);
  if (missing.length) {
    throw new VoiceActionError(`I'm missing permissions in this channel: ${missing.join(', ')}.`, channel);
  }
}

export class VoiceChannelService {
  /** Rename budget for the panel display. */
  public static renameStatus(channelId: string): { remaining: number; nextAt: Date | null } {
    const history = recentRenames(channelId);
    return {
      remaining: Math.max(0, RENAME_MAX - history.length),
      nextAt: history.length >= RENAME_MAX ? new Date(history[0] + RENAME_WINDOW_MS) : null,
    };
  }

  public static async isDynamicChannel(channelId: string): Promise<boolean> {
    return Boolean(await prisma.dynamicVoiceChannel.findUnique({ where: { channelId } }));
  }

  /** The member's live dynamic channel, purging the DB row if Discord says the channel is gone. */
  public static async getOwnedChannel(guild: Guild, ownerId: string): Promise<VoiceChannel | null> {
    const record = await prisma.dynamicVoiceChannel.findUnique({
      where: { guildId_ownerId: { guildId: guild.id, ownerId } },
    });
    if (!record) return null;

    const channel = await fetchVoiceChannel(guild, record.channelId);
    if (!channel) {
      await prisma.dynamicVoiceChannel.deleteMany({ where: { channelId: record.channelId } });
      return null;
    }
    return channel;
  }

  public static async requireOwnedChannel(guild: Guild, ownerId: string): Promise<VoiceChannel> {
    const channel = await this.getOwnedChannel(guild, ownerId);
    if (!channel) {
      throw new VoiceActionError(
        "You don't own a custom voice channel. Join the **➕ Create VC** channel or use `/vc create`."
      );
    }
    return channel;
  }

  public static resolveCategory(guild: Guild): CategoryChannel | null {
    const id = config.vcCategoryId || guild.channels.cache.get(config.vcHubChannelId)?.parentId;
    const category = id ? guild.channels.cache.get(id) : null;
    return category?.type === ChannelType.GuildCategory ? category : null;
  }

  public static async createChannel(params: {
    guild: Guild;
    owner: GuildMember;
    name?: string | null;
    userLimit?: number | null;
  }): Promise<VoiceChannel> {
    const { guild, owner } = params;
    const me = guild.members.me;
    if (!me) throw new VoiceActionError('Bot member is not available yet, please try again.');

    const existing = await this.getOwnedChannel(guild, owner.id);
    if (existing) {
      throw new VoiceActionError(`You already own ${existing}. Use \`/vc menu\` to manage it.`, existing);
    }

    const parent = this.resolveCategory(guild);
    const scopePerms = parent ? parent.permissionsFor(me) : me.permissions;
    const missing = scopePerms.missing(BOT_REQUIRED_TO_CREATE);
    if (missing.length) {
      throw new VoiceActionError(`I can't create voice channels here. Missing permissions: ${missing.join(', ')}.`);
    }

    const name = sanitizeName(params.name || '') || sanitizeName(`${owner.displayName}'s Lounge`);
    const inherited = inheritCategoryOverwrites(parent, me).filter((ow) => ow.id !== owner.id && ow.id !== me.id);

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: parent?.id,
      userLimit: Math.min(Math.max(params.userLimit ?? 0, 0), 99),
      reason: `Custom voice channel for ${owner.user.tag}`,
      permissionOverwrites: [
        ...inherited,
        { id: owner.id, type: OverwriteType.Member, allow: OWNER_ALLOW },
        { id: me.id, type: OverwriteType.Member, allow: BOT_ALLOW },
      ],
    });

    try {
      await prisma.dynamicVoiceChannel.create({
        data: { guildId: guild.id, channelId: channel.id, ownerId: owner.id },
      });
    } catch (err) {
      // Lost a race with a concurrent create (unique guildId+ownerId): don't leave an orphan behind
      await safeDeleteChannel(channel, 'Duplicate custom voice channel');
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new VoiceActionError('You already have a custom voice channel being created.');
      }
      throw err;
    }

    await Logger.log({
      type: 'VOICE',
      title: 'Custom Voice Channel Created',
      message: `@${owner.user.username} created **${channel.name}**.`,
      metadata: { channelId: channel.id, ownerId: owner.id },
    });

    return channel;
  }

  /** "➕ Create VC" hub: create (or reuse) the member's channel and move them into it. */
  public static async handleHubJoin(member: GuildMember) {
    if (member.user.bot || creatingFor.has(member.id)) return;
    creatingFor.add(member.id);

    try {
      const existing = await this.getOwnedChannel(member.guild, member.id);
      if (existing) {
        await member.voice.setChannel(existing, 'Returning owner to their channel').catch(() => {});
        return;
      }

      const now = Date.now();
      for (const [id, at] of hubCooldowns) {
        if (now - at > HUB_COOLDOWN_MS) hubCooldowns.delete(id);
      }
      if (hubCooldowns.has(member.id)) {
        // Rapid join/leave spam: bounce them out of the hub instead of creating another channel
        await member.voice.disconnect('Join-to-Create cooldown').catch(() => {});
        return;
      }
      hubCooldowns.set(member.id, now);

      const channel = await this.createChannel({ guild: member.guild, owner: member });
      try {
        await member.voice.setChannel(channel, 'Join-to-Create');
      } catch {
        // They left voice before the move completed
        await this.deleteIfEmpty(channel);
      }
    } catch (err: any) {
      await Logger.log({
        type: 'ERROR',
        title: 'Join-to-Create Failed',
        message: `Could not create a voice channel for @${member.user.username}: ${err.message}`,
      });
      await member.voice.disconnect('Join-to-Create failed').catch(() => {});
    } finally {
      creatingFor.delete(member.id);
    }
  }

  /** Called on every voice leave: removes a dynamic channel once no humans remain. */
  public static async handleChannelLeft(channel: VoiceChannel) {
    if (humanCount(channel) > 0) return;
    if (!(await this.isDynamicChannel(channel.id))) return;
    await this.deleteIfEmpty(channel);
  }

  public static async deleteIfEmpty(channel: VoiceChannel): Promise<boolean> {
    if (humanCount(channel) > 0) return false;
    const deleted = await safeDeleteChannel(channel, 'Custom voice channel is empty');
    if (deleted) {
      await prisma.dynamicVoiceChannel.deleteMany({ where: { channelId: channel.id } });
    }
    return deleted;
  }

  public static async onChannelDeleted(channelId: string) {
    renameHistory.delete(channelId);
    await prisma.dynamicVoiceChannel.deleteMany({ where: { channelId } });
  }

  /**
   * Reconciles DB with Discord: drops rows for channels deleted while the bot was offline and
   * removes channels that emptied during downtime or were never joined after /vc create.
   */
  public static async sweep(client: Client) {
    const records = await prisma.dynamicVoiceChannel.findMany();
    for (const record of records) {
      const guild = client.guilds.cache.get(record.guildId);
      if (!guild) continue;

      let channel: VoiceChannel | null;
      try {
        channel = await fetchVoiceChannel(guild, record.channelId);
      } catch {
        continue; // transient — try again next sweep
      }

      if (!channel) {
        await prisma.dynamicVoiceChannel.deleteMany({ where: { channelId: record.channelId } });
      } else if (Date.now() - record.createdAt.getTime() > EMPTY_GRACE_MS) {
        await this.deleteIfEmpty(channel);
      }
    }
  }

  // ───────────────────────────── Owner actions ─────────────────────────────

  public static async setAccess(channel: VoiceChannel, perm: AccessPerm, locked: boolean): Promise<string> {
    const label = perm === 'Connect' ? (locked ? 'locked' : 'unlocked') : locked ? 'hidden' : 'visible';
    if (isRoleLocked(channel, perm) === locked) {
      return `${channel} is already ${label}.`;
    }
    assertBotCanEdit(channel);

    if (locked) {
      // Let people already inside rejoin if they drop
      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        const ow = channel.permissionOverwrites.cache.get(member.id);
        if (!ow?.allow.has(PermissionFlagsBits[perm])) {
          await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: true }, { type: OverwriteType.Member });
        }
      }
    }

    await setRoleAccess(channel, perm, locked, `Custom VC ${label} by owner`);
    return `${channel} is now **${label}**.`;
  }

  public static async rename(channel: VoiceChannel, rawName: string): Promise<string> {
    const name = sanitizeName(rawName);
    if (!name) throw new VoiceActionError('Channel name cannot be empty.', channel);
    if (name === channel.name) return `${channel} is already named **${name}**.`;
    assertBotCanEdit(channel);

    const { nextAt } = this.renameStatus(channel.id);
    if (nextAt) {
      throw new VoiceActionError(
        `Discord only allows 2 renames per 10 minutes. You can rename again <t:${Math.ceil(nextAt.getTime() / 1000)}:R>.`,
        channel
      );
    }

    try {
      // The client is configured to reject (not silently queue) long channel-edit rate limits
      await channel.setName(name, 'Custom VC renamed by owner');
    } catch (err) {
      if (err instanceof RateLimitError) {
        const retryAt = Math.ceil((Date.now() + err.retryAfter) / 1000);
        throw new VoiceActionError(`Discord's rename limit was hit. Try again <t:${retryAt}:R>.`, channel);
      }
      throw err;
    }

    renameHistory.set(channel.id, [...recentRenames(channel.id), Date.now()]);
    return `Channel renamed to **${name}**.`;
  }

  public static async setLimit(channel: VoiceChannel, limit: number): Promise<string> {
    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      throw new VoiceActionError('User limit must be a whole number between 0 and 99 (0 = unlimited).', channel);
    }
    assertBotCanEdit(channel);
    await channel.setUserLimit(limit, 'Custom VC limit changed by owner');
    return limit === 0 ? 'User limit removed (unlimited).' : `User limit set to **${limit}**.`;
  }

  public static async permit(channel: VoiceChannel, target: GuildMember): Promise<string> {
    assertBotCanEdit(channel);
    await channel.permissionOverwrites.edit(
      target.id,
      { ViewChannel: true, Connect: true },
      { type: OverwriteType.Member, reason: 'Permitted by custom VC owner' }
    );
    return `${target} can now see and join ${channel}.`;
  }

  public static async reject(channel: VoiceChannel, target: GuildMember, ownerId: string): Promise<string> {
    if (target.id === ownerId) throw new VoiceActionError("You can't kick yourself.", channel);
    if (target.id === channel.client.user.id) throw new VoiceActionError("I can't kick myself.", channel);
    if (target.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageChannels])) {
      throw new VoiceActionError(`${target} is server staff and can't be kicked from custom channels.`, channel);
    }
    assertBotCanEdit(channel, [PermissionFlagsBits.MoveMembers]);

    await channel.permissionOverwrites.edit(
      target.id,
      { Connect: false, ViewChannel: null },
      { type: OverwriteType.Member, reason: 'Rejected by custom VC owner' }
    );

    const wasInside = target.voice.channelId === channel.id;
    if (wasInside) {
      await target.voice.disconnect('Kicked by custom VC owner');
    }
    return `${target} ${wasInside ? 'was disconnected and ' : ''}can no longer join ${channel}.`;
  }

  public static async transfer(channel: VoiceChannel, fromId: string, target: GuildMember): Promise<string> {
    if (target.user.bot) throw new VoiceActionError("Ownership can't be transferred to a bot.", channel);
    if (target.id === fromId) throw new VoiceActionError('You already own this channel.', channel);
    assertBotCanEdit(channel);

    if (await this.getOwnedChannel(channel.guild, target.id)) {
      throw new VoiceActionError(`${target} already owns a custom voice channel.`, channel);
    }

    try {
      await prisma.dynamicVoiceChannel.update({ where: { channelId: channel.id }, data: { ownerId: target.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new VoiceActionError(`${target} already owns a custom voice channel.`, channel);
      }
      throw err;
    }

    await channel.permissionOverwrites.edit(target.id, OWNER_PERMS, {
      type: OverwriteType.Member,
      reason: 'Custom VC ownership transferred',
    });
    // Previous owner keeps access as a regular member but loses management rights
    await channel.permissionOverwrites.edit(
      fromId,
      { ManageChannels: null, MoveMembers: null, MuteMembers: null, DeafenMembers: null },
      { type: OverwriteType.Member, reason: 'Custom VC ownership transferred' }
    );

    await Logger.log({
      type: 'VOICE',
      title: 'Custom Voice Channel Transferred',
      message: `**${channel.name}** ownership moved from <@${fromId}> to @${target.user.username}.`,
    });
    return `Ownership of ${channel} transferred to ${target}.`;
  }
}

export default VoiceChannelService;

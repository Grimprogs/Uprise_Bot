import {
  ChannelType,
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type VoiceChannel,
} from 'discord.js';

export type AccessPerm = 'Connect' | 'ViewChannel';

export interface RawOverwrite {
  id: string;
  type: OverwriteType;
  allow: bigint;
  deny: bigint;
}

export function isUnknownChannelError(err: unknown): boolean {
  return err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel;
}

/**
 * Resolves a voice channel by ID.
 * Returns null only when Discord confirms the channel no longer exists (or isn't voice);
 * transient/permission errors are rethrown so callers never purge DB rows on a network blip.
 */
export async function fetchVoiceChannel(guild: Guild, channelId: string): Promise<VoiceChannel | null> {
  let channel = guild.channels.cache.get(channelId) ?? null;
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch (err) {
      if (isUnknownChannelError(err)) return null;
      throw err;
    }
  }
  return channel?.type === ChannelType.GuildVoice ? channel : null;
}

export function humanCount(channel: VoiceChannel): number {
  return channel.members.filter((m) => !m.user.bot).size;
}

/** Names of permissions the bot is missing in `channel` (empty array = all good). */
export function missingBotPermissions(channel: VoiceChannel | CategoryChannel, perms: bigint[]): string[] {
  const me = channel.guild.members.me;
  if (!me) return ['(bot member not cached)'];
  return channel.permissionsFor(me).missing(perms);
}

/**
 * Category overwrites to copy onto a new child channel, masked to bits the bot itself holds:
 * Discord rejects overwrite edits that touch permissions the bot doesn't have.
 */
export function inheritCategoryOverwrites(parent: CategoryChannel | null, me: GuildMember): RawOverwrite[] {
  if (!parent) return [];
  const botPerms = parent.permissionsFor(me);
  const mask = botPerms.has(PermissionFlagsBits.Administrator) ? PermissionsBitField.All : botPerms.bitfield;
  return parent.permissionOverwrites.cache.map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield & mask,
    deny: ow.deny.bitfield & mask,
  }));
}

/**
 * In-memory lock for channel creation: deny `bits` for @everyone and for any role overwrite that
 * explicitly allows them. Denying only @everyone is not enough on servers where a role (e.g.
 * @Community Member) is granted access at the category level — a role allow beats an @everyone deny.
 */
export function denyForRoles(overwrites: RawOverwrite[], everyoneId: string, bits: bigint): RawOverwrite[] {
  const result = overwrites.map((ow) => {
    if (ow.type !== OverwriteType.Role) return ow;
    const toDeny = ow.id === everyoneId ? bits : ow.allow & bits;
    return { ...ow, allow: ow.allow & ~toDeny, deny: ow.deny | toDeny };
  });
  if (!result.some((ow) => ow.id === everyoneId)) {
    result.push({ id: everyoneId, type: OverwriteType.Role, allow: 0n, deny: bits });
  }
  return result;
}

export function isRoleLocked(channel: VoiceChannel, perm: AccessPerm): boolean {
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  return Boolean(everyone?.deny.has(PermissionFlagsBits[perm]));
}

/** What the parent category says for this overwrite target: true (allow), false (deny) or null (inherit). */
function categoryState(channel: VoiceChannel, id: string, perm: AccessPerm): boolean | null {
  const parentOw = channel.parent?.permissionOverwrites.cache.get(id);
  if (parentOw?.allow.has(PermissionFlagsBits[perm])) return true;
  if (parentOw?.deny.has(PermissionFlagsBits[perm])) return false;
  return null;
}

/**
 * Live lock/unlock of a permission for roles.
 *  - lock:   deny for @everyone + every role overwrite that currently allows it
 *  - unlock: restore every role overwrite to the parent category's value, so server-wide
 *            gating (e.g. verified-only categories) is preserved instead of forced to "allow"
 * Member overwrites (owner, permitted users, the bot) are untouched and keep winning.
 */
export async function setRoleAccess(channel: VoiceChannel, perm: AccessPerm, locked: boolean, reason: string) {
  const bit = PermissionFlagsBits[perm];
  const everyoneId = channel.guild.roles.everyone.id;
  const roleOverwrites = channel.permissionOverwrites.cache.filter((ow) => ow.type === OverwriteType.Role);

  if (locked) {
    const targets = new Set<string>([everyoneId]);
    for (const ow of roleOverwrites.values()) {
      if (ow.allow.has(bit)) targets.add(ow.id);
    }
    for (const id of targets) {
      if (channel.permissionOverwrites.cache.get(id)?.deny.has(bit)) continue; // already locked
      await channel.permissionOverwrites.edit(id, { [perm]: false }, { type: OverwriteType.Role, reason });
    }
    return;
  }

  for (const ow of roleOverwrites.values()) {
    const desired = categoryState(channel, ow.id, perm);
    const current = ow.allow.has(bit) ? true : ow.deny.has(bit) ? false : null;
    if (desired !== current) {
      await channel.permissionOverwrites.edit(ow.id, { [perm]: desired }, { type: OverwriteType.Role, reason });
    }
  }
}

/** Deletes a channel if the bot is allowed to. Returns true when the channel is gone. */
export async function safeDeleteChannel(channel: VoiceChannel, reason: string): Promise<boolean> {
  if (!channel.deletable) {
    console.warn(`[Voice] Cannot delete #${channel.name} (${channel.id}): bot lacks Manage Channels.`);
    return false;
  }
  try {
    await channel.delete(reason);
    return true;
  } catch (err: any) {
    if (isUnknownChannelError(err)) return true;
    console.warn(`[Voice] Failed to delete #${channel.name} (${channel.id}):`, err.message);
    return false;
  }
}

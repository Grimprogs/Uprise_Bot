import { Guild, Collection, Invite } from 'discord.js';
import prisma from '../database/prisma.js';
import Logger from '../utils/logger.js';

export interface CachedInviteData {
  code: string;
  uses: number;
  inviterDiscordId: string | null;
  inviterUsername: string | null;
  maxUses?: number | null;
}

export interface DetectedInvite {
  code: string;
  inviterDiscordId: string | null;
  inviterUsername: string | null;
  uses: number;
}

export class InviteService {
  // Guild ID -> Map of Invite Code to cached data
  private static inviteCache: Map<string, Map<string, CachedInviteData>> = new Map();

  /**
   * Cache all guild invites into memory and SQLite
   */
  public static async cacheGuildInvites(guild: Guild): Promise<void> {
    try {
      const invites = await guild.invites.fetch().catch((err) => {
        console.warn(`[InviteService] ⚠️ Unable to fetch invites for guild "${guild.name}" (${guild.id}): ${err.message}`);
        if (err.message.includes('Missing Permissions')) {
          console.error(`[InviteService] 🚨 CRITICAL: Bot lacks "Manage Server" (ManageGuild) permission in "${guild.name}". Please grant "Manage Server" permission in Discord Server Settings -> Roles!`);
        }
        return null;
      });

      if (!invites) return;

      const guildInvites = new Map<string, CachedInviteData>();

      for (const [code, invite] of invites) {
        const uses = invite.uses || 0;
        const inviterId = invite.inviter ? invite.inviter.id : null;
        const inviterTag = invite.inviter ? invite.inviter.username : null;

        const data: CachedInviteData = {
          code,
          uses,
          inviterDiscordId: inviterId,
          inviterUsername: inviterTag,
          maxUses: invite.maxUses,
        };

        guildInvites.set(code, data);

        // Persist to SQLite TrackedInvite table
        await prisma.trackedInvite.upsert({
          where: { code },
          update: {
            uses,
            inviterDiscordId: inviterId,
          },
          create: {
            code,
            inviterDiscordId: inviterId,
            uses,
          },
        }).catch((err) => {
          console.warn(`[InviteService] DB upsert invite failed: ${err.message}`);
        });
      }

      this.inviteCache.set(guild.id, guildInvites);
      console.log(`[InviteService] ✅ Successfully cached ${invites.size} invites for guild "${guild.name}" (${guild.id})`);
    } catch (err: any) {
      console.error(`[InviteService] Error caching invites: ${err.message}`);
    }
  }

  /**
   * Real-time handler for when an invite is created in Discord
   */
  public static async handleInviteCreate(invite: Invite): Promise<void> {
    if (!invite.guild) return;
    const guildId = invite.guild.id;
    let guildInvites = this.inviteCache.get(guildId);
    if (!guildInvites) {
      guildInvites = new Map();
      this.inviteCache.set(guildId, guildInvites);
    }

    const data: CachedInviteData = {
      code: invite.code,
      uses: invite.uses || 0,
      inviterDiscordId: invite.inviter?.id || null,
      inviterUsername: invite.inviter?.username || null,
      maxUses: invite.maxUses,
    };

    guildInvites.set(invite.code, data);

    await prisma.trackedInvite.upsert({
      where: { code: invite.code },
      update: {
        uses: invite.uses || 0,
        inviterDiscordId: invite.inviter?.id || null,
      },
      create: {
        code: invite.code,
        inviterDiscordId: invite.inviter?.id || null,
        uses: invite.uses || 0,
      },
    }).catch(() => {});

    console.log(`[InviteService] 🔗 New invite created: ${invite.code} by @${invite.inviter?.username || 'Unknown'} (${invite.inviter?.id})`);
  }

  /**
   * Compares the current guild invites with the cached ones to determine
   * which invite had its usage counter incremented or was consumed.
   */
  public static async detectUsedInvite(guild: Guild): Promise<DetectedInvite | null> {
    try {
      const newInvites: Collection<string, Invite> | null = await guild.invites.fetch().catch((err) => {
        console.warn(`[InviteService] Unable to fetch invites upon member join: ${err.message}`);
        if (err.message.includes('Missing Permissions')) {
          Logger.log({
            type: 'ERROR',
            title: 'Bot Lacks Manage Server Permission',
            message: 'Bot cannot read guild invites because it is missing the "Manage Server" (ManageGuild) permission. Please assign "Manage Server" to the bot role in Discord Server Settings.',
          }).catch(() => {});
        }
        return null;
      });

      if (!newInvites) {
        return null;
      }

      let cachedGuildInvites = this.inviteCache.get(guild.id);

      // If cache wasn't initialized in memory, try recovering from SQLite database
      if (!cachedGuildInvites) {
        cachedGuildInvites = new Map<string, CachedInviteData>();
        const dbInvites = await prisma.trackedInvite.findMany();
        for (const item of dbInvites) {
          cachedGuildInvites.set(item.code, {
            code: item.code,
            uses: item.uses,
            inviterDiscordId: item.inviterDiscordId,
            inviterUsername: null,
          });
        }
      }

      let detected: DetectedInvite | null = null;

      // Strategy 1: Check for incremented usage in active invites
      for (const [code, invite] of newInvites) {
        const newUses = invite.uses || 0;
        const cached = cachedGuildInvites.get(code);
        const cachedUses = cached ? cached.uses : 0;

        if (newUses > cachedUses) {
          detected = {
            code,
            inviterDiscordId: invite.inviter ? invite.inviter.id : cached?.inviterDiscordId || null,
            inviterUsername: invite.inviter ? invite.inviter.username : cached?.inviterUsername || null,
            uses: newUses,
          };
          break;
        }
      }

      // Strategy 2: Check for consumed single-use invite (disappeared from newInvites)
      if (!detected && cachedGuildInvites.size > 0) {
        for (const [cachedCode, cachedData] of cachedGuildInvites) {
          if (!newInvites.has(cachedCode)) {
            // Invite disappeared! It was a single-use invite that was just consumed.
            detected = {
              code: cachedCode,
              inviterDiscordId: cachedData.inviterDiscordId,
              inviterUsername: cachedData.inviterUsername,
              uses: cachedData.uses + 1,
            };
            break;
          }
        }
      }

      // Update the cache with the fresh invite data
      const updatedMap = new Map<string, CachedInviteData>();
      for (const [code, invite] of newInvites) {
        const uses = invite.uses || 0;
        const inviterId = invite.inviter ? invite.inviter.id : null;
        const inviterTag = invite.inviter ? invite.inviter.username : null;

        updatedMap.set(code, {
          code,
          uses,
          inviterDiscordId: inviterId,
          inviterUsername: inviterTag,
          maxUses: invite.maxUses,
        });

        // Update database as well
        await prisma.trackedInvite.upsert({
          where: { code },
          update: { uses, inviterDiscordId: inviterId },
          create: { code, uses, inviterDiscordId: inviterId },
        }).catch(() => {});
      }
      this.inviteCache.set(guild.id, updatedMap);

      if (detected) {
        await Logger.log({
          type: 'INVITE_DETECTED',
          title: 'Invite Used Detected',
          message: `Detected invite ${detected.code} by @${detected.inviterUsername || 'User'} (ID: ${detected.inviterDiscordId || 'Unknown'}). Uses: ${detected.uses}`,
          metadata: {
            code: detected.code,
            inviterId: detected.inviterDiscordId || 'Unknown',
            inviterUsername: detected.inviterUsername || 'Unknown',
            uses: detected.uses,
          },
        });
      } else {
        await Logger.log({
          type: 'INVITE_DETECTED',
          title: 'Invite Not Identified',
          message: 'Member joined via vanity URL, temporary invite, or unidentifiable link. No inviter assigned.',
        });
      }

      return detected;
    } catch (err: any) {
      console.error(`[InviteService] Error detecting used invite: ${err.message}`);
      return null;
    }
  }

  /**
   * Helper for test/simulated environment
   */
  public static async registerSimulatedInvite(code: string, inviterDiscordId: string, initialUses: number = 0) {
    return prisma.trackedInvite.upsert({
      where: { code },
      update: { inviterDiscordId, uses: initialUses },
      create: { code, inviterDiscordId, uses: initialUses },
    });
  }

  /**
   * Simulates an invite usage increment
   */
  public static async incrementInviteUsage(code: string) {
    const invite = await prisma.trackedInvite.findUnique({
      where: { code },
    });

    if (!invite) return null;

    const updated = await prisma.trackedInvite.update({
      where: { code },
      data: { uses: invite.uses + 1 },
    });

    return updated;
  }
}

export default InviteService;

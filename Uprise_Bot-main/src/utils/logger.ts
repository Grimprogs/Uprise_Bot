import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import prisma from '../database/prisma.ts';
import config from '../config/config.ts';
import { getDiscordBotClient } from '../bot/client.ts';

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  type: 'JOIN' | 'LEAVE' | 'PENALTY' | 'INVITE_DETECTED' | 'VERIFICATION' | 'REFERRAL_CREATED' | 'REFERRAL_VALIDATED' | 'XP_AWARDED' | 'ERROR' | 'ADMIN' | 'VOICE';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  discordClient?: Client | null;
}

export class Logger {
  private static discordClient: Client | null = null;

  public static setDiscordClient(client: Client | null) {
    this.discordClient = client;
  }

  public static getDiscordClient(): Client | null {
    return this.discordClient;
  }

  public static async log(entry: LogEntry): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${entry.type}] ${entry.title}: ${entry.message}`);

    // Persist to SQLite for the staff audit ledger
    try {
      await prisma.botLog.create({
        data: {
          type: entry.type,
          title: entry.title,
          message: entry.message,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        },
      });
    } catch (err) {
      console.error('[Logger] Failed to write log to SQLite database:', err);
    }

    // Attempt to post to Discord #bot-logs channel if connected
    const client = entry.discordClient || this.discordClient || getDiscordBotClient();
    if (client && config.botLogChannelId) {
      try {
        const channel = await client.channels.fetch(config.botLogChannelId).catch((fetchErr) => {
          console.warn(`[Logger] Could not fetch botLogChannelId (${config.botLogChannelId}):`, fetchErr.message);
          return null;
        });
        if (channel && channel.isTextBased()) {
          const textChannel = channel as TextChannel;
          const color = this.getColorForType(entry.type);

          const embed = new EmbedBuilder()
            .setTitle(entry.title)
            .setDescription(entry.message)
            .setColor(color)
            .setTimestamp(new Date())
            .setFooter({ text: 'UPRISE Bot Logger' });

          if (entry.metadata) {
            for (const [key, value] of Object.entries(entry.metadata)) {
              if (value !== undefined && value !== null) {
                embed.addFields({
                  name: key.charAt(0).toUpperCase() + key.slice(1),
                  value: String(value).slice(0, 1024),
                  inline: true,
                });
              }
            }
          }

          await textChannel.send({ embeds: [embed] }).catch((e) => {
            console.warn('[Logger] Could not send log embed to Discord channel:', e.message);
          });
        }
      } catch (e: any) {
        console.warn('[Logger] Discord channel fetch failed:', e.message);
      }
    }
  }

  private static getColorForType(type: LogEntry['type']): number {
    switch (type) {
      case 'REFERRAL_VALIDATED':
      case 'VERIFICATION':
        return 0x22c55e; // Green
      case 'XP_AWARDED':
        return 0x3b82f6; // Blue
      case 'REFERRAL_CREATED':
      case 'INVITE_DETECTED':
      case 'JOIN':
        return 0xeab308; // Amber
      case 'ERROR':
        return 0xef4444; // Red
      case 'LEAVE':
      case 'PENALTY':
        return 0xf97316; // Orange
      case 'ADMIN':
        return 0xa855f7; // Purple
      case 'VOICE':
        return 0x14b8a6; // Teal
      default:
        return 0x64748b; // Slate
    }
  }
}

export default Logger;

import { Client, GatewayIntentBits, Partials, REST, Routes, Events } from 'discord.js';
import config, { isDiscordConfigured } from '../config/config.ts';
import InviteService from '../services/inviteService.ts';
import ReferralService from '../services/referralService.ts';
import Logger from '../utils/logger.ts';
import readyEvent from '../events/ready.ts';
import guildMemberAddEvent from '../events/guildMemberAdd.ts';
import guildMemberRemoveEvent from '../events/guildMemberRemove.ts';
import interactionCreateEvent from '../events/interactionCreate.ts';

import verifyCommand from '../commands/verify.ts';
import xpCommand from '../commands/xp.ts';
import leaderboardCommand from '../commands/leaderboard.ts';
import referralsCommand from '../commands/referrals.ts';
import adminXpCommand from '../commands/adminXp.ts';
import adminReferralCommand from '../commands/adminReferral.ts';

export const allCommands = [
  verifyCommand,
  xpCommand,
  leaderboardCommand,
  referralsCommand,
  adminXpCommand,
  adminReferralCommand,
];

let botClient: Client | null = null;
let isStarting = false;

export function getBotClient(): Client | null {
  return botClient;
}

export function isBotOnline(): boolean {
  return Boolean(botClient && botClient.isReady());
}

/**
 * Deploys slash commands to Discord
 */
export async function deploySlashCommands(token?: string, clientId?: string, guildId?: string) {
  const authToken = token || config.discordToken;
  const appId = clientId || config.discordClientId;
  const targetGuild = guildId || config.discordGuildId;

  if (!authToken || !appId) {
    throw new Error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID for command deployment.');
  }

  const rest = new REST({ version: '10' }).setToken(authToken);
  const commandData = allCommands.map((c) => c.data.toJSON());

  console.log(`[UPRISE Bot] Deploying ${commandData.length} slash commands...`);

  if (targetGuild) {
    await rest.put(Routes.applicationGuildCommands(appId, targetGuild), {
      body: commandData,
    });
    console.log(`[UPRISE Bot] Successfully registered slash commands for guild ${targetGuild}`);
  } else {
    await rest.put(Routes.applicationCommands(appId), {
      body: commandData,
    });
    console.log('[UPRISE Bot] Successfully registered global slash commands');
  }

  return commandData;
}

/**
 * Initializes and starts the Discord bot client
 */
export async function startDiscordBot(): Promise<Client> {
  if (botClient && botClient.isReady()) {
    return botClient;
  }

  if (isStarting) {
    throw new Error('Bot is currently starting up.');
  }

  if (!isDiscordConfigured()) {
    throw new Error('Cannot start Discord bot: DISCORD_TOKEN is not configured in .env');
  }

  isStarting = true;

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // Privileged intent: must be enabled in Discord Dev Portal
        GatewayIntentBits.GuildInvites, // Needed for tracking invites
        GatewayIntentBits.GuildMessages,
      ],
      partials: [Partials.GuildMember, Partials.User],
    });

    Logger.setDiscordClient(client);

    // Register event listeners
    client.once(Events.ClientReady, (readyClient) => readyEvent.execute(readyClient));
    client.on(Events.GuildCreate, async (guild) => {
      console.log(`[UPRISE Bot] Joined/detected guild: "${guild.name}" (${guild.id})`);
      await InviteService.cacheGuildInvites(guild);
    });
    client.on(Events.InviteCreate, async (invite) => {
      await InviteService.handleInviteCreate(invite);
    });
    client.on(Events.GuildMemberAdd, (member) => guildMemberAddEvent.execute(member));
    client.on(Events.GuildMemberRemove, (member) => guildMemberRemoveEvent.execute(member));
    client.on(Events.InteractionCreate, (interaction) => interactionCreateEvent.execute(interaction));

    client.on('error', (err) => {
      console.error('[UPRISE Bot] Discord client error:', err);
    });

    // Deploy commands automatically if credentials are ready
    if (config.discordClientId) {
      deploySlashCommands().catch((e) => {
        console.warn('[UPRISE Bot] Non-fatal: automatic command registration failed:', e.message);
      });
    }

    await client.login(config.discordToken);
    botClient = client;
    isStarting = false;

    // Background departure audit loop: checks for departed members every 20s across all guilds
    setInterval(async () => {
      try {
        if (!botClient || !botClient.isReady()) return;
        for (const [_, guild] of botClient.guilds.cache) {
          await ReferralService.syncDepartedMembers(guild);
        }
      } catch (err: any) {
        console.warn('[UPRISE Bot] Departure audit interval error:', err.message);
      }
    }, 20000);

    return client;
  } catch (err) {
    isStarting = false;
    botClient = null;
    throw err;
  }
}

export function getDiscordBotClient(): Client | null {
  return botClient;
}

/**
 * Gracefully stops the Discord bot
 */
export async function stopDiscordBot(): Promise<void> {
  if (botClient) {
    console.log('[UPRISE Bot] Destroying Discord client connection...');
    await botClient.destroy();
    botClient = null;
  }
}

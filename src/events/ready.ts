import { Client, Events, EmbedBuilder, TextChannel } from 'discord.js';
import InviteService from '../services/inviteService.js';
import { createVerificationButtonRow } from '../commands/verify.js';
import Logger from '../utils/logger.js';
import config from '../config/config.js';

export const readyEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client) {
    if (!client.user) return;

    console.log(`[UPRISE Bot] Logged in as ${client.user.tag} (${client.user.id})`);
    Logger.setDiscordClient(client);

    try {
      // Fetch all guilds actively
      const oauthGuilds = await client.guilds.fetch().catch(() => null);
      const totalGuilds = oauthGuilds ? oauthGuilds.size : client.guilds.cache.size;

      console.log(`[UPRISE Bot] Initializing invite caching across ${totalGuilds} guild(s)...`);

      if (oauthGuilds) {
        for (const [guildId, oauthGuild] of oauthGuilds) {
          const fullGuild = await oauthGuild.fetch().catch(() => null);
          if (fullGuild) {
            console.log(`[UPRISE Bot] Caching invites for guild: "${fullGuild.name}" (${guildId})`);
            await InviteService.cacheGuildInvites(fullGuild);
          }
        }
      } else {
        for (const [guildId, guild] of client.guilds.cache) {
          console.log(`[UPRISE Bot] Caching invites for cached guild: "${guild.name}" (${guildId})`);
          await InviteService.cacheGuildInvites(guild);
        }
      }

      await Logger.log({
        type: 'ADMIN',
        title: 'UPRISE Bot Online',
        message: `UPRISE Bot is online and tracking invites across ${totalGuilds} server(s).`,
        metadata: {
          botTag: client.user.tag,
          botId: client.user.id,
          servers: totalGuilds,
        },
      });

      // Ensure permanent verification gateway message in #verify channel
      for (const [_, guild] of client.guilds.cache) {
        const verifyChannel = guild.channels.cache.find(
          (c) => c.isTextBased() && (c.name.includes('verify') || c.id === '1556015393842397195')
        ) as TextChannel | undefined;

        if (verifyChannel && verifyChannel.isTextBased()) {
          const messages = await verifyChannel.messages.fetch({ limit: 10 }).catch(() => null);
          const hasBotMessage = messages?.some((m) => m.author.id === client.user?.id);
          if (!hasBotMessage) {
            const verifyEmbed = new EmbedBuilder()
              .setTitle('🛡️ UPRISE Verification Gateway')
              .setDescription(
                'Welcome to **UPRISE**!\n\n' +
                'Click the **VERIFY** button below to complete verification and unlock:\n' +
                `• **+${config.xpVerification} XP** instant reward\n` +
                '• **@Community Member** role\n' +
                '• Full community channel access\n\n' +
                '*(When you click the button, only you will see the response)*'
              )
              .setColor(0x22c55e)
              .setFooter({ text: 'UPRISE Security System' });

            const row = createVerificationButtonRow();
            await verifyChannel.send({ embeds: [verifyEmbed], components: [row] }).catch((err) => {
              console.warn('[UPRISE Bot] Failed to send permanent verify embed:', err.message);
            });
            console.log(`[UPRISE Bot] Ensured permanent verification gateway in #${verifyChannel.name}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[UPRISE Bot] Error during ready guild initialization:', err);
    }
  },
};

export default readyEvent;

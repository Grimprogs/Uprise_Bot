import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import dotenv from 'dotenv';
import { deploySlashCommands } from '../src/bot/client.ts';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

async function main() {
  console.log('1. Deploying all slash commands (including /clear)...');
  await deploySlashCommands();
  console.log('✅ Commands deployed.');

  console.log('2. Connecting to Discord to setup voice rules and channel guides...');
  await client.login(process.env.DISCORD_TOKEN);

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID || '');
  console.log(`[Guild] Found: ${guild.name} (${guild.id})`);

  const voiceCategoryId = '1556014917855879349'; // 🔊 VOICE
  const channels = await guild.channels.fetch();

  // 1. Ensure #🔊・voice-commands exists in VOICE category
  let voiceCmdChannel = channels.find(
    (c) =>
      c?.parentId === voiceCategoryId &&
      (c.name.includes('voice-command') || c.name.includes('voice-rules') || c.name.includes('voice-chat')) &&
      c.type === ChannelType.GuildText
  ) as TextChannel | undefined;

  if (!voiceCmdChannel) {
    voiceCmdChannel = (await guild.channels.create({
      name: '🔊・voice-commands',
      type: ChannelType.GuildText,
      parent: voiceCategoryId,
      topic: 'Voice channel commands, temporary room controls, and audio etiquette rules.',
    })) as TextChannel;
    console.log(`✅ Created Voice Text Channel: #${voiceCmdChannel.name}`);
  }

  // Post Voice Rules & Commands with TTL in #🔊・voice-commands
  const voiceRulesEmbed = new EmbedBuilder()
    .setTitle('🔊 UPRISE Voice Channels, Etiquette & TTL Rules')
    .setDescription(
      `Welcome to the **UPRISE Voice Hub**! All voice rooms are dynamically managed by the bot with automatic lifecycle cleanups (TTL).\n\n` +
      `### 🎙️ Voice Channel Code of Conduct:\n` +
      `1. **Mute by Default:** Please keep your microphone muted when listening in groups or during speaker sessions.\n` +
      `2. **Zero Audio Spam:** Soundboards, voice changers, screaming, and loud background music are strictly forbidden.\n` +
      `3. **Respect Channel Ownership:** The room creator has authority over their room. If a room is locked, do not harass the owner for invites.\n` +
      `4. **Zero Harassment:** Disrespectful remarks, interruptions, or unwanted private DMs will result in voice bans.`
    )
    .setColor(0x14b8a6)
    .addFields(
      {
        name: '⏳ Automated Room Lifecycle (TTL)',
        value:
          '• **Join-to-Create:** Join <#1556714586110165092> or type `/vc create` to spawn your room.\n' +
          '• **Auto-Deletion:** Once all members leave your temporary room, the channel is **instantly deleted** to keep the server clutter-free.\n' +
          '• **Response TTL:** Bot confirmations and control panels use ephemeral auto-deleting notices (5-15s TTL).',
      },
      {
        name: '🎛️ Voice Slash Commands (`/vc`)',
        value:
          '• `/vc create [name] [limit]` — Spawn your custom room\n' +
          '• `/vc lock` — Prevent new users from entering\n' +
          '• `/vc unlock` — Reopen room to everyone\n' +
          '• `/vc hide` / `/vc unhide` — Toggle channel visibility\n' +
          '• `/vc name <new_name>` — Rename your room\n' +
          '• `/vc limit <number>` — Set maximum member count\n' +
          '• `/vc permit @user` — Whitelist a friend into your locked room\n' +
          '• `/vc kick @user` — Disconnect an unwanted user',
      }
    )
    .setFooter({ text: 'UPRISE Audio Infrastructure • Real-Time Dynamic Allocation' })
    .setTimestamp(new Date());

  await voiceCmdChannel.send({ embeds: [voiceRulesEmbed] });
  console.log(`✅ Posted Voice Rules & Commands in #${voiceCmdChannel.name}`);

  // 2. Setup Guides for Community Channels that didn't have rules
  const communityGuides: Array<{ channelId: string; title: string; color: number; description: string; fields: Array<{ name: string; value: string }> }> = [
    {
      channelId: '1556017914744672266', // 👋・introductions
      title: '👋 Welcome to UPRISE Introductions!',
      color: 0x6366f1,
      description: 'Tell the community who you are! Feel free to copy and paste this quick template:',
      fields: [
        {
          name: '📝 Introduction Template',
          value:
            '**Name / Handle:** \n' +
            '**Role:** (Developer / Founder / Designer / Student / Explorer)\n' +
            '**What I’m Building / Working On:** \n' +
            '**Tech Stack / Interests:** \n' +
            '**Looking for:** (Co-founders, feedback, friends, collaboration)\n' +
            '**Links / Socials:** ',
        },
        {
          name: '📌 Channel Rule',
          value: 'Keep unprompted direct sales and spam out of this channel. Focus on genuine connection!',
        },
      ],
    },
    {
      channelId: '1556017941076770957', // 💻・tech
      title: '💻 Tech & Engineering Hub',
      color: 0x3b82f6,
      description: 'The place for high-signal engineering conversations, architecture debates, and debugging.',
      fields: [
        {
          name: '🎯 Topics Welcomed',
          value:
            '• Modern web, cloud & distributed systems\n' +
            '• AI/LLM models, prompt engineering & RAG pipelines\n' +
            '• DevOps, Docker, databases & security best practices\n' +
            '• Code reviews and tricky bug hunts',
        },
      ],
    },
    {
      channelId: '1556018042016632942', // 🚀・startups
      title: '🚀 Founders & Startups Room',
      color: 0xf59e0b,
      description: 'From zero-to-one: ideation, MVP launches, finding product-market fit, and fundraising.',
      fields: [
        {
          name: '💡 Discussions',
          value:
            '• Pitch deck and value proposition feedback\n' +
            '• Go-to-market strategies and early user acquisition\n' +
            '• Founder stories, lessons learned, and metrics\n' +
            '• Legal, incorporation, and tooling recommendations',
        },
      ],
    },
    {
      channelId: '1556018119758319666', // 🏗️・showcase
      title: '🏗️ Project & Product Showcase',
      color: 0x10b981,
      description: 'Show off what you are building! Demos, GitHub repos, live apps, and new features.',
      fields: [
        {
          name: '🚀 Showcase Format',
          value:
            '• **Project Name:** \n' +
            '• **One-line Pitch:** \n' +
            '• **Live Link / Demo:** \n' +
            '• **What feedback do you need?** (UI/UX, bug reports, performance)',
        },
      ],
    },
    {
      channelId: '1556018077588791387', // 🤝・networking
      title: '🤝 Networking & Collaboration',
      color: 0xec4899,
      description: 'Connect with peers, find co-founders, hire talent, or team up for hackathons.',
      fields: [
        {
          name: '🤝 Guidelines',
          value:
            '• Be explicit about the role, commitment, and skill requirements.\n' +
            '• No predatory unpaid labor schemes.\n' +
            '• Build relationships first, pitch second!',
        },
      ],
    },
  ];

  for (const guide of communityGuides) {
    try {
      const ch = (await guild.channels.fetch(guide.channelId)) as TextChannel;
      if (ch && ch.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(guide.title)
          .setColor(guide.color)
          .setDescription(guide.description)
          .addFields(guide.fields)
          .setFooter({ text: 'UPRISE Community Guidelines' })
          .setTimestamp(new Date());

        await ch.send({ embeds: [embed] });
        console.log(`✅ Posted guide in #${ch.name}`);
      }
    } catch (err: any) {
      console.warn(`Could not post guide in channel ${guide.channelId}:`, err.message);
    }
  }

  console.log('🎉 Voice channel rules, commands, and community guides setup complete!');
  client.destroy();
}

main().catch(console.error);

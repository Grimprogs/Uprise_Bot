import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  VoiceChannel,
  CategoryChannel,
} from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

async function main() {
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[Bot] Logged in as ${client.user?.tag}`);

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID || '');
  console.log(`[Guild] Found: ${guild.name} (${guild.id})`);

  // Channel IDs already in guild
  const rulesChannelId = '1556015267497381948'; // 📜・rules
  const verifyChannelId = '1556015393842397195'; // ✅・verify
  const botCommandsChannelId = '1556028055116324955'; // 🤖・bot-commands
  const voiceCategoryChannelId = '1556014917855879349'; // 🔊 VOICE category
  const voiceTextChannelId = '1556028355143405719'; // 🔊・networking text channel
  const staffCategoryId = '1556014942153343136'; // 🔐 STAFF category

  // 1. Post to #📜・rules
  try {
    const rulesChannel = (await guild.channels.fetch(rulesChannelId)) as TextChannel;
    if (rulesChannel && rulesChannel.isTextBased()) {
      const embedHeader = new EmbedBuilder()
        .setTitle('🌊 UPRISE COMMUNITY GUIDELINES & CODE OF CONDUCT')
        .setDescription(
          `Welcome to **UPRISE**! Our mission is to build a high-signal community of builders, founders, engineers, and creators.\n\n` +
          `By joining and participating in this server, you agree to adhere to our community standards. Violations will result in warnings, XP penalties, timeouts, or permanent bans.`
        )
        .setColor(0x0284c7)
        .setThumbnail(guild.iconURL() || client.user?.displayAvatarURL() || null);

      const embedRules = new EmbedBuilder()
        .setTitle('📜 Official Server Rules')
        .setColor(0x0ea5e9)
        .addFields(
          {
            name: '1️⃣ Respect & Professionalism',
            value:
              'Treat all members with courtesy. Harassment, hate speech, sexism, racism, trolling, or aggressive behavior will not be tolerated under any circumstance.',
          },
          {
            name: '2️⃣ Zero Spam & Unauthorized Promotion',
            value:
              'No unprompted DMs to members, self-promotion, telegram links, or referral links in general channels. Keep project showcases strictly in <#1556018119758319666>.',
          },
          {
            name: '3️⃣ Account & Identity Integrity',
            value:
              'Each member is permitted **one Discord account**. Using alternate accounts ("alts"), disposable temp emails, or spoofed phone numbers for verification or referral farming is strictly prohibited and results in immediate automated bans.',
          },
          {
            name: '4️⃣ Voice & Event Etiquette',
            value:
              'Keep microphones muted when you are not speaking during events, AMAs, and townhalls. No soundboards, mic-spam, screamers, or disruptive background noise.',
          },
          {
            name: '5️⃣ Fair Play in XP & Leaderboard',
            value:
              'UPRISE XP and referral rankings are audited in real time. Any attempt to exploit bot mechanics, spam commands, or coordinate artificial invite schemes will trigger automated ledger rollbacks and banishment from community perks.',
          },
          {
            name: '6️⃣ Follow Discord Terms of Service',
            value:
              'All members must follow the official [Discord Terms of Service](https://discord.com/terms) and [Community Guidelines](https://discord.com/guidelines).',
          }
        )
        .setFooter({ text: 'UPRISE Administration • Enforcement is at staff discretion' })
        .setTimestamp(new Date());

      await rulesChannel.send({ embeds: [embedHeader, embedRules] });
      console.log('✅ Posted rules in #📜・rules');
    }
  } catch (err) {
    console.error('Failed to post rules:', err);
  }

  // 2. Post to #✅・verify
  try {
    const verifyChannel = (await guild.channels.fetch(verifyChannelId)) as TextChannel;
    if (verifyChannel && verifyChannel.isTextBased()) {
      const verifyEmbed = new EmbedBuilder()
        .setTitle('🛡️ UPRISE Verification & Onboarding Gateway')
        .setDescription(
          `Welcome newcomer! To unlock access to the UPRISE community channels, voice rooms, and progression systems, please complete identity verification.\n\n` +
          `### 🎁 Verification Rewards:\n` +
          `• **+100 UPRISE XP** instantly awarded to your account\n` +
          `• **🌟 Community Member** role unlocked\n` +
          `• Full read/write access to discussion, networking, and tech channels\n` +
          `• Activates referral attribution for the person who invited you (+250 XP)\n\n` +
          `### 📝 Required Information:\n` +
          `1. **Full Name** (Display and community recognition)\n` +
          `2. **Phone Number** (with country code, e.g. \`+91 9876543210\` or \`+1 5551234567\`)\n` +
          `3. **Email Address** (6-digit OTP code sent for confirmation)\n\n` +
          `*Your data is stored securely and never shared with 3rd parties.*`
        )
        .setColor(0x6366f1)
        .setThumbnail(client.user?.displayAvatarURL() || null)
        .setFooter({ text: 'UPRISE Security Gateway • Fast 30-Second Verification' })
        .setTimestamp(new Date());

      const verifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('uprise_start_verification_btn')
          .setLabel('🛡️ Start Verification Now')
          .setStyle(ButtonStyle.Primary)
      );

      await verifyChannel.send({ embeds: [verifyEmbed], components: [verifyRow] });
      console.log('✅ Posted verification gateway in #✅・verify');
    }
  } catch (err) {
    console.error('Failed to post verify guide:', err);
  }

  // 3. Post to #🤖・bot-commands (Member Guide)
  try {
    const commandsChannel = (await guild.channels.fetch(botCommandsChannelId)) as TextChannel;
    if (commandsChannel && commandsChannel.isTextBased()) {
      const memberCommandsEmbed = new EmbedBuilder()
        .setTitle('🤖 UPRISE Community Commands Manual')
        .setDescription(
          `Here is the complete reference guide for all member slash commands available in UPRISE. All commands use the standard Discord slash (\`/\`) interface.`
        )
        .setColor(0x8b5cf6)
        .addFields(
          {
            name: '🛡️ `/verify` — Identity Verification',
            value:
              'Opens the verification modal. Submit your full name, phone number (with country code), and email address to receive your 6-digit OTP.\n' +
              '**Reward:** `+100 XP` & `🌟 Community Member` role.',
          },
          {
            name: '📊 `/xp [user]` — XP Balance & Rank',
            value:
              'Check your current XP balance, rank in the server, level progression, and verified status. You can also specify an optional `user` to inspect a fellow member.',
          },
          {
            name: '🏆 `/leaderboard [page]` — Top Rankings',
            value:
              'Displays the top 10 members sorted by XP and verified referrals. Leaderboard updates in real time with dynamic medal badges (`🥇`, `🥈`, `🥉`).',
          },
          {
            name: '🤝 `/referrals` — Your Referral Stats & Invite Code',
            value:
              'Displays your personal referral statistics: your unique invite link, number of valid referrals, pending referrals, total bonus XP earned, and full list of recruited members.\n' +
              '**Reward:** `+250 XP` for every invited member who completes `/verify`.',
          },
          {
            name: '🔊 `/vc create [name] [limit]` — Personal Voice Channel',
            value:
              'Creates your personal temporary voice channel. You become the owner and receive a real-time interactive control panel to manage who can join.',
          },
          {
            name: '🎛️ Voice Channel Controls (`/vc`)',
            value:
              '• `/vc lock` — Lock channel to current members only\n' +
              '• `/vc unlock` — Unlock channel so anyone can join\n' +
              '• `/vc hide` / `/vc unhide` — Toggle channel visibility\n' +
              '• `/vc name <new_name>` — Rename your channel\n' +
              '• `/vc limit <number>` — Set maximum members (0 for unlimited)\n' +
              '• `/vc permit @user` — Whitelist a specific friend\n' +
              '• `/vc kick @user` — Disconnect a user from your channel',
          }
        )
        .setFooter({ text: 'Commands are rate-limited to avoid spam. Use respectfully.' })
        .setTimestamp(new Date());

      await commandsChannel.send({ embeds: [memberCommandsEmbed] });
      console.log('✅ Posted member commands in #🤖・bot-commands');
    }
  } catch (err) {
    console.error('Failed to post member commands:', err);
  }

  // 4. Create "➕ Join to Create VC" and post Voice guide in #🔊・networking
  try {
    // Check if "➕ Join to Create VC" already exists in category
    const channels = await guild.channels.fetch();
    let hubChannel = channels.find(
      (c) => c?.name.includes('Create VC') && c.type === ChannelType.GuildVoice
    );

    if (!hubChannel) {
      hubChannel = await guild.channels.create({
        name: '➕ Join to Create VC',
        type: ChannelType.GuildVoice,
        parent: voiceCategoryChannelId,
        userLimit: 1,
      });
      console.log(`✅ Created Voice Hub: ${hubChannel.name} (${hubChannel.id})`);

      // Update .env with the new VC_HUB_CHANNEL_ID
      const envPath = '/.env';
      let envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(
        /VC_HUB_CHANNEL_ID=".*"/,
        `VC_HUB_CHANNEL_ID="${hubChannel.id}"`
      );
      fs.writeFileSync(envPath, envContent);
      console.log(`✅ Configured VC_HUB_CHANNEL_ID="${hubChannel.id}" in .env`);
    }

    const voiceTextChannel = (await guild.channels.fetch(voiceTextChannelId)) as TextChannel;
    if (voiceTextChannel && voiceTextChannel.isTextBased()) {
      const voiceEmbed = new EmbedBuilder()
        .setTitle('🔊 Dynamic Voice Channels & Event Hub Guide')
        .setDescription(
          `Welcome to the **UPRISE Voice Hub**! We offer dynamic, member-owned voice channels and scheduled event rooms.`
        )
        .setColor(0x14b8a6)
        .addFields(
          {
            name: '✨ How to Create Your Own Voice Channel',
            value:
              `**Method 1:** Join the <#${hubChannel.id}> channel above! The bot will instantly create a private channel for you and move you into it.\n` +
              `**Method 2:** Type \`/vc create [name] [limit]\` in any channel.`,
          },
          {
            name: '🎛️ Owner Features',
            value:
              'When you own a channel, you get full control:\n' +
              '• Lock the room with `/vc lock` so outsiders cannot enter\n' +
              '• Permit friends with `/vc permit @friend`\n' +
              '• Change user limit with `/vc limit 4`\n' +
              '• Automatic cleanup: the channel is automatically deleted as soon as everyone leaves!',
          },
          {
            name: '🎙️ Voice Chat Rules',
            value:
              '• Keep conversations constructive and friendly.\n' +
              '• No ear rape, loud music bots without consent, or soundboard spam.\n' +
              '• Channel owners have authority over their dynamic rooms.',
          }
        )
        .setFooter({ text: 'Dynamic Voice Systems • UPRISE Audio Network' });

      await voiceTextChannel.send({ embeds: [voiceEmbed] });
      console.log('✅ Posted voice guide in #🔊・networking');
    }
  } catch (err) {
    console.error('Failed to create/post voice hub:', err);
  }

  // 5. Create #🔒・admin-commands under 🔐 STAFF and post Admin Manual
  try {
    const channels = await guild.channels.fetch();
    let adminChannel = channels.find(
      (c) =>
        (c?.name === 'admin-commands' || c?.name === 'staff-commands') &&
        c.parentId === staffCategoryId
    ) as TextChannel;

    if (!adminChannel) {
      adminChannel = (await guild.channels.create({
        name: 'staff-commands',
        type: ChannelType.GuildText,
        parent: staffCategoryId,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
          },
        ],
      })) as TextChannel;
      console.log(`✅ Created Staff Channel: #${adminChannel.name} (${adminChannel.id})`);
    }

    const adminEmbed = new EmbedBuilder()
      .setTitle('🛡️ UPRISE Staff & Administrator Operations Manual')
      .setDescription(
        `This channel contains the official command reference for **Staff, Organizers, and Admins**. All actions are logged into the immutable audit ledger.`
      )
      .setColor(0xef4444)
      .addFields(
        {
          name: '📅 `/event-vc create` — Schedule Event Voice Channel',
          value:
            'Creates a locked event channel that automatically unlocks at the scheduled time.\n' +
            '**Parameters:**\n' +
            '• `name` (required): Event title (e.g. `Community AMA`)\n' +
            '• `start_time` (required): Opening time (`now`, `30m`, `2h`, or timestamp)\n' +
            '• `end_time` (optional): Duration or closing timestamp\n' +
            '• `limit` (optional): Max attendees\n' +
            '• `hidden` (optional): True to hide until live\n' +
            '• `announce_channel` (optional): Text channel for opening blast\n' +
            '• `ping_role` (optional): Role to mention when doors open',
        },
        {
          name: '📅 `/event-vc list` & `/event-vc cancel`',
          value:
            '• `/event-vc list` — View all scheduled, pending, and live event voice channels.\n' +
            '• `/event-vc cancel channel:#channel` — Cancel a scheduled event and delete the voice channel.',
        },
        {
          name: '⚖️ `/admin-xp` — XP Ledger Modifications',
          value:
            'Every adjustment is permanently recorded in the database ledger with staff ID and reason.\n' +
            '• `/admin-xp add user:@member amount:50 reason:"Hackathon winner"`\n' +
            '• `/admin-xp remove user:@member amount:50 reason:"Spam penalty"`\n' +
            '• `/admin-xp set user:@member amount:500 reason:"Reset balance"`',
        },
        {
          name: '🔗 `/admin-referral` — Referral Attribution Management',
          value:
            '• `/admin-referral set-inviter invitee:@member inviter:@member`\n' +
            'Manually links a referral attribution if a new member forgot an invite link. Awards `+250 XP` to the inviter upon verification.\n' +
            '• `/admin-referral invalidate invitee:@member reason:"Alt account"`\n' +
            'Invalidates fraudulent referral, claws back `250 XP` from the inviter, and logs the penalty.',
        },
        {
          name: '📊 Web Management Dashboard & Google Sheets',
          value:
            'Admins can access the full web dashboard at the deployment URL:\n' +
            '• **Members View:** Inspect all member details, phone numbers, and verification status\n' +
            '• **Audited XP Ledger:** Trace all transactions and reasons\n' +
            '• **Google Sheets Sync:** Export all members and referrals to Google Drive spreadsheet in 1 click\n' +
            '• **Live Bot Gateway Controls:** Pause/Resume bot instance without token collisions',
        }
      )
      .setFooter({ text: 'UPRISE Administration • All commands strictly audited' })
      .setTimestamp(new Date());

    await adminChannel.send({ embeds: [adminEmbed] });
    console.log(`✅ Posted Admin Guide in #${adminChannel.name}`);
  } catch (err) {
    console.error('Failed to post admin guide:', err);
  }

  console.log('🎉 All rules and guides successfully posted!');
  client.destroy();
}

main().catch(console.error);

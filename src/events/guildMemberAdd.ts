import { Events, GuildMember, EmbedBuilder, TextChannel } from 'discord.js';
import InviteService from '../services/inviteService.ts';
import ReferralService from '../services/referralService.ts';
import { createVerificationButtonRow } from '../commands/verify.ts';
import config from '../config/config.ts';
import Logger from '../utils/logger.ts';

// In-memory debounce set to avoid duplicate welcomes if Discord retries or emits duplicate events
const recentlyGreeted = new Map<string, number>();

export const guildMemberAddEvent = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    const now = Date.now();
    const lastGreeted = recentlyGreeted.get(member.id);
    if (lastGreeted && now - lastGreeted < 30000) {
      console.log(`[UPRISE Bot] Skipping duplicate guildMemberAdd for ${member.user.tag} (debounced)`);
      return;
    }
    recentlyGreeted.set(member.id, now);

    // Clean up old entries
    if (recentlyGreeted.size > 200) {
      for (const [id, timestamp] of recentlyGreeted.entries()) {
        if (now - timestamp > 60000) recentlyGreeted.delete(id);
      }
    }

    console.log(`[UPRISE Bot] Member joined: ${member.user.tag} (${member.id})`);

    // 1. Detect which invite was used
    const detectedInvite = await InviteService.detectUsedInvite(member.guild);

    // 2. Record member join and establish PENDING referral in database
    await ReferralService.recordMemberJoin({
      inviteeDiscordId: member.id,
      inviteeUsername: member.user.username,
      inviterDiscordId: detectedInvite?.inviterDiscordId || null,
      inviterUsername: detectedInvite?.inviterUsername || null,
      inviteCode: detectedInvite?.code || null,
      isBot: member.user.bot,
    });

    // 3. Assign New Member role if configured
    if (config.newMemberRoleId) {
      await member.roles.add(config.newMemberRoleId).catch((err) => {
        console.warn(`[UPRISE Bot] Could not assign New Member role to ${member.user.tag}:`, err.message);
      });
    }

    // 4. Log to staff channel
    await Logger.log({
      type: 'JOIN',
      title: 'Member Joined Guild',
      message: `**@${member.user.username}** joined the server.\nInvite: \`${detectedInvite?.code || 'Direct / Unknown'}\`\nInviter: ${detectedInvite?.inviterUsername ? `@${detectedInvite.inviterUsername}` : 'Unknown'}\nReferral status: **PENDING** (XP locked until verified).`,
      metadata: {
        member: member.user.tag,
        memberId: member.id,
        invite: detectedInvite?.code || 'None',
        inviter: detectedInvite?.inviterUsername || 'None',
      },
    });

    // 5. Send Private DM Verification message to the new member
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🔒 UPRISE Verification Gateway')
        .setDescription(
          `Welcome to **UPRISE**, <@${member.id}>!\n\n` +
          `Click the **VERIFY** button below to complete verification and claim your **+${config.xpVerification} XP** bonus.\n\n` +
          `*(This message is private to you)*`
        )
        .setColor(0x22c55e)
        .setFooter({ text: 'UPRISE Security Gateway' })
        .setTimestamp(new Date());

      const row = createVerificationButtonRow();
      await member.send({ embeds: [dmEmbed], components: [row] });
      console.log(`[UPRISE Bot] Dispatched private verification DM to ${member.user.username}`);
    } catch (dmErr: any) {
      console.warn(`[UPRISE Bot] Could not send private verification DM to ${member.user.username}:`, dmErr.message);
    }

    // 6. Send Public Welcome greeting (no public button cluttering chat for everyone)
    const welcomeChannel = member.guild.systemChannel || (member.guild.channels.cache.find(
      (c) => c.isTextBased() && (c.name.includes('welcome') || c.name.includes('general'))
    ) as TextChannel | undefined);

    if (welcomeChannel && welcomeChannel.isTextBased()) {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('👋 Welcome to UPRISE!')
        .setDescription(
          `Welcome to the server, <@${member.id}>!\n\n` +
          `• Check your **Direct Messages** for your private verification button.\n` +
          `• Or type \`/verify\` right here in chat (only you can see the response) to claim your **+${config.xpVerification} XP**!`
        )
        .setColor(0x6366f1)
        .setFooter({ text: 'UPRISE Community Gateway' })
        .setTimestamp(new Date());

      await welcomeChannel.send({
        content: `<@${member.id}>`,
        embeds: [welcomeEmbed],
      }).catch((err) => {
        console.warn('[UPRISE Bot] Failed to send welcome greeting:', err.message);
      });
    }
  },
};

export default guildMemberAddEvent;

import { Events, GuildMember, type PartialGuildMember } from 'discord.js';
import ReferralService from '../services/referralService.ts';

export const guildMemberRemoveEvent = {
  name: Events.GuildMemberRemove,
  async execute(member: GuildMember | PartialGuildMember) {
    const username = member.user?.username || 'Unknown Member';
    console.log(`[UPRISE Bot] Member departed guild: ${username} (${member.id})`);

    // Deduct 100 XP from leaving member & inviter, and invalidate referral
    const result = await ReferralService.handleMemberLeave(member.id, username);

    if (result) {
      console.log(
        `[UPRISE Bot] Leave penalties applied: Member -${result.memberDeducted} XP, Inviter @${result.inviterUsername || 'N/A'} -${result.inviterDeducted} XP`
      );
    }
  },
};

export default guildMemberRemoveEvent;

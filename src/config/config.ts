import dotenv from 'dotenv';
dotenv.config();

export interface AppConfig {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string;
  databaseUrl: string;
  xpVerification: number;
  xpReferral: number;
  newMemberRoleId: string;
  communityMemberRoleId: string;
  botLogChannelId: string;
  // Voice channel management
  vcHubChannelId: string;
  vcCategoryId: string;
  eventVcCategoryId: string;
  eventAnnounceChannelId: string;
  eventManagerRoleId: string;
  port: number;
  botDisabled: boolean;
}

export const config: AppConfig = {
  discordToken: process.env.DISCORD_TOKEN?.trim() || '',
  discordClientId: process.env.DISCORD_CLIENT_ID?.trim() || '',
  discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || '',
  databaseUrl: process.env.DATABASE_URL?.trim() || 'file:./data/uprise.db',
  // Configurable XP rewards (Do not hardcode!)
  xpVerification: parseInt(process.env.XP_VERIFICATION || '100', 10) || 100,
  xpReferral: parseInt(process.env.XP_REFERRAL || '250', 10) || 250,
  newMemberRoleId: process.env.NEW_MEMBER_ROLE_ID?.trim() || '',
  communityMemberRoleId: process.env.COMMUNITY_MEMBER_ROLE_ID?.trim() || '',
  botLogChannelId: process.env.BOT_LOG_CHANNEL_ID?.trim() || '',
  vcHubChannelId: process.env.VC_HUB_CHANNEL_ID?.trim() || '',
  vcCategoryId: process.env.VC_CATEGORY_ID?.trim() || '',
  eventVcCategoryId: process.env.EVENT_VC_CATEGORY_ID?.trim() || '',
  eventAnnounceChannelId: process.env.EVENT_ANNOUNCE_CHANNEL_ID?.trim() || '',
  eventManagerRoleId: process.env.EVENT_MANAGER_ROLE_ID?.trim() || '',
  port: parseInt(process.env.PORT || '3000', 10) || 3000,
  botDisabled: process.env.DISABLE_DISCORD_BOT === 'true' || process.env.BOT_DISABLED === 'true',
};

export function isDiscordConfigured(): boolean {
  if (config.botDisabled) return false;
  return Boolean(config.discordToken && config.discordToken.length > 20);
}

export default config;

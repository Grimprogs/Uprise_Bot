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
  port: number;
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
  port: parseInt(process.env.PORT || '3000', 10) || 3000,
};

export function isDiscordConfigured(): boolean {
  return Boolean(config.discordToken && config.discordToken.length > 20);
}

export default config;

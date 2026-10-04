import config, { isDiscordConfigured } from './config/config.ts';
import prisma from './database/prisma.ts';
import { startDiscordBot, stopDiscordBot } from './bot/client.ts';

async function main() {
  console.log('----------------------------------------------------');
  console.log('🚀 UPRISE Discord Bot — MVP');
  console.log('Invite Tracking · Verification · Auditable XP · Leaderboard');
  console.log(`Database: SQLite @ ${config.databaseUrl}`);
  console.log(`XP Configuration: Verification = +${config.xpVerification} XP | Referral = +${config.xpReferral} XP`);
  console.log('----------------------------------------------------');

  try {
    // Test SQLite database connection
    await prisma.$connect();
    console.log('✅ SQLite database connected successfully.');

    if (isDiscordConfigured()) {
      console.log('🔑 Discord token detected. Starting bot client...');
      await startDiscordBot();
    } else {
      console.log('⚠️  No DISCORD_TOKEN provided in .env.');
      console.log('   The bot can be configured in .env or tested via the Web Simulator console.');
    }
  } catch (err: any) {
    console.error('❌ Failed during UPRISE startup:', err.message);
  }
}

// Handle clean shutdown
process.on('SIGINT', async () => {
  console.log('\nStopping UPRISE bot gracefully...');
  await stopDiscordBot();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await stopDiscordBot();
  await prisma.$disconnect();
  process.exit(0);
});

main();

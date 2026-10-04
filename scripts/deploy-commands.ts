import { deploySlashCommands } from '../src/bot/client.js';

async function run() {
  console.log('Deploying slash commands to Discord...');
  try {
    const commands = await deploySlashCommands();
    console.log(`✅ Successfully deployed ${commands.length} commands.`);
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Command deployment failed:', err.message);
    process.exit(1);
  }
}

run();

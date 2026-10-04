import type { Client } from 'discord.js';
import EventChannelService from './eventChannelService.ts';
import VoiceChannelService from './voiceChannelService.ts';

const POLL_INTERVAL_MS = 30 * 1000;

let interval: NodeJS.Timeout | null = null;
let running = false;

/**
 * Drives scheduled event channels and dynamic-channel reconciliation.
 * Started on ClientReady and stopped in stopDiscordBot, so dashboard bot restarts
 * never stack duplicate intervals.
 */
export const VoiceScheduler = {
  start(client: Client) {
    this.stop();
    void this.run(client);
    interval = setInterval(() => void this.run(client), POLL_INTERVAL_MS);
    console.log('[VoiceScheduler] Started (30s poll).');
  },

  stop() {
    if (interval) clearInterval(interval);
    interval = null;
    EventChannelService.clearTimers();
  },

  async run(client: Client) {
    // Skip overlapping ticks if Discord is slow
    if (running || !client.isReady()) return;
    running = true;
    try {
      await EventChannelService.processDue(client);
      await VoiceChannelService.sweep(client);
    } catch (err: any) {
      console.warn('[VoiceScheduler] Tick failed:', err.message);
    } finally {
      running = false;
    }
  },
};

export default VoiceScheduler;

import { ChannelType, Events, type VoiceState } from 'discord.js';
import VoiceChannelService from '../services/voiceChannelService.ts';
import EventChannelService from '../services/eventChannelService.ts';
import config from '../config/config.ts';

export const voiceStateUpdateEvent = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState) {
    try {
      // Left or moved out of a channel: clean up if that left it empty
      const left = oldState.channel;
      if (left && left.id !== newState.channelId && left.type === ChannelType.GuildVoice) {
        await VoiceChannelService.handleChannelLeft(left);
        await EventChannelService.handleChannelLeft(left.client, left);
      }

      // Joined the "➕ Create VC" hub
      if (
        config.vcHubChannelId &&
        newState.channelId === config.vcHubChannelId &&
        oldState.channelId !== newState.channelId &&
        newState.member
      ) {
        await VoiceChannelService.handleHubJoin(newState.member);
      }
    } catch (err: any) {
      console.error('[UPRISE Bot] voiceStateUpdate error:', err);
    }
  },
};

export default voiceStateUpdateEvent;

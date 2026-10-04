import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Shield,
  ShieldAlert,
  Users,
  Hash,
  Copy,
  Check,
  Send,
  HelpCircle,
  ExternalLink,
  Lock,
  Unlock,
  Radio,
  Sparkles,
  Trophy,
  ChevronRight,
  Info,
} from 'lucide-react';

interface DiscordChannel {
  id: string;
  name: string;
  parent: string | null;
}

interface CommandInfo {
  name: string;
  category: 'user' | 'admin';
  description: string;
  syntax: string;
  allowedChannels: string[];
  requiredRole: string;
  permissions: string;
  xpEffect: string;
  notes: string;
  example: string;
  sampleResponse: {
    title: string;
    color: string;
    description: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  };
}

const COMMANDS_DATA: CommandInfo[] = [
  // User Commands
  {
    name: '/verify',
    category: 'user',
    description: 'Verifies the member, assigns the @Community Member role, awards +100 XP, and rewards +250 XP to their inviter.',
    syntax: '/verify',
    allowedChannels: ['#verify-here', '#welcome', '#rules', 'Any Channel (Ephemeral)'],
    requiredRole: '@everyone / @New Member',
    permissions: 'Send Messages / Use Slash Commands',
    xpEffect: '+100 XP to invitee, +250 XP to inviter',
    notes: 'Idempotent: running multiple times never duplicates rewards. An interactive green [ VERIFY ] button is also available in #verify-here.',
    example: '/verify',
    sampleResponse: {
      title: '✅ Verification Successful',
      color: '#22c55e',
      description: 'Welcome to UPRISE, @newbie! Your account has been verified.',
      fields: [
        { name: 'XP Earned', value: '+100 XP', inline: true },
        { name: 'Inviter Rewarded', value: '@grimsense (+250 XP)', inline: true },
        { name: 'Role Unlocked', value: '@Community Member', inline: true },
      ],
    },
  },
  {
    name: '/xp',
    category: 'user',
    description: 'Displays current XP balance, auditable rank standing, and community profile for yourself or another member.',
    syntax: '/xp [user]',
    allowedChannels: ['#commands', '#bot-commands', '#general'],
    requiredRole: '@everyone',
    permissions: 'Use Application Commands',
    xpEffect: 'Read-only query',
    notes: 'If [user] is omitted, checks the caller\'s own profile. Displays global standing out of total server members.',
    example: '/xp user:@grimsense',
    sampleResponse: {
      title: 'UPRISE XP Profile',
      color: '#6366f1',
      description: 'Community standing and points balance.',
      fields: [
        { name: 'Member', value: '@grimsense', inline: true },
        { name: 'Balance', value: '450 XP', inline: true },
        { name: 'Rank', value: 'Rank #1 of 6', inline: true },
      ],
    },
  },
  {
    name: '/leaderboard',
    category: 'user',
    description: 'Interactive paginated Top 10 community leaderboard with navigation buttons and personal ranking highlight.',
    syntax: '/leaderboard',
    allowedChannels: ['#commands', '#leaderboard', '#general'],
    requiredRole: '@everyone',
    permissions: 'Use Application Commands',
    xpEffect: 'Read-only query',
    notes: 'Includes interactive [ ◀ Previous ] and [ Next ▶ ] buttons. Also auto-pinned in #🏆・leaderboard.',
    example: '/leaderboard',
    sampleResponse: {
      title: '🏆 UPRISE LEADERBOARD',
      color: '#f59e0b',
      description: '🥇 @grimsense — 450 XP\n🥈 @emperor_2110 — 100 XP\n🥉 @abhishek_29_07 — 100 XP',
      fields: [
        { name: '🥇 YOUR RANKING & XP', value: 'Rank: #1 of 6\nBalance: 450 XP', inline: false },
      ],
    },
  },
  {
    name: '/referrals',
    category: 'user',
    description: 'Shows your referral performance: successful verified referrals, pending joins, and total earned referral XP.',
    syntax: '/referrals',
    allowedChannels: ['#commands', '#bot-commands'],
    requiredRole: '@everyone',
    permissions: 'Use Application Commands',
    xpEffect: 'Read-only query',
    notes: 'Gives members clear feedback on how many people joined with their invites and how many have verified.',
    example: '/referrals',
    sampleResponse: {
      title: '👥 Your Referral Statistics',
      color: '#3b82f6',
      description: 'Summary of members invited to UPRISE.',
      fields: [
        { name: '✅ Successful', value: '2 members', inline: true },
        { name: '⏳ Pending', value: '0 members', inline: true },
        { name: '⚡ Referral XP', value: '+500 XP', inline: true },
      ],
    },
  },

  // Admin Commands
  {
    name: '/admin-xp',
    category: 'admin',
    description: 'Manually credit or deduct XP from any member with mandatory audit tracking and ledger justification.',
    syntax: '/admin-xp <user> <amount> <reason>',
    allowedChannels: ['#admin-chat', '#staff-commands', '#mod-desk'],
    requiredRole: '🛡️ Admin / 🔨 Moderator',
    permissions: 'Manage Server (ManageGuild)',
    xpEffect: 'Custom delta (+/- N XP)',
    notes: 'Strictly restricted to staff. Cannot be executed in public channels. Permanently logs transaction ID to #bot-logs.',
    example: '/admin-xp user:@nishant.xd04 amount:150 reason:Event Winner Round 1',
    sampleResponse: {
      title: '⚙️ Manual XP Adjustment Processed',
      color: '#22c55e',
      description: 'Staff manual ledger adjustment completed.',
      fields: [
        { name: 'Target Member', value: '@nishant.xd04', inline: true },
        { name: 'Adjustment', value: '+150 XP', inline: true },
        { name: 'New Balance', value: '250 XP', inline: true },
        { name: 'Reason', value: 'Event Winner Round 1', inline: false },
        { name: 'Audit ID', value: '`tx_cmustj...`', inline: true },
      ],
    },
  },
  {
    name: '/admin-referral',
    category: 'admin',
    description: 'Inspect full referral ancestry, fraud detection flags, invite code provenance, and invitee roster for any member.',
    syntax: '/admin-referral <user>',
    allowedChannels: ['#admin-chat', '#staff-commands'],
    requiredRole: '🛡️ Admin / 🔨 Moderator',
    permissions: 'Manage Server (ManageGuild)',
    xpEffect: 'Audit query',
    notes: 'Reveals who invited the member, what code was used, exact join/verify timestamps, and list of people they referred.',
    example: '/admin-referral user:@emperor_2110',
    sampleResponse: {
      title: '🔎 Referral Inspection: @emperor_2110',
      color: '#8b5cf6',
      description: 'Attribution history and lineage.',
      fields: [
        { name: 'Invited By', value: '@grimsense (Code: NZ9yGWKhR)', inline: false },
        { name: 'Joined / Verified', value: '2026-10-04 / Verified', inline: false },
        { name: 'Status', value: 'VALID (+250 XP Rewarded)', inline: true },
      ],
    },
  },
];

const CHANNEL_ROUTING_MATRIX = [
  {
    channel: '#🛡️・verify-here',
    purpose: 'New Member Gateway & Onboarding',
    commandsAllowed: ['/verify', 'Persistent [ VERIFY ] Button Click'],
    whoCanSend: '@everyone (Slash commands only) / Bot',
    behavior: 'Ephemeral responses keep the channel pristine. Clean landing card with green button.',
    category: 'Public / Welcome',
  },
  {
    channel: '#💬・commands',
    purpose: 'Community Bot Playground',
    commandsAllowed: ['/xp', '/leaderboard', '/referrals'],
    whoCanSend: '@everyone / @Community Member',
    behavior: 'Open channel for regular members to check ranks and referral earnings without cluttering general chat.',
    category: 'Public / Community',
  },
  {
    channel: '#🏆・leaderboard',
    purpose: 'Live Global Standings Display',
    commandsAllowed: ['Auto-pinned Embed (Read Only)'],
    whoCanSend: 'Bot Only',
    behavior: 'Bot automatically rewrites the pinned embed whenever any member verifies or gains XP.',
    category: 'Public / Information',
  },
  {
    channel: '#🤖・bot-logs',
    purpose: 'Immutable Real-Time Audit Feed',
    commandsAllowed: ['Auto-logged System Embeds'],
    whoCanSend: 'Bot Only (Read-only for Staff)',
    behavior: 'Color-coded audit embeds for member joins, verifications, leave penalties, and admin edits.',
    category: 'Internal / Audit',
  },
  {
    channel: '#🔒・admin-chat',
    purpose: 'Privileged Staff & Governance',
    commandsAllowed: ['/admin-xp', '/admin-referral'],
    whoCanSend: 'Admins & Staff Only',
    behavior: 'All manual XP adjustments, point penalties, and user lineage inspections must run here.',
    category: 'Restricted / Staff',
  },
];

export const CommandsGuideView: React.FC = () => {
  const [filter, setFilter] = useState<'all' | 'user' | 'admin' | 'matrix'>('all');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [isDeployingVerify, setIsDeployingVerify] = useState(false);
  const [isDeployingLb, setIsDeployingLb] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/bot/channels')
      .then((r) => r.json())
      .then((data) => {
        if (data.channels && data.channels.length > 0) {
          setChannels(data.channels);
          setSelectedChannelId(data.channels[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDeployVerifyButton = async () => {
    if (!selectedChannelId) return;
    setIsDeployingVerify(true);
    setDeployFeedback(null);
    try {
      const res = await fetch('/api/bot/post-verify-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setDeployFeedback({ type: 'success', message: data.message });
      } else {
        throw new Error(data.error || 'Failed to post embed');
      }
    } catch (e: any) {
      setDeployFeedback({ type: 'error', message: e.message });
    } finally {
      setIsDeployingVerify(false);
    }
  };

  const handleDeployLeaderboard = async () => {
    if (!selectedChannelId) return;
    setIsDeployingLb(true);
    setDeployFeedback(null);
    try {
      const res = await fetch('/api/bot/post-leaderboard-embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: selectedChannelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setDeployFeedback({ type: 'success', message: data.message });
      } else {
        throw new Error(data.error || 'Failed to post leaderboard');
      }
    } catch (e: any) {
      setDeployFeedback({ type: 'error', message: e.message });
    } finally {
      setIsDeployingLb(false);
    }
  };

  const filteredCommands = COMMANDS_DATA.filter((cmd) => {
    if (filter === 'user') return cmd.category === 'user';
    if (filter === 'admin') return cmd.category === 'admin';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Slash Commands & Permissions
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Channel Partitioned
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-indigo-400" />
              Bot Commands & Discord Channel Architecture
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Complete reference of all slash commands, partitioned by role privileges and channel boundaries. User commands empower community members while Admin commands protect server integrity.
            </p>
          </div>

          {/* Quick Deploy Tool Card */}
          {channels.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl text-xs space-y-3 shrink-0 lg:w-80">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                <span>Deploy Embeds to Server</span>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Target Channel</label>
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name} {c.parent ? `(${c.parent})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeployVerifyButton}
                  disabled={isDeployingVerify}
                  className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50 text-center"
                >
                  {isDeployingVerify ? 'Posting...' : 'Post [ VERIFY ] Button'}
                </button>

                <button
                  onClick={handleDeployLeaderboard}
                  disabled={isDeployingLb}
                  className="flex-1 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50 text-center"
                >
                  {isDeployingLb ? 'Posting...' : 'Post Leaderboard'}
                </button>
              </div>

              {deployFeedback && (
                <div
                  className={`p-2 rounded text-[11px] ${
                    deployFeedback.type === 'success'
                      ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800'
                      : 'bg-red-950/50 text-red-300 border border-red-800'
                  }`}
                >
                  {deployFeedback.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1 bg-[#0e121b] border border-slate-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Commands ({COMMANDS_DATA.length})
          </button>
          <button
            onClick={() => setFilter('user')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              filter === 'user' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>User Commands ({COMMANDS_DATA.filter((c) => c.category === 'user').length})</span>
          </button>
          <button
            onClick={() => setFilter('admin')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              filter === 'admin' ? 'bg-red-900/60 text-red-200 font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Admin Commands ({COMMANDS_DATA.filter((c) => c.category === 'admin').length})</span>
          </button>
          <button
            onClick={() => setFilter('matrix')}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              filter === 'matrix' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Hash className="w-3.5 h-3.5 text-emerald-400" />
            <span>Channel Routing Matrix</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-indigo-400" />
          <span>Slash commands auto-register with Discord API</span>
        </div>
      </div>

      {/* CHANNEL ROUTING MATRIX VIEW */}
      {filter === 'matrix' ? (
        <div className="bg-[#0e121b] border border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="px-5 py-4 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Hash className="w-4 h-4 text-emerald-400" />
              Discord Channel Permissions & Bot Command Routing
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              How channels in the UPRISE Discord server are organized to prevent spam and restrict sensitive admin operations.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0b0e14] border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Channel Name</th>
                  <th className="px-4 py-3">Role / Category</th>
                  <th className="px-4 py-3">Commands Permitted</th>
                  <th className="px-4 py-3">Access & Senders</th>
                  <th className="px-4 py-3">Bot Behavior</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {CHANNEL_ROUTING_MATRIX.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3.5 font-mono font-semibold text-indigo-300">
                      {row.channel}
                    </td>
                    <td className="px-4 py-3.5 text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] border border-slate-700">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.commandsAllowed.map((cmd, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300 font-mono text-[11px]"
                          >
                            {cmd}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-300 text-[11px]">{row.whoCanSend}</td>
                    <td className="px-4 py-3.5 text-slate-400 text-[11px] leading-relaxed">
                      {row.behavior}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* COMMANDS LIST VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredCommands.map((cmd, idx) => {
            const isAdmin = cmd.category === 'admin';
            return (
              <div
                key={idx}
                className="bg-[#0e121b] border border-slate-800 rounded-xl p-5 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-xs"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`p-2 rounded-lg ${
                          isAdmin
                            ? 'bg-red-950/60 border border-red-800/80 text-red-400'
                            : 'bg-indigo-950/60 border border-indigo-800/80 text-indigo-400'
                        }`}
                      >
                        {isAdmin ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                      </span>
                      <div>
                        <div className="font-mono text-base font-bold text-white flex items-center gap-2">
                          <span>{cmd.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              isAdmin
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isAdmin ? 'Staff Only' : 'Public Member'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{cmd.description}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => copyToClipboard(cmd.example, idx)}
                      title="Copy syntax"
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-md transition-colors"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Metadata Chips */}
                  <div className="grid grid-cols-2 gap-2 my-3 text-[11px]">
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block mb-1">Target Channels</span>
                      <div className="flex flex-wrap gap-1">
                        {cmd.allowedChannels.map((ch, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-slate-800 text-indigo-300 font-mono rounded text-[10px]"
                          >
                            {ch}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                      <span className="text-slate-400 block mb-1">Required Permissions</span>
                      <div className="font-medium text-slate-200 truncate">{cmd.requiredRole}</div>
                      <div className="text-[10px] text-slate-500 truncate">{cmd.permissions}</div>
                    </div>
                  </div>

                  {/* Syntax & XP */}
                  <div className="space-y-1.5 my-3 text-xs">
                    <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[11px] text-indigo-300 flex items-center justify-between">
                      <span>{cmd.syntax}</span>
                      <span className="text-[10px] text-slate-400 font-sans">{cmd.xpEffect}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed italic">{cmd.notes}</p>
                  </div>
                </div>

                {/* Simulated Discord Embed Response */}
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 block mb-1.5">
                    Simulated Discord Embed Reply
                  </span>
                  <div
                    className="bg-[#2b2d31] p-3 rounded text-xs border-l-4 space-y-1.5"
                    style={{ borderColor: cmd.sampleResponse.color }}
                  >
                    <div className="font-bold text-white flex items-center justify-between">
                      <span>{cmd.sampleResponse.title}</span>
                      <span className="text-[10px] text-slate-400 font-normal">UPRISE Bot</span>
                    </div>
                    <p className="text-slate-300 text-[11px] whitespace-pre-line leading-relaxed">
                      {cmd.sampleResponse.description}
                    </p>

                    {cmd.sampleResponse.fields && (
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60 mt-2">
                        {cmd.sampleResponse.fields.map((f, i) => (
                          <div key={i}>
                            <span className="text-[10px] text-slate-400 block font-semibold">
                              {f.name}
                            </span>
                            <span className="text-[11px] text-slate-200 font-mono">{f.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommandsGuideView;

import React, { useState } from 'react';
import {
  Shield,
  UserPlus,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  UserCheck,
  UserMinus,
  SlidersHorizontal,
} from 'lucide-react';

interface DiscordSimulatorProps {
  onEventTriggered: () => void;
  config: {
    xpVerification: number;
    xpReferral: number;
  };
}

interface SimulatedMember {
  discordId: string;
  username: string;
  inviteUsed: string | null;
  inviterName: string | null;
  status: 'PENDING' | 'VALID' | 'INVALID';
  roles: string[];
  xp: number;
}

export const DiscordSimulator: React.FC<DiscordSimulatorProps> = ({ onEventTriggered, config }) => {
  // Join form state
  const [inviteeName, setInviteeName] = useState('Rahul');
  const [selectedInviteCode, setSelectedInviteCode] = useState('uprise-anurag');
  const [isDirectJoin, setIsDirectJoin] = useState(false);
  const [isSelfReferral, setIsSelfReferral] = useState(false);

  // Active simulated member in the Discord channel
  const [currentMember, setCurrentMember] = useState<SimulatedMember | null>({
    discordId: '1003',
    username: 'Rahul',
    inviteUsed: 'uprise-anurag',
    inviterName: 'Anurag',
    status: 'PENDING',
    roles: ['@New Member'],
    xp: 0,
  });

  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Slash command tester state
  const [commandTargetUser, setCommandTargetUser] = useState('Rahul');
  const [commandOutput, setCommandOutput] = useState<{
    title: string;
    description: string;
    fields: { name: string; value: string; inline?: boolean }[];
    color: string;
  } | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSimulationLog((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // 1. Simulate Member Join
  const handleSimulateJoin = async () => {
    setIsProcessing(true);
    try {
      const generatedId = isSelfReferral ? '1001' : `user_${Math.floor(1000 + Math.random() * 9000)}`;
      const name = isSelfReferral ? 'Anurag' : (inviteeName.trim() || 'NewUser');
      const code = isDirectJoin ? null : isSelfReferral ? 'uprise-anurag' : selectedInviteCode;

      const res = await fetch('/api/simulate/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteeDiscordId: generatedId,
          inviteeUsername: name,
          inviteCode: code,
          isDirectJoin,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setCurrentMember({
          discordId: generatedId,
          username: name,
          inviteUsed: code,
          inviterName: isDirectJoin ? null : isSelfReferral ? 'Anurag (Self)' : 'Anurag',
          status: 'PENDING',
          roles: ['@New Member'],
          xp: 0,
        });

        addLog(`Member joined: @${name} via ${code || 'Direct Link'}. Status: PENDING (0 XP awarded).`);
        onEventTriggered();
      } else {
        addLog(`Join error: ${data.error}`);
      }
    } catch (err: any) {
      addLog(`Join exception: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Simulate Clicking [ VERIFY ] Button
  const handleSimulateVerify = async () => {
    if (!currentMember) return;
    setIsProcessing(true);

    try {
      const res = await fetch('/api/simulate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordId: currentMember.discordId,
          username: currentMember.username,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        const result = data.result;

        if (result.alreadyVerified) {
          addLog(`[IDEMPOTENCY TEST]: @${currentMember.username} already verified! 0 duplicate XP awarded.`);
        } else {
          setCurrentMember((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'VALID',
                  roles: ['@Community Member'],
                  xp: prev.xp + result.inviteeXpAwarded,
                }
              : null
          );

          addLog(
            `Verification Success: @${currentMember.username} (+${result.inviteeXpAwarded} XP). ` +
              (result.inviterUsername
                ? `Inviter @${result.inviterUsername} rewarded (+${result.inviterXpAwarded} XP).`
                : 'Direct Join (no referral reward).')
          );
        }
        onEventTriggered();
      } else {
        addLog(`Verification error: ${data.error}`);
      }
    } catch (err: any) {
      addLog(`Verification exception: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Simulate Member Leave Before Verify
  const handleSimulateLeave = async () => {
    if (!currentMember) return;
    setIsProcessing(true);

    try {
      const res = await fetch('/api/simulate/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordId: currentMember.discordId,
          username: currentMember.username,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setCurrentMember((prev) =>
          prev
            ? {
                ...prev,
                status: 'INVALID',
                roles: [],
              }
            : null
        );
        addLog(`Member @${currentMember.username} left server before verify. Referral marked INVALID.`);
        onEventTriggered();
      }
    } catch (err: any) {
      addLog(`Leave exception: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Run Simulated Slash Command
  const handleRunCommand = async (cmd: 'xp' | 'leaderboard' | 'referrals' | 'admin-xp') => {
    try {
      if (cmd === 'xp') {
        const res = await fetch('/api/users');
        const users = await res.json();
        const user = users.find((u: any) => u.username.toLowerCase() === commandTargetUser.toLowerCase()) || users[0];

        if (user) {
          const rankRes = await fetch(`/api/leaderboard?pageSize=100`);
          const lb = await rankRes.json();
          const entry = lb.entries.find((e: any) => e.discordId === user.discordId);

          setCommandOutput({
            title: 'UPRISE XP',
            description: `Query executed for member **@${user.username}**`,
            color: '#6366f1',
            fields: [
              { name: 'Member', value: user.username, inline: true },
              { name: 'Balance', value: `${user.xp.toLocaleString()} XP`, inline: true },
              { name: 'Rank', value: entry ? `#${entry.rank}` : '#--', inline: true },
            ],
          });
        }
      } else if (cmd === 'leaderboard') {
        const res = await fetch('/api/leaderboard?page=1&pageSize=5');
        const data = await res.json();

        setCommandOutput({
          title: '🏆 UPRISE LEADERBOARD',
          description: data.entries
            .map((e: any) => `${e.rank}. ${e.username} — ${e.xp.toLocaleString()} XP`)
            .join('\n'),
          color: '#f59e0b',
          fields: [
            { name: 'Total Community Members', value: `${data.totalUsers}`, inline: true },
            { name: 'Current Page', value: `1 / ${data.totalPages}`, inline: true },
          ],
        });
      } else if (cmd === 'referrals') {
        const res = await fetch('/api/referrals');
        const referrals = await res.json();

        const successful = referrals.filter((r: any) => r.status === 'VALID').length;
        const pending = referrals.filter((r: any) => r.status === 'PENDING').length;

        setCommandOutput({
          title: 'Your UPRISE Referrals',
          description: `Referral overview for **@${commandTargetUser}**`,
          color: '#3b82f6',
          fields: [
            { name: 'Successful', value: `${successful} verified`, inline: true },
            { name: 'Pending', value: `${pending} awaiting verify`, inline: true },
            { name: 'Referral XP', value: `${successful * config.xpReferral} XP`, inline: true },
          ],
        });
      } else if (cmd === 'admin-xp') {
        const res = await fetch('/api/users');
        const users = await res.json();
        const target = users[0];

        if (target) {
          const adjustRes = await fetch('/api/simulate/admin-xp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              discordId: target.discordId,
              amount: 500,
              reason: 'Community Hackathon Organizer Bonus',
              adminUsername: 'Founder',
            }),
          });
          const adjustData = await adjustRes.json();

          setCommandOutput({
            title: '⚙️ /admin-xp Executed (Audited)',
            description: `Manual adjustment of +500 XP granted to **@${target.username}**`,
            color: '#22c55e',
            fields: [
              { name: 'Adjustment', value: '+500 XP', inline: true },
              { name: 'Reason', value: 'Community Hackathon Organizer Bonus', inline: false },
              { name: 'Authorized Staff', value: '@Founder', inline: true },
              { name: 'New Balance', value: `${adjustData.result.user.xp} XP`, inline: true },
            ],
          });
          onEventTriggered();
        }
      }
    } catch (err: any) {
      addLog(`Command error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Simulation Controls Banner */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Interactive Discord Lifecycle Simulator
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate Discord joins, invite resolution, verification buttons, role assignments, and XP ledger idempotency.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Config:</span>
            <span className="text-slate-200 font-mono">Verify = +{config.xpVerification} XP</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-200 font-mono">Referral = +{config.xpReferral} XP</span>
          </div>
        </div>

        {/* Join Simulator Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">New Member Name</label>
            <input
              type="text"
              value={inviteeName}
              disabled={isSelfReferral}
              onChange={(e) => setInviteeName(e.target.value)}
              placeholder="e.g. Rahul, Kavya"
              className="w-full bg-[#0b0e14] border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Invite Source</label>
            <select
              value={isDirectJoin ? 'direct' : isSelfReferral ? 'self' : selectedInviteCode}
              onChange={(e) => {
                if (e.target.value === 'direct') {
                  setIsDirectJoin(true);
                  setIsSelfReferral(false);
                } else if (e.target.value === 'self') {
                  setIsSelfReferral(true);
                  setIsDirectJoin(false);
                } else {
                  setIsDirectJoin(false);
                  setIsSelfReferral(false);
                  setSelectedInviteCode(e.target.value);
                }
              }}
              className="w-full bg-[#0b0e14] border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="uprise-anurag">uprise-anurag (Inviter: Anurag)</option>
              <option value="uprise-priya">uprise-priya (Inviter: Priya)</option>
              <option value="direct">Direct Join (No inviter detected)</option>
              <option value="self">Self-Referral (Anurag invites Anurag)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSimulateJoin}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-3 rounded-md transition-colors disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Simulate Member Join</span>
            </button>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleSimulateLeave}
              disabled={isProcessing || !currentMember || currentMember.status !== 'PENDING'}
              title="Test member leaving before verification (marks referral INVALID)"
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-red-950/40 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-900 text-xs py-2 px-2.5 rounded-md transition-colors disabled:opacity-40"
            >
              <UserMinus className="w-3.5 h-3.5" />
              <span>Leave Server</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Discord Channel Simulation & Slash Commands */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Realistic Discord Server & Channel Mockup (7 Cols) */}
        <div className="lg:col-span-7 bg-[#1e1f22] border border-[#2b2d31] rounded-lg overflow-hidden flex flex-col shadow-lg">
          {/* Discord Channel Header */}
          <div className="bg-[#2b2d31] px-4 py-2.5 flex items-center justify-between border-b border-[#1f2023]">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <span className="text-slate-400 font-bold">#</span>
              <span>welcome-and-verify</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>Channel ID: 123456789012345680</span>
            </div>
          </div>

          {/* Discord Message History Area */}
          <div className="p-4 space-y-4 flex-1 bg-[#313338] min-h-[360px]">
            {/* System Join Notification */}
            {currentMember && (
              <div className="flex items-start gap-3 text-xs text-slate-300 border-l-2 border-indigo-500 pl-3 py-1">
                <span className="text-indigo-400 font-semibold">Join Event</span>
                <span>
                  <strong className="text-white">@{currentMember.username}</strong> joined using invite{' '}
                  <code className="bg-[#1e1f22] px-1 py-0.5 rounded text-amber-300">
                    {currentMember.inviteUsed || 'Direct Link'}
                  </code>
                  . Assigned role: <span className="text-amber-400 font-mono">@New Member</span>.
                </span>
              </div>
            )}

            {/* UPRISE Bot Message Card with Embed and [ VERIFY ] Button */}
            {currentMember ? (
              <div className="flex items-start gap-3 pt-2">
                {/* Bot Avatar */}
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white shrink-0 font-bold text-sm shadow">
                  UP
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">UPRISE Bot</span>
                    <span className="bg-[#5865f2] text-white text-[10px] font-bold px-1 rounded uppercase">
                      BOT
                    </span>
                    <span className="text-[11px] text-slate-400">Today at {new Date().toLocaleTimeString()}</span>
                  </div>

                  {/* Welcome Embed */}
                  <div className="bg-[#2b2d31] border-l-4 border-indigo-500 rounded p-4 text-xs text-slate-200 space-y-2 max-w-lg">
                    <div className="font-bold text-sm text-white">Welcome to UPRISE</div>
                    <p className="text-slate-300 leading-relaxed">
                      Welcome to UPRISE, <strong className="text-indigo-300">@{currentMember.username}</strong>!
                      Verify your membership below to unlock community channels and claim your{' '}
                      <span className="text-emerald-400 font-semibold font-mono">+{config.xpVerification} XP</span> welcome reward.
                    </p>

                    <div className="bg-[#1e1f22] rounded p-2 text-slate-300 space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Referral Tracking Status
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Inviter detected:</span>
                        <span className="font-semibold text-slate-100">
                          {currentMember.inviterName ? `@${currentMember.inviterName}` : 'None (Direct Join)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Referral Status:</span>
                        <span
                          className={`font-semibold ${
                            currentMember.status === 'VALID'
                              ? 'text-emerald-400'
                              : currentMember.status === 'INVALID'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {currentMember.status}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Rule: Inviter only earns +{config.xpReferral} XP after this member completes verification.
                    </div>
                  </div>

                  {/* Interactive [ VERIFY ] Button Component */}
                  <div className="pt-1">
                    <button
                      onClick={handleSimulateVerify}
                      disabled={isProcessing || currentMember.status === 'INVALID'}
                      className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold shadow transition-all ${
                        currentMember.status === 'VALID'
                          ? 'bg-[#248046] hover:bg-[#1a6334] text-white ring-1 ring-emerald-400'
                          : 'bg-[#248046] hover:bg-[#1a6334] text-white hover:scale-[1.01]'
                      } disabled:opacity-50`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>{currentMember.status === 'VALID' ? 'VERIFY AGAIN (IDEMPOTENCY TEST)' : 'VERIFY'}</span>
                    </button>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Custom ID: <code className="text-slate-300">uprise_verify_btn</code>
                    </span>
                  </div>

                  {/* Member Roles Inspection */}
                  <div className="pt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Current Discord Roles:</span>
                    {currentMember.roles.map((role) => (
                      <span
                        key={role}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium font-mono ${
                          role === '@Community Member'
                            ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950/70 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs">
                No active simulated member. Click &quot;Simulate Member Join&quot; above to begin.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Slash Commands Testing Terminal & Event Log (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Slash Commands Execution Box */}
          <div className="bg-[#12161f] border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                Slash Commands Tester
              </h3>
              <input
                type="text"
                value={commandTargetUser}
                onChange={(e) => setCommandTargetUser(e.target.value)}
                placeholder="Target User"
                className="w-28 bg-[#0b0e14] border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleRunCommand('xp')}
                className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 text-xs py-1.5 px-3 rounded flex items-center justify-between transition-colors"
              >
                <span>/xp</span>
                <span className="text-[10px] text-slate-500 font-mono">Check rank</span>
              </button>

              <button
                onClick={() => handleRunCommand('leaderboard')}
                className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 text-xs py-1.5 px-3 rounded flex items-center justify-between transition-colors"
              >
                <span>/leaderboard</span>
                <span className="text-[10px] text-slate-500 font-mono">Global ranks</span>
              </button>

              <button
                onClick={() => handleRunCommand('referrals')}
                className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 text-xs py-1.5 px-3 rounded flex items-center justify-between transition-colors"
              >
                <span>/referrals</span>
                <span className="text-[10px] text-slate-500 font-mono">Referral stats</span>
              </button>

              <button
                onClick={() => handleRunCommand('admin-xp')}
                className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700/60 text-xs py-1.5 px-3 rounded flex items-center justify-between transition-colors"
              >
                <span>/admin-xp</span>
                <span className="text-[10px] text-emerald-400 font-mono">+500 XP audit</span>
              </button>
            </div>

            {/* Rendered Discord Embed Response */}
            {commandOutput && (
              <div
                className="bg-[#1a1f2c] border-l-4 rounded p-3 text-xs space-y-2 mt-2"
                style={{ borderColor: commandOutput.color }}
              >
                <div className="font-bold text-white text-xs">{commandOutput.title}</div>
                <div className="text-slate-300 whitespace-pre-line text-xs font-mono">{commandOutput.description}</div>

                {commandOutput.fields && commandOutput.fields.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                    {commandOutput.fields.map((f, i) => (
                      <div key={i} className={f.inline === false ? 'col-span-2' : ''}>
                        <div className="text-[10px] text-slate-400">{f.name}</div>
                        <div className="text-slate-200 font-semibold text-xs">{f.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Real-time Simulator Event Log */}
          <div className="bg-[#12161f] border border-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Simulation Live Log
              </h3>
              <button
                onClick={() => setSimulationLog([])}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>

            <div className="bg-[#0b0e14] rounded p-2.5 font-mono text-[11px] space-y-1 max-h-48 overflow-y-auto border border-slate-800/60">
              {simulationLog.length === 0 ? (
                <div className="text-slate-600 italic">No events logged yet. Execute an action to view output.</div>
              ) : (
                simulationLog.map((log, index) => (
                  <div key={index} className="text-slate-400 leading-snug">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscordSimulator;

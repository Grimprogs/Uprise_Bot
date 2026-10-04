import React from 'react';
import { BookOpen, Key, CheckSquare, Shield, Terminal, ArrowUpRight } from 'lucide-react';

export const SetupGuideView: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Overview Card */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          UPRISE Discord Bot Deployment & Configuration Guide
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Follow these step-by-step instructions to connect your UPRISE Discord bot to your live Discord server, configure privileged gateway intents, deploy slash commands, and persist data in SQLite.
        </p>
      </div>

      {/* Step 1: Discord Developer Portal */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs flex items-center justify-center font-mono">
            1
          </span>
          <span>Discord Developer Portal & Privileged Intents</span>
        </div>

        <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed pl-2">
          <li>
            Visit{' '}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:underline inline-flex items-center gap-0.5"
            >
              discord.com/developers <ArrowUpRight className="w-3 h-3" />
            </a>{' '}
            and click <strong>New Application</strong> (e.g. &quot;UPRISE Community Bot&quot;).
          </li>
          <li>
            Go to the <strong>Bot</strong> tab: Click <strong>Reset Token</strong> to generate your bot token. Copy this into <code className="bg-slate-900 text-amber-300 px-1 py-0.5 rounded">DISCORD_TOKEN</code>.
          </li>
          <li>
            <strong className="text-emerald-400">CRITICAL INTENT SETTINGS:</strong> Scroll down to <strong>Privileged Gateway Intents</strong> and enable:
            <div className="mt-1 ml-4 space-y-1 font-mono text-[11px] text-amber-300">
              <div>✔ Server Members Intent (Required for detecting new joins & tracking invites)</div>
              <div>✔ Message Content Intent</div>
            </div>
          </li>
          <li>
            Go to <strong>OAuth2 → URL Generator</strong>:
            <div className="mt-1 ml-4 space-y-1 text-slate-300">
              <div>• Scopes: <code className="text-indigo-300 font-mono">bot</code>, <code className="text-indigo-300 font-mono">applications.commands</code></div>
              <div>• Bot Permissions: <strong>Manage Roles</strong>, <strong>View Channels</strong>, <strong>Send Messages</strong>, <strong>Embed Links</strong>, <strong>Read Message History</strong></div>
            </div>
          </li>
          <li>Open the generated invitation URL in your browser and authorize the bot into your UPRISE Discord server.</li>
        </ul>
      </div>

      {/* Step 2: Discord Server Roles Hierarchy */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs flex items-center justify-center font-mono">
            2
          </span>
          <span>Discord Server Roles Hierarchy</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Discord requires the bot&apos;s role to be positioned <strong>above</strong> any roles it gives or takes:
        </p>

        <div className="bg-[#0b0e14] border border-slate-800 p-3 rounded font-mono text-xs space-y-1.5">
          <div className="text-indigo-400">▲ Higher in Discord Server Roles list:</div>
          <div className="pl-4 text-slate-100 font-semibold">• @UPRISE Bot (Bot&apos;s managed role)</div>
          <div className="pl-4 text-emerald-400">• @Community Member (Assigned upon verification)</div>
          <div className="pl-4 text-amber-400">• @New Member (Assigned upon join, removed on verify)</div>
          <div className="pl-4 text-slate-500">• @everyone</div>
        </div>

        <p className="text-xs text-slate-400">
          Right-click each role in Discord (with Developer Mode on) to copy their Role IDs, and paste into <code className="text-slate-200">NEW_MEMBER_ROLE_ID</code> and <code className="text-slate-200">COMMUNITY_MEMBER_ROLE_ID</code>.
        </p>
      </div>

      {/* Step 3: Commands & Running Standalone Bot */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-400 text-xs flex items-center justify-center font-mono">
            3
          </span>
          <span>Command Deployment & Standalone Bot Scripts</span>
        </div>

        <div className="space-y-2 text-xs">
          <p className="text-slate-300">Register slash commands instantly:</p>
          <pre className="bg-[#0b0e14] border border-slate-800 p-2.5 rounded font-mono text-emerald-400 text-xs">
            npm run deploy-commands
          </pre>

          <p className="text-slate-300 pt-2">Run the standalone Discord bot process:</p>
          <pre className="bg-[#0b0e14] border border-slate-800 p-2.5 rounded font-mono text-indigo-400 text-xs">
            npm run bot
          </pre>
        </div>
      </div>

      {/* Step 4: Verification Edge Cases Checklist (Section 21) */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <CheckSquare className="w-4 h-4 text-emerald-400" />
          <span>Verification & Edge Cases Test Checklist</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>User joins through invite:</strong> Referral recorded as PENDING.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>User verifies:</strong> Inviter receives +250 XP, Invitee receives +100 XP.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Idempotency guard:</strong> User verifies twice → 0 duplicate XP awarded.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Self-referral check:</strong> User inviting themselves receives no referral XP.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Unknown/direct join:</strong> Member receives +100 XP, no false inviter rewarded.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Leave before verify:</strong> Pending referral marked INVALID.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Bot restart safety:</strong> All state loaded directly from SQLite database.
          </div>
          <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
            ✔ <strong>Auditable ledger:</strong> Every single XP change logs an XPTransaction.
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupGuideView;

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  UserCheck,
  Link2,
  FileSpreadsheet,
  Trophy,
  ListOrdered,
  Radio,
  RefreshCw,
  Sparkles,
  Zap,
  Terminal,
} from 'lucide-react';
import { auth, googleSignIn, googleLogout, initAuth } from '../services/firebaseAuth.ts';

export type TabType = 'members' | 'referrals' | 'invites' | 'sheets' | 'commands' | 'leaderboard' | 'ledger' | 'logs';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  botOnline: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  realtimeConnected: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  botOnline,
  onRefresh,
  isRefreshing,
  realtimeConnected,
}) => {
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  useEffect(() => {
    return initAuth(
      (user) => setCurrentUser(user),
      () => setCurrentUser(null)
    );
  }, []);

  return (
    <header className="border-b border-slate-800 bg-[#0d111a] sticky top-0 z-40 px-4 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Shield className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            <span>UPRISE Community Engine</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              REAL DATA
            </span>
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden xl:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'members'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members & Verify</span>
          </button>

          <button
            onClick={() => setActiveTab('referrals')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'referrals'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Referrals (CRUD)</span>
          </button>

          <button
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'invites'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Discord Invites</span>
          </button>

          <button
            onClick={() => setActiveTab('sheets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'sheets'
                ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Sheets & OTP</span>
          </button>

          <button
            onClick={() => setActiveTab('commands')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'commands'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Bot Commands</span>
          </button>

          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'leaderboard'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Leaderboard</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'ledger'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>XP Ledger</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'logs'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>#bot-logs</span>
          </button>
        </nav>

        {/* Right Status & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Real-time Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
            <Zap className={`w-3 h-3 ${realtimeConnected ? 'text-amber-400 animate-bounce' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Real-Time Sync</span>
          </div>

          {/* Discord Bot Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                botOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-slate-400 hidden sm:inline">
              {botOnline ? 'Discord Bot Live' : 'Bot Offline'}
            </span>
          </div>

          {/* Google Auth Status Badge */}
          {currentUser ? (
            <div
              onClick={() => setActiveTab('sheets')}
              title={`Connected as ${currentUser.email}`}
              className="cursor-pointer flex items-center gap-1.5 px-2 py-1 bg-emerald-950/40 border border-emerald-800 rounded-md text-[11px] text-emerald-300 font-mono"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="max-w-[100px] truncate">{currentUser.email?.split('@')[0]}</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('sheets')}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-900 rounded-md text-[11px] font-semibold transition-colors shadow-xs"
            >
              <span>Connect Google</span>
            </button>
          )}

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh database records"
            className="p-1.5 text-slate-400 hover:text-white rounded-md bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Horizontal Navigation Scroll */}
      <div className="flex xl:hidden items-center gap-1 overflow-x-auto py-2 border-t border-slate-800/80">
        {(
          [
            { id: 'members', label: 'Members & Verify' },
            { id: 'referrals', label: 'Referrals (CRUD)' },
            { id: 'invites', label: 'Discord Invites' },
            { id: 'sheets', label: 'Google Sheets & OTP' },
            { id: 'commands', label: 'Bot Commands' },
            { id: 'leaderboard', label: 'Leaderboard' },
            { id: 'ledger', label: 'XP Ledger' },
            { id: 'logs', label: '#bot-logs' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-xs font-medium rounded capitalize whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
};

export default Navbar;

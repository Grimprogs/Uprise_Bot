import React, { useState, useEffect } from 'react';
import Navbar, { TabType } from './components/Navbar.js';
import DiscordSimulator from './components/DiscordSimulator.js';
import LeaderboardView from './components/LeaderboardView.js';
import LedgerView from './components/LedgerView.js';
import ReferralsView from './components/ReferralsView.js';
import BotLogsView from './components/BotLogsView.js';
import SetupGuideView from './components/SetupGuideView.js';
import { Database, ShieldCheck, Sparkles, RefreshCcw, Trash2, ArrowUpRight } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('simulator');
  const [statusData, setStatusData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatusData(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleResetDb = async () => {
    if (!confirm('Are you sure you want to reset all test database records?')) return;
    try {
      await fetch('/api/simulate/reset', { method: 'POST' });
      await fetchStatus();
    } catch (err) {
      console.error('Reset failed:', err);
    }
  };

  const handleSeedDb = async () => {
    try {
      await fetch('/api/seed', { method: 'POST' });
      await fetchStatus();
    } catch (err) {
      console.error('Seed failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        botOnline={statusData?.botOnline || false}
        onRefresh={fetchStatus}
        isRefreshing={isRefreshing}
      />

      {/* Metric Telemetry & Environment Bar */}
      <section className="border-b border-slate-800/80 bg-[#0e121b] px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Key Metrics */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Database:</span>
              <span className="text-slate-200 font-mono flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                SQLite (data/uprise.db)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Community Members:</span>
              <span className="text-white font-mono font-semibold tabular-nums">
                {statusData?.counts?.users ?? 0}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Referrals:</span>
              <span className="text-white font-mono font-semibold tabular-nums">
                {statusData?.counts?.validReferrals ?? 0} Valid / {statusData?.counts?.pendingReferrals ?? 0} Pending
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Audited XP Transactions:</span>
              <span className="text-emerald-400 font-mono font-semibold tabular-nums">
                {statusData?.counts?.transactions ?? 0}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSeedDb}
              title="Seed sample test community members (Anurag, Priya, Rahul)"
              className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Seed Test Data</span>
            </button>

            <button
              onClick={handleResetDb}
              title="Clear all database tables for a fresh test run"
              className="px-2.5 py-1 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-red-950/30 border border-slate-700/60 hover:border-red-900 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-6">
        {activeTab === 'simulator' && (
          <DiscordSimulator
            onEventTriggered={fetchStatus}
            config={{
              xpVerification: statusData?.config?.xpVerification ?? 100,
              xpReferral: statusData?.config?.xpReferral ?? 250,
            }}
          />
        )}

        {activeTab === 'leaderboard' && <LeaderboardView />}

        {activeTab === 'ledger' && <LedgerView />}

        {activeTab === 'referrals' && <ReferralsView />}

        {activeTab === 'logs' && <BotLogsView />}

        {activeTab === 'setup' && <SetupGuideView />}
      </main>

      {/* Clean Quiet Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0d111a] px-4 lg:px-8 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span>UPRISE Discord Bot Engine · MVP Specification</span>
            <span className="mx-2 text-slate-700">·</span>
            <span>Prisma ORM with SQLite Local Storage</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Invite Tracking</span>
            <span aria-hidden="true">·</span>
            <span>Verification Gateway</span>
            <span aria-hidden="true">·</span>
            <span>Auditable XP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

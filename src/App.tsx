import React, { useState, useEffect, useCallback } from 'react';
import Navbar, { TabType } from './components/Navbar.tsx';
import MembersView from './components/MembersView.tsx';
import ReferralsView from './components/ReferralsView.tsx';
import InvitesView from './components/InvitesView.tsx';
import GoogleSheetsHub from './components/GoogleSheetsHub.tsx';
import CommandsGuideView from './components/CommandsGuideView.tsx';
import LeaderboardView from './components/LeaderboardView.tsx';
import LedgerView from './components/LedgerView.tsx';
import BotLogsView from './components/BotLogsView.tsx';
import { Database, FileSpreadsheet, Zap, Radio, RefreshCcw } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('members');
  const [statusData, setStatusData] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const fetchStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statusRes, settingsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/settings'),
      ]);
      const sData = await statusRes.json();
      const settsData = await settingsRes.json();
      setStatusData(sData);
      setSettings(settsData || {});
    } catch (err) {
      console.error('Failed to fetch status:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Real-time Server-Sent Events (SSE) listener
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        setRealtimeConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Auto-refresh metrics on any database mutation event
          if (
            [
              'MEMBER_CREATED',
              'MEMBER_UPDATED',
              'MEMBER_DELETED',
              'REFERRAL_CREATED',
              'REFERRAL_UPDATED',
              'REFERRAL_DELETED',
              'MEMBER_VERIFIED',
              'INVITE_CREATED',
              'INVITE_DELETED',
              'SETTINGS_UPDATED',
              'BOT_STATUS',
            ].includes(data.type)
          ) {
            fetchStatus();
          }
        } catch (e) {
          console.warn('Error parsing SSE event:', e);
        }
      };

      eventSource.onerror = () => {
        setRealtimeConnected(false);
      };
    } catch (e) {
      console.warn('SSE connection failed:', e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchStatus]);

  const spreadsheetId = settings['google_spreadsheet_id'] || statusData?.googleSheet?.spreadsheetId;
  const spreadsheetUrl = settings['google_spreadsheet_url'] || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        botOnline={statusData?.botOnline || false}
        onRefresh={fetchStatus}
        isRefreshing={isRefreshing}
        realtimeConnected={realtimeConnected}
      />

      {/* Real-time Telemetry & Data Storage Bar */}
      <section className="border-b border-slate-800/80 bg-[#0e121b] px-4 lg:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* Key Metrics */}
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-slate-400">
            <div className="flex items-center gap-1.5">
              <span>Members:</span>
              <span className="text-white font-mono font-semibold tabular-nums">
                {statusData?.counts?.users ?? 0}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Referrals:</span>
              <span className="text-emerald-400 font-mono font-semibold tabular-nums">
                {statusData?.counts?.validReferrals ?? 0} Valid
              </span>
              <span className="text-slate-500">/</span>
              <span className="text-amber-400 font-mono font-semibold tabular-nums">
                {statusData?.counts?.pendingReferrals ?? 0} Pending
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Audited XP Ledger:</span>
              <span className="text-indigo-400 font-mono font-semibold tabular-nums">
                {statusData?.counts?.transactions ?? 0} tx
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Google Sheet:</span>
              {spreadsheetUrl ? (
                <a
                  href={spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline font-mono flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Linked & Syncing ↗</span>
                </a>
              ) : (
                <button
                  onClick={() => setActiveTab('sheets')}
                  className="text-slate-500 hover:text-slate-300 italic"
                >
                  Click to link spreadsheet
                </button>
              )}
            </div>
          </div>

          {/* Real-time Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                realtimeConnected
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Zap className={`w-3 h-3 ${realtimeConnected ? 'text-amber-400 animate-pulse' : ''}`} />
              <span>{realtimeConnected ? 'SSE Live Stream Active' : 'Connecting Stream...'}</span>
            </span>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-6">
        {activeTab === 'members' && (
          <MembersView onRefreshAll={fetchStatus} spreadsheetUrl={spreadsheetUrl} />
        )}

        {activeTab === 'referrals' && <ReferralsView onRefreshAll={fetchStatus} />}

        {activeTab === 'invites' && <InvitesView onRefreshAll={fetchStatus} />}

        {activeTab === 'sheets' && <GoogleSheetsHub onRefreshAll={fetchStatus} />}

        {activeTab === 'commands' && <CommandsGuideView />}

        {activeTab === 'leaderboard' && <LeaderboardView />}

        {activeTab === 'ledger' && <LedgerView />}

        {activeTab === 'logs' && <BotLogsView />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0d111a] px-4 lg:px-8 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="text-slate-400 font-medium">UPRISE Discord Community Platform</span>
            <span className="mx-2 text-slate-700">·</span>
            <span>Real-time Multi-Role Ledger & Verification Engine</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Google Sheets Master Storage</span>
            <span aria-hidden="true">·</span>
            <span>Gmail OTP Delivery</span>
            <span aria-hidden="true">·</span>
            <span>Discord Live Gateway</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

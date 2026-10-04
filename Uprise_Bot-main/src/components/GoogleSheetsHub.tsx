import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Mail,
  CheckCircle,
  ExternalLink,
  RefreshCw,
  Send,
  ShieldCheck,
  AlertCircle,
  LogIn,
  LogOut,
  Database,
  ArrowRight,
} from 'lucide-react';
import { googleSignIn, googleLogout, getAccessToken, initAuth, auth } from '../services/firebaseAuth.ts';

interface GoogleSheetsHubProps {
  onRefreshAll?: () => void;
}

export const GoogleSheetsHub: React.FC<GoogleSheetsHubProps> = ({ onRefreshAll }) => {
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Load settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (e: any) {
      console.warn('Failed to fetch settings:', e.message);
    }
  };

  useEffect(() => {
    fetchSettings();

    initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
  }, []);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setAccessToken(result.accessToken);

        // Store access token in backend settings so Discord bot can send Gmail OTPs & sync Sheets
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'google_access_token', value: result.accessToken }),
        }).catch(() => {});

        setStatusMessage({
          type: 'success',
          text: `Signed in as ${result.user.email}. Google Sheets and Gmail permissions active!`,
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e.message || 'Google Sign-In failed. Please try again.',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await googleLogout();
    setCurrentUser(null);
    setAccessToken(null);
    setStatusMessage({ type: 'success', text: 'Signed out of Google account.' });
  };

  const handleCreateSheet = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'Please sign in with Google first.' });
      return;
    }

    setIsCreatingSheet(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.ok) {
        await fetchSettings();
        if (onRefreshAll) onRefreshAll();
        setStatusMessage({
          type: 'success',
          text: `Google Spreadsheet created successfully!`,
        });
      } else {
        throw new Error(data.error || 'Failed to create spreadsheet');
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleSyncData = async () => {
    if (!accessToken) {
      setStatusMessage({ type: 'error', text: 'Please sign in with Google first.' });
      return;
    }

    setIsSyncing(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.ok) {
        setStatusMessage({
          type: 'success',
          text: `Synchronized ${data.syncResult.membersCount} members, ${data.syncResult.referralsCount} referrals, and ${data.syncResult.transactionsCount} transactions to Google Sheet!`,
        });
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSendTestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmail) return;

    setIsSendingTest(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch('/api/verify/send-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: testEmail,
          fullName: testName || 'Test User',
          username: 'tester',
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setTestResult(
          data.emailSent
            ? `✅ Real email delivered to ${testEmail} via Gmail API! Code: ${data.otpPreview}`
            : `ℹ️ OTP generated: ${data.otpPreview} (Connect Google account to deliver straight to mailbox)`
        );
      } else {
        throw new Error(data.error || 'Failed to send OTP');
      }
    } catch (e: any) {
      setTestResult(`❌ Error: ${e.message}`);
    } finally {
      setIsSendingTest(false);
    }
  };

  const spreadsheetId = settings['google_spreadsheet_id'];
  const spreadsheetUrl = settings['google_spreadsheet_url'] || (spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                100% Real Google Workspace Integration
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Sheets & Gmail API
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
              Google Sheets Master Storage & Email OTP Gateway
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Permanently store all member records, email addresses, verification logs, and referral audit ledgers in your Google Spreadsheet. Deliver 6-digit OTP verification codes directly to member mailboxes.
            </p>
          </div>

          {/* Google Auth Status Card */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
            {currentUser ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
                  {currentUser.email?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    Google Account Connected
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  title="Sign out of Google"
                  className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors ml-2"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-400 mb-2">Connect Google account to enable Sheets sync & Gmail OTP:</p>
                <button
                  onClick={handleSignIn}
                  disabled={isLoggingIn}
                  className="flex items-center gap-2.5 px-4 py-2 bg-white text-slate-900 font-medium text-xs rounded-lg hover:bg-slate-100 transition-colors shadow-sm disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{isLoggingIn ? 'Connecting...' : 'Sign in with Google'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/40 border border-red-800 text-red-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Google Sheets Master Control */}
        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                Community Master Google Spreadsheet
              </h3>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                  spreadsheetId
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {spreadsheetId ? 'Linked & Active' : 'Not Linked'}
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Every verified member is automatically saved to your linked Google Sheet with their verification timestamp, full name, email, phone number, Discord username, user ID, inviter details, and XP earned.
            </p>

            {spreadsheetId ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-5 space-y-3">
                <div className="text-xs">
                  <span className="text-slate-400">Spreadsheet ID:</span>
                  <div className="font-mono text-emerald-300 text-[11px] mt-0.5 truncate select-all">
                    {spreadsheetId}
                  </div>
                </div>

                <div className="text-xs">
                  <span className="text-slate-400">Tabs Included:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] border border-slate-700">
                      📋 Verified Members
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] border border-slate-700">
                      👥 Referrals Ledger
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] border border-slate-700">
                      ⚡ XP Transactions
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-lg p-6 text-center mb-5">
                <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400 mb-3">
                  No Google Spreadsheet is linked yet. Click below to create a pre-formatted spreadsheet in your Google Drive!
                </p>
                <button
                  onClick={handleCreateSheet}
                  disabled={isCreatingSheet || !accessToken}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{isCreatingSheet ? 'Creating Sheet...' : 'Create Master Google Sheet'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800/80">
            {spreadsheetUrl && (
              <a
                href={spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
              >
                <span>Open in Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              onClick={handleSyncData}
              disabled={isSyncing || !spreadsheetId || !accessToken}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync All Data to Sheet'}</span>
            </button>

            {!spreadsheetId && (
              <button
                onClick={handleCreateSheet}
                disabled={isCreatingSheet || !accessToken}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isCreatingSheet ? 'Creating...' : 'Create Spreadsheet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Gmail OTP Verification Delivery */}
        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-400" />
                Gmail OTP Delivery Gateway
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950/40 border border-indigo-800 text-indigo-400">
                Official Gmail API
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              When members submit the verification form, a secure 6-digit OTP code is dispatched directly to their email inbox using your connected Gmail account. Test the delivery pipeline below:
            </p>

            <form onSubmit={handleSendTestOtp} className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Recipient Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anurag Gupta"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Recipient Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. user@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSendingTest || !testEmail}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingTest ? 'Sending Test OTP...' : 'Send Test OTP via Gmail'}</span>
              </button>
            </form>

            {testResult && (
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
                {testResult}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>
              Codes expire automatically after 10 minutes and can only be used once.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleSheetsHub;

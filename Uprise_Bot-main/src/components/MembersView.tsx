import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  UserPlus,
  Edit2,
  Trash2,
  Mail,
  Search,
  CheckCircle,
  Clock,
  ExternalLink,
  KeyRound,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  FileSpreadsheet,
} from 'lucide-react';
import { getAccessToken } from '../services/firebaseAuth.ts';

interface UserRecord {
  id: string;
  discordId: string;
  username: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  xp: number;
  verifiedAt: string | null;
  createdAt: string;
  referralReceived?: {
    id: string;
    inviteCode: string | null;
    status: string;
    inviter?: {
      username: string;
      discordId: string;
    } | null;
  } | null;
  _count?: {
    referralsGiven: number;
    xpTransactions: number;
  };
}

interface DiscordGuildMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  roles: string[];
  isBot: boolean;
  inDatabase: boolean;
}

interface MembersViewProps {
  onRefreshAll?: () => void;
  spreadsheetUrl?: string | null;
}

export const MembersView: React.FC<MembersViewProps> = ({ onRefreshAll, spreadsheetUrl }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [discordMembers, setDiscordMembers] = useState<DiscordGuildMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'verified' | 'unverified' | 'discord'>('all');

  // Modal states
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<UserRecord | null>(null);
  const [deletingMember, setDeletingMember] = useState<UserRecord | null>(null);

  // Verification Form State
  const [verifyForm, setVerifyForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    discordId: '',
    username: '',
  });
  const [verifyStep, setVerifyStep] = useState<'details' | 'otp'>('details');
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);
  const [otpFeedback, setOtpFeedback] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Add Member State
  const [addForm, setAddForm] = useState({
    discordId: '',
    username: '',
    fullName: '',
    email: '',
    initialXp: '100',
  });
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Member State
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    username: '',
    xp: 0,
  });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete Member State
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Notification Banner
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      setUsers(data.users || []);
      setDiscordMembers(data.discordGuildMembers || []);
    } catch (err: any) {
      console.error('Failed to load members:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  // Open Verify Modal for a specific member or new
  const openVerifyModal = (discordMember?: DiscordGuildMember | UserRecord) => {
    if (discordMember) {
      setVerifyForm({
        fullName: ('fullName' in discordMember ? discordMember.fullName : '') || '',
        email: ('email' in discordMember ? discordMember.email : '') || '',
        phone: ('phone' in discordMember ? discordMember.phone : '') || '',
        discordId: 'discordId' in discordMember ? discordMember.discordId : discordMember.id,
        username: discordMember.username,
      });
    } else {
      setVerifyForm({
        fullName: '',
        email: '',
        phone: '',
        discordId: '',
        username: '',
      });
    }
    setVerifyStep('details');
    setOtpCode('');
    setOtpFeedback(null);
    setVerifyError(null);
    setIsVerifyModalOpen(true);
  };

  // Step 1: Send OTP to Email
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyForm.email || !verifyForm.phone || !verifyForm.discordId) {
      setVerifyError('Email, phone number and Discord ID are required.');
      return;
    }

    setIsSendingOtp(true);
    setVerifyError(null);
    setOtpFeedback(null);

    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/verify/send-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: verifyForm.email,
          fullName: verifyForm.fullName,
          phone: verifyForm.phone,
          discordId: verifyForm.discordId,
          username: verifyForm.username,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setVerifyStep('otp');
        setOtpFeedback(
          data.emailSent
            ? `✅ 6-digit OTP sent to ${verifyForm.email} via Gmail! Check your inbox.`
            : `ℹ️ OTP Code generated: ${data.otpPreview} (Connect Google in Sheets tab for direct email delivery)`
        );
      } else {
        throw new Error(data.error || 'Failed to send OTP code');
      }
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Confirm OTP & Complete Verification
  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) {
      setVerifyError('Please enter the 6-digit code.');
      return;
    }

    setIsSubmittingVerify(true);
    setVerifyError(null);

    try {
      const token = await getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/verify/confirm-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: verifyForm.email,
          otp: otpCode.trim(),
          discordId: verifyForm.discordId,
          username: verifyForm.username,
          fullName: verifyForm.fullName,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsVerifyModalOpen(false);
        setActionNotice({
          type: 'success',
          message: `Successfully verified @${verifyForm.username}! +100 XP awarded and logged to Google Sheets.`,
        });
        await fetchMembers();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Verification failed');
      }
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setIsSubmittingVerify(false);
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAdd(true);
    setAddError(null);

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      const data = await res.json();
      if (data.ok) {
        setIsAddModalOpen(false);
        setAddForm({ discordId: '', username: '', fullName: '', email: '', initialXp: '100' });
        setActionNotice({
          type: 'success',
          message: `Member @${data.user.username} registered with ${data.user.xp} XP.`,
        });
        await fetchMembers();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to add member');
      }
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (user: UserRecord) => {
    setEditingMember(user);
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      username: user.username,
      xp: user.xp,
    });
  };

  // Submit Edit Member
  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/members/${editingMember.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();
      if (data.ok) {
        setEditingMember(null);
        setActionNotice({
          type: 'success',
          message: `Updated @${data.user.username} successfully.`,
        });
        await fetchMembers();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to update member');
      }
    } catch (err: any) {
      alert(`Error updating member: ${err.message}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Submit Delete Member
  const handleDeleteMember = async () => {
    if (!deletingMember) return;
    setIsSubmittingDelete(true);

    try {
      const res = await fetch(`/api/members/${deletingMember.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.ok) {
        setDeletingMember(null);
        setActionNotice({
          type: 'success',
          message: data.message || `Member deleted.`,
        });
        await fetchMembers();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to delete member');
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Filtered list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.discordId.includes(searchQuery) ||
      (u.fullName && u.fullName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterTab === 'verified') return Boolean(u.verifiedAt || u.xp > 0);
    if (filterTab === 'unverified') return !u.verifiedAt && u.xp === 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Action & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e121b] border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Members & Real-Time Verification Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real community members from Discord and SQLite database. Send email OTP verification, manipulate XP, and auto-sync records to Google Sheets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800 text-emerald-400 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheet ↗</span>
            </a>
          )}

          <button
            onClick={() => openVerifyModal()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Verify Member (OTP)</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-300'
              : 'bg-red-950/40 border border-red-800 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionNotice.message}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-white text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Live Discord Server Members Banner */}
      {discordMembers.length > 0 && (
        <div className="bg-[#0d111a] border border-slate-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                Live Discord Server Roster ({discordMembers.length} Members in Server)
              </h3>
            </div>
            <button
              onClick={fetchMembers}
              title="Refresh server roster"
              className="text-slate-400 hover:text-white text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {discordMembers.map((m) => (
              <div
                key={m.id}
                className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {m.avatarUrl ? (
                    <img
                      src={m.avatarUrl}
                      alt={m.username}
                      className="w-8 h-8 rounded-full border border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
                      <span>{m.displayName}</span>
                      {m.isBot && (
                        <span className="px-1 py-0.2 rounded bg-indigo-900/80 text-[9px] text-indigo-300 font-mono">
                          BOT
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">@{m.username}</div>
                  </div>
                </div>

                <div>
                  {m.inDatabase ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/40 border border-emerald-800 text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      <span>Tracked</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => openVerifyModal(m)}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium rounded transition-colors"
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by username, full name, email, or Discord ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0e121b] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0e121b] p-1 border border-slate-800 rounded-lg text-xs">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterTab === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Members ({users.length})
          </button>
          <button
            onClick={() => setFilterTab('verified')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterTab === 'verified'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Verified ({users.filter((u) => u.verifiedAt || u.xp > 0).length})
          </button>
          <button
            onClick={() => setFilterTab('unverified')}
            className={`px-3 py-1 rounded-md transition-colors ${
              filterTab === 'unverified'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Unverified ({users.filter((u) => !u.verifiedAt && u.xp === 0).length})
          </button>
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b0e14] border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Member Details</th>
                <th className="px-4 py-3">Email & Contact</th>
                <th className="px-4 py-3">XP Points</th>
                <th className="px-4 py-3">Referral Status</th>
                <th className="px-4 py-3">Verified Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading community records...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No matching members found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isVerified = Boolean(user.verifiedAt || user.xp > 0);
                  return (
                    <tr key={user.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-300 shrink-0">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>@{user.username}</span>
                              {user.fullName && (
                                <span className="text-slate-400 font-normal">({user.fullName})</span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 select-all">
                              ID: {user.discordId}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {user.email ? (
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="font-mono text-[11px] truncate max-w-[180px]">{user.email}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No email linked</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-1 rounded bg-indigo-950/60 border border-indigo-800/80 font-mono font-bold text-indigo-300 text-xs">
                          {user.xp} XP
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        {user.referralReceived ? (
                          <div className="text-[11px]">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                user.referralReceived.status === 'VALID'
                                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                                  : user.referralReceived.status === 'PENDING'
                                  ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                                  : 'bg-red-950/40 border-red-800 text-red-400'
                              }`}
                            >
                              {user.referralReceived.status}
                            </span>
                            <div className="text-slate-400 mt-1">
                              Invited by:{' '}
                              <strong className="text-slate-300">
                                @{user.referralReceived.inviter?.username || 'Direct'}
                              </strong>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Direct Join</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                        {user.verifiedAt ? (
                          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>{new Date(user.verifiedAt).toLocaleDateString()}</span>
                          </div>
                        ) : isVerified ? (
                          <span className="text-indigo-400 font-medium">Verified (XP Balance)</span>
                        ) : (
                          <span className="text-amber-500/80 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Verification
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isVerified && (
                            <button
                              onClick={() => openVerifyModal(user)}
                              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors"
                            >
                              Verify
                            </button>
                          )}

                          <button
                            onClick={() => openEditModal(user)}
                            title="Edit member"
                            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeletingMember(user)}
                            title="Delete member"
                            className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-red-950/30 border border-slate-700/60 hover:border-red-900 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VERIFY WITH EMAIL OTP MODAL */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsVerifyModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Member Email OTP Verification</h3>
                <p className="text-xs text-slate-400">Verifies account, awards +100 XP & syncs to Google Sheets</p>
              </div>
            </div>

            {verifyError && (
              <div className="my-3 p-2.5 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {verifyStep === 'details' ? (
              <form onSubmit={handleSendOtp} className="space-y-3.5 mt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anurag Gupta"
                    value={verifyForm.fullName}
                    onChange={(e) => setVerifyForm({ ...verifyForm, fullName: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. anurag@example.com"
                    value={verifyForm.email}
                    onChange={(e) => setVerifyForm({ ...verifyForm, email: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +919876543210"
                    value={verifyForm.phone}
                    onChange={(e) => setVerifyForm({ ...verifyForm, phone: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Discord Username <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. anurag_123"
                      value={verifyForm.username}
                      onChange={(e) => setVerifyForm({ ...verifyForm, username: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Discord User ID <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 1556014..."
                      value={verifyForm.discordId}
                      onChange={(e) => setVerifyForm({ ...verifyForm, discordId: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isSendingOtp}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{isSendingOtp ? 'Sending 6-Digit Code...' : 'Send Verification OTP to Email'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmOtp} className="space-y-4 mt-4">
                {otpFeedback && (
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
                    {otpFeedback}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 text-center">
                    Enter the 6-Digit Code sent to <strong className="text-white">{verifyForm.email}</strong>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    autoFocus
                    placeholder="123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 text-center text-xl font-mono tracking-widest text-indigo-400 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setVerifyStep('details')}
                    className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingVerify || otpCode.length !== 6}
                    className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{isSubmittingVerify ? 'Verifying...' : 'Confirm & Complete'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-4">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Add Community Member Manually</h3>
            </div>

            {addError && (
              <div className="mb-3 p-2.5 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddMember} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Discord Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. anurag_123"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Discord User ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1556014358180397237"
                  value={addForm.discordId}
                  onChange={(e) => setAddForm({ ...addForm, discordId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Anurag Gupta"
                  value={addForm.fullName}
                  onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. anurag@example.com"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial XP</label>
                <input
                  type="number"
                  placeholder="100"
                  value={addForm.initialXp}
                  onChange={(e) => setAddForm({ ...addForm, initialXp: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmittingAdd ? 'Saving...' : 'Register Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MEMBER MODAL */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingMember(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Edit2 className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Edit @{editingMember.username}</h3>
            </div>

            <form onSubmit={handleEditMember} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">XP Points Balance</label>
                <input
                  type="number"
                  value={editForm.xp}
                  onChange={(e) => setEditForm({ ...editForm, xp: parseInt(e.target.value || '0', 10) })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MEMBER MODAL */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-red-900/50 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-3 text-red-400">
              <div className="p-2 rounded-lg bg-red-950/60 border border-red-900/60">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Member Record</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to permanently delete member <strong className="text-white">@{deletingMember.username}</strong> ({deletingMember.discordId})?
            </p>

            <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-300 mb-4 space-y-1">
              <div>• Removes user and ledger transaction history.</div>
              {deletingMember.referralReceived?.status === 'VALID' && (
                <div>• Automatically reverts referral bonus from their inviter (-250 XP).</div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteMember}
                disabled={isSubmittingDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmittingDelete ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MembersView;

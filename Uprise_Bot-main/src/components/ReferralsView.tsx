import React, { useEffect, useState } from 'react';
import {
  Users,
  CheckCircle,
  Clock,
  XCircle,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface ReferralRecord {
  id: string;
  inviteCode: string | null;
  status: 'PENDING' | 'VALID' | 'INVALID';
  joinedAt: string;
  verifiedAt: string | null;
  rewardedAt: string | null;
  inviter: {
    id: string;
    username: string;
    discordId: string;
    xp: number;
  } | null;
  invitee: {
    id: string;
    username: string;
    discordId: string;
    xp: number;
  };
}

interface MemberOption {
  id: string;
  username: string;
  discordId: string;
}

interface ReferralsViewProps {
  onRefreshAll?: () => void;
}

export const ReferralsView: React.FC<ReferralsViewProps> = ({ onRefreshAll }) => {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<ReferralRecord | null>(null);
  const [deletingReferral, setDeletingReferral] = useState<ReferralRecord | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    inviterId: '',
    inviteeId: '',
    inviteCode: '',
    status: 'VALID',
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Form State
  const [editStatus, setEditStatus] = useState<'VALID' | 'PENDING' | 'INVALID'>('VALID');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete State
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchReferrals = async () => {
    setIsLoading(true);
    try {
      const [refRes, memRes] = await Promise.all([
        fetch('/api/referrals'),
        fetch('/api/members'),
      ]);
      const refData = await refRes.json();
      const memData = await memRes.json();

      setReferrals(refData || []);
      setMembers(memData.users || []);
    } catch (err: any) {
      console.error('Failed to load referrals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, []);

  const successfulCount = referrals.filter((r) => r.status === 'VALID').length;
  const pendingCount = referrals.filter((r) => r.status === 'PENDING').length;
  const invalidCount = referrals.filter((r) => r.status === 'INVALID').length;

  const filtered = referrals.filter((r) => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (!searchQuery) return true;

    const q = searchQuery.toLowerCase();
    return (
      r.invitee.username.toLowerCase().includes(q) ||
      r.invitee.discordId.includes(q) ||
      (r.inviter && r.inviter.username.toLowerCase().includes(q)) ||
      (r.inviteCode && r.inviteCode.toLowerCase().includes(q))
    );
  });

  // Handle Create Referral
  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.inviteeId) {
      setCreateError('Please select an invitee member.');
      return;
    }
    if (createForm.inviterId && createForm.inviterId === createForm.inviteeId) {
      setCreateError('A member cannot invite themselves.');
      return;
    }

    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      const data = await res.json();
      if (data.ok) {
        setIsCreateModalOpen(false);
        setCreateForm({ inviterId: '', inviteeId: '', inviteCode: '', status: 'VALID' });
        setActionNotice({
          type: 'success',
          message: `Referral created successfully! [Status: ${data.referral.status}]`,
        });
        await fetchReferrals();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to create referral');
      }
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Handle Edit Status
  const handleEditStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReferral) return;

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/referrals/${editingReferral.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus }),
      });

      const data = await res.json();
      if (data.ok) {
        setEditingReferral(null);
        setActionNotice({
          type: 'success',
          message: `Referral status updated to ${editStatus}. Inviter XP adjusted automatically.`,
        });
        await fetchReferrals();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to update referral');
      }
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Delete Referral
  const handleDeleteReferral = async () => {
    if (!deletingReferral) return;

    setIsSubmittingDelete(true);
    try {
      const res = await fetch(`/api/referrals/${deletingReferral.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (data.ok) {
        setDeletingReferral(null);
        setActionNotice({
          type: 'success',
          message: 'Referral removed. If it was Valid, 250 XP bonus was reverted from the inviter.',
        });
        await fetchReferrals();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to delete referral');
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Valid / Rewarded Referrals</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1 tabular-nums">
            {successfulCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Inviter rewarded +250 XP each</div>
        </div>

        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Pending Verification</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1 tabular-nums">
            {pendingCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Joined via invite, awaiting OTP</div>
        </div>

        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Invalidated (Departed)</div>
          <div className="text-2xl font-bold text-slate-400 font-mono mt-1 tabular-nums">
            {invalidCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Left server or manually revoked</div>
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
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white text-xs">
            ✕
          </button>
        </div>
      )}

      {/* Referrals Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            Referrals Directory & CRUD Manager
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full lineage linking inviters with invitees. Create, edit status, or revoke referrals in real time.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Referral</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by inviter, invitee, or invite code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0e121b] border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0e121b] border border-slate-800 p-1 rounded-lg text-xs">
          {['ALL', 'VALID', 'PENDING', 'INVALID'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 rounded-md transition-colors ${
                filterStatus === status ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b0e14] border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Inviter (Referrer)</th>
                <th className="px-4 py-3">Invitee (New Member)</th>
                <th className="px-4 py-3">Invite Code</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-400" />
                    Loading referrals ledger...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No referrals found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3.5">
                      {r.inviter ? (
                        <div>
                          <div className="font-semibold text-white">@{r.inviter.username}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {r.inviter.discordId} · {r.inviter.xp} XP
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Direct Join / None</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-white">@{r.invitee.username}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.invitee.discordId}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      {r.inviteCode ? (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-700">
                          {r.inviteCode}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">None</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${
                          r.status === 'VALID'
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                            : r.status === 'PENDING'
                            ? 'bg-amber-950/40 border-amber-800 text-amber-400'
                            : 'bg-red-950/40 border-red-800 text-red-400'
                        }`}
                      >
                        {r.status === 'VALID' && <CheckCircle className="w-3 h-3" />}
                        {r.status === 'PENDING' && <Clock className="w-3 h-3" />}
                        {r.status === 'INVALID' && <XCircle className="w-3 h-3" />}
                        <span>{r.status}</span>
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {new Date(r.joinedAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingReferral(r);
                            setEditStatus(r.status);
                          }}
                          title="Change status"
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setDeletingReferral(r)}
                          title="Delete referral"
                          className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-red-950/30 border border-slate-700/60 hover:border-red-900 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE REFERRAL MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Create New Referral Link</h3>
            </div>

            {createError && (
              <div className="mb-3 p-2.5 rounded bg-red-950/40 border border-red-800 text-red-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateReferral} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Invited By (Referrer)
                </label>
                <select
                  value={createForm.inviterId}
                  onChange={(e) => setCreateForm({ ...createForm, inviterId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Direct Join (No Inviter)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      @{m.username} ({m.discordId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Invitee (New Member) <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={createForm.inviteeId}
                  onChange={(e) => setCreateForm({ ...createForm, inviteeId: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select invitee...</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      @{m.username} ({m.discordId})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Invite Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. uprise-vip"
                  value={createForm.inviteCode}
                  onChange={(e) => setCreateForm({ ...createForm, inviteCode: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Initial Status</label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="VALID">VALID (Immediately awards +250 XP to Inviter)</option>
                  <option value="PENDING">PENDING (Awaiting verification)</option>
                  <option value="INVALID">INVALID</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Saving...' : 'Create Referral'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT REFERRAL STATUS MODAL */}
      {editingReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingReferral(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-3">
              <Edit2 className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Update Referral Status</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              Inviter:{' '}
              <strong className="text-white">
                @{editingReferral.inviter?.username || 'Direct Join'}
              </strong>{' '}
              → Invitee: <strong className="text-white">@{editingReferral.invitee.username}</strong>
            </p>

            <form onSubmit={handleEditStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Select Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="VALID">VALID (Awards +250 XP to Inviter)</option>
                  <option value="PENDING">PENDING (Unverified)</option>
                  <option value="INVALID">INVALID (Revokes +250 XP bonus)</option>
                </select>
              </div>

              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-400 leading-relaxed">
                {editStatus === 'VALID' && (
                  <span className="text-emerald-400">
                    • Transitioning to VALID marks the referral as confirmed and awards +250 XP to the inviter with audit trail.
                  </span>
                )}
                {editStatus === 'INVALID' && (
                  <span className="text-red-400">
                    • Transitioning to INVALID deducts the 250 XP bonus from the inviter and updates the audit ledger.
                  </span>
                )}
                {editStatus === 'PENDING' && (
                  <span>
                    • Status set to PENDING awaiting verification form or /verify slash command.
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReferral(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Update Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE REFERRAL MODAL */}
      {deletingReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-red-900/50 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-3 text-red-400">
              <div className="p-2 rounded-lg bg-red-950/60 border border-red-900/60">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Referral Record</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to delete the referral record between{' '}
              <strong className="text-white">@{deletingReferral.inviter?.username || 'Direct'}</strong> and{' '}
              <strong className="text-white">@{deletingReferral.invitee.username}</strong>?
            </p>

            {deletingReferral.status === 'VALID' && (
              <div className="p-3 bg-red-950/30 border border-red-900/40 rounded-lg text-xs text-red-300 mb-4">
                ⚠️ This referral is currently VALID. Deleting it will automatically deduct the 250 XP bonus previously awarded to @{deletingReferral.inviter?.username}.
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingReferral(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteReferral}
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

export default ReferralsView;

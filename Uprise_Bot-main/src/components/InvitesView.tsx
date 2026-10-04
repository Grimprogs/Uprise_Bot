import React, { useState, useEffect } from 'react';
import {
  Link2,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Users,
  RefreshCw,
  AlertTriangle,
  Radio,
} from 'lucide-react';

interface DiscordInvite {
  code: string;
  uses: number;
  maxUses: number | null;
  inviterTag: string | null;
  inviterId: string | null;
  url: string;
  channelName: string | null;
}

interface TrackedInvite {
  code: string;
  inviterDiscordId: string | null;
  uses: number;
  createdAt: string;
}

interface InvitesViewProps {
  onRefreshAll?: () => void;
}

export const InvitesView: React.FC<InvitesViewProps> = ({ onRefreshAll }) => {
  const [discordInvites, setDiscordInvites] = useState<DiscordInvite[]>([]);
  const [trackedInvites, setTrackedInvites] = useState<TrackedInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    code: '',
    inviterDiscordId: '',
    createOnDiscord: true,
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const fetchInvites = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/invites');
      const data = await res.json();
      setDiscordInvites(data.discordInvites || []);
      setTrackedInvites(data.tracked || []);
    } catch (e: any) {
      console.error('Failed to load invites:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  const copyToClipboard = (text: string, code: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCreate(true);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      const data = await res.json();
      if (data.ok) {
        setIsCreateOpen(false);
        setCreateForm({ code: '', inviterDiscordId: '', createOnDiscord: true });
        await fetchInvites();
        if (onRefreshAll) onRefreshAll();
      } else {
        throw new Error(data.error || 'Failed to create invite');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleDeleteInvite = async () => {
    if (!deletingCode) return;
    setIsSubmittingDelete(true);
    try {
      const res = await fetch(`/api/invites/${deletingCode}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        setDeletingCode(null);
        await fetchInvites();
        if (onRefreshAll) onRefreshAll();
      }
    } catch (e: any) {
      alert(`Delete failed: ${e.message}`);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0e121b] border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Link2 className="w-5 h-5 text-indigo-400" />
            Discord Invites & Attribution Codes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real invite links created on your Discord server and tracked in the referral attribution engine.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Discord Invite</span>
        </button>
      </div>

      {/* Live Server Invites */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Live Guild Invites (From Discord API)
            </h3>
          </div>
          <button
            onClick={fetchInvites}
            className="text-slate-400 hover:text-white text-xs flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0b0e14] border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Invite Link / Code</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Creator / Inviter</th>
                <th className="px-4 py-3">Uses</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading Discord server invites...
                  </td>
                </tr>
              ) : discordInvites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No active Discord invites found. Click "Create Discord Invite" to generate one.
                  </td>
                </tr>
              ) : (
                discordInvites.map((inv) => (
                  <tr key={inv.code} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-indigo-300 font-semibold text-xs select-all">
                          {inv.code}
                        </span>
                        <button
                          onClick={() => copyToClipboard(inv.url, inv.code)}
                          title="Copy full invite link"
                          className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded transition-colors"
                        >
                          {copiedCode === inv.code ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-xs">{inv.url}</div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-300">
                      #{inv.channelName || 'general'}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-medium text-white">{inv.inviterTag || 'Server'}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{inv.inviterId}</div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-medium">
                        {inv.uses} {inv.maxUses ? `/ ${inv.maxUses}` : 'uses'}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => setDeletingCode(inv.code)}
                        title="Revoke / Delete Invite"
                        className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-red-950/30 border border-slate-700/60 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE INVITE MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-slate-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-sm"
            >
              ✕
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Create Discord Invite</h3>
            </div>

            <form onSubmit={handleCreateInvite} className="space-y-3.5">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-white">Generate Real Guild Invite</div>
                  <div className="text-[11px] text-slate-400">
                    Creates an active discord.gg link in the server
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={createForm.createOnDiscord}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, createOnDiscord: e.target.checked })
                  }
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Custom Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. uprise-ambassador"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Map to Inviter (Discord User ID)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1556014358180397237"
                  value={createForm.inviterDiscordId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, inviterDiscordId: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Creating...' : 'Create Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE INVITE MODAL */}
      {deletingCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#0e121b] border border-red-900/50 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center gap-3 mb-3 text-red-400">
              <div className="p-2 rounded-lg bg-red-950/60 border border-red-900/60">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Revoke Discord Invite</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to revoke invite code <strong className="text-white font-mono">{deletingCode}</strong>? This will delete the invite from Discord and untrack it.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingCode(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteInvite}
                disabled={isSubmittingDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmittingDelete ? 'Revoking...' : 'Confirm Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitesView;

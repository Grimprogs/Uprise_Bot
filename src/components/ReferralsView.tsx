import React, { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, XCircle, ArrowRight } from 'lucide-react';

interface ReferralRecord {
  id: string;
  inviteCode: string | null;
  status: 'PENDING' | 'VALID' | 'INVALID';
  joinedAt: string;
  verifiedAt: string | null;
  rewardedAt: string | null;
  inviter: {
    username: string;
    discordId: string;
  } | null;
  invitee: {
    username: string;
    discordId: string;
    xp: number;
  };
}

export const ReferralsView: React.FC = () => {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchReferrals = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/referrals');
      const data = await res.json();
      setReferrals(data || []);
    } catch (err) {
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
    if (filterStatus === 'ALL') return true;
    return r.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      {/* Metric Cards (Zero-Pill, Clean Typography) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#12161f] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Valid / Rewarded Referrals</div>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1 tabular-nums">
            {successfulCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Inviter received +250 XP each</div>
        </div>

        <div className="bg-[#12161f] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Pending Verification</div>
          <div className="text-2xl font-bold text-amber-400 font-mono mt-1 tabular-nums">
            {pendingCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Joined but not verified yet</div>
        </div>

        <div className="bg-[#12161f] border border-slate-800 rounded-lg p-4">
          <div className="text-xs text-slate-400 font-medium">Invalidated (Left Early)</div>
          <div className="text-2xl font-bold text-slate-400 font-mono mt-1 tabular-nums">
            {invalidCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Left server prior to verify</div>
        </div>
      </div>

      {/* Referrals Table Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            Referrals Directory
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full lineage linking inviter and invitee with timestamps and invite codes.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#12161f] border border-slate-800 p-1 rounded-md">
          {['ALL', 'VALID', 'PENDING', 'INVALID'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                filterStatus === status ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* High-density Referrals Table */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-medium">
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Inviter</th>
              <th className="py-2.5 px-4"></th>
              <th className="py-2.5 px-4">Invitee</th>
              <th className="py-2.5 px-4">Invite Code</th>
              <th className="py-2.5 px-4 hidden sm:table-cell">Joined</th>
              <th className="py-2.5 px-4 hidden sm:table-cell">Verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                  Loading referrals...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                  No referrals found matching the selected filter.
                </td>
              </tr>
            ) : (
              filtered.map((ref) => {
                const isValid = ref.status === 'VALID';
                const isPending = ref.status === 'PENDING';

                return (
                  <tr key={ref.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Status with descriptive icon & text (not hue alone) */}
                    <td className="py-3 px-4 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {isValid ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-mono">VALID</span>
                          </>
                        ) : isPending ? (
                          <>
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-amber-400 font-mono">PENDING</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-red-400 font-mono">INVALID</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Inviter */}
                    <td className="py-3 px-4 text-slate-200 font-medium">
                      {ref.inviter ? (
                        <span>@{ref.inviter.username}</span>
                      ) : (
                        <span className="text-slate-500 italic">None / Direct</span>
                      )}
                    </td>

                    {/* Arrow */}
                    <td className="py-3 px-1 text-slate-600">
                      <ArrowRight className="w-3 h-3" />
                    </td>

                    {/* Invitee */}
                    <td className="py-3 px-4 text-slate-200 font-medium">
                      <span>@{ref.invitee.username}</span>
                    </td>

                    {/* Invite Code */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {ref.inviteCode || 'N/A'}
                    </td>

                    {/* Joined At */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                      {new Date(ref.joinedAt).toLocaleDateString()}
                    </td>

                    {/* Verified At */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                      {ref.verifiedAt ? new Date(ref.verifiedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReferralsView;

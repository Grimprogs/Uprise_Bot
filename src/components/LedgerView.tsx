import React, { useEffect, useState } from 'react';
import { ListOrdered, Search, ShieldCheck } from 'lucide-react';

interface XPTransactionRecord {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  referralId: string | null;
  createdAt: string;
  user: {
    username: string;
    discordId: string;
  };
}

export const LedgerView: React.FC = () => {
  const [transactions, setTransactions] = useState<XPTransactionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterReason, setFilterReason] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      setTransactions(data || []);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const filtered = transactions.filter((tx) => {
    const matchesSearch =
      tx.user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.user.discordId.includes(searchTerm) ||
      tx.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesReason =
      filterReason === 'ALL' ||
      (filterReason === 'REFERRAL' && tx.reason.includes('REFERRAL')) ||
      (filterReason === 'VERIFICATION' && tx.reason.includes('VERIFICATION')) ||
      (filterReason === 'ADMIN' && tx.reason.includes('ADMIN'));

    return matchesSearch && matchesReason;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-indigo-400" />
            Auditable XP Ledger (XPTransactions)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable log of every single XP adjustment. Every reward links to an explicit reason and referral reference.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#12161f] border border-slate-800 p-1 rounded-md">
          {['ALL', 'VERIFICATION', 'REFERRAL', 'ADMIN'].map((reason) => (
            <button
              key={reason}
              onClick={() => setFilterReason(reason)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                filterReason === reason ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {reason}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by member, ID, or transaction ID..."
          className="w-full bg-[#12161f] border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Ledger Table */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-medium">
              <th className="py-2.5 px-4 w-36">Timestamp</th>
              <th className="py-2.5 px-4">Member</th>
              <th className="py-2.5 px-4 text-right">Adjustment</th>
              <th className="py-2.5 px-4">Reason</th>
              <th className="py-2.5 px-4 hidden md:table-cell">Transaction ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                  Loading ledger transactions...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                  No XP transactions recorded yet.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                  {/* Timestamp */}
                  <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>

                  {/* Member */}
                  <td className="py-2.5 px-4 font-medium text-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span>@{tx.user.username}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({tx.user.discordId})</span>
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">
                    <span
                      className={
                        tx.amount > 0
                          ? 'text-emerald-400'
                          : tx.amount < 0
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} XP
                    </span>
                  </td>

                  {/* Reason */}
                  <td className="py-2.5 px-4 text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="font-mono text-[11px]">{tx.reason}</span>
                    </div>
                  </td>

                  {/* Transaction ID */}
                  <td className="py-2.5 px-4 text-slate-500 font-mono text-[10px] hidden md:table-cell">
                    {tx.id.slice(0, 16)}...
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LedgerView;

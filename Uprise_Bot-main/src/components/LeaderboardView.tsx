import React, { useEffect, useState } from 'react';
import { Trophy, ChevronLeft, ChevronRight, Medal } from 'lucide-react';

export interface LeaderboardUser {
  rank: number;
  id: string;
  discordId: string;
  username: string;
  xp: number;
}

export const LeaderboardView: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardUser[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLeaderboard = async (page: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?page=${page}&pageSize=10`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(data.currentPage || 1);
      setTotalUsers(data.totalUsers || 0);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(currentPage);
  }, [currentPage]);

  return (
    <div className="space-y-4">
      {/* Header and Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Global UPRISE Leaderboard
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ranked strictly by verified total XP balance. Updated automatically on every XP transaction.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Total Community Members:</span>
          <span className="font-mono text-white font-semibold">{totalUsers}</span>
        </div>
      </div>

      {/* Leaderboard High-Density Table */}
      <div className="bg-[#12161f] border border-slate-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-medium">
              <th className="py-2.5 px-4 w-16">Rank</th>
              <th className="py-2.5 px-4">Member</th>
              <th className="py-2.5 px-4 hidden sm:table-cell">Discord ID</th>
              <th className="py-2.5 px-4 text-right">Total XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                  Loading leaderboard ranks...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500 italic">
                  No members recorded yet. Simulate a member join & verify to populate.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isGold = entry.rank === 1;
                const isSilver = entry.rank === 2;
                const isBronze = entry.rank === 3;

                return (
                  <tr key={entry.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Rank */}
                    <td className="py-3 px-4 font-mono font-medium">
                      <div className="flex items-center gap-1.5">
                        {isGold ? (
                          <span className="text-amber-400 font-bold flex items-center gap-1">
                            <Medal className="w-3.5 h-3.5" /> 1
                          </span>
                        ) : isSilver ? (
                          <span className="text-slate-300 font-bold flex items-center gap-1">
                            <Medal className="w-3.5 h-3.5" /> 2
                          </span>
                        ) : isBronze ? (
                          <span className="text-amber-600 font-bold flex items-center gap-1">
                            <Medal className="w-3.5 h-3.5" /> 3
                          </span>
                        ) : (
                          <span className="text-slate-500 font-mono pl-4">{entry.rank}</span>
                        )}
                      </div>
                    </td>

                    {/* Member */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 uppercase">
                          {entry.username.slice(0, 2)}
                        </div>
                        <span className="font-medium text-slate-100">{entry.username}</span>
                      </div>
                    </td>

                    {/* Discord ID */}
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px] hidden sm:table-cell">
                      {entry.discordId}
                    </td>

                    {/* Total XP */}
                    <td className="py-3 px-4 text-right font-mono font-semibold text-indigo-300 tabular-nums">
                      {entry.xp.toLocaleString()} XP
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-900/40 text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardView;

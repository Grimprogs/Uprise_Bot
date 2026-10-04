import React, { useEffect, useState } from 'react';
import { Radio, AlertCircle, CheckCircle2, UserPlus, Gift, Terminal } from 'lucide-react';

interface BotLogItem {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: string | null;
  createdAt: string;
}

export const BotLogsView: React.FC = () => {
  const [logs, setLogs] = useState<BotLogItem[]>([]);
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filtered = logs.filter((log) => {
    if (selectedType === 'ALL') return true;
    return log.type === selectedType;
  });

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'REFERRAL_VALIDATED':
      case 'VERIFICATION':
        return 'text-emerald-400 border-emerald-800/60 bg-emerald-950/30';
      case 'XP_AWARDED':
        return 'text-blue-400 border-blue-800/60 bg-blue-950/30';
      case 'JOIN':
      case 'INVITE_DETECTED':
      case 'REFERRAL_CREATED':
        return 'text-amber-400 border-amber-800/60 bg-amber-950/30';
      case 'ERROR':
        return 'text-red-400 border-red-800/60 bg-red-950/30';
      case 'ADMIN':
        return 'text-purple-400 border-purple-800/60 bg-purple-950/30';
      default:
        return 'text-slate-400 border-slate-700 bg-slate-800/40';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            #bot-logs Live Audit Stream
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Mirror of the staff-only Discord channel tracking member joins, invite detection, verification, and errors.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 bg-[#12161f] border border-slate-800 p-1 rounded-md overflow-x-auto">
          {['ALL', 'JOIN', 'VERIFICATION', 'XP_AWARDED', 'ERROR', 'ADMIN'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                selectedType === type ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Feed */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="bg-[#12161f] border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-xs">
            Loading logs...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[#12161f] border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-xs">
            No log entries found.
          </div>
        ) : (
          filtered.map((log) => {
            let metaObj: Record<string, any> | null = null;
            if (log.metadata) {
              try {
                metaObj = JSON.parse(log.metadata);
              } catch {
                metaObj = null;
              }
            }

            return (
              <div
                key={log.id}
                className="bg-[#12161f] border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${getBadgeStyle(
                        log.type
                      )}`}
                    >
                      {log.type}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{log.title}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-mono">
                  {log.message}
                </div>

                {metaObj && Object.keys(metaObj).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-400">
                    {Object.entries(metaObj).map(([key, val]) => (
                      <div key={key}>
                        <span className="text-slate-500 capitalize">{key}: </span>
                        <span className="text-slate-300 font-mono">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default BotLogsView;

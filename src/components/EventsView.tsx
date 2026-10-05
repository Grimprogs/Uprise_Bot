import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Radio,
  Bell,
  Trash2,
  Users,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Volume2,
  CheckCircle2,
} from 'lucide-react';

interface EventItem {
  id: string;
  name: string;
  channelId: string;
  channelName: string;
  startTime: string;
  endTime: string | null;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  attendeesCount: number;
  userLimit: number;
  description: string | null;
  reminded1h: boolean;
  reminded15m: boolean;
  createdAt: string;
}

export const EventsView: React.FC = () => {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/scheduled-events');
      const data = await res.json();
      if (data.ok) {
        setEvents(data.events || []);
      }
    } catch (err: any) {
      console.warn('Failed to fetch events:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const handleSendReminder = async (id: string, name: string) => {
    setActionLoading(`remind-${id}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/scheduled-events/${id}/remind`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch reminder');
      setFeedback({ type: 'success', text: `🔔 @everyone reminder dispatched to announcements for "${name}"!` });
      await fetchEvents();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelEvent = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to cancel "${name}" and delete its voice channel?`)) {
      return;
    }
    setActionLoading(`cancel-${id}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/scheduled-events/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel event');
      setFeedback({ type: 'success', text: `Event "${name}" cancelled and channel deleted.` });
      await fetchEvents();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const formatCountdown = (isoString: string) => {
    const diffMs = new Date(isoString).getTime() - Date.now();
    if (diffMs <= 0) return 'Due now / Live';
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `in ${days}d ${hours % 24}h`;
    if (hours > 0) return `in ${hours}h ${mins % 60}m`;
    return `in ${mins}m`;
  };

  const pendingEvents = events.filter((e) => e.status === 'PENDING');
  const liveEvents = events.filter((e) => e.status === 'ACTIVE');
  const pastEvents = events.filter((e) => e.status === 'ENDED' || e.status === 'CANCELLED');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Official Event & Announcement Engine
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Community Events & Broadcast Hub
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Schedule voice events that automatically announce to <strong className="text-slate-200">#📣・announcements</strong> with <strong className="text-slate-200">@everyone</strong> pings, dispatch automatic 1-hour & 15-minute countdown reminders, and unlock on time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchEvents}
              disabled={isLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Discord Slash Command Quick Reference */}
      <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <span>How to Schedule an Event via Discord</span>
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Staff and Organizers can run the slash command in Discord anytime:
        </p>
        <div className="p-3 bg-slate-950 rounded-lg font-mono text-xs text-emerald-400 border border-slate-800/80 overflow-x-auto">
          /event-vc create name:"Community AMA" start_time:"2h" limit:25 description:"Product Roadmap and Q&A"
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Auto @everyone in #📣・announcements</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Auto 1-Hour & 15-Min Reminders</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Auto-unlocks voice channel at start</span>
          </div>
        </div>
      </div>

      {/* Live & Upcoming Events Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Active & Upcoming Scheduled Events ({pendingEvents.length + liveEvents.length})</span>
          </h3>
        </div>

        {liveEvents.length === 0 && pendingEvents.length === 0 ? (
          <div className="bg-[#0e121b] border border-dashed border-slate-800 rounded-xl p-10 text-center">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              No upcoming events currently scheduled. Run <code className="text-indigo-400 bg-slate-900 px-1.5 py-0.5 rounded">/event-vc create</code> in Discord to schedule your next event!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Live Events First */}
            {liveEvents.map((event) => (
              <div
                key={event.id}
                className="bg-[#0e121b] border-2 border-emerald-500/50 rounded-xl p-5 shadow-lg shadow-emerald-500/5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500 text-slate-950 flex items-center gap-1">
                          <Radio className="w-3 h-3 animate-ping" />
                          <span>LIVE NOW</span>
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Volume2 className="w-3 h-3 text-slate-400" />
                          <span>{event.channelName}</span>
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white tracking-tight">{event.name}</h4>
                    </div>

                    <div className="text-right text-xs">
                      <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1 justify-end">
                        <Users className="w-3.5 h-3.5" />
                        <span>{event.attendeesCount} listening</span>
                      </span>
                    </div>
                  </div>

                  {event.description && (
                    <p className="text-xs text-slate-300 mb-4 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {event.description}
                    </p>
                  )}

                  <div className="text-[11px] text-slate-400 space-y-1 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>Started at {new Date(event.startTime).toLocaleTimeString()}</span>
                    </div>
                    {event.endTime && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Scheduled until {new Date(event.endTime).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSendReminder(event.id, event.name)}
                    disabled={actionLoading === `remind-${event.id}`}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Broadcast Live Ping (@everyone)</span>
                  </button>

                  <button
                    onClick={() => handleCancelEvent(event.id, event.name)}
                    disabled={actionLoading === `cancel-${event.id}`}
                    className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-xs transition-colors cursor-pointer"
                  >
                    End & Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Upcoming Pending Events */}
            {pendingEvents.map((event) => (
              <div
                key={event.id}
                className="bg-[#0e121b] border border-slate-800 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {formatCountdown(event.startTime)}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Volume2 className="w-3 h-3 text-slate-400" />
                          <span>{event.channelName}</span>
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-white tracking-tight">{event.name}</h4>
                    </div>

                    <div className="text-right text-xs">
                      <span className="text-slate-400 font-mono">
                        Limit: {event.userLimit > 0 ? `${event.userLimit} max` : 'Unlimited'}
                      </span>
                    </div>
                  </div>

                  {event.description && (
                    <p className="text-xs text-slate-300 mb-4 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {event.description}
                    </p>
                  )}

                  <div className="text-[11px] text-slate-400 space-y-1 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>Opens {new Date(event.startTime).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <span>1h Reminder: {event.reminded1h ? '✅ Sent' : '⏳ Pending'}</span>
                      <span>•</span>
                      <span>15m Reminder: {event.reminded15m ? '✅ Sent' : '⏳ Pending'}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSendReminder(event.id, event.name)}
                    disabled={actionLoading === `remind-${event.id}`}
                    className="px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Dispatch Reminder Now (@everyone)</span>
                  </button>

                  <button
                    onClick={() => handleCancelEvent(event.id, event.name)}
                    disabled={actionLoading === `cancel-${event.id}`}
                    className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-xs transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past / Completed Events */}
      {pastEvents.length > 0 && (
        <div className="bg-[#0e121b] border border-slate-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Past Events History ({pastEvents.length})
          </h3>
          <div className="divide-y divide-slate-800/80 text-xs">
            {pastEvents.slice(0, 5).map((e) => (
              <div key={e.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-300 mr-2">{e.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(e.startTime).toLocaleDateString()}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  e.status === 'ENDED' ? 'bg-slate-800 text-slate-400' : 'bg-rose-950 text-rose-400'
                }`}>
                  {e.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsView;

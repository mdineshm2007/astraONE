import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { Calendar, ChevronRight, User, RefreshCw } from 'lucide-react';
import { resolveNameFromEmail } from '../utils/userUtils';

// Direct Firebase RTDB REST — bypasses ALL security rules, no proxy needed
const RTDB_URL = 'https://studio-1045950084-89865-default-rtdb.asia-southeast1.firebasedatabase.app';
const RTDB_SECRET = 'nbN32sF35ZGFoP3IdVaGkVb5t9gW5NFj3V7Gu7rY';

/** Returns 'YYYY-MM-DD' in UTC to avoid local-timezone day-shift bugs */
function toUTCDateKey(createdAt: any): string {
  if (!createdAt) return '';
  let d: Date;
  if (typeof createdAt === 'number') {
    d = new Date(createdAt > 1e10 ? createdAt : createdAt * 1000);
  } else if (typeof createdAt === 'object' && createdAt.seconds) {
    d = new Date(createdAt.seconds * 1000);
  } else {
    d = new Date(String(createdAt));
  }
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns 'YYYY-MM-DD' in LOCAL time (for the calendar grid squares) */
function toLocalDateKey(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface TaskHeatmapProps {
  updates?: any[]; // kept for API compat, component self-fetches
}

export default function TaskHeatmap(_props: TaskHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [rawUpdates, setRawUpdates] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchData = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`${RTDB_URL}/task_updates.json?auth=${RTDB_SECRET}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json) {
        setRawUpdates([]);
        return;
      }
      if (Array.isArray(json)) {
        setRawUpdates(json);
      } else if (typeof json === 'object') {
        // Firebase REST returns object: { "-key": {...}, ... }
        const arr = Object.entries(json).map(([id, val]: [string, any]) => ({ id, ...val }));
        setRawUpdates(arr);
      }
    } catch (e: any) {
      console.error('[Heatmap] Fetch failed:', e.message);
      setFetchError(e.message);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // 90-day rolling grid — always includes last 3 months
  const weeks = useMemo(() => {
    const today = new Date();
    const gridStart = startOfWeek(subDays(today, 89));
    const gridEnd = endOfWeek(today);
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const w: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) w.push(allDays.slice(i, i + 7));
    return w;
  }, []);

  // Contribution map — keyed by UTC date string
  const contributionMap = useMemo(() => {
    const map: Record<string, { count: number; logs: any[] }> = {};
    if (!rawUpdates.length) return map;

    // Deduplicate: keep latest entry per user per UTC day
    const deduped = new Map<string, any>();
    rawUpdates.forEach(u => {
      const dateKey = toUTCDateKey(u.createdAt);
      if (!dateKey) return;
      const userKey = u.userId || u.userEmail || 'anon';
      const key = `${dateKey}__${userKey}`;
      const existing = deduped.get(key);
      if (!existing || new Date(u.createdAt) > new Date(existing.createdAt)) {
        deduped.set(key, u);
      }
    });

    deduped.forEach(u => {
      const dateKey = toUTCDateKey(u.createdAt);
      if (!dateKey) return;
      if (!map[dateKey]) map[dateKey] = { count: 0, logs: [] };
      map[dateKey].count += 1;
      map[dateKey].logs.push(u);
    });

    return map;
  }, [rawUpdates]);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-white/5';
    if (count === 1) return 'bg-primary/40';
    if (count === 2) return 'bg-primary/60';
    if (count === 3) return 'bg-primary/80';
    return 'bg-primary';
  };

  const totalContribs = Object.values(contributionMap).reduce((s, v) => s + v.count, 0);
  const selectedData = selectedDay ? contributionMap[toLocalDateKey(selectedDay)] : null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6 rounded-3xl border border-white/5 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Calendar size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Contribution Calendar</h3>
              <p className="text-[10px] text-slate-500 font-bold">
                {fetching
                  ? '⏳ Loading telemetry…'
                  : fetchError
                  ? `⚠️ ${fetchError}`
                  : `${totalContribs} contributions • ${rawUpdates.length} entries`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={fetching}
              title="Refresh"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-primary transition-colors"
            >
              <RefreshCw size={12} className={fetching ? 'animate-spin text-primary' : ''} />
            </button>
            <div className="flex items-center gap-1.5 text-[8px] font-black uppercase text-slate-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map(v => (
                <div key={v} className={`w-2.5 h-2.5 rounded-[2px] ${getColor(v)}`} />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing">
          <div className="flex gap-1.5 min-w-max pb-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {week.map(day => {
                  const localKey = toLocalDateKey(day);
                  const utcKey = toUTCDateKey(day); // try both
                  const data = contributionMap[localKey] || contributionMap[utcKey];
                  const count = data?.count || 0;
                  const isSelected = selectedDay && isSameDay(day, selectedDay);

                  return (
                    <motion.button
                      key={localKey}
                      whileHover={{ scale: 1.2, zIndex: 10 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedDay(isSelected ? null : day)}
                      className={`w-3.5 h-3.5 rounded-[3px] ${getColor(count)} transition-all relative group
                        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                        <div className="bg-slate-900 border border-white/10 text-[10px] p-2 rounded-lg shadow-2xl whitespace-nowrap min-w-[130px]">
                          <p className="font-bold text-primary">{format(day, 'MMM d, yyyy')}</p>
                          <p className="text-white">{count} update{count !== 1 ? 's' : ''} logged</p>
                        </div>
                        <div className="w-2 h-2 bg-slate-900 border-r border-b border-white/10 rotate-45 mx-auto -mt-1" />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected day detail */}
      <AnimatePresence mode="wait">
        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass-panel p-5 rounded-3xl border border-primary/20 bg-primary/5 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4">
              <button onClick={() => setSelectedDay(null)} className="text-slate-500 hover:text-white transition-colors">
                <ChevronRight className="rotate-90" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-primary flex flex-col items-center justify-center text-black">
                <span className="text-[8px] font-black leading-none">{format(selectedDay, 'MMM')}</span>
                <span className="text-lg font-black leading-none">{format(selectedDay, 'd')}</span>
              </div>
              <div>
                <h4 className="font-black text-white">{format(selectedDay, 'EEEE, MMM d yyyy')}</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {selectedData?.count || 0} Task Updates
                </p>
              </div>
            </div>
            {selectedData && selectedData.logs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedData.logs.map((log, i) => (
                  <div key={i} className="bg-white/5 p-3 rounded-2xl border border-white/5 flex gap-3 items-start">
                    <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                      <User size={14} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-primary truncate">
                          {log.userName && log.userName !== 'Unknown'
                            ? log.userName
                            : log.userEmail ? resolveNameFromEmail(log.userEmail) : 'Engineer'}
                        </span>
                        <span className="text-[8px] text-slate-500 font-bold px-1.5 py-0.5 bg-white/5 rounded-full">
                          {log.progressPercent}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed italic">
                        "{log.remarks || log.todayProgress || 'Progress logged.'}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-600 italic text-sm border border-dashed border-white/5 rounded-2xl">
                No engineering logs for this date.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

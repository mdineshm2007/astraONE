import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, addDays, eachDayOfInterval, startOfWeek, endOfWeek, isSameDay, differenceInDays, startOfDay } from 'date-fns';
import { TaskUpdate } from '../types';
import { Calendar, ChevronRight, MessageSquare, User } from 'lucide-react';
import { resolveNameFromEmail } from '../utils/userUtils';

interface TaskHeatmapProps {
  updates: TaskUpdate[];
}

export default function TaskHeatmap({ updates }: TaskHeatmapProps) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Debug: log what we receive
  console.log('[Heatmap] Received updates count:', updates.length, 
    updates.length > 0 ? 'First entry:' : '', 
    updates.length > 0 ? JSON.stringify(updates[0]).slice(0, 200) : ''
  );

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const anchorDate = startOfDay(new Date('2026-04-26'));
    
    let start = anchorDate;
    const diff = differenceInDays(today, anchorDate);
    
    // If more than 45 days passed since April 26, start sliding the window
    // This keeps about 1.5 months of history and 2.5 months of future
    if (diff > 45) {
      start = subDays(today, 45);
    }
    
    // Always align to start of week for a consistent grid layout
    const gridStart = startOfWeek(start);
    // Maintain a ~4 month window (126 days = 18 weeks)
    const gridEnd = endOfWeek(addDays(gridStart, 126));
    
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, []);

  const contributionMap = useMemo(() => {
    const map: Record<string, { count: number; logs: any[] }> = {};

    /** Parse any createdAt value safely */
    const parseDate = (createdAt: any): Date | null => {
      if (!createdAt) return null;
      // Handle numeric timestamp
      if (typeof createdAt === 'number') {
        const d = new Date(createdAt > 1e10 ? createdAt : createdAt * 1000);
        return isNaN(d.getTime()) ? null : d;
      }
      // Handle ISO string or date string
      if (typeof createdAt === 'string') {
        const d = new Date(createdAt);
        return isNaN(d.getTime()) ? null : d;
      }
      // Handle Firestore Timestamp object
      if (typeof createdAt === 'object' && createdAt.seconds) {
        return new Date(createdAt.seconds * 1000);
      }
      return null;
    };

    // 1. Sort all updates by date to calculate deltas
    const sortedAll = [...updates].sort((a, b) => {
      const dA = parseDate(a.createdAt)?.getTime() || 0;
      const dB = parseDate(b.createdAt)?.getTime() || 0;
      return dA - dB;
    });
    const taskLastProgress: Record<string, number> = {};
    const deltas = new Map<string, number>();

    sortedAll.forEach(u => {
      const prev = taskLastProgress[u.taskId] || 0;
      deltas.set(u.id, u.progressPercent - prev);
      taskLastProgress[u.taskId] = u.progressPercent;
    });

    // 2. Deduplicate updates: only one update per member per day
    const deduplicated = new Map<string, TaskUpdate & { delta: number }>();
    updates.forEach(u => {
      const date = parseDate(u.createdAt);
      if (!date) return;

      const dateKey = format(date, 'yyyy-MM-dd');
      const userKey = u.userId || u.userEmail || 'unknown';
      const compositeKey = `${dateKey}_${userKey}`;
      const delta = deltas.get(u.id) || 0;

      // Take the latest update for that day/user
      const existing = deduplicated.get(compositeKey);
      const existingTime = existing ? (parseDate(existing.createdAt)?.getTime() || 0) : 0;
      const currentTime = date.getTime();
      if (!existing || currentTime > existingTime) {
        deduplicated.set(compositeKey, { ...u, delta });
      }
    });

    deduplicated.forEach(u => {
      try {
        const date = parseDate(u.createdAt);
        if (!date) return;

        const dateKey = format(date, 'yyyy-MM-dd');
        if (!map[dateKey]) {
          map[dateKey] = { count: 0, logs: [] };
        }
        map[dateKey].count += 1;
        map[dateKey].logs.push(u);
      } catch (e) {
        console.error("Heatmap date parsing error:", e);
      }
    });
    return map;
  }, [updates]);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-white/5';
    if (count === 1) return 'bg-primary/40';
    if (count === 2) return 'bg-primary/60';
    if (count === 3) return 'bg-primary/80';
    return 'bg-primary'; 
  };

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const selectedData = selectedDay ? contributionMap[format(selectedDay, 'yyyy-MM-dd')] : null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-6 rounded-3xl border border-white/5 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Calendar size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Contribution Calendar</h3>
              <p className="text-[10px] text-slate-500 font-bold">DAILY PROGRESS TELEMETRY</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[8px] font-black uppercase text-slate-500 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(v => (
              <div key={v} className={`w-2.5 h-2.5 rounded-[2px] ${getColor(v)}`} />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing">
          <div className="flex gap-1.5 min-w-max pb-2">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1.5">
                {week.map((day, di) => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const data = contributionMap[dateKey];
                  const count = data?.count || 0;
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  
                  return (
                    <motion.button
                      key={dateKey}
                      whileHover={{ scale: 1.2, zIndex: 10 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setSelectedDay(day)}
                      className={`w-3.5 h-3.5 rounded-[3px] ${getColor(count)} transition-all relative group
                        ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                    >
                      {/* Tooltip on Hover */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                        <div className="bg-slate-900 border border-white/10 text-[10px] p-2 rounded-lg shadow-2xl whitespace-nowrap min-w-[120px]">
                          <p className="font-bold text-primary">{format(day, 'MMM d, yyyy')}</p>
                          <p className="text-white">{count} updates logged</p>
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

      {/* Persistent Detailed Box (Google Calendar Style) */}
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
                <h4 className="font-black text-white">{format(selectedDay, 'EEEE')}</h4>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {selectedData?.count || 0} Task Updates Finalized
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
                            : (log.userEmail ? resolveNameFromEmail(log.userEmail) : 'Unknown')}
                        </span>
                        <span className="text-[8px] text-slate-500 font-bold px-1.5 py-0.5 bg-white/5 rounded-full">
                          {log.progressPercent}% Progress
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed italic">
                        "{log.remarks || (
                          (log as any).delta > 0 
                            ? `Progress increased by +${(log as any).delta}% since previous update.` 
                            : (log as any).delta < 0
                              ? `Progress adjusted by ${(log as any).delta}% since previous update.`
                              : "Maintained current progress levels."
                        )}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-600 italic text-sm border border-dashed border-white/5 rounded-2xl">
                No engineering logs detected for this cycle.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckSquare, Square, Plus, Trash2, ClipboardList,
  Globe, Users, ChevronDown, Loader2, Lock, Wrench, Package
} from 'lucide-react';

interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  teamId: string;
  checked: boolean;
  checkedBy?: string;
  checkedAt?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

const TEAMS = [
  'Steering', 'Suspension', 'Brakes', 'Transmission', 'Design',
  'Electricals', 'Innovation', 'Autonomous', 'Cost', 'PRO',
  'Seat', 'Others', 'Safety_Equipments', 'Dashboard', 'Wheel_Tyre', 'Frame', 'Drive_Train'
];

export default function RulebookChecklist() {
  const { profile } = useAuth();
  const isPrivileged = profile?.role === 'CAPTAIN' || profile?.role === 'TEAM_LEAD';
  const isCaptain = profile?.role === 'CAPTAIN';

  const [viewMode, setViewMode] = useState<'team' | 'overall'>('team');
  const activeCategory = 'general';
  const [selectedTeam, setSelectedTeam] = useState<string>(
    profile?.approvedTeams?.[0] || 'Steering'
  );
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const teamParam = viewMode === 'overall' ? 'all' : selectedTeam;
      const res = await fetch(`/api/rulebook/${activeCategory}?team=${encodeURIComponent(teamParam)}&t=${Date.now()}`);
      if (!res.ok) throw new Error('Failed to fetch checklist');
      const data = await res.json();
      setItems(data);
    } catch (e) {
      console.error('[Rulebook] Fetch error:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, viewMode, selectedTeam]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch(`/api/rulebook/${activeCategory}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          teamId: viewMode === 'overall' ? 'all' : selectedTeam,
          createdBy: profile?.uid,
          createdByName: profile?.displayName || 'Unknown',
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error);
      }
      const result = await res.json();
      // Optimistically add
      setItems(prev => [{
        id: result.id,
        title: newTitle.trim(),
        description: newDesc.trim(),
        category: activeCategory,
        teamId: viewMode === 'overall' ? 'all' : selectedTeam,
        checked: false,
        createdBy: profile?.uid || '',
        createdByName: profile?.displayName || 'Unknown',
        createdAt: new Date().toISOString(),
      }, ...prev]);
      setNewTitle('');
      setNewDesc('');
    } catch (err: any) {
      alert(`Failed to add item: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleCheck = async (item: ChecklistItem) => {
    if (!isPrivileged) return;
    setSavingId(item.id);
    // Optimistic update
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, checked: !i.checked, checkedBy: profile?.displayName, checkedAt: new Date().toISOString() }
      : i
    ));
    try {
      const res = await fetch(`/api/rulebook/${activeCategory}/${item.id}/check`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checked: !item.checked,
          checkedBy: profile?.displayName,
          checkedAt: new Date().toISOString(),
          teamId: item.teamId,
        })
      });
      if (!res.ok) throw new Error('Failed to update');
    } catch {
      // Revert
      setItems(prev => prev.map(i => i.id === item.id ? item : i));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (item: ChecklistItem) => {
    if (!isCaptain) return;
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    setItems(prev => prev.filter(i => i.id !== item.id));
    try {
      await fetch(`/api/rulebook/${activeCategory}/${item.id}?teamId=${encodeURIComponent(item.teamId)}`, {
        method: 'DELETE'
      });
    } catch {
      fetchItems();
    }
  };

  const checkedCount = items.filter(i => i.checked).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  // Group by team when in overall view
  const groupedItems = viewMode === 'overall'
    ? items.reduce((acc, item) => {
        const key = item.teamId || 'General';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {} as Record<string, ChecklistItem[]>)
    : { [selectedTeam]: items };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
            <div className="p-2 bg-primary/10 rounded-xl">
              <ClipboardList className="text-primary" size={28} />
            </div>
            Rulebook Checklist
          </h1>
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">
            Standards & Compliance Tracker
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center min-w-[90px]">
            <p className="text-2xl font-black text-primary">{checkedCount}/{totalCount}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Completed</p>
          </div>
          <div className="glass-panel p-4 rounded-2xl border border-white/5 text-center min-w-[90px]">
            <p className="text-2xl font-black text-emerald-400">{progress}%</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Progress</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full shadow-[0_0_12px_rgba(var(--primary-rgb),0.5)]"
        />
      </div>

      {/* View Toggle */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5">
          <button
            onClick={() => setViewMode('team')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
              viewMode === 'team' ? 'bg-primary text-black shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            <Users size={14} /> TEAM VIEW
          </button>
          <button
            onClick={() => setViewMode('overall')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
              viewMode === 'overall' ? 'bg-primary text-black shadow-lg' : 'text-slate-500 hover:text-white'
            }`}
          >
            <Globe size={14} /> OVERALL
          </button>
        </div>

        {/* Team Selector (team mode only) */}
        {viewMode === 'team' && (
          <div className="relative">
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="appearance-none bg-white/5 border border-white/10 rounded-xl px-5 py-2.5 pr-10 text-[10px] font-black uppercase tracking-widest text-white focus:border-primary outline-none transition-colors cursor-pointer"
            >
              {TEAMS.map(t => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={14} />
          </div>
        )}
      </div>

      {/* Add Item Form (CAPTAIN/TEAM_LEAD only) */}
      {isPrivileged && (
        <motion.form
          onSubmit={handleAddItem}
          className="glass-panel p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary flex items-center gap-2">
            <Plus size={12} /> Add Checklist Item
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Checklist item title..."
              required
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-primary outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={isAdding || !newTitle.trim()}
              className="px-5 py-2.5 bg-primary text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              ADD
            </button>
          </div>
          <input
            type="text"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Optional description / standard reference..."
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-xs text-slate-400 placeholder:text-slate-600 focus:border-primary outline-none transition-colors"
          />
        </motion.form>
      )}

      {/* Checklist Items */}
      <AnimatePresence mode="wait">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 size={24} className="animate-spin mr-3" />
            <span className="text-sm font-bold uppercase tracking-widest">Loading Checklist...</span>
          </div>
        ) : (
          <motion.div
            key={`${activeCategory}-${viewMode}-${selectedTeam}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6 pb-24"
          >
            {Object.entries(groupedItems).map(([teamName, teamItems]) => (
              <div key={teamName} className="glass-panel rounded-[2rem] border border-white/5 overflow-hidden">
                {/* Team Header (only shown in overall view) */}
                {viewMode === 'overall' && (
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                      {teamName.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-black text-slate-500">
                      {teamItems.filter(i => i.checked).length}/{teamItems.length} Done
                    </span>
                  </div>
                )}

                {teamItems.length === 0 ? (
                  <div className="py-12 text-center text-slate-600">
                    <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-xs font-black uppercase tracking-widest">No items yet</p>
                    {isPrivileged && (
                      <p className="text-[10px] text-slate-700 mt-1">Use the form above to add checklist items</p>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {teamItems.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className={`group flex items-start gap-4 p-5 transition-all ${
                          item.checked ? 'bg-emerald-500/5' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Check Button */}
                        <button
                          onClick={() => handleToggleCheck(item)}
                          disabled={!isPrivileged || savingId === item.id}
                          className={`mt-0.5 flex-shrink-0 transition-all ${
                            isPrivileged
                              ? 'hover:scale-110 active:scale-95 cursor-pointer'
                              : 'cursor-not-allowed opacity-50'
                          }`}
                          title={isPrivileged ? (item.checked ? 'Uncheck' : 'Check') : 'Only Team Lead/Captain can check items'}
                        >
                          {savingId === item.id ? (
                            <Loader2 size={22} className="animate-spin text-primary" />
                          ) : item.checked ? (
                            <CheckSquare size={22} className="text-emerald-400" />
                          ) : (
                            <Square size={22} className="text-slate-600 group-hover:text-slate-400" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm transition-all ${
                            item.checked ? 'line-through text-slate-500' : 'text-white'
                          }`}>
                            {item.title}
                          </p>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                              Added by {item.createdByName}
                            </span>
                            {item.checked && item.checkedBy && (
                              <>
                                <span className="text-slate-700">•</span>
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600">
                                  ✓ Verified by {item.checkedBy}
                                </span>
                              </>
                            )}
                            {!isPrivileged && (
                              <span className="flex items-center gap-1 text-[9px] text-slate-700 font-bold">
                                <Lock size={9} /> View only
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Delete (Captain only) */}
                        {isCaptain && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1.5 text-slate-700 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {Object.keys(groupedItems).length === 0 && (
              <div className="py-20 text-center text-slate-600">
                <ClipboardList size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-black uppercase tracking-widest text-sm">No checklist items</p>
                {isPrivileged && <p className="text-xs mt-2 text-slate-700">Use the form above to add the first item</p>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

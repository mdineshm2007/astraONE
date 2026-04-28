import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToQueries, createQuery, resolveQuery, deleteQuery } from '../services/queryService';
import { Query } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Lock, Trash2, CheckCircle2, Plus, Clock, ShieldCheck, Loader } from 'lucide-react';
import AIIntelligencePanel from './AIIntelligencePanel';

export default function Queries() {
  const { profile } = useAuth();
  const [queries, setQueries] = useState<Query[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newQuery, setNewQuery] = useState({
    title: '',
    content: ''
  });

  useEffect(() => {
    if (!profile) return;
    return subscribeToQueries(profile, setQueries);
  }, [profile]);

  const handleCreateQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuery.title || !newQuery.content || !profile) return;
    
    setSaving(true);
    try {
      await createQuery({
        ...newQuery,
        status: 'OPEN',
        authorId: profile.uid,
        authorName: profile.displayName
      });
      setNewQuery({ title: '', content: '' });
      setIsAdding(false);
    } catch (error) {
      console.error('Error creating query:', error);
    } finally {
      setSaving(false);
    }
  };

  const isCaptain = profile?.role === 'CAPTAIN';

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <HelpCircle className="text-primary" />
            Query Panel
          </h1>
          <p className="text-slate-500 text-sm">Raise issues confidentially directly to the Team Captain.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-primary text-black font-bold px-6 py-2 rounded-xl flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            Raise Query
          </button>
        </div>
      </div>

      <AIIntelligencePanel type="PERFORMANCE" data={queries} context="Confidential Queries Analysis" />

      <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl flex items-start gap-3">
        <ShieldCheck className="text-primary mt-0.5" size={18} />
        <div className="space-y-1">
          <p className="text-xs text-primary/80 leading-relaxed font-bold">
            STRICT PRIVACY MODE: All queries are visible ONLY to the Team Captain.
          </p>
          {!isCaptain && (
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              You can only see the queries you have raised. No other members can see your queries.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 pb-20">
        <AnimatePresence mode="popLayout">
          {queries.map((q) => (
            <motion.div
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={q.id}
              className={`glass-panel p-6 rounded-2xl border ${
                q.status === 'RESOLVED' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5'
              } hover:border-white/10 transition-all group`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <Lock size={14} className="text-primary" />
                    <h3 className="text-lg font-bold">{q.title}</h3>
                    <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase tracking-widest ${
                      q.status === 'RESOLVED' ? 'bg-emerald-500 text-black' : 'bg-yellow-500 text-black'
                    }`}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{q.content}</p>
                  
                  <div className="flex items-center gap-4 pt-4 border-t border-white/5 mt-4">
                    {isCaptain && (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold">
                          {q.authorName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Raised by {q.authorName || 'Unknown'}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold uppercase">
                      <Clock size={12} />
                      {q.createdAt ? new Date(q.createdAt).toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </div>

                <div className="flex md:flex-col items-center gap-2">
                  {isCaptain && q.status === 'OPEN' && (
                    <button
                      onClick={() => resolveQuery(q.id)}
                      className="p-2 text-slate-500 hover:text-emerald-400 transition-colors bg-white/5 rounded-xl border border-white/5"
                      title="Mark as Resolved"
                    >
                      <CheckCircle2 size={20} />
                    </button>
                  )}
                  {(isCaptain || profile?.uid === q.authorId) && (
                    <button
                      onClick={async () => { 
                        if(window.confirm('Delete this query?')) {
                          try {
                            await deleteQuery(q.id);
                          } catch (err) {
                            alert("Failed to delete query.");
                          }
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-error transition-colors bg-white/5 rounded-xl border border-white/5"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {queries.length === 0 && (
          <div className="py-20 text-center">
            <HelpCircle size={40} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500 italic uppercase tracking-widest text-sm">No queries found.</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-2xl shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6 text-primary">
                <Lock size={24} />
                <h2 className="text-xl font-black uppercase tracking-tight">Raise Confidential Query</h2>
              </div>

              <form onSubmit={handleCreateQuery} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Query Subject</label>
                  <input
                    required
                    autoFocus
                    value={newQuery.title}
                    onChange={e => setNewQuery({ ...newQuery, title: e.target.value })}
                    placeholder="Brief title of the issue..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500 ml-1">Detailed Description</label>
                  <textarea
                    required
                    rows={6}
                    value={newQuery.content}
                    onChange={e => setNewQuery({ ...newQuery, content: e.target.value })}
                    placeholder="Describe your concern in detail..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 bg-primary hover:bg-primary/90 text-black font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-60 flex justify-center items-center gap-2"
                  >
                    {saving && <Loader className="animate-spin" size={16} />}
                    {saving ? 'Submitting...' : 'Submit Query'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

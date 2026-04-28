import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getNotes, createNote, updateNote, deleteNote } from '../services/noteService';
import { logUserActivity } from '../services/logService';
import { Note } from '../types';
import { Plus, Search, NotebookIcon as Notebook, Trash2, Edit3, ShieldAlert, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_SUBSYSTEMS } from '../constants';

import AIIntelligencePanel from './AIIntelligencePanel';

export default function Notebooks() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newNote, setNewNote] = useState({
    title: '',
    content: '',
    type: 'GENERAL' as Note['type'],
    subsystem: 'General'
  });

  // Load notes initially and when localStorage changes
  useEffect(() => {
    setNotes(getNotes());
    
    const handleStorage = () => setNotes(getNotes());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.title.trim() || !profile) return;
    
    createNote(newNote);
    await logUserActivity(profile.uid, 'CREATE_NOTE', { title: newNote.title, type: newNote.type });
    setNotes(getNotes());
    setNewNote({ title: '', content: '', type: 'GENERAL', subsystem: 'General' });
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this private note?')) {
      deleteNote(id);
      const updated = getNotes();
      setNotes(updated);
      if (profile) {
        await logUserActivity(profile.uid, 'DELETE_NOTE', { id });
      }
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Note>) => {
    updateNote(id, updates);
    if (profile) {
      await logUserActivity(profile.uid, 'UPDATE_NOTE', { id, ...updates });
    }
    setNotes(getNotes());
    setIsEditing(null);
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Notebook className="text-primary" />
            Private Workspace
          </h1>
          <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
            <ShieldAlert size={14} className="text-primary/60" />
            Private notes stored locally on this device. Never synced to cloud.
          </p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-primary text-black font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus size={18} />
          New Note
        </button>
      </div>

      <AIIntelligencePanel type="NOTES" data={notes.slice(0, 10)} />

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Search private notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
        <AnimatePresence mode="popLayout">
          {filteredNotes.map(note => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={note.id}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col group"
            >
              {isEditing === note.id ? (
                <div className="space-y-4 flex-1 flex flex-col">
                  <input
                    autoFocus
                    defaultValue={note.title}
                    className="w-full bg-transparent text-lg font-bold border-b border-white/10 outline-none pb-2 focus:border-primary"
                    onBlur={(e) => handleUpdate(note.id, { title: e.target.value })}
                  />
                  <textarea
                    defaultValue={note.content}
                    className="w-full flex-1 min-h-[150px] bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:ring-1 focus:ring-primary text-sm resize-none"
                    onBlur={(e) => handleUpdate(note.id, { content: e.target.value })}
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setIsEditing(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400">
                      <X size={16} />
                    </button>
                    <button onClick={() => setIsEditing(null)} className="px-4 py-2 bg-primary/20 text-primary font-bold rounded-lg text-sm flex items-center gap-2">
                      <Save size={14} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-[10px] font-black uppercase rounded-full border border-white/10">
                        {note.subsystem}
                      </span>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-black uppercase rounded-full border border-primary/20">
                        {note.type}
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setIsEditing(note.id)} className="p-1.5 text-slate-500 hover:text-primary transition-colors bg-white/5 rounded-lg">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => handleDelete(note.id)} className="p-1.5 text-slate-500 hover:text-error transition-colors bg-white/5 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-lg text-white mb-2">{note.title}</h3>
                  <p className="text-slate-400 text-sm whitespace-pre-wrap flex-1 leading-relaxed">
                    {note.content}
                  </p>
                  
                  <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredNotes.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <Notebook size={40} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500 italic uppercase tracking-widest text-sm">No notes found.</p>
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
              <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                <Plus className="text-primary" />
                Create Private Note
              </h2>
              
              <form onSubmit={handleCreateNote} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Title</label>
                  <input
                    required
                    autoFocus
                    value={newNote.title}
                    onChange={e => setNewNote({ ...newNote, title: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Note Type</label>
                    <select
                      value={newNote.type}
                      onChange={e => setNewNote({ ...newNote, type: e.target.value as any })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    >
                      <option value="GENERAL">General</option>
                      <option value="RESEARCH">Research</option>
                      <option value="EXPERIMENT">Experiment</option>
                      <option value="FAILURE">Failure Analysis</option>
                      <option value="SKETCH">Sketch/Idea</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Subsystem Tag</label>
                    <select
                      value={newNote.subsystem}
                      onChange={e => setNewNote({ ...newNote, subsystem: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    >
                      <option value="General">General / All</option>
                      {DEFAULT_SUBSYSTEMS.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Content</label>
                  <textarea
                    required
                    rows={8}
                    value={newNote.content}
                    onChange={e => setNewNote({ ...newNote, content: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-3 bg-white/5 font-bold rounded-xl">Cancel</button>
                  <button type="submit" className="flex-1 py-3 bg-primary text-black font-bold rounded-xl shadow-lg shadow-primary/20">Save Note</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

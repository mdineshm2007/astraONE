import { Note } from '../types';

const STORAGE_KEY = 'astra_private_notes_v2';

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (err) {
    console.error('Failed to save notes:', err);
  }
}

export function getNotes(): Note[] {
  return loadNotes();
}

export function createNote(data: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Note {
  const now = new Date().toISOString();
  const note: Note = {
    ...data,
    id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    createdAt: now,
    updatedAt: now,
  };
  const notes = loadNotes();
  saveNotes([note, ...notes]);
  return note;
}

export function updateNote(id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>): void {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === id);
  if (idx !== -1) {
    notes[idx] = { ...notes[idx], ...updates, updatedAt: new Date().toISOString() };
    saveNotes(notes);
  }
}

export function deleteNote(id: string): void {
  const notes = loadNotes();
  saveNotes(notes.filter(n => n.id !== id));
}

import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, Bell, Menu, Rocket, Notebook as NotebookIcon, ShieldAlert, Database, LogOut, Globe, HelpCircle, BarChart3, MessageSquare, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AIAssistant from './AIAssistant';
import { subscribeToMultipleTeamsPendingMembers, updateUserProfile } from '../services/userService';
import { uploadImage } from '../services/storageService';
import { AppView } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export default function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { profile, logout } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editYear, setEditYear] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName || '');
      setEditPhoto(profile.photoURL || '');
      setEditYear(profile.year || '');
    }
  }, [profile, isProfileModalOpen]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isUploading) return;
    try {
      await updateUserProfile(profile.uid, {
        displayName: editName,
        photoURL: editPhoto,
        year: editYear
      });
      setProfileModalOpen(false);
    } catch (error) {
      console.error('Failed to update profile', error);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const url = await uploadImage(file, `profiles/${profile?.uid || 'unknown'}`);
      setEditPhoto(url);
    } catch (error) {
      console.error('Failed to upload photo', error);
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    const isAdmin = profile.role === 'CAPTAIN' || profile.role === 'TEAM_LEAD';
    if (!isAdmin) return;

    const teamIds = profile.role === 'TEAM_LEAD' ? (profile.approvedTeams || []) : ['all'];
    return subscribeToMultipleTeamsPendingMembers(teamIds, (members) => {
      setPendingCount(members.length);
    });
  }, [profile]);

  if (!profile) return null;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'teams', label: 'Engineering Hub', icon: Users, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'posts', label: 'Engineering Feed', icon: Globe, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'queries', label: 'Query Panel', icon: HelpCircle, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'notebooks', label: 'Personal Notes', icon: NotebookIcon, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'workspace', label: 'Cloud Infrastructure', icon: Database, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'admin', label: 'Admin Control', icon: ShieldAlert, roles: ['CAPTAIN', 'TEAM_LEAD'], badge: pendingCount },
  ];

  const allowedItems = menuItems.filter(item => item.roles.includes(profile.role));

  return (
    <div className="flex h-screen bg-background text-white overflow-hidden font-sans">
      {/* Sidebar Toggle Button (floating) */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className="absolute left-0 top-20 w-10 h-10 bg-primary text-black rounded-r-xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform z-[60]"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? '280px' : '0px' }}
        className={`bg-surface flex flex-col z-50 relative overflow-hidden transition-all ${isSidebarOpen ? 'border-r border-white/5' : ''}`}
      >
        <div className="w-[280px] flex flex-col h-full">
          <div className="p-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
              <Rocket className="text-black" size={24} />
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col">
              <span className="text-xl font-black tracking-tighter leading-none">ASTRA</span>
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">Solar Car IQ</span>
            </motion.div>
          </div>

          <nav className="flex-1 px-4 space-y-1 mt-4">
            {allowedItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id as AppView)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group relative ${
                  currentView === item.id 
                    ? 'bg-primary text-black font-bold shadow-lg shadow-primary/10' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon size={20} className={currentView === item.id ? 'text-black' : 'group-hover:text-primary transition-colors'} />
                <span>{item.label}</span>
                {(item.badge ?? 0) > 0 && (
                  <span className="absolute right-4 min-w-[18px] h-[18px] flex items-center justify-center bg-error text-white text-[10px] font-black rounded-full px-1 border-2 border-surface">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-white/5">
            <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setProfileModalOpen(true)}>
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-black flex-shrink-0 overflow-hidden">
                {profile.photoURL ? (
                  <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
                ) : (
                  profile.displayName?.charAt(0)?.toUpperCase() || '?'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{profile.displayName || 'User'}</p>
                <p className="text-[10px] font-black text-primary uppercase">
                  {profile.role} {profile.year ? `• ${profile.year}` : ''}
                </p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); logout(); }} 
                className="p-2 text-slate-500 hover:text-error transition-colors z-10"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>

        {isSidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(false)}
            className="absolute -right-3 top-20 w-6 h-6 bg-primary text-black rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <Menu size={14} />
          </button>
        )}
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between bg-background/50 backdrop-blur-xl z-40 sticky top-0">
          <div className="flex items-center gap-4">
             <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
             </span>
          </div>
          <div className="flex items-center gap-4">
             <button className="relative p-2 text-slate-400 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/5">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background animate-pulse" />
             </button>
             <div className="h-8 w-[1px] bg-white/5" />
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${profile.isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {profile.isOnline ? 'Active Now' : 'Offline'}
                </span>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
           {children}
        </div>

        <AIAssistant onViewChange={onViewChange} />

        {/* Profile Edit Modal */}
        <AnimatePresence>
          {isProfileModalOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => setProfileModalOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface border border-white/10 p-6 rounded-2xl w-full max-w-md shadow-2xl relative"
              >
                <button 
                  onClick={() => setProfileModalOpen(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                    <Rocket size={16} />
                  </div>
                  Edit Profile
                </h2>

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Display Name</label>
                    <input 
                      type="text" 
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                      placeholder="e.g. John Doe"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Profile Photo</label>
                    <div className="flex items-center gap-4">
                      {editPhoto ? (
                        <div className="w-16 h-16 rounded-xl bg-black/20 border border-white/10 overflow-hidden flex-shrink-0 shadow-inner">
                          <img src={editPhoto} alt="Profile" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-primary/20 border border-white/10 flex items-center justify-center text-primary font-black text-xl flex-shrink-0">
                          {editName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div className="flex-1">
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          disabled={isUploading}
                          className="w-full text-sm text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-all cursor-pointer focus:outline-none"
                        />
                        {isUploading && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-primary font-bold">
                            <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin"></span>
                            Uploading photo...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mechatronics Year</label>
                    <select
                      value={editYear}
                      onChange={(e) => setEditYear(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none"
                    >
                      <option value="">Select Year</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                      <option value="Alumni">Alumni</option>
                    </select>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setProfileModalOpen(false)}
                      className="flex-1 px-4 py-3 rounded-xl font-bold border border-white/10 text-white hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isUploading}
                      className={`flex-1 px-4 py-3 rounded-xl font-bold bg-primary text-black transition-colors shadow-[0_0_20px_rgba(255,204,0,0.3)] ${
                        isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/90'
                      }`}
                    >
                      {isUploading ? 'Uploading...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

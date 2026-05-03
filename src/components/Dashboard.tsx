import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToSubsystems } from '../services/subsystemService';
import { subscribeToTasks } from '../services/taskService';
import { Subsystem, Task, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clock, AlertTriangle, TrendingUp, CheckCircle2,
  Zap, Activity, Shield, Target, Star, BarChart3, Cloud
} from 'lucide-react';

import AIIntelligencePanel from './AIIntelligencePanel';
import TaskHeatmap from './TaskHeatmap';
import { subscribeToTaskUpdates, createTask } from '../services/taskService';
import { TaskUpdate } from '../types';
import { rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';

export default function Dashboard() {
  const { profile } = useAuth();
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allUpdates, setAllUpdates] = useState<TaskUpdate[]>([]);
  const [finances, setFinances] = useState<any>(null);

  useEffect(() => subscribeToSubsystems(setSubsystems), []);
  useEffect(() => subscribeToTasks(null, setAllTasks), []);
  
  const [driveFolders, setDriveFolders] = useState<any>(null);
  useEffect(() => {
    const foldersRef = ref(rtdb, 'drive_folders');
    const financesRef = ref(rtdb, 'finances');
    
    const unsubFolders = onValue(foldersRef, (snapshot) => {
      setDriveFolders(snapshot.val());
    });
    
    const unsubFinances = onValue(financesRef, (snapshot) => {
      setFinances(snapshot.val());
    });
    
    return () => {
      unsubFolders();
      unsubFinances();
    };
  }, []);
  
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileData, setProfileData] = useState({
    displayName: profile?.displayName || '',
    department: profile?.department || 'Mechatronics Engineering',
    year: profile?.year || '1st Year',
    photoURL: profile?.photoURL || ''
  });

  useEffect(() => {
    if (profile && (!profile.department || !profile.year || profile.displayName === 'Engineer')) {
      setShowProfileSetup(true);
    }
  }, [profile]);

  const handleProfileUpdate = async () => {
    if (!profile) return;
    const { updateUserProfile } = await import('../services/userService');
    await updateUserProfile(profile.uid, profileData);
    setShowProfileSetup(false);
  };
  
  // Fetch all updates for heatmap via backend (bypasses Firebase security rules)
  useEffect(() => {
    let cancelled = false;
    const fetchUpdates = async () => {
      try {
        const res = await fetch('/api/admin/telemetry/updates');
        if (!res.ok) throw new Error('Backend fetch failed');
        const updates = await res.json();
        if (!cancelled) setAllUpdates(updates);
      } catch (err) {
        console.error('[Heatmap] Failed to fetch updates via backend, trying client fallback:', err);
        // Fallback to client-side subscription
        const unsub = subscribeToTaskUpdates('', (updates) => {
          if (!cancelled) setAllUpdates(updates);
        });
        return unsub;
      }
    };
    fetchUpdates();
    return () => { cancelled = true; };
  }, []);
  if (!profile) return null;

  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
  const pendingTasks = allTasks.filter(t => t.status === 'PENDING').length;
  const inProgressTasks = allTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const blockedTasks = allTasks.filter(t => t.status === 'BLOCKED').length;
  
  // Rename Readiness to Progress Efficiency and use average progress
  const averageProgress = totalTasks > 0 
    ? Math.round(allTasks.reduce((acc, t) => acc + (t.progressPercent || 0), 0) / totalTasks)
    : 0;
  const readinessPct = averageProgress; 

  // For heatmap: use ALL updates (including ones for deleted tasks)
  // The heatmap is a permanent activity log — should never drop historical data
  const validUpdates = allUpdates;

  // Filter subsystems based on role
  const visibleSubsystems = profile.role === 'CAPTAIN'
    ? subsystems
    : subsystems.filter(s => (profile.approvedTeams || []).includes(s.id));

  const teamTasks = profile.role === 'CAPTAIN'
    ? allTasks
    : allTasks.filter(t => (profile.approvedTeams || []).includes(t.subsystem));

  // Match by uid first (most reliable), then by name as fallback
  const myTasks = allTasks.filter(t =>
    t.assignedToId === profile.uid ||
    (t.assignedTo && t.assignedTo === profile.displayName)
  );


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Header */}
      <div className="relative overflow-hidden glass-panel rounded-3xl p-8 border border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-purple-500/5 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center">
                <span className="text-primary font-black text-xl">
                  {profile.displayName?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  ASTRA <span className="text-primary">Intelligence</span>
                </h1>
                <p className="text-slate-400 text-sm">
                  Welcome, <span className="text-white font-bold">
                    {profile.displayName?.split(' ')?.[0] || 'Engineer'}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="glass-panel px-4 py-3 rounded-2xl border border-primary/20 text-center">
              <p className="text-[10px] font-black text-primary uppercase tracking-widest">Role</p>
              <p className="text-sm font-black text-white mt-0.5">{profile.role}</p>
            </div>
          </div>
        </div>
      </div>


      <AIIntelligencePanel 
        type="DASHBOARD" 
        data={{ readinessPct, subsystems: visibleSubsystems.length, tasks: teamTasks, updates: validUpdates }} 
        context={profile.role} 
      />

      {/* Contribution Heatmap */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Clock size={20} className="text-primary" />
          Mission Activity
        </h2>
        <TaskHeatmap updates={validUpdates} />
      </section>

      {/* Task Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Progress Efficiency', value: `${readinessPct}%`, icon: Zap, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
          { label: 'Completed', value: completedTasks, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20' },
          { label: 'In Progress', value: inProgressTasks, icon: Activity, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
          { label: 'Blocked', value: blockedTasks, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20' },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            whileHover={{ y: -2 }}
            className={`glass-panel p-5 rounded-2xl border ${stat.border} group cursor-default`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</span>
              <div className={`p-2 rounded-xl ${stat.bg}`}>
                <stat.icon size={16} className={stat.color} />
              </div>
            </div>
            <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Subsystem Progress */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp size={20} className="text-primary" />
            {profile.role === 'CAPTAIN' ? 'All Teams Progress' : 'Your Team Progress'}
          </h2>
          {visibleSubsystems.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 border border-white/5 text-center text-slate-500 italic text-sm">
              {profile.role === 'MEMBER' ? 'No approved teams yet.' : 'No subsystems found.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto scrollbar-hide pr-1">
              {visibleSubsystems.map((sub) => {
                const subTasks = allTasks.filter(t => t.subsystem === sub.id);
                const total = subTasks.length;
                const totalProgress = subTasks.reduce((acc, t) => acc + (t.progressPercent || 0), 0);
                const pct = total > 0 ? Math.round(totalProgress / total) : (sub.progress || 0);
                const done = subTasks.filter(t => t.status === 'COMPLETED').length;
                return (
                  <div key={sub.id} className="glass-panel p-4 rounded-2xl border border-white/5 hover:border-primary/20 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-sm text-white">{sub.name}</h3>
                        <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">
                          {done}/{total} tasks done
                        </p>
                      </div>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase ${
                        sub.status === 'Active' ? 'bg-primary/20 text-primary' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {sub.status || 'Active'}
                      </span>
                      {driveFolders?.[`progress/${sub.name}`] && (
                        <a 
                          href={driveFolders[`progress/${sub.name}`].webViewLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-500 hover:text-primary transition-colors bg-white/5 rounded-lg ml-2"
                        >
                          <Cloud size={12} />
                        </a>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black text-slate-400">
                        <span>Progress Percentage</span>
                        <span className="text-primary">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>


      {/* My Tasks (for members/leads) */}
      {profile.role !== 'CAPTAIN' && myTasks.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Target size={20} className="text-primary" />
            My Assigned Tasks
            <span className="ml-auto text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {myTasks.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {myTasks.slice(0, 6).map((task) => (
              <div key={task.id} className={`glass-panel p-4 rounded-2xl border transition-all ${
                task.status === 'COMPLETED' ? 'border-emerald-500/20 bg-emerald-500/5' :
                task.status === 'BLOCKED' ? 'border-red-500/20 bg-red-500/5' :
                task.status === 'IN_PROGRESS' ? 'border-primary/20 bg-primary/5' :
                'border-white/5'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${
                    task.priority === 'CRITICAL' ? 'bg-red-500 text-white' :
                    task.priority === 'HIGH' ? 'bg-orange-500 text-white' :
                    task.priority === 'MEDIUM' ? 'bg-yellow-500 text-black' :
                    'bg-slate-700 text-white'
                  }`}>
                    {task.priority}
                  </span>
                  <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ml-auto ${
                    task.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                    task.status === 'BLOCKED' ? 'bg-red-500/20 text-red-400' :
                    task.status === 'IN_PROGRESS' ? 'bg-primary/20 text-primary' :
                    'bg-white/5 text-slate-400'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {driveFolders?.[`progress/${task.subsystem}`] && (
                    <a 
                      href={driveFolders[`progress/${task.subsystem}`].webViewLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-500 hover:text-primary transition-colors bg-white/5 rounded-lg ml-2"
                    >
                      <Cloud size={10} />
                    </a>
                  )}
                </div>
                <h3 className="font-bold text-sm text-white mb-1 truncate">{task.title}</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                  {task.subsystem} • Due {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A'}
                </p>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Progress</span>
                    <span className="text-primary font-bold">{task.progressPercent || 0}%</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${task.progressPercent || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}


      <AnimatePresence>
        {showProfileSetup && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 border border-primary/20 p-8 rounded-[2.5rem] w-full max-w-lg shadow-[0_0_50px_rgba(125,211,252,0.1)]">
              <h2 className="text-2xl font-black text-white mb-2">COMPLETE YOUR IDENTITY</h2>
              <p className="text-slate-400 text-sm mb-8 uppercase font-bold tracking-widest italic">Astra Team Member Verification</p>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Full Name</label>
                  <input type="text" value={profileData.displayName} onChange={e => setProfileData({...profileData, displayName: e.target.value})}
                    placeholder="Your Real Name" className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500">Department</label>
                    <select value={profileData.department} onChange={e => setProfileData({...profileData, department: e.target.value})}
                      className="w-full px-5 py-4 bg-[#0f1524] border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm font-bold appearance-none">
                      <option value="Mechatronics Engineering">Mechatronics Engineering</option>
                      <option value="Electrical Engineering">Electrical Engineering</option>
                      <option value="Software Engineering">Software Engineering</option>
                      <option value="Mechanical Engineering">Mechanical Engineering</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500">Academic Year</label>
                    <select value={profileData.year} onChange={e => setProfileData({...profileData, year: e.target.value})}
                      className="w-full px-5 py-4 bg-[#0f1524] border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm font-bold appearance-none">
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500">Profile Photo URL</label>
                  <input type="text" value={profileData.photoURL} onChange={e => setProfileData({...profileData, photoURL: e.target.value})}
                    placeholder="https://image-url.com" className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary" />
                </div>

                <button onClick={handleProfileUpdate}
                  className="w-full py-5 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all">
                  Finalize Mission Identity
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

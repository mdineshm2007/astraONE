import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Users, Bell, Menu, Rocket, Notebook as NotebookIcon, ShieldAlert, Database, LogOut, Globe, HelpCircle, BarChart3, MessageSquare, X, ClipboardList, Megaphone, Radio, Send, Loader2, AlertTriangle, Bot, ClipboardCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeToMultipleTeamsPendingMembers, updateUserProfile, subscribeToUsers } from '../services/userService';
import { uploadImage } from '../services/storageService';
import { AppView, UserProfile } from '../types';
import { subscribeToNotifications, markNotificationRead, type Notification } from '../services/archiveService';
import { rtdb } from '../firebase';


interface LayoutProps {
  children: React.ReactNode;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

export default function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { profile, logout } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setNotifOpen] = useState(false);

  const [isProfileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [editYear, setEditYear] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Broadcast Modal State
  const [isBroadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastTargetType, setBroadcastTargetType] = useState<'all' | 'team' | 'user'>('all');
  const [broadcastTargetId, setBroadcastTargetId] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);

  // Subsystem options
  const broadcastSubsystems = [
    { id: 'steering', name: 'Steering' },
    { id: 'suspension', name: 'Suspension' },
    { id: 'brakes', name: 'Brakes' },
    { id: 'transmission', name: 'Transmission' },
    { id: 'design', name: 'Design' },
    { id: 'electrical', name: 'Electricals' },
    { id: 'innovation', name: 'Innovation' },
    { id: 'autonomous', name: 'Autonomous' },
    { id: 'cost', name: 'Cost' },
    { id: 'pro', name: 'PRO' },
  ];

  useEffect(() => {
    if (!profile) return;
    const isCaptain = profile.role === 'CAPTAIN';
    const isLead = profile.role === 'TEAM_LEAD';
    if (!isCaptain && !isLead) return;

    return subscribeToUsers((users) => {
      if (isCaptain) {
        setAllUsersList(users);
      } else {
        const approvedTeams = profile.approvedTeams || [];
        setAllUsersList(users.filter(u => u.approvedTeams?.some(t => approvedTeams.includes(t))));
      }
    });
  }, [profile]);

  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      alert("Title and Message are required.");
      return;
    }
    if (broadcastTargetType !== 'all' && !broadcastTargetId) {
      alert("Please select a target.");
      return;
    }

    setIsBroadcasting(true);
    try {
      const notifId = `custom_${Date.now()}`;
      const notification = {
        title: broadcastTitle,
        message: broadcastMessage,
        type: 'ANNOUNCEMENT',
        timestamp: new Date().toISOString(),
        read: false,
        link: 'teams'
      };

      let targets: UserProfile[] = [];
      if (broadcastTargetType === 'all') {
        targets = allUsersList;
      } else if (broadcastTargetType === 'user') {
        const matched = allUsersList.find(u => u.uid === broadcastTargetId);
        if (matched) targets = [matched];
      } else if (broadcastTargetType === 'team') {
        const teamId = broadcastTargetId.toLowerCase().trim();
        targets = allUsersList.filter(u => {
          const approved = u.approvedTeams || [];
          const tms = u.teams || [];
          return approved.includes(teamId) || tms.some((t: any) => t.teamId === teamId && t.status === 'APPROVED');
        });
      }

      if (targets.length === 0) {
        throw new Error("No target users found.");
      }

      const firebaseDatabase = (await import('firebase/database'));
      const writes = targets.map(u => 
        firebaseDatabase.set(firebaseDatabase.ref(rtdb, `notifications/${u.uid}/${notifId}`), notification)
      );
      await Promise.all(writes);

      fetch('/api/notifications/send-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: broadcastTargetType,
          targetId: broadcastTargetId,
          title: broadcastTitle,
          message: broadcastMessage
        })
      }).catch(e => console.warn('[FCM] Push trigger failed:', e.message));

      alert(`✅ Broadcast sent to ${targets.length} users successfully!`);
      setBroadcastTitle('');
      setBroadcastMessage('');
      setBroadcastOpen(false);
    } catch (err: any) {
      alert(`❌ Failed to send broadcast: ${err.message}`);
    } finally {
      setIsBroadcasting(false);
    }
  };

  // ── Auto Task Reminder at 8:30 PM ──────────────────────────────────────────
  // Every minute, check if it's 8:30 PM. If so, look at the current user's tasks.
  // For any task that is still pending/in-progress with no progress logged today,
  // write a Firebase notification so they receive an in-app + push alert.
  useEffect(() => {
    if (!profile) return;
    const REMINDED_TODAY_KEY = `astra_reminded_${profile.uid}_${new Date().toDateString()}`;

    const checkAndSendReminder = async () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      if (h !== 20 || m !== 30) return; // only fire at 8:30 PM

      // Only send once per day
      if (localStorage.getItem(REMINDED_TODAY_KEY)) return;
      localStorage.setItem(REMINDED_TODAY_KEY, '1');

      try {
        const { ref: dbRef, get: dbGet, set: dbSet } = await import('firebase/database');
        const tasksSnap = await dbGet(dbRef(rtdb, 'tasks'));
        if (!tasksSnap.exists()) return;

        const today = now.toDateString();
        const allTasks = Object.entries(tasksSnap.val() as Record<string, any>);
        const myPendingTasks = allTasks.filter(([, t]) => {
          if (t.assignedToId !== profile.uid) return false;
          if (t.status === 'COMPLETED') return false;
          // Check if there's a progress note logged today
          const updatedAt = t.updatedAt ? new Date(t.updatedAt).toDateString() : '';
          const hasTodayUpdate = updatedAt === today && t.todayProgress && t.todayProgress.trim().length > 0;
          return !hasTodayUpdate;
        });

        if (myPendingTasks.length === 0) return;

        const notifId = `auto_reminder_${now.getTime()}`;
        const notification = {
          title: '⏰ Daily Progress Reminder',
          message: `You have ${myPendingTasks.length} task${myPendingTasks.length > 1 ? 's' : ''} with no progress update today. Tap to update now.`,
          type: 'INFO',
          timestamp: now.toISOString(),
          read: false,
          link: 'teams'
        };
        await dbSet(dbRef(rtdb, `notifications/${profile.uid}/${notifId}`), notification);
        console.log('[AutoReminder] Sent 8:30 PM task reminder.');
      } catch (e) {
        console.warn('[AutoReminder] Could not send reminder:', e);
      }
    };

    const interval = setInterval(checkAndSendReminder, 60_000); // check every minute
    return () => clearInterval(interval);
  }, [profile]);


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
        year: editYear,
        onboarded: true
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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isInitialMount = useRef(true);
  const prevNotifications = useRef<Notification[]>([]);
  const notifiedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;

    // Register service worker for push and background notification support on mobile Android Chrome
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[ServiceWorker] Registered successfully:', reg.scope))
        .catch(err => console.warn('[ServiceWorker] Registration failed:', err));
    }

    // Request native permission for browser notifications (works on mobile and desktop)
    // NOTE: We do NOT auto-request here anymore - Chrome blocks silent requestPermission calls.
    // Instead we show a banner button for the user to click.

    return subscribeToNotifications(profile.uid, (newNotifs) => {
      // On initial mount, register all existing unread notification IDs to avoid spamming them
      if (isInitialMount.current) {
        newNotifs.forEach(n => {
          if (!n.read) {
            notifiedIds.current.add(n.id);
          }
        });
        isInitialMount.current = false;
      } else {
        // Trigger Chrome notification for any new unread notification we haven't seen in this session
        newNotifs.forEach(notif => {
          if (!notif.read && !notifiedIds.current.has(notif.id)) {
            notifiedIds.current.add(notif.id);

            if ('Notification' in window && Notification.permission === 'granted') {
              const title = notif.title;
              const options = {
                body: notif.message,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                vibrate: [100, 50, 100],
                tag: notif.id,
                renotify: true
              };

              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification(title, options);
                }).catch(() => {
                  new Notification(title, options);
                });
              } else {
                new Notification(title, options);
              }
            }
          }
        });
      }

      prevNotifications.current = newNotifs;
      setNotifications(newNotifs);
    });
  }, [profile]);

  const unreadNotifications = notifications.filter(n => !n.read);
  const unreadCount = unreadNotifications.length;

  if (!profile) return null;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'teams', label: 'Engineering Hub', icon: Users, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'posts', label: 'Engineering Feed', icon: Globe, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'queries', label: 'Query Panel', icon: HelpCircle, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'copilot', label: 'AI Copilot', icon: Bot, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'workspace', label: 'Cloud Infrastructure', icon: Database, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
    { id: 'rulebook', label: 'Rulebook Checklist', icon: ClipboardList, roles: ['CAPTAIN', 'TEAM_LEAD', 'MEMBER'] },
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
                onClick={() => {
                  onViewChange(item.id as AppView);
                  setSidebarOpen(false);
                }}
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
          <div className="flex items-center gap-4 relative">
             {(!window.isSecureContext || !('Notification' in window)) ? (
               <div 
                 onClick={() => alert("🚨 HTTP Connection Detected!\n\nChrome restricts notifications and service workers to secure connections (HTTPS) or localhost.\n\nTo test notifications on your Android phone:\n1. Open Chrome on your phone and go to: chrome://flags/#unsafely-treat-insecure-origin-as-secure\n2. Enable the flag and add your computer's IP address (e.g., http://192.168.x.x:3050)\n3. Relaunch Chrome and you will be able to enable alerts!")}
                 className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-black rounded-xl border border-red-500/20 transition-all flex items-center gap-1.5 cursor-help"
                 title="Chrome blocks notifications on HTTP. Click for override guide."
               >
                 <AlertTriangle size={12} className="animate-pulse" />
                 HTTP Connection: No Push
               </div>
             ) : (
               'Notification' in window && Notification.permission !== 'granted' && (
                 <button
                   id="enable-chrome-alerts-btn"
                   onClick={async () => {
                     if (Notification.permission === 'denied') {
                       alert('🔕 Notifications are BLOCKED in your browser.\n\nTo fix this:\n1. Click the 🔒 lock icon in your address bar\n2. Set "Notifications" to "Allow"\n3. Refresh the page');
                       return;
                     }
                     const perm = await Notification.requestPermission();
                     if (perm === 'granted') {
                       // Show a test notification immediately to confirm it works
                       if ('serviceWorker' in navigator) {
                         navigator.serviceWorker.ready.then(reg => {
                           reg.showNotification('🔔 ASTRA Alerts Active!', {
                             body: 'You will now receive team notifications from ASTRA.',
                             icon: '/favicon.ico',
                             badge: '/favicon.ico',
                             vibrate: [200, 100, 200]
                           } as any);
                         });
                       } else {
                         new Notification('🔔 ASTRA Alerts Active!', {
                           body: 'You will now receive team notifications from ASTRA.',
                           icon: '/favicon.ico'
                         });
                       }
                     } else {
                       alert('Notification permission denied. Enable them in browser settings to receive team alerts.');
                     }
                   }}
                   className="px-3 py-1.5 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-[10px] font-black rounded-xl border border-yellow-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                   style={{ animation: 'pulse 2s infinite' }}
                   title={Notification.permission === 'denied' ? 'Notifications blocked - click for help' : 'Click to enable Chrome push notifications'}
                 >
                   <Bell size={12} />
                   {Notification.permission === 'denied' ? '🚫 Notifications Blocked' : '🔔 Enable Chrome Alerts'}
                 </button>
               )
             )}

             {profile && (profile.role === 'CAPTAIN' || profile.role === 'TEAM_LEAD') && (
               <button
                 onClick={() => setBroadcastOpen(true)}
                 className="px-3 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 text-[10px] font-black rounded-xl border border-orange-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
                 title="Send Broadcast / Custom Notification"
               >
                 <Megaphone size={12} />
                 📢 Broadcast
               </button>
             )}


             <button 
                onClick={() => setNotifOpen(!isNotifOpen)}
                className={`relative p-2 transition-colors rounded-xl border ${
                  isNotifOpen 
                    ? 'text-primary bg-primary/10 border-primary/20' 
                    : 'text-slate-400 hover:text-white bg-white/5 border-white/5'
                }`}
             >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-error text-white text-[9px] font-black rounded-full px-1 border border-background">
                    {unreadCount}
                  </span>
                )}
             </button>

             {/* Notification Dropdown */}
             <AnimatePresence>
               {isNotifOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                   <motion.div 
                     initial={{ opacity: 0, y: 10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     exit={{ opacity: 0, y: 10, scale: 0.95 }}
                     className="absolute right-0 top-12 w-80 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                   >
                     <div className="p-4 border-b border-white/5 flex items-center justify-between">
                       <span className="text-xs font-black uppercase tracking-wider text-slate-400">Notifications</span>
                       {unreadCount > 0 && (
                         <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                           {unreadCount} unread
                         </span>
                       )}
                     </div>
                     <div className="max-h-72 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                       {notifications.length === 0 ? (
                         <div className="p-8 text-center text-xs text-slate-500 italic">
                           No notifications yet
                         </div>
                       ) : (
                         notifications.map((notif) => (
                           <div 
                             key={notif.id}
                             onClick={async () => {
                               if (!notif.read) {
                                 await markNotificationRead(profile.uid, notif.id);
                               }
                               if (notif.link) {
                                 onViewChange(notif.link as AppView);
                               }
                               setNotifOpen(false);
                             }}
                             className={`p-4 hover:bg-white/5 transition-colors cursor-pointer flex gap-3 text-left ${
                               !notif.read ? 'bg-primary/5' : ''
                             }`}
                           >
                             <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" style={{ opacity: notif.read ? 0 : 1 }} />
                             <div className="space-y-1">
                               <p className={`text-xs font-bold ${!notif.read ? 'text-white' : 'text-slate-300'}`}>{notif.title}</p>
                               <p className="text-[11px] text-slate-400 leading-normal">{notif.message}</p>
                               <p className="text-[9px] text-slate-500 font-medium">
                                 {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.timestamp).toLocaleDateString()}
                               </p>
                             </div>
                           </div>
                         ))
                       )}
                     </div>
                   </motion.div>
                 </>
               )}
             </AnimatePresence>

             <div className="h-8 w-[1px] bg-white/5" />
             <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-500'}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {isOnline ? 'Active Now' : 'Offline'}
                </span>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
           {children}
        </div>


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

        {/* Broadcast Modal */}
        <AnimatePresence>
          {isBroadcastOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => setBroadcastOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-surface border border-white/10 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative border-t-4 border-t-orange-500"
              >
                <button 
                  onClick={() => setBroadcastOpen(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors animate-pulse"
                >
                  <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Megaphone size={16} />
                  </div>
                  Captain & Lead Broadcast
                </h2>
                <p className="text-xs text-slate-400 mb-6">Send real-time alerts to the team directly to their browser/phone notifications.</p>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Audience</label>
                      <select
                        value={broadcastTargetType}
                        onChange={(e) => {
                          setBroadcastTargetType(e.target.value as any);
                          setBroadcastTargetId('');
                        }}
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      >
                        <option value="all" className="bg-slate-900 text-slate-200">Everyone (All Users)</option>
                        <option value="team" className="bg-slate-900 text-slate-200">Specific Subsystem Team</option>
                        <option value="user" className="bg-slate-900 text-slate-200">Specific User</option>
                      </select>
                    </div>

                    {broadcastTargetType === 'team' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Subsystem</label>
                        <select
                          value={broadcastTargetId}
                          onChange={(e) => setBroadcastTargetId(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                        >
                          <option value="" className="bg-slate-900 text-slate-200">-- Choose Subsystem --</option>
                          {broadcastSubsystems
                            .filter(sub => profile.role === 'CAPTAIN' || profile.approvedTeams?.includes(sub.id))
                            .map(sub => (
                              <option key={sub.id} value={sub.id} className="bg-slate-900 text-slate-200">{sub.name}</option>
                            ))}
                        </select>
                      </div>
                    )}

                    {broadcastTargetType === 'user' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select User</label>
                        <select
                          value={broadcastTargetId}
                          onChange={(e) => setBroadcastTargetId(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                        >
                          <option value="" className="bg-slate-900 text-slate-200">-- Choose User --</option>
                          {allUsersList.map(usr => (
                            <option key={usr.uid} value={usr.uid} className="bg-slate-900 text-slate-200">
                              {usr.displayName || usr.email} ({usr.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Notification Title</label>
                    <input 
                      type="text" 
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      placeholder="e.g. 📢 Everyone Assemble!"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Message Body</label>
                    <textarea 
                      value={broadcastMessage}
                      onChange={(e) => setBroadcastMessage(e.target.value)}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors resize-none"
                      placeholder="e.g. Everyone assemble at drone lab at 3pm for today's brakes class."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <div className="flex gap-3">
                      <button 
                        type="button"
                        onClick={() => setBroadcastOpen(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-bold border border-white/10 text-white hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        type="button"
                        onClick={handleSendBroadcast}
                        disabled={isBroadcasting || !broadcastTitle.trim() || !broadcastMessage.trim()}
                        className={`flex-1 px-4 py-3 rounded-xl font-bold bg-orange-500 text-white transition-colors shadow-[0_0_20px_rgba(249,115,22,0.3)] flex items-center justify-center gap-1.5 cursor-pointer ${
                          isBroadcasting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-orange-600'
                        }`}
                      >
                        {isBroadcasting ? (
                          <><Loader2 size={16} className="animate-spin" /> Sending...</>
                        ) : (
                          <><Send size={16} /> Send Broadcast</>
                        )}
                      </button>
                    </div>

                    <div className="h-[1px] bg-white/5 my-2" />
                    <p className="text-[10px] text-center text-slate-600 font-bold uppercase tracking-widest flex items-center justify-center gap-1.5">
                      <Radio size={10} className="text-orange-500/50" /> Auto 8:30 PM reminders active
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}


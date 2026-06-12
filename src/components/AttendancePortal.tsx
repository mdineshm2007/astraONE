import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUsers } from '../services/userService';
import { 
  createTrainingSession, 
  updateTrainingSession, 
  deleteTrainingSession, 
  subscribeToTrainingSessions,
  createHoliday,
  deleteHoliday,
  subscribeToHolidays
} from '../services/attendanceService';
import { rtdb } from '../firebase';
import { TrainingSession, UserProfile, Holiday } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, CheckSquare, List, Users as UsersIcon, BarChart3, 
  Plus, Download, Printer, Edit, Trash2, Search, Clock, 
  Check, X, ChevronDown, ChevronUp, UserCheck, BookOpen, UserPlus 
} from 'lucide-react';

const DEPARTMENTS = [
  'General Team',
  'Autonomous',
  'Brakes',
  'Cost',
  'Design',
  'Electrical',
  'Innovation',
  'Media and Sponsorship',
  'Steering',
  'Suspension',
  'Transmission'
];

const DEPT_TO_ID: { [key: string]: string } = {
  'General Team': 'general',
  'Autonomous': 'autonomous',
  'Brakes': 'brakes',
  'Cost': 'cost',
  'Design': 'design',
  'Electrical': 'electrical',
  'Innovation': 'innovation',
  'Media and Sponsorship': 'pro',
  'Steering': 'steering',
  'Suspension': 'suspension',
  'Transmission': 'transmission'
};

type TabType = 'attendance' | 'log' | 'members' | 'departments' | 'reports';

export default function AttendancePortal() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Realtime Subscriptions
  useEffect(() => {
    const unsubUsers = subscribeToUsers(setUsers);
    const unsubSessions = subscribeToTrainingSessions(setSessions);
    const unsubHolidays = subscribeToHolidays(setHolidays);
    return () => {
      unsubUsers();
      unsubSessions();
      unsubHolidays();
    };
  }, []);

  // Strict role check: ONLY Captains can mark attendance, create, edit, or delete sessions
  const isPrivileged = profile?.role === 'CAPTAIN';

  // State for session forms
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionData, setNewSessionData] = useState({
    date: new Date().toISOString().split('T')[0],
    topic: '',
    handledBy: profile?.displayName || '',
    department: DEPARTMENTS[0],
    duration: 2,
    status: 'UPCOMING' as 'COMPLETED' | 'UPCOMING' // Default to upcoming so captains can mark attendance on completion
  });

  // State for holiday forms
  const [isCreatingHoliday, setIsCreatingHoliday] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState(new Date().toISOString().split('T')[0]);

  // Report Filtering range
  const [reportType, setReportType] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>('ALL');
  const [selectedReportDate, setSelectedReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedReportMonth, setSelectedReportMonth] = useState(new Date().toISOString().split('T')[0].substring(0, 7)); // YYYY-MM

  // State for active attendance logging
  const [loggingSession, setLoggingSession] = useState<TrainingSession | null>(null);
  const [attendanceMap, setAttendanceMap] = useState<{ [uid: string]: boolean }>({});
  const [externalNames, setExternalNames] = useState<string[]>([]);
  const [newExternalName, setNewExternalName] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // Start logging attendance for a session
  const startLogging = (session: TrainingSession) => {
    setLoggingSession(session);
    setAttendanceMap(session.attendance || {});
    setExternalNames(session.externalAttendance || []);
    setNewExternalName('');
    setActiveTab('attendance');
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      const sessionData = {
        ...newSessionData,
        attendance: {},
        externalAttendance: [],
        createdBy: profile.uid,
        createdAt: new Date().toISOString()
      };
      
      const newId = await createTrainingSession(sessionData);
      setIsCreatingSession(false);
      setNewSessionData({
        date: new Date().toISOString().split('T')[0],
        topic: '',
        handledBy: profile?.displayName || '',
        department: DEPARTMENTS[0],
        duration: 2,
        status: 'UPCOMING'
      });
      
      // Notify everyone (except alumni) when a new training session is created
      try {
        const { ref: dbRef, set: dbSet } = await import('firebase/database');
        const notifId = `session_notif_${newId}`;
        const notification = {
          title: '📅 New Training Scheduled',
          message: `A new session on "${sessionData.topic}" has been scheduled for the ${sessionData.department} subsystem on ${sessionData.date} by ${sessionData.handledBy}.`,
          type: 'INFO',
          timestamp: new Date().toISOString(),
          read: false,
          link: 'attendance'
        };
        const activeUsers = users.filter(u => u.year !== 'Alumni');
        const notificationPromises = activeUsers.map(u => 
          dbSet(dbRef(rtdb, `notifications/${u.uid}/${notifId}`), notification)
        );
        await Promise.all(notificationPromises);
      } catch (notifErr) {
        console.warn("Could not dispatch session scheduling notifications:", notifErr);
      }

      // Auto open attendance logger if completed session was created
      if (sessionData.status === 'COMPLETED' && newId) {
        const createdSession: TrainingSession = {
          id: newId,
          ...sessionData
        };
        startLogging(createdSession);
      } else {
        setActiveTab('attendance');
      }
    } catch (err) {
      console.error("Failed to create training session:", err);
      alert("Failed to create training session.");
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !newHolidayName.trim()) return;
    try {
      const holidayData = {
        date: newHolidayDate,
        name: newHolidayName.trim(),
        createdBy: profile.uid,
        createdAt: new Date().toISOString()
      };
      await createHoliday(holidayData);
      setNewHolidayName('');
      setIsCreatingHoliday(false);
      alert("Holiday successfully saved!");
    } catch (err) {
      console.error("Failed to create holiday:", err);
      alert("Failed to create holiday.");
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm("Are you sure you want to remove this holiday?")) return;
    try {
      await deleteHoliday(id);
    } catch (err) {
      console.error("Failed to delete holiday:", err);
      alert("Failed to delete holiday.");
    }
  };

  const handleSeedData = async () => {
    if (!profile || !activeUsers.length) {
      alert("No active users found to generate attendance for.");
      return;
    }
    if (!confirm("Would you like to seed sample training and daily attendance data into the Realtime Database?")) return;
    try {
      const { ref: dbRef, push: dbPush, set: dbSet } = await import('firebase/database');
      
      const seedSessions = [
        {
          topic: "Chassis & Vehicle Dynamics",
          date: "2026-06-08",
          handledBy: "Dinesh M",
          department: "Design",
          duration: 2.5,
          status: "COMPLETED",
          attendance: activeUsers.reduce((acc, u, idx) => {
            acc[u.uid] = idx % 5 !== 0; // 80% attendance
            return acc;
          }, {} as any),
          externalAttendance: ["John Doe (V1)", "Sam (V2)"],
          createdBy: profile.uid,
          createdAt: new Date().toISOString()
        },
        {
          topic: "Battery Pack Assembly",
          date: "2026-06-10",
          handledBy: "Sanjay",
          department: "Electrical",
          duration: 3,
          status: "COMPLETED",
          attendance: activeUsers.reduce((acc, u, idx) => {
            acc[u.uid] = idx % 4 !== 0; // 75% attendance
            return acc;
          }, {} as any),
          externalAttendance: [],
          createdBy: profile.uid,
          createdAt: new Date().toISOString()
        },
        {
          topic: "Daily Attendance & Roll Call",
          date: "2026-06-12",
          handledBy: profile.displayName || "Captain",
          department: "General Team",
          duration: 1,
          status: "COMPLETED",
          attendance: activeUsers.reduce((acc, u, idx) => {
            acc[u.uid] = idx % 10 !== 0; // 90% attendance
            return acc;
          }, {} as any),
          externalAttendance: ["External Student"],
          createdBy: profile.uid,
          createdAt: new Date().toISOString()
        }
      ];

      for (const s of seedSessions) {
        const newSessionRef = dbPush(dbRef(rtdb, 'training_sessions'));
        await dbSet(newSessionRef, s);
      }
      alert("Successfully seeded sample attendance data!");
    } catch (err) {
      console.error("Failed to seed data:", err);
      alert("Failed to seed database.");
    }
  };

  const handleAddExternalName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newExternalName.trim();
    if (!name) return;
    if (externalNames.includes(name)) {
      alert("Name is already added to this session.");
      return;
    }
    setExternalNames([...externalNames, name]);
    setNewExternalName('');
  };

  const handleRemoveExternalName = (name: string) => {
    setExternalNames(externalNames.filter(n => n !== name));
  };

  const handleSaveAttendance = async () => {
    if (!loggingSession) return;
    try {
      await updateTrainingSession(loggingSession.id, {
        attendance: attendanceMap,
        externalAttendance: externalNames,
        status: 'COMPLETED' // Automatically marks completed once attendance is saved/confirmed
      });
      setLoggingSession(null);
      setAttendanceMap({});
      setExternalNames([]);
      setActiveTab('log');
    } catch (err) {
      console.error("Failed to save attendance:", err);
      alert("Failed to save attendance.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("Are you sure you want to delete this training session log?")) return;
    try {
      await deleteTrainingSession(id);
      if (loggingSession?.id === id) {
        setLoggingSession(null);
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
      alert("Failed to delete training session.");
    }
  };

  // Filter out Alumni from active lists
  const activeUsers = users.filter(u => u.year !== 'Alumni');
  const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
  const upcomingSessions = sessions.filter(s => s.status === 'UPCOMING');

  // Derived state to filter completed sessions based on report range
  const getFilteredSessions = (sessionList: TrainingSession[]) => {
    return sessionList.filter(s => {
      if (s.status !== 'COMPLETED') return false;
      if (reportType === 'DAILY') {
        return s.date === selectedReportDate;
      }
      if (reportType === 'WEEKLY') {
        const start = new Date(selectedReportDate);
        const end = new Date(selectedReportDate);
        end.setDate(end.getDate() + 7);
        const sessionDate = new Date(s.date);
        return sessionDate >= start && sessionDate < end;
      }
      if (reportType === 'MONTHLY') {
        return s.date.startsWith(selectedReportMonth);
      }
      return true;
    });
  };

  const filteredCompletedSessions = getFilteredSessions(sessions);

  // Member statistics calculations based on all completed sessions (excluding Alumni)
  const getMemberStats = (userId: string, sessionList = completedSessions) => {
    const attended = sessionList.filter(s => s.attendance && s.attendance[userId] === true);
    
    const percentage = sessionList.length > 0
      ? Math.round((attended.length / sessionList.length) * 100)
      : 100;

    const totalHours = attended.reduce((acc, s) => acc + (s.duration || 0), 0);

    return {
      attendedCount: attended.length,
      expectedCount: sessionList.length,
      percentage,
      totalHours
    };
  };

  // Get list of unique external members who have attended sessions
  const getExternalMembers = () => {
    const allExternals = new Set<string>();
    completedSessions.forEach(s => {
      if (s.externalAttendance) {
        s.externalAttendance.forEach(name => allExternals.add(name));
      }
    });
    return Array.from(allExternals);
  };

  const externalMembers = getExternalMembers();

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = ['Name', 'Type', 'Department/Subsystem', 'Attended Sessions', 'Total Relevant Sessions', 'Attendance %', 'Total Training Hours'];
    
    // Append completed sessions columns to headers
    filteredCompletedSessions.forEach(s => {
      headers.push(`"${s.date} - ${s.topic}"`);
    });

    const rows: string[] = [];

    // Add registered members (excluding alumni)
    activeUsers.forEach(user => {
      const stats = getMemberStats(user.uid, filteredCompletedSessions);
      const row = [
        `"${user.displayName || 'Unnamed User'}"`,
        'Registered',
        `"${user.approvedTeams?.map(id => Object.keys(DEPT_TO_ID).find(key => DEPT_TO_ID[key] === id) || id).join(', ') || 'General'}"`,
        stats.attendedCount,
        stats.expectedCount,
        `${stats.percentage}%`,
        stats.totalHours
      ];

      filteredCompletedSessions.forEach(s => {
        const isPresent = s.attendance && s.attendance[user.uid] === true;
        row.push(isPresent ? 'Present' : 'Absent');
      });

      rows.push(row.join(','));
    });

    // Add manual external attendees
    externalMembers.forEach(name => {
      let attended = 0;
      let hours = 0;
      let totalRelevant = 0;

      filteredCompletedSessions.forEach(s => {
        const isPresent = s.externalAttendance && s.externalAttendance.includes(name);
        if (isPresent) {
          attended++;
          hours += s.duration || 0;
        }
        totalRelevant++;
      });

      const percent = totalRelevant > 0 ? Math.round((attended / totalRelevant) * 100) : 100;
      
      const row = [
        `"${name}"`,
        'External/Manual',
        'Multiple',
        attended,
        totalRelevant,
        `${percent}%`,
        hours
      ];

      filteredCompletedSessions.forEach(s => {
        const isPresent = s.externalAttendance && s.externalAttendance.includes(name);
        row.push(isPresent ? 'Present' : 'Absent');
      });

      rows.push(row.join(','));
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `astra_${reportType.toLowerCase()}_attendance_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 print:bg-white print:text-black">
      
      {/* Dynamic style block for print page formatting */}
      <style>{`
        @media print {
          body, html, #root {
            background: white !important;
            color: black !important;
          }
          aside, header, nav, button, .no-print, .tabs-list {
            display: none !important;
          }
          .print-card {
            background: transparent !important;
            border: 1px solid #000 !important;
            color: black !important;
            box-shadow: none !important;
          }
          .print-title {
            color: black !important;
            font-size: 24px !important;
            font-weight: bold !important;
          }
          .print-text {
            color: black !important;
          }
          .print-table {
            border-collapse: collapse;
            width: 100%;
          }
          .print-table th, .print-table td {
            border: 1px solid #000 !important;
            padding: 8px !important;
            color: black !important;
          }
        }
      `}</style>

      {/* Header Panel */}
      <div className="relative overflow-hidden glass-panel rounded-3xl p-8 border border-white/5 no-print">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-yellow-500/5 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Calendar className="text-primary" size={32} />
              Attendance & <span className="text-primary">Training</span>
            </h1>
            <p className="text-slate-400 text-sm">
              Team ASTRA Training Session Logger and Participation Metrics.
            </p>
          </div>
          {isPrivileged && (
            <div className="flex gap-3">
              <button
                onClick={() => setIsCreatingHoliday(!isCreatingHoliday)}
                className="px-5 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer text-sm"
              >
                {isCreatingHoliday ? <X size={16} /> : <Calendar size={16} />}
                {isCreatingHoliday ? 'Cancel Holiday' : 'Manage Holidays'}
              </button>
              <button
                onClick={() => setIsCreatingSession(!isCreatingSession)}
                className="px-5 py-3 bg-primary text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
              >
                {isCreatingSession ? <X size={18} /> : <Plus size={18} />}
                {isCreatingSession ? 'Cancel' : 'Log Session'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Holiday Form Overlay */}
      <AnimatePresence>
        {isCreatingHoliday && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-panel p-6 rounded-2xl border border-yellow-500/20 overflow-hidden no-print"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="text-yellow-500" size={20} />
              Manage Holidays / Non-Attendance Days
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <form onSubmit={handleCreateHoliday} className="space-y-4">
                <h4 className="text-sm font-bold text-slate-300">Add New Holiday</h4>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Holiday Reason</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Exam Break, Festival"
                    value={newHolidayName}
                    onChange={e => setNewHolidayName(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                  <input
                    type="date"
                    required
                    value={newHolidayDate}
                    onChange={e => setNewHolidayDate(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-yellow-500 text-black font-black rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md"
                >
                  Save Holiday
                </button>
              </form>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-300">Active Holidays</h4>
                <div className="max-h-[220px] overflow-y-auto space-y-2 bg-white/5 border border-white/5 rounded-xl p-3">
                  {holidays.map(h => (
                    <div key={h.id} className="flex justify-between items-center bg-black/20 p-2.5 rounded-lg border border-white/5 text-xs text-slate-300">
                      <div>
                        <span className="font-bold text-white block">{h.name}</span>
                        <span className="text-[10px] text-slate-500">{h.date}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteHoliday(h.id)}
                        className="p-1 hover:text-red-400 rounded transition text-slate-500 cursor-pointer"
                        title="Delete Holiday"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {holidays.length === 0 && (
                    <p className="text-xs text-slate-500 italic py-4 text-center">No holidays declared yet.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Session Form Overlay */}
      <AnimatePresence>
        {isCreatingSession && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-panel p-6 rounded-2xl border border-primary/20 overflow-hidden no-print"
          >
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BookOpen className="text-primary" size={20} />
              Record New Training Session
            </h3>
            <form onSubmit={handleCreateSession} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3 flex gap-2 border-b border-white/5 pb-3">
                <button
                  type="button"
                  onClick={() => setNewSessionData({
                    ...newSessionData,
                    topic: '',
                    duration: 2,
                    department: DEPARTMENTS[0]
                  })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !newSessionData.topic.startsWith("Daily Attendance")
                      ? 'bg-primary text-black'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  Training Session
                </button>
                <button
                  type="button"
                  onClick={() => setNewSessionData({
                    ...newSessionData,
                    topic: `Daily Attendance - ${newSessionData.date}`,
                    duration: 3,
                    department: 'General Team'
                  })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    newSessionData.topic.startsWith("Daily Attendance")
                      ? 'bg-primary text-black'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  Daily Attendance (3-6 PM)
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Topic handled</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Steering System Basics"
                  value={newSessionData.topic}
                  onChange={e => setNewSessionData({...newSessionData, topic: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Trainer</label>
                <input
                  type="text"
                  required
                  placeholder="Trainer name"
                  value={newSessionData.handledBy}
                  onChange={e => setNewSessionData({...newSessionData, handledBy: e.target.value})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Subsystem Department</label>
                <select
                  value={newSessionData.department}
                  onChange={e => setNewSessionData({...newSessionData, department: e.target.value})}
                  className="w-full bg-[#0d1320] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none font-bold"
                >
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Date</label>
                <input
                  type="date"
                  required
                  value={newSessionData.date}
                  onChange={e => {
                    const newDate = e.target.value;
                    const isDaily = newSessionData.topic.startsWith("Daily Attendance");
                    setNewSessionData({
                      ...newSessionData,
                      date: newDate,
                      topic: isDaily ? `Daily Attendance - ${newDate}` : newSessionData.topic
                    });
                  }}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Duration (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={newSessionData.duration}
                  onChange={e => setNewSessionData({...newSessionData, duration: parseFloat(e.target.value) || 0})}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Session Status</label>
                <select
                  value={newSessionData.status}
                  onChange={e => setNewSessionData({...newSessionData, status: e.target.value as any})}
                  className="w-full bg-[#0d1320] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none font-bold"
                >
                  <option value="UPCOMING">Upcoming / Ongoing Session</option>
                  <option value="COMPLETED">Completed Session</option>
                </select>
              </div>

              <div className="md:col-span-3 flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  className="px-6 py-3 bg-primary text-black font-black rounded-xl hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-primary/10"
                >
                  Create Session Log
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs list navigation */}
      <div className="flex border-b border-white/5 pb-px space-x-6 tabs-list no-print overflow-x-auto">
        {[
          { id: 'attendance', label: 'Attendance', icon: CheckSquare },
          { id: 'log', label: 'Session Log', icon: List },
          { id: 'members', label: 'Member List', icon: UsersIcon },
          { id: 'departments', label: 'Department List', icon: BarChart3 },
          { id: 'reports', label: 'Reports', icon: UserCheck }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 pb-4 font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary font-black'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}
      <div className="space-y-6">

        {/* 1. ATTENDANCE TAB */}
        {activeTab === 'attendance' && (
          <div className="space-y-6 no-print">
            {(() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const todayHoliday = holidays.find(h => h.date === todayStr);
              if (todayHoliday) {
                return (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-xl flex items-center gap-3 no-print">
                    <Calendar className="text-yellow-500" size={20} />
                    <div>
                      <span className="font-black text-xs uppercase tracking-wider block leading-none">Holiday Notice</span>
                      <p className="text-sm font-bold mt-1">Today is a holiday: {todayHoliday.name}. No attendance required.</p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            {isPrivileged ? (
              loggingSession ? (
                // Interactive attendance grid for captains
                <div className="glass-panel p-6 rounded-2xl border border-primary/20 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
                    <div>
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">Active Logging Mode</span>
                      <h2 className="text-xl font-bold text-white mt-1">{loggingSession.topic}</h2>
                      <p className="text-slate-400 text-xs mt-0.5">
                        Trainer: {loggingSession.handledBy} • Dept: {loggingSession.department} • Date: {loggingSession.date}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setLoggingSession(null); setAttendanceMap({}); setExternalNames([]); }}
                        className="px-4 py-2 border border-white/10 rounded-xl hover:bg-white/5 transition font-bold text-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveAttendance}
                        className="px-5 py-2 bg-primary text-black font-black rounded-xl hover:brightness-110 transition shadow-lg shadow-primary/15 flex items-center gap-1.5 cursor-pointer text-sm"
                      >
                        <Check size={16} />
                        Confirm Attendance List
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Registered Members Grid */}
                    <div className="lg:col-span-2 space-y-4">
                      <h3 className="text-sm font-bold text-slate-300">Registered Active Members</h3>
                      <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-xl border border-white/5">
                        <span className="text-xs font-bold text-slate-400">
                          {activeUsers.length} active members found
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const updated: any = {};
                              activeUsers.forEach(u => {
                                updated[u.uid] = true;
                              });
                              setAttendanceMap(updated);
                            }}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-slate-300 rounded-lg transition cursor-pointer"
                          >
                            Mark All Present
                          </button>
                          <button
                            onClick={() => setAttendanceMap({})}
                            className="px-3 py-1 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase text-slate-300 rounded-lg transition cursor-pointer"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeUsers
                          .map(user => {
                            const isPresent = attendanceMap[user.uid] === true;
                            return (
                              <div
                                key={user.uid}
                                onClick={() => setAttendanceMap({ ...attendanceMap, [user.uid]: !isPresent })}
                                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                  isPresent 
                                    ? 'border-primary/40 bg-primary/5' 
                                    : 'border-white/5 bg-white/5 hover:bg-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-primary">
                                    {user.photoURL ? (
                                      <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover rounded-lg" />
                                    ) : (
                                      user.displayName?.charAt(0).toUpperCase() || '?'
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-sm text-white leading-none">{user.displayName || user.email}</h4>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                                      {user.role} {user.year ? `• ${user.year}` : ''}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                                  isPresent
                                    ? 'border-primary bg-primary text-black'
                                    : 'border-white/20 bg-black/20 text-transparent'
                                }`}>
                                  <Check size={14} strokeWidth={3} />
                                </div>
                              </div>
                            );
                          })}
                        {activeUsers.length === 0 && (
                          <div className="col-span-full py-8 text-center text-slate-500 italic text-sm">
                            No registered active members found.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Manual name additions / External members */}
                    <div className="lg:col-span-1 space-y-4">
                      <h3 className="text-sm font-bold text-slate-300">Temporary / Manual Attendee Addition</h3>
                      
                      <form onSubmit={handleAddExternalName} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type student name..."
                          value={newExternalName}
                          onChange={e => setNewExternalName(e.target.value)}
                          className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                        />
                        <button
                          type="submit"
                          className="px-3.5 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1"
                        >
                          <UserPlus size={14} />
                          Add
                        </button>
                      </form>

                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-2 min-h-[150px]">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Added to this Session</span>
                        
                        <div className="flex flex-wrap gap-2 pt-2">
                          {externalNames.map(name => (
                            <span 
                              key={name}
                              className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-lg text-xs font-bold"
                            >
                              {name}
                              <button 
                                type="button"
                                onClick={() => handleRemoveExternalName(name)}
                                className="text-slate-400 hover:text-red-400 transition"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                          {externalNames.length === 0 && (
                            <span className="text-xs text-slate-500 italic">No manual names added yet.</span>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                // List of sessions waiting to have attendance logged
                <div className="space-y-4">
                  <h3 className="text-md font-bold text-slate-300">Pending Training Sessions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sessions.filter(s => s.status === 'UPCOMING').map(session => (
                      <div key={session.id} className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[9px] font-black uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">
                              Upcoming
                            </span>
                            <span className="text-[10px] text-slate-500 font-bold">{session.date}</span>
                          </div>
                          <h4 className="text-base font-bold text-white mb-1">{session.topic}</h4>
                          <p className="text-xs text-slate-400 mb-4">
                            Trainer: {session.handledBy} • Subsystem: {session.department} • Duration: {session.duration}h
                          </p>
                        </div>
                        <div className="flex gap-2 justify-end border-t border-white/5 pt-3">
                          <button
                            onClick={() => startLogging(session)}
                            className="px-3.5 py-2 bg-primary text-black font-black rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-primary/10"
                          >
                            <CheckSquare size={13} />
                            Session Completed (Confirm Attendance)
                          </button>
                        </div>
                      </div>
                    ))}
                    {sessions.filter(s => s.status === 'UPCOMING').length === 0 && (
                      <div className="col-span-full py-8 text-center text-slate-500 italic text-sm glass-panel border-white/5 rounded-2xl">
                        No upcoming sessions require attendance logs. You can create a new session above.
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : (
              // Member personalized dashboard
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Stats overview card */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5 lg:col-span-1 space-y-6">
                  <h3 className="text-base font-bold text-white border-b border-white/5 pb-3">Training Summary</h3>
                  
                  {(() => {
                    const stats = getMemberStats(profile?.uid || '', profile?.approvedTeams || []);
                    return (
                      <div className="space-y-4">
                        <div className="text-center py-6 bg-white/5 rounded-xl border border-white/5">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Attendance</p>
                          <p className="text-5xl font-black text-primary mt-2">{stats.percentage}%</p>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">
                            {stats.attendedCount} of {stats.expectedCount} Sessions Attended
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Training Hours</p>
                            <p className="text-2xl font-black text-white mt-1">{stats.totalHours}h</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Upcoming</p>
                            <p className="text-2xl font-black text-white mt-1">
                              {upcomingSessions.length}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Personal schedule list */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5 lg:col-span-2 space-y-6">
                  <h3 className="text-base font-bold text-white border-b border-white/5 pb-3">Training Schedule</h3>
                  
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {sessions
                      .map(session => {
                        const isCompleted = session.status === 'COMPLETED';
                        const isPresent = session.attendance && session.attendance[profile?.uid || ''] === true;

                        return (
                          <div key={session.id} className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center gap-4">
                            <div>
                              <p className="text-[10px] text-slate-500 font-bold">{session.date} • Subsystem: {session.department}</p>
                              <h4 className="font-bold text-sm text-white mt-0.5">{session.topic}</h4>
                              <p className="text-xs text-slate-400 mt-1">
                                Trainer: {session.handledBy} • Duration: {session.duration} hours
                              </p>
                            </div>
                            
                            <div>
                              {isCompleted ? (
                                isPresent ? (
                                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                                    Present
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-red-400 bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20">
                                    Absent
                                  </span>
                                )
                              ) : (
                                <span className="text-[10px] font-black text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-full border border-yellow-500/20">
                                  Upcoming
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {sessions.length === 0 && (
                      <div className="py-8 text-center text-slate-500 italic text-sm">
                        No training sessions logged yet.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* 2. SESSION LOG TAB */}
        {activeTab === 'log' && (
          <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold text-white">All Training Sessions</h3>
              
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by topic, trainer, subsystem..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Topic Handled</th>
                    <th className="py-3 px-4">Trainer</th>
                    <th className="py-3 px-4">Subsystem</th>
                    <th className="py-3 px-4 text-center">Duration</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {sessions
                    .filter(s => 
                      s.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      s.handledBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      s.department.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(session => {
                      const isExpanded = expandedSessionId === session.id;
                      const presentCount = Object.values(session.attendance || {}).filter(val => val === true).length + (session.externalAttendance || []).length;
                      
                      return (
                        <React.Fragment key={session.id}>
                          <tr className="hover:bg-white/5 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-300">{session.date}</td>
                            <td className="py-3.5 px-4 font-bold text-white">{session.topic}</td>
                            <td className="py-3.5 px-4 text-slate-300">{session.handledBy}</td>
                            <td className="py-3.5 px-4 text-slate-400">{session.department}</td>
                            <td className="py-3.5 px-4 text-center font-bold text-slate-300">{session.duration} hours</td>
                            <td className="py-3.5 px-4 text-center">
                              {session.status === 'COMPLETED' ? (
                                <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                  Completed
                                </span>
                              ) : (
                                <span className="text-[9px] font-black text-yellow-400 bg-yellow-500/10 px-2.5 py-0.5 rounded-full border border-yellow-500/20">
                                  Upcoming
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              <button
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                className="p-1.5 hover:text-primary bg-white/5 hover:bg-white/10 rounded-lg transition text-slate-400 cursor-pointer"
                                title="View Attendees"
                              >
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>

                              {isPrivileged && (
                                <>
                                  <button
                                    onClick={() => startLogging(session)}
                                    className="p-1.5 hover:text-primary bg-white/5 hover:bg-white/10 rounded-lg transition text-slate-400 cursor-pointer"
                                    title={session.status === 'UPCOMING' ? "Confirm Completion" : "Edit Attendance"}
                                  >
                                    {session.status === 'UPCOMING' ? <CheckSquare size={14} /> : <Edit size={14} />}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSession(session.id)}
                                    className="p-1.5 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded-lg transition text-slate-400 cursor-pointer"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Attendees List */}
                          <AnimatePresence>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="py-4 px-6 bg-white/5 rounded-b-xl border-l-2 border-primary">
                                  <div className="space-y-3">
                                    <h5 className="font-bold text-xs text-primary uppercase tracking-wider">
                                      Attendees List ({presentCount} Present)
                                    </h5>
                                    
                                    <div className="flex flex-wrap gap-2">
                                      {/* Registered active members */}
                                      {activeUsers
                                        .map(user => {
                                          const isPresent = session.attendance && session.attendance[user.uid] === true;
                                          return (
                                            <span 
                                              key={user.uid}
                                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-medium transition ${
                                                isPresent 
                                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                  : 'bg-red-500/5 text-slate-400 border-white/5'
                                              }`}
                                            >
                                              <span className={`w-1.5 h-1.5 rounded-full ${isPresent ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                              {user.displayName || user.email}
                                            </span>
                                          );
                                        })}
                                      
                                      {/* Manual External Members */}
                                      {session.externalAttendance && session.externalAttendance.map(name => (
                                        <span 
                                          key={name}
                                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                          {name} (Manual Addition)
                                        </span>
                                      ))}

                                      {activeUsers.length === 0 && (!session.externalAttendance || session.externalAttendance.length === 0) && (
                                        <p className="text-slate-500 italic text-xs">No attendees recorded.</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                        <p className="mb-3">No training sessions recorded yet.</p>
                        {isPrivileged && (
                          <button
                            onClick={handleSeedData}
                            className="px-4 py-2 bg-primary/10 border border-primary/20 text-primary font-bold rounded-xl hover:bg-primary/20 transition cursor-pointer text-xs"
                          >
                            Seed Sample Attendance Data
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. MEMBER LIST TAB */}
        {activeTab === 'members' && (
          <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 no-print">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <h3 className="text-lg font-bold text-white">Active Engineering Members</h3>
              
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Subsystem Teams</th>
                    <th className="py-3 px-4 text-center">Attended Sessions</th>
                    <th className="py-3 px-4 text-center">Attendance %</th>
                    <th className="py-3 px-4 text-center">Total Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-slate-300">
                  {activeUsers
                    .filter(u => 
                      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(user => {
                      const stats = getMemberStats(user.uid, user.approvedTeams || []);
                      
                      return (
                        <tr key={user.uid} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center font-bold text-primary overflow-hidden">
                                {user.photoURL ? (
                                  <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                                ) : (
                                  user.displayName?.charAt(0).toUpperCase() || '?'
                                )}
                              </div>
                              <div>
                                <h4 className="font-bold text-white leading-none">{user.displayName || 'Unnamed User'}</h4>
                                <span className="text-[9px] text-slate-500 lowercase mt-1 block">{user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-bold">
                            {user.approvedTeams?.map(id => Object.keys(DEPT_TO_ID).find(key => DEPT_TO_ID[key] === id) || id).join(', ') || 'General'}
                          </td>
                          <td className="py-3 px-4 text-center font-bold">{stats.attendedCount} / {stats.expectedCount}</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`font-black ${
                              stats.percentage >= 80 ? 'text-emerald-400' :
                              stats.percentage >= 50 ? 'text-yellow-400' :
                              'text-red-400'
                            }`}>
                              {stats.percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">{stats.totalHours}h</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. DEPARTMENT LIST TAB */}
        {activeTab === 'departments' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
            {DEPARTMENTS.map(dept => {
              const deptId = DEPT_TO_ID[dept];
              const activeMembers = activeUsers.filter(u => u.approvedTeams?.includes(deptId));
              const deptSessions = completedSessions.filter(s => s.department === dept);
              
              // Calculate department average attendance rate
              let totalPresents = 0;
              deptSessions.forEach(s => {
                activeMembers.forEach(m => {
                  if (s.attendance && s.attendance[m.uid] === true) totalPresents++;
                });
                // Count manual external presents
                if (s.externalAttendance) {
                  totalPresents += s.externalAttendance.length;
                }
              });

              const totalExpected = (deptSessions.length * activeMembers.length) + deptSessions.reduce((acc, s) => acc + (s.externalAttendance || []).length, 0);
              const averageRate = totalExpected > 0
                ? Math.round((totalPresents / totalExpected) * 100)
                : 100;

              const totalHours = deptSessions.reduce((acc, s) => acc + (s.duration || 0), 0);

              return (
                <div key={dept} className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-primary/20 transition-all flex flex-col justify-between">
                  <div>
                    <h3 className="font-black text-lg text-white mb-4 border-b border-white/5 pb-2">{dept}</h3>
                    <div className="grid grid-cols-3 gap-3 text-center mb-6">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Members</p>
                        <p className="text-xl font-black text-white mt-1">{activeMembers.length}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Sessions</p>
                        <p className="text-xl font-black text-white mt-1">{deptSessions.length}</p>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Training Hours</p>
                        <p className="text-xl font-black text-white mt-1">{totalHours}h</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span>Avg Attendance Rate</span>
                      <span className="text-primary font-black">{averageRate}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${averageRate}%` }}
                        className="h-full bg-gradient-to-r from-primary to-yellow-500 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 5. REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="space-y-8">
            {/* Control buttons & filters (no-print) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 border border-white/5 p-5 rounded-2xl no-print">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">Report Range</label>
                  <select
                    value={reportType}
                    onChange={e => setReportType(e.target.value as any)}
                    className="bg-[#0d1320] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-primary"
                  >
                    <option value="ALL">All Time</option>
                    <option value="DAILY">Daily Report</option>
                    <option value="WEEKLY">Weekly Report</option>
                    <option value="MONTHLY">Monthly Report</option>
                  </select>
                </div>

                {(reportType === 'DAILY' || reportType === 'WEEKLY') && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">
                      {reportType === 'DAILY' ? 'Select Date' : 'Week Start Date'}
                    </label>
                    <input
                      type="date"
                      value={selectedReportDate}
                      onChange={e => setSelectedReportDate(e.target.value)}
                      className="bg-[#0d1320] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                )}

                {reportType === 'MONTHLY' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1.5">Select Month</label>
                    <input
                      type="month"
                      value={selectedReportMonth}
                      onChange={e => setSelectedReportMonth(e.target.value)}
                      className="bg-[#0d1320] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-2"
                >
                  <Download size={14} />
                  Export CSV (Excel)
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2.5 bg-primary text-black font-black rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shadow-lg shadow-primary/10"
                >
                  <Printer size={14} />
                  Print PDF Report
                </button>
              </div>
            </div>

            {/* Metrics cards (printed & visible) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {(() => {
                // Calculate general metrics based on filtered sessions
                const activeTrainers = new Set(filteredCompletedSessions.map(s => s.handledBy)).size;
                const totalHours = filteredCompletedSessions.reduce((acc, s) => acc + (s.duration || 0), 0);

                let presents = 0;
                let expected = 0;
                filteredCompletedSessions.forEach(s => {
                  activeUsers.forEach(m => {
                    if (s.attendance && s.attendance[m.uid] === true) presents++;
                    expected++;
                  });
                  if (s.externalAttendance) {
                    presents += s.externalAttendance.length;
                    expected += s.externalAttendance.length;
                  }
                });
                
                const overallRate = expected > 0 ? Math.round((presents / expected) * 100) : 100;

                return (
                  <>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 print-card">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 print-text">Overall Attendance</span>
                      <div className="text-3xl font-black text-primary mt-2 print-title">{overallRate}%</div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 print-card">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 print-text">Sessions Conducted</span>
                      <div className="text-3xl font-black text-white mt-2 print-title">{completedSessions.length}</div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 print-card">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 print-text">Total Training Hours</span>
                      <div className="text-3xl font-black text-white mt-2 print-title">{totalHours} Hours</div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 print-card">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 print-text">Active Trainers</span>
                      <div className="text-3xl font-black text-white mt-2 print-title">{activeTrainers}</div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Matrix Table (always printed) */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 print-card space-y-4">
              <h3 className="text-base font-bold text-white print-title">Complete Member Attendance Matrix</h3>
              <p className="text-slate-400 text-xs mt-1 no-print">
                This table shows the attendance status of all active members across each recorded training session.
              </p>
              
              <div className="overflow-x-auto print-container">
                <table className="w-full text-left border-collapse print-table text-[10px]">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500">
                      <th className="py-2.5 px-3 font-bold uppercase">Member Name</th>
                      <th className="py-2.5 px-3 font-bold uppercase">Type</th>
                      <th className="py-2.5 px-3 font-bold uppercase">Subsystem Department</th>
                      {filteredCompletedSessions.map(s => (
                        <th key={s.id} className="py-2.5 px-3 font-bold uppercase text-center whitespace-nowrap" style={{ minWidth: '80px' }}>
                          {s.date.split('-').slice(1).reverse().join('/')}
                          <span className="block text-[8px] font-normal lowercase">{s.topic.substring(0, 10)}...</span>
                        </th>
                      ))}
                      <th className="py-2.5 px-3 font-bold uppercase text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {/* Active Registered Members */}
                    {activeUsers.map(user => {
                      const stats = getMemberStats(user.uid, filteredCompletedSessions);
                      return (
                        <tr key={user.uid} className="hover:bg-white/5">
                          <td className="py-2.5 px-3 font-bold text-white print-text">{user.displayName || user.email}</td>
                          <td className="py-2.5 px-3 text-slate-400 print-text">Registered</td>
                          <td className="py-2.5 px-3 text-slate-400 print-text font-bold">
                            {user.approvedTeams?.map(id => Object.keys(DEPT_TO_ID).find(key => DEPT_TO_ID[key] === id) || id).join(', ') || 'General'}
                          </td>
                          {filteredCompletedSessions.map(s => {
                            const isPresent = s.attendance && s.attendance[user.uid] === true;
                            
                            return (
                              <td key={s.id} className="py-2.5 px-3 text-center">
                                {isPresent ? (
                                  <span className="text-emerald-400 font-bold">P</span>
                                ) : (
                                  <span className="text-red-400 font-bold">A</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-black text-primary print-text">{stats.percentage}%</td>
                        </tr>
                      );
                    })}

                    {/* Manual External Attendees */}
                    {externalMembers.map(name => {
                      let attended = 0;
                      let expectedCount = 0;
                      filteredCompletedSessions.forEach(s => {
                        const isPresent = s.externalAttendance && s.externalAttendance.includes(name);
                        if (isPresent) attended++;
                        expectedCount++;
                      });
                      const percentage = expectedCount > 0 ? Math.round((attended / expectedCount) * 100) : 100;

                      return (
                        <tr key={name} className="hover:bg-white/5">
                          <td className="py-2.5 px-3 font-bold text-emerald-300 print-text">{name}</td>
                          <td className="py-2.5 px-3 text-slate-400 print-text">External / Manual</td>
                          <td className="py-2.5 px-3 text-slate-500 print-text">Unassigned</td>
                          {filteredCompletedSessions.map(s => {
                            const isPresent = s.externalAttendance && s.externalAttendance.includes(name);
                            return (
                              <td key={s.id} className="py-2.5 px-3 text-center">
                                {isPresent ? (
                                  <span className="text-emerald-400 font-bold">P</span>
                                ) : (
                                  <span className="text-red-400 font-bold">A</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-right font-black text-primary print-text">{percentage}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>

    </div>
  );
}

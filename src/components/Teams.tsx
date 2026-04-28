import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUsers } from '../services/userService';
import { subscribeToTasks, createTask, updateTask, deleteTask, saveTaskUpdate } from '../services/taskService';
import { logUserActivity } from '../services/logService';
import { Task, TaskStatus, TaskPriority, UserProfile } from '../types';
import AIIntelligencePanel from './AIIntelligencePanel';
import { Plus, Search, Clock, Trash2, Link, UserPlus, ChevronDown, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_SUBSYSTEMS } from '../constants';
import TaskTable from './TaskTable';
import { resolveNameFromEmail } from '../utils/userUtils';

export default function Teams() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [progressTask, setProgressTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [viewMode, setViewMode] = useState<'LIST' | 'TABLE'>('TABLE');
  const [newTask, setNewTask] = useState({
    title: '', description: '', priority: 'MEDIUM' as TaskPriority,
    status: 'PENDING' as TaskStatus, assignedTo: '', assignedToId: '',
    deadline: '', dependencies: [] as string[],
    workstream: 'R&D' as any, taskType: 'REPORT' as 'REPORT' | 'MANUFACTURING', startDate: new Date().toISOString().split('T')[0],
    requirements: '',
  });
  const [dailyLog, setDailyLog] = useState({
    event: 'SEVC',
    attendance: 'Present' as any,
    todayProgress: '',
    nextAction: '',
    resourcesNeeded: '',
    remarks: '',
    status: 'IN_PROGRESS' as TaskStatus,
    progressPercent: 0
  });
  const [showDailyLogPrompt, setShowDailyLogPrompt] = useState(false);

  // Set default subsystem based on role
  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'CAPTAIN') {
      setSelectedSubsystem(DEFAULT_SUBSYSTEMS[0].id);
    } else {
      setSelectedSubsystem(profile.approvedTeams?.[0] || DEFAULT_SUBSYSTEMS[0].id);
    }
  }, [profile]);

  useEffect(() => {
    if (!selectedSubsystem) return;
    return subscribeToTasks(selectedSubsystem, setTasks);
  }, [selectedSubsystem]);

  const isBeforeJune = new Date().getMonth() < 5; // 0-4 is Jan-May

  // Load team members for assignment
  useEffect(() => {
    if (!selectedSubsystem || !profile) return;
    return subscribeToUsers(allMembers => {
      if (profile.role === 'CAPTAIN') {
        setMembers(allMembers);
      } else {
        setMembers(allMembers.filter(m => m.approvedTeams?.includes(selectedSubsystem)));
      }
    });
  }, [selectedSubsystem, profile]);

  const canManage = profile?.role === 'CAPTAIN' || profile?.role === 'TEAM_LEAD';
  
  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.assignedTo || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const visibleSubsystems = profile?.role === 'CAPTAIN'
    ? DEFAULT_SUBSYSTEMS
    : DEFAULT_SUBSYSTEMS.filter(s => profile?.approvedTeams?.includes(s.id));

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedSubsystem) return;
    setSaving(true);
    try {
      await createTask({
        ...newTask,
        subsystem: selectedSubsystem,
        createdBy: profile.uid,
        createdByName: profile.displayName,
        progressPercent: 0,
        delayProbability: 0,
        aiSuggestions: '',
      });
      await logUserActivity(profile.uid, 'CREATE_TASK', { title: newTask.title, subsystem: selectedSubsystem });
      setNewTask({ title: '', description: '', priority: 'MEDIUM', status: 'PENDING', assignedTo: '', assignedToId: '', deadline: '', dependencies: [], workstream: 'R&D', taskType: 'REPORT', startDate: new Date().toISOString().split('T')[0], requirements: '' });
      setIsAddingTask(false);
      setShowDailyLogPrompt(true);
      setTimeout(() => setShowDailyLogPrompt(false), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleProgressSave = async () => {
    if (!progressTask || !profile) return;
    setSaving(true);
    try {
      const updates: Partial<Task> = { 
        progressPercent: dailyLog.progressPercent, 
        status: dailyLog.status, 
        remarks: dailyLog.remarks,
        todayProgress: dailyLog.todayProgress,
        nextAction: dailyLog.nextAction,
        resourcesNeeded: dailyLog.resourcesNeeded,
        attendance: dailyLog.attendance,
        event: dailyLog.event
      };
      
      await updateTask(progressTask.id, updates, progressTask);
      await saveTaskUpdate({
        taskId: progressTask.id,
        userId: profile.uid,
        userName: profile.displayName || resolveNameFromEmail(profile.email),
        userEmail: profile.email, // Add email for better resolution
        progressPercent: dailyLog.progressPercent,
        attendance: dailyLog.attendance,
        todayProgress: dailyLog.todayProgress,
        nextAction: dailyLog.nextAction,
        resourcesNeeded: dailyLog.resourcesNeeded,
        event: dailyLog.event,
        remarks: dailyLog.remarks,
        createdAt: null,
      });
      
      const { updatePerformanceMetric } = await import('../services/analyticsService');
      await updatePerformanceMetric(progressTask.subsystem, dailyLog.progressPercent, dailyLog.progressPercent < 50 ? 30 : 10);
      await logUserActivity(profile.uid, 'UPDATE_PROGRESS', { taskId: progressTask.id, progress: dailyLog.progressPercent });
      
      setProgressTask(null);
      setDailyLog({
        event: 'SEVC',
        attendance: 'Present',
        todayProgress: '',
        nextAction: '',
        resourcesNeeded: '',
        remarks: '',
        status: 'IN_PROGRESS',
        progressPercent: 0
      });
    } finally {
      setSaving(false);
    }
  };

  const priorityColors: Record<TaskPriority, string> = {
    CRITICAL: 'bg-red-500 text-white',
    HIGH: 'bg-orange-500 text-white',
    MEDIUM: 'bg-yellow-500 text-black',
    LOW: 'bg-slate-700 text-white',
  };
  const statusColors: Record<TaskStatus, string> = {
    COMPLETED: 'bg-emerald-500/20 text-emerald-400',
    BLOCKED: 'bg-red-500/20 text-red-400',
    IN_PROGRESS: 'bg-primary/20 text-primary',
    PENDING: 'bg-white/5 text-slate-400',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">Engineering Teams</h1>
          <p className="text-slate-500 text-sm mt-1">Task management • Progress tracking • Dependencies</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mr-2">
              <button onClick={() => setViewMode('LIST')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${viewMode === 'LIST' ? 'bg-primary text-black' : 'text-slate-400'}`}>LIST</button>
              <button onClick={() => setViewMode('TABLE')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${viewMode === 'TABLE' ? 'bg-primary text-black' : 'text-slate-400'}`}>TABLE</button>
            </div>
            <button onClick={() => setIsAddingTask(true)}
              className="bg-primary text-black font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all">
              <Plus size={18} /> Create Task
            </button>
          </div>
        )}
      </div>

      {showDailyLogPrompt && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          className="bg-emerald-500 text-black px-4 py-3 rounded-xl font-black text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>TASK CREATED! DON'T FORGET TO UPDATE YOUR DAILY LOG TO KEEP THE HEATMAP ACTIVE.</span>
          </div>
        </motion.div>
      )}

      {/* Subsystem Selector */}
      {visibleSubsystems.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {visibleSubsystems.map(sub => (
            <button key={sub.id} onClick={() => setSelectedSubsystem(sub.id)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                selectedSubsystem === sub.id ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}>
              {sub.name}
            </button>
          ))}
        </div>
      )}
      
      <AIIntelligencePanel 
        type="TASKS" 
        data={tasks} 
        subsystem={DEFAULT_SUBSYSTEMS.find(s => s.id === selectedSubsystem)?.name || selectedSubsystem}
        members={members}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
        <input type="text" placeholder="Search tasks or members..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-primary outline-none text-sm" />
      </div>

      {/* Task Content */}
      <div className="space-y-3 pb-20">
        {viewMode === 'TABLE' ? (
          <TaskTable 
            tasks={filteredTasks} 
            onUpdateProgress={(task) => { 
              setProgressTask(task); 
              setDailyLog({
                event: task.event || 'SEVC',
                attendance: task.attendance || 'Present',
                todayProgress: task.todayProgress || '',
                nextAction: task.nextAction || '',
                resourcesNeeded: task.resourcesNeeded || '',
                remarks: task.remarks || '',
                status: task.status,
                progressPercent: task.progressPercent || 0
              });
            }}
            onDeleteTask={(taskId) => {
              if (window.confirm('Delete this task?')) {
                deleteTask(taskId, selectedSubsystem);
              }
            }}
            canManage={canManage}
          />
        ) : (
          filteredTasks.length === 0 ? (
            <div className="py-20 text-center text-slate-600 text-sm italic">
              No tasks in {DEFAULT_SUBSYSTEMS.find(s => s.id === selectedSubsystem)?.name || selectedSubsystem}
            </div>
          ) : filteredTasks.map(task => (
            <motion.div key={task.id} layout
              className={`glass-panel p-5 rounded-2xl border ${task.status === 'COMPLETED' ? 'border-emerald-500/20' : task.status === 'BLOCKED' ? 'border-red-500/20' : 'border-white/5'} hover:border-white/10 transition-all`}>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${priorityColors[task.priority]}`}>{task.priority}</span>
                    <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${statusColors[task.status]}`}>{task.status.replace('_', ' ')}</span>
                    <span className="px-2 py-0.5 text-[8px] font-black rounded-full uppercase bg-white/5 text-slate-500">{task.workstream || 'R&D'}</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{task.title}</h3>
                  {task.description && <p className="text-slate-400 text-sm leading-relaxed">{task.description}</p>}
                  <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-500 uppercase">
                    {task.deadline && <span className="flex items-center gap-1"><Clock size={10} /> Due {new Date(task.deadline).toLocaleDateString()}</span>}
                    <span className={`flex items-center gap-1 ${
                      (!task.assignedTo || task.assignedTo.trim() === '' || task.assignedTo === 'Engineer') && !task.assignedToId
                        ? 'text-slate-600 italic' : 'text-slate-400'
                    }`}>
                      <UserPlus size={10} />
                      {(task.assignedTo && task.assignedTo.trim() !== '' && task.assignedTo !== 'Engineer')
                        ? task.assignedTo
                        : task.assignedToId
                          ? resolveNameFromEmail(task.assignedToId)
                          : 'Unassigned'}
                    </span>
                  </div>
                </div>

                <div className="w-full lg:w-64 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500">
                      <span>Progress</span><span className="text-primary">{task.progressPercent || 0}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div animate={{ width: `${task.progressPercent || 0}%` }}
                        className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { 
                      setProgressTask(task); 
                      setDailyLog({
                        event: task.event || 'SEVC',
                        attendance: task.attendance || 'Present',
                        todayProgress: task.todayProgress || '',
                        nextAction: task.nextAction || '',
                        resourcesNeeded: task.resourcesNeeded || '',
                        remarks: task.remarks || '',
                        status: task.status,
                        progressPercent: task.progressPercent || 0
                      });
                    }}
                      className="flex-1 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-all">
                      Update Progress
                    </button>
                    {canManage && (
                      <button onClick={() => window.confirm('Delete this task?') && deleteTask(task.id, selectedSubsystem)}
                        className="p-2 text-slate-600 hover:text-red-400 transition-colors bg-white/5 rounded-xl">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Task Modal */}
      <AnimatePresence>
        {isAddingTask && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
              <h2 className="text-lg font-black mb-5 flex items-center gap-2">
                <Plus className="text-primary" size={20} />
                Create Task — {DEFAULT_SUBSYSTEMS.find(s => s.id === selectedSubsystem)?.name}
              </h2>
              <form onSubmit={handleCreateTask} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Title *</label>
                  <input required value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="Task title..." className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Description</label>
                  <textarea rows={3} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder="Describe the task..." className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all resize-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Initial Requirements</label>
                  <textarea rows={2} value={newTask.requirements} onChange={e => setNewTask({ ...newTask, requirements: e.target.value })}
                    placeholder="Hardware/Software needs..." className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Task Type</label>
                    <select value={newTask.taskType} onChange={e => setNewTask({ ...newTask, taskType: e.target.value as 'REPORT' | 'MANUFACTURING' })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary">
                      <option value="REPORT">Report Phase (Doc, Design)</option>
                      <option value="MANUFACTURING">Manufacturing (Build, Weld)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Workstream</label>
                    <select value={newTask.workstream} onChange={e => setNewTask({ ...newTask, workstream: e.target.value as any })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary">
                      <option value="R&D">R&D</option>
                      <option value="Hardware">Hardware</option>
                      <option value="Software">Software</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Priority</label>
                    <select value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Start Date</label>
                    <input type="date" value={newTask.startDate} onChange={e => setNewTask({ ...newTask, startDate: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase text-slate-500">Deadline *</label>
                    <input type="date" required value={newTask.deadline} onChange={e => setNewTask({ ...newTask, deadline: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Assign Member</label>
                  <select value={newTask.assignedToId}
                    onChange={e => {
                      const m = members.find(m => m.uid === e.target.value);
                      // Resolve name: use displayName, fallback to email map, fallback to email prefix
                      const resolvedName = m
                        ? (m.displayName && m.displayName.trim() !== '' && m.displayName !== 'Engineer'
                            ? m.displayName
                            : resolveNameFromEmail(m.email))
                        : '';
                      setNewTask({ ...newTask, assignedToId: e.target.value, assignedTo: resolvedName });
                    }}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-primary">
                    <option value="">— Unassigned —</option>
                    {members.map(m => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName || resolveNameFromEmail(m.email)} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Constraints removed as requested by user */}


                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsAddingTask(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 font-bold rounded-xl transition-all">Cancel</button>
                  <button type="submit" 
                    disabled={
                      saving || 
                      (newTask.taskType === 'MANUFACTURING' && isBeforeJune)
                    } 
                    className="flex-1 py-3 bg-primary text-black font-bold rounded-xl shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {saving ? <Loader size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    {saving ? 'Creating...' : 'Create Task'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Progress Update Modal (Excel-like) */}
      <AnimatePresence>
        {progressTask && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-slate-900 border border-primary/20 p-8 rounded-[2.5rem] w-full max-w-4xl shadow-[0_0_50px_rgba(255,51,51,0.15)] max-h-[90vh] overflow-y-auto custom-scrollbar">
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black text-white flex items-center gap-3">
                    <div className="w-2 h-8 bg-primary rounded-full" />
                    DAILY PROGRESS LOG
                  </h2>
                  <p className="text-slate-500 text-sm mt-1 uppercase font-bold tracking-widest">{progressTask.title}</p>
                </div>
                <button onClick={() => setProgressTask(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <Plus className="rotate-45 text-slate-500" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Metadata */}
                <div className="space-y-6 md:col-span-1">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Event / Milestone</label>
                    <select value={dailyLog.event} onChange={e => setDailyLog({...dailyLog, event: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm font-bold">
                      <option value="SEVC">SEVC</option>
                      <option value="TESTING">Testing Phase</option>
                      <option value="ASSEMBLY">Assembly</option>
                      <option value="DESIGN">Design Review</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Attendance Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Present', 'Work from home', 'Absent', 'On Duty'].map(status => (
                        <button key={status} onClick={() => setDailyLog({...dailyLog, attendance: status as any})}
                          className={`py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                            dailyLog.attendance === status ? 'bg-primary border-primary text-black' : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10'
                          }`}>
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Mission Status</label>
                    <select value={dailyLog.status} onChange={e => setDailyLog({...dailyLog, status: e.target.value as TaskStatus})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm font-bold">
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="BLOCKED">Blocked</option>
                      <option value="PENDING">Pending</option>
                    </select>
                  </div>

                  <div className={`space-y-4 pt-4 border-t border-white/5 ${!canManage ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase">
                      <span>Completion Percentage</span>
                      <span className="text-primary">{dailyLog.progressPercent}%</span>
                    </div>
                    {canManage ? (
                      <>
                        <input type="range" min="0" max="100" step="5" value={dailyLog.progressPercent}
                          onChange={e => setDailyLog({...dailyLog, progressPercent: Number(e.target.value)})}
                          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary" />
                        <div className="grid grid-cols-5 gap-1">
                          {[0, 25, 50, 75, 100].map(v => (
                            <button key={v} onClick={() => setDailyLog({...dailyLog, progressPercent: v})}
                              className={`py-1.5 rounded-lg text-[8px] font-black transition-all ${dailyLog.progressPercent === v ? 'bg-primary text-black' : 'bg-white/5 text-slate-500'}`}>
                              {v}%
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] text-primary italic font-bold">Only Team Leads can adjust progress percentage.</p>
                    )}
                  </div>
                </div>

                {/* Right Column: Content */}
                <div className="md:col-span-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Today's Progress (Achievements)</label>
                      <textarea rows={4} value={dailyLog.todayProgress} onChange={e => setDailyLog({...dailyLog, todayProgress: e.target.value})}
                        placeholder="Detail what was accomplished today..."
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-primary text-sm resize-none scrollbar-hide" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Next Action (Strategic Plan)</label>
                      <textarea rows={4} value={dailyLog.nextAction} onChange={e => setDailyLog({...dailyLog, nextAction: e.target.value})}
                        placeholder="What is the next critical step?"
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-primary text-sm resize-none scrollbar-hide" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Resources Needed / Blockers</label>
                      <textarea rows={3} value={dailyLog.resourcesNeeded} onChange={e => setDailyLog({...dailyLog, resourcesNeeded: e.target.value})}
                        placeholder="Hardware, software, or guidance required..."
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-primary text-sm resize-none scrollbar-hide" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Additional Remarks</label>
                      <textarea rows={3} value={dailyLog.remarks} onChange={e => setDailyLog({...dailyLog, remarks: e.target.value})}
                        placeholder="Any other observations or notes..."
                        className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-[1.5rem] outline-none focus:ring-2 focus:ring-primary text-sm resize-none scrollbar-hide" />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button onClick={() => setProgressTask(null)}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-400 font-black uppercase tracking-widest text-xs rounded-2xl transition-all">
                      Discard Changes
                    </button>
                    <button onClick={handleProgressSave} disabled={saving}
                      className="flex-[2] py-4 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 disabled:opacity-60 flex items-center justify-center gap-3">
                      {saving ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                      {saving ? 'Synchronizing...' : 'Finalize Daily Log'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

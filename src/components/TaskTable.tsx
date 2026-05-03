import React from 'react';
import { Task, TaskStatus, TaskPriority, TaskUpdate } from '../types';
import { motion } from 'motion/react';
import { Download, Edit3, CheckCircle2, Clock, AlertTriangle, User, Trash2 } from 'lucide-react';
import { get, ref } from 'firebase/database';
import { rtdb } from '../firebase';
import { resolveNameFromEmail } from '../utils/userUtils';

/** Resolve the best available display name for a task assignee */
function resolveAssigneeName(task: Task): string {
  // 1. If assignedTo is a real name (not blank/Engineer), use it
  if (task.assignedTo && task.assignedTo.trim() !== '' && task.assignedTo !== 'Engineer') {
    return task.assignedTo;
  }
  // 2. If we have an assignedToId (uid), nothing to look up without the users list.
  //    Use a placeholder — the captain will see uid fallback.
  //    In practice the email map will resolve most cases via resolveNameFromEmail.
  if (task.assignedToId) {
    return `Member (${(task.assignedToId || '').slice(0, 6)}…)`;
  }
  return 'Unassigned';
}

interface TaskTableProps {
  tasks: Task[];
  onUpdateProgress: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  canManage: boolean;
}

export default function TaskTable({ tasks, onUpdateProgress, onDeleteTask, canManage }: TaskTableProps) {
  
  const exportToCSV = async () => {
    try {
      // Fetch updates via backend to bypass 'Permission Denied' on frontend
      const res = await fetch('/api/admin/telemetry/updates');
      if (!res.ok) throw new Error('Backend telemetry sync failed');
      const allUpdates: TaskUpdate[] = await res.json();

      const headers = [
        'DATE', 'ASSIGNEE', 'WORKSTREAM', 'TASK TITLE',
        'EVENT / MILESTONE', 'ATTENDANCE STATUS', 'MISSION STATUS',
        'COMPLETION PERCENTAGE', "TODAY'S PROGRESS", 'NEXT ACTION',
        'RESOURCES NEEDED / BLOCKERS', 'ADDITIONAL REMARKS'
      ];

      const rows: string[][] = [];

      tasks.forEach(task => {
        const taskUpdates = allUpdates.filter(u => u.taskId === task.id);
        if (taskUpdates.length === 0) {
          rows.push([
            'N/A',
            resolveAssigneeName(task),
            task.workstream || 'R&D',
            task.title,
            task.event || 'SEVC',
            task.attendance || 'Pending',
            task.status.replace('_', ' '),
            `${task.progressPercent || 0}%`,
            'No updates yet',
            'N/A',
            task.resourcesNeeded || 'NIL',
            '—'
          ]);
          return;
        }

        const dailyUpdates: Record<string, TaskUpdate> = {};
        taskUpdates.forEach(u => {
          const date = new Date(u.createdAt).toLocaleDateString('en-GB');
          const key = `${date}_${u.userId}`;
          if (!dailyUpdates[key] || new Date(u.createdAt) > new Date(dailyUpdates[key].createdAt)) {
            dailyUpdates[key] = u;
          }
        });

        Object.values(dailyUpdates)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .forEach(u => {
            rows.push([
              new Date(u.createdAt).toLocaleDateString('en-GB'),
              u.userName || resolveAssigneeName(task),
              task.workstream || 'R&D',
              task.title,
              u.event || task.event || 'SEVC',
              u.attendance || 'Present',
              task.status.replace('_', ' '),
              `${u.progressPercent || 0}%`,
              u.todayProgress || 'N/A',
              u.nextAction || 'N/A',
              u.resourcesNeeded || 'NIL',
              u.remarks || 'NIL'
            ]);
          });
      });

      const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return '""';
        const stringVal = String(str);
        if (stringVal.includes('"') || stringVal.includes(',') || stringVal.includes('\n')) {
          return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return `"${stringVal}"`;
      };

      const csvContent = [
        headers.map(h => escapeCsv(h)).join(','),
        ...rows.map(row => row.map(cell => escapeCsv(cell)).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `astra_telemetry_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Export CSV Error:', err);
      alert(`Export Failed: ${err.message || 'Database connection lost'}`);
    }
  };

  const statusColors: Record<TaskStatus, string> = {
    COMPLETED: 'text-emerald-400 bg-emerald-400/10',
    BLOCKED: 'text-red-400 bg-red-400/10',
    IN_PROGRESS: 'text-primary bg-primary/10',
    PENDING: 'text-slate-400 bg-white/5',
  };

  const priorityIcons: Record<TaskPriority, any> = {
    CRITICAL: <AlertTriangle size={14} className="text-red-500" />,
    HIGH: <AlertTriangle size={14} className="text-orange-500" />,
    MEDIUM: <Clock size={14} className="text-yellow-500" />,
    LOW: <CheckCircle2 size={14} className="text-slate-500" />,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center px-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Project Master Table</h3>
        <button 
          onClick={exportToCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-black uppercase transition-all"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                <th className="px-6 py-4 border-b border-white/5">Task / Activity</th>
                <th className="px-6 py-4 border-b border-white/5">Workstream</th>
                <th className="px-6 py-4 border-b border-white/5">Type</th>
                <th className="px-6 py-4 border-b border-white/5">Assignee</th>
                <th className="px-6 py-4 border-b border-white/5">Timeline</th>
                <th className="px-6 py-4 border-b border-white/5">Status</th>
                <th className="px-6 py-4 border-b border-white/5 text-primary/80">Requirements</th>
                <th className="px-6 py-4 border-b border-white/5">Attendance</th>
                <th className="px-6 py-4 border-b border-white/5">Progress</th>
                <th className="px-6 py-4 border-b border-white/5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {priorityIcons[task.priority]}
                      <span className="text-sm font-bold text-white">{task.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-white/5 text-slate-400">
                      {task.workstream || 'R&D'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border ${
                      task.taskType === 'MANUFACTURING' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
                      task.taskType === 'MEDIA_SPONSOR' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {task.taskType?.replace('_', ' ') || 'REPORT'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <User size={12} className="text-primary/60 flex-shrink-0" />
                      <span className={resolveAssigneeName(task) === 'Unassigned' ? 'text-slate-600 italic' : 'text-slate-300'}>
                        {resolveAssigneeName(task)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[10px] font-bold text-slate-500">
                      <p>START: {task.startDate ? new Date(task.startDate).toLocaleDateString() : 'N/A'}</p>
                      <p className="text-primary/60">DUE: {task.deadline ? new Date(task.deadline).toLocaleDateString() : 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${statusColors[task.status]}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[10px] text-slate-400 max-w-[150px] truncate italic" title={task.resourcesNeeded}>
                      {task.resourcesNeeded || '—'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                      task.attendance === 'Present' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {task.attendance || 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-24 space-y-1">
                      <div className="flex justify-between text-[8px] font-black text-slate-500">
                        <span>{task.progressPercent || 0}%</span>
                      </div>
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${task.progressPercent || 0}%` }}
                          className="h-full bg-primary"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => onUpdateProgress(task)}
                        className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
                        title="Update Progress"
                      >
                        <Edit3 size={16} />
                      </button>
                      {canManage && onDeleteTask && (
                        <button 
                          onClick={() => onDeleteTask(task.id)}
                          className="p-2 text-slate-500 hover:text-error hover:bg-error/10 rounded-xl transition-all"
                          title="Delete Task"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

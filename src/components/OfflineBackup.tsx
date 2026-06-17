import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, Download, Smartphone, Wifi, Terminal, 
  CheckCircle, Search, Filter, AlertTriangle, FileSpreadsheet, 
  FileText, ClipboardList, RefreshCw, Upload, Sparkles 
} from 'lucide-react';

interface BackupData {
  users?: Record<string, any>;
  tasks?: Record<string, any>;
  subsystems?: Record<string, any>;
  posts?: Record<string, any>;
  queries?: Record<string, any>;
  notebooks?: Record<string, any>;
  teamRequests?: Record<string, any>;
  notifications?: Record<string, any>;
  innovation?: Record<string, any>;
  updates?: Record<string, any>;
  rulebook?: Record<string, any>;
  finances?: Record<string, any>;
}

export default function OfflineBackup() {
  const [activeTab, setActiveTab] = useState<'setup' | 'viewer'>('setup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localBackup, setLocalBackup] = useState<BackupData | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  
  // Data Viewer States
  const [viewerTab, setViewerTab] = useState<'tasks' | 'checklist' | 'bom'>('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [subsystemFilter, setSubsystemFilter] = useState('all');
  
  // Load initial backup from localStorage if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem('astra_local_db_backup');
      const time = localStorage.getItem('astra_local_db_backup_time');
      if (stored) {
        setLocalBackup(JSON.parse(stored));
        if (time) setExportedAt(time);
      }
    } catch (e) {
      console.error('Failed to load backup from localStorage', e);
    }
  }, []);

  // Fetch new backup from API
  const handleCreateBackup = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/backup/full');
      if (!res.ok) throw new Error(`Server returned error status ${res.status}`);
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Backup extraction failed.');
      
      const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      localStorage.setItem('astra_local_db_backup', JSON.stringify(result.data));
      localStorage.setItem('astra_local_db_backup_time', timestamp);
      
      setLocalBackup(result.data);
      setExportedAt(timestamp);
      alert('⚡ System backup generated and stored in browser cache successfully!');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to connect to backend server. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Download local backup as JSON file
  const handleDownloadJson = () => {
    if (!localBackup) return;
    const blob = new Blob([JSON.stringify(localBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `astra_rtdb_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Upload/Import a JSON backup file manually
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.tasks || parsed.rulebook || parsed.finances) {
          const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          localStorage.setItem('astra_local_db_backup', JSON.stringify(parsed));
          localStorage.setItem('astra_local_db_backup_time', timestamp);
          setLocalBackup(parsed);
          setExportedAt(timestamp);
          alert('📁 Backup JSON imported successfully!');
        } else {
          alert('Invalid Backup Format. File must contain tasks, rulebook, or finances keys.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Get raw arrays from backup dictionary
  const getTasks = () : any[] => {
    if (!localBackup || !localBackup.tasks) return [];
    return Object.entries(localBackup.tasks).map(([id, val]: [string, any]) => ({ id, ...val }));
  };

  const getChecklist = () : any[] => {
    if (!localBackup || !localBackup.rulebook || !localBackup.rulebook.general) return [];
    const items: any[] = [];
    for (const [teamId, teamItems] of Object.entries(localBackup.rulebook.general)) {
      if (teamItems && typeof teamItems === 'object') {
        for (const [id, val] of Object.entries(teamItems as Record<string, any>)) {
          items.push({ id, teamId, ...val });
        }
      }
    }
    return items;
  };

  const getBOM = () : any[] => {
    if (!localBackup || !localBackup.finances || !localBackup.finances.bom) return [];
    const items: any[] = [];
    for (const [teamName, rows] of Object.entries(localBackup.finances.bom)) {
      if (rows && typeof rows === 'object') {
        for (const [id, val] of Object.entries(rows as Record<string, any>)) {
          items.push({ id, teamName, ...val });
        }
      }
    }
    return items;
  };

  // CSV Exporters
  const exportTasksToCSV = (filteredTasks: any[]) => {
    const headers = ['S.No', 'Title', 'Subsystem', 'Status', 'Priority', 'Assigned To', 'Deadline', 'Progress %', 'Progress Log'];
    const rows = filteredTasks.map((t, i) => [
      i + 1,
      t.title || '',
      t.subsystem || '',
      t.status || 'PENDING',
      t.priority || 'MEDIUM',
      t.assignedTo || '',
      t.deadline || '',
      t.progressPercent || 0,
      t.todayProgress || ''
    ]);
    
    downloadCSV('astra_tasks_export.csv', headers, rows);
  };

  const exportChecklistToCSV = (filteredCheck: any[]) => {
    const headers = ['S.No', 'Title', 'Description', 'Subsystem', 'Completed', 'Verified By', 'Verified At'];
    const rows = filteredCheck.map((item, i) => [
      i + 1,
      item.title || '',
      item.description || '',
      item.teamId || '',
      item.checked ? 'YES' : 'NO',
      item.checkedBy || '',
      item.checkedAt || ''
    ]);
    
    downloadCSV('astra_checklist_export.csv', headers, rows);
  };

  const exportBOMToCSV = (filteredBOM: any[]) => {
    const headers = ['S.No', 'Part Category', 'Part Name', 'Vendor', 'Type', 'Cost (₹)', 'Date Added', 'Remarks'];
    const rows = filteredBOM.map((r, i) => [
      r.sno || (i + 1),
      r.category || r.teamName || '',
      r.partName || '',
      r.vendor || '',
      r.type || 'Purchased',
      r.totalMaterialCost || 0,
      r.date || '',
      r.remarks || ''
    ]);
    
    downloadCSV('astra_bom_export.csv', headers, rows);
  };

  const downloadCSV = (filename: string, headers: string[], rows: any[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  // PDF Exporters via dynamic print windows
  const printTasksPDF = (filteredTasks: any[]) => {
    const html = `
      <html>
      <head>
        <title>ASTRA Tasks Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          h1 { text-align: center; text-transform: uppercase; font-size: 16px; margin-bottom: 5px; color: #1e293b; }
          p.meta { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; color: #334155; font-size: 9px; text-transform: uppercase; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .badge { padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: bold; text-transform: uppercase; }
          .status-COMPLETED { background-color: #dcfce7; color: #15803d; }
          .status-IN_PROGRESS { background-color: #dbeafe; color: #1d4ed8; }
          .status-PENDING { background-color: #fef9c3; color: #a16207; }
          .status-BLOCKED { background-color: #fee2e2; color: #b91c1c; }
        </style>
      </head>
      <body>
        <h1>Astra Solar Vehicle — Task Telemetry Report</h1>
        <p class="meta">Exported offline on: ${new Date().toLocaleDateString('en-IN')} | Total Records: ${filteredTasks.length}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 5%">S.No</th>
              <th style="width: 25%">Task Title</th>
              <th style="width: 12%">Subsystem</th>
              <th style="width: 10%">Status</th>
              <th style="width: 8%">Priority</th>
              <th style="width: 15%">Assigned To</th>
              <th style="width: 10%">Deadline</th>
              <th style="width: 15%">Remarks / Log</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTasks.map((t, i) => `
              <tr>
                <td style="text-align: center;">${i + 1}</td>
                <td><strong>${t.title}</strong></td>
                <td>${t.subsystem.toUpperCase()}</td>
                <td><span class="badge status-${t.status}">${t.status}</span></td>
                <td>${t.priority}</td>
                <td>${t.assignedTo || 'Unassigned'}</td>
                <td>${t.deadline}</td>
                <td>${t.todayProgress || t.description || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    openPrintWindow(html);
  };

  const printChecklistPDF = (filteredCheck: any[]) => {
    const html = `
      <html>
      <head>
        <title>ASTRA Standards Checklist Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          h1 { text-align: center; text-transform: uppercase; font-size: 16px; margin-bottom: 5px; color: #1e293b; }
          p.meta { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; color: #334155; font-size: 9px; text-transform: uppercase; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .check-box { font-size: 14px; text-align: center; }
          .checked { color: #16a34a; font-weight: bold; }
          .unchecked { color: #dc2626; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Astra Solar Vehicle — Rulebook & Standards Compliance</h1>
        <p class="meta">Exported offline on: ${new Date().toLocaleDateString('en-IN')} | Total Standards: ${filteredCheck.length}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 5%">S.No</th>
              <th style="width: 12%">Subsystem</th>
              <th style="width: 35%">Compliance Standard</th>
              <th style="width: 25%">Reference / Description</th>
              <th style="width: 8%; text-align: center;">Verified</th>
              <th style="width: 15%">Verified By</th>
            </tr>
          </thead>
          <tbody>
            ${filteredCheck.map((item, i) => `
              <tr>
                <td style="text-align: center;">${i + 1}</td>
                <td><strong>${item.teamId.toUpperCase()}</strong></td>
                <td>${item.title}</td>
                <td>${item.description || ''}</td>
                <td class="check-box ${item.checked ? 'checked' : 'unchecked'}">${item.checked ? '✓' : '✗'}</td>
                <td>${item.checked ? item.checkedBy || 'System' : 'Pending'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    openPrintWindow(html);
  };

  const printBOMPDF = (filteredBOM: any[]) => {
    const total = filteredBOM.reduce((sum, r) => sum + (Number(r.totalMaterialCost) || 0), 0);
    const html = `
      <html>
      <head>
        <title>ASTRA Bill of Materials Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; font-size: 11px; }
          h1 { text-align: center; text-transform: uppercase; font-size: 16px; margin-bottom: 5px; color: #1e293b; }
          p.meta { text-align: center; font-size: 10px; color: #64748b; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          th { background-color: #f1f5f9; font-weight: bold; color: #334155; font-size: 9px; text-transform: uppercase; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .total-row { font-weight: bold; background-color: #e2e8f0 !important; }
        </style>
      </head>
      <body>
        <h1>Astra Solar Vehicle — Bill of Materials (BOM)</h1>
        <p class="meta">Exported offline on: ${new Date().toLocaleDateString('en-IN')} | Total Parts: ${filteredBOM.length}</p>
        <table>
          <thead>
            <tr>
              <th style="width: 8%">S.No</th>
              <th style="width: 15%">Category</th>
              <th style="width: 30%">Part Name</th>
              <th style="width: 15%">Vendor</th>
              <th style="width: 10%">Type</th>
              <th style="width: 12%; text-align: right;">Cost (₹)</th>
              <th style="width: 10%">Date</th>
            </tr>
          </thead>
          <tbody>
            ${filteredBOM.map((r, i) => `
              <tr>
                <td style="text-align: center;">${r.sno || (i + 1)}</td>
                <td>${(r.category || r.teamName || '').toUpperCase()}</td>
                <td><strong>${r.partName}</strong></td>
                <td>${r.vendor || ''}</td>
                <td>${r.type || 'Purchased'}</td>
                <td style="text-align: right;">₹${Number(r.totalMaterialCost || 0).toLocaleString('en-IN')}</td>
                <td>${r.date || ''}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="5" style="text-align: right; text-transform: uppercase;">Total vehicle materials cost</td>
              <td style="text-align: right;">₹${total.toLocaleString('en-IN')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;
    openPrintWindow(html);
  };

  const openPrintWindow = (html: string) => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 400);
    }
  };

  // Filter tasks based on query/selectors
  const filteredTasks = getTasks().filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.assignedTo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.subsystem?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesSubsystem = subsystemFilter === 'all' || t.subsystem?.toLowerCase() === subsystemFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesSubsystem;
  });

  // Filter checklist based on query/subsystem
  const filteredChecklist = getChecklist().filter(item => {
    const matchesSearch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubsystem = subsystemFilter === 'all' || item.teamId?.toLowerCase() === subsystemFilter.toLowerCase();
    return matchesSearch && matchesSubsystem;
  });

  // Filter BOM based on query/subsystem
  const filteredBOM = getBOM().filter(r => {
    const cat = r.category || r.teamName || '';
    const matchesSearch = r.partName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.vendor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          cat.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubsystem = subsystemFilter === 'all' || cat.toLowerCase() === subsystemFilter.toLowerCase();
    return matchesSearch && matchesSubsystem;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Database className="text-primary" size={28} />
            </div>
            Offline Sync & Backup
          </h1>
          <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">
            Export Web Database & Sync to Mobile Devices
          </p>
        </div>

        {/* Global Statistics Panel */}
        {localBackup && (
          <div className="flex items-center gap-4">
            <div className="glass-panel px-4 py-3 rounded-2xl border border-white/5 text-center min-w-[90px]">
              <p className="text-xl font-black text-primary">{getTasks().length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Tasks</p>
            </div>
            <div className="glass-panel px-4 py-3 rounded-2xl border border-white/5 text-center min-w-[90px]">
              <p className="text-xl font-black text-emerald-400">{getChecklist().length}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Standards</p>
            </div>
            <div className="glass-panel px-4 py-3 rounded-2xl border border-white/5 text-center min-w-[90px]">
              <p className="text-lg font-black text-amber-400">₹{(getBOM().reduce((sum, r) => sum + (Number(r.totalMaterialCost) || 0), 0) / 1000).toFixed(1)}k</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">BOM Cost</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5 w-fit">
        <button
          onClick={() => { setActiveTab('setup'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
            activeTab === 'setup' ? 'bg-primary text-black shadow-lg shadow-primary/10' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Smartphone size={14} /> 1. CONNECTION SETUP
        </button>
        <button
          onClick={() => { setActiveTab('viewer'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
            activeTab === 'viewer' ? 'bg-primary text-black shadow-lg shadow-primary/10' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database size={14} /> 2. OFFLINE DATA BROWSER
        </button>
      </div>

      <AnimatePresence mode="wait">
        
        {/* TAB 1: CONNECTION & BACKUP GENERATOR */}
        {activeTab === 'setup' && (
          <motion.div
            key="setup-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 text-left"
          >
            
            {/* Action Card: Extract / Sync Backup */}
            <div className="glass-panel rounded-[2rem] border border-primary/20 bg-primary/5 p-8 relative overflow-hidden shadow-2xl">
              <div className="absolute right-0 top-0 translate-x-1/3 -translate-y-1/3 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
              <div className="max-w-xl space-y-4 relative">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles size={18} />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]">Extract Live Backup</span>
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">Extract Cloud RTDB Backup</h2>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Extract a full database snapshot containing tasks, rulebook checklists, member details, and Bill of Materials (BOM) financial parameters to browse locally or load on your old phone browser.
                </p>

                <div className="flex flex-wrap gap-4 pt-4">
                  <button
                    onClick={handleCreateBackup}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-primary text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {loading ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Generate System Backup
                  </button>

                  {localBackup && (
                    <>
                      <button
                        onClick={handleDownloadJson}
                        className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 active:scale-95 transition-all"
                      >
                        <Download size={14} />
                        Download JSON File
                      </button>
                      <label className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-dashed border-white/20 text-slate-400 hover:text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer">
                        <Upload size={14} />
                        Import JSON File
                        <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </>
                  )}
                </div>

                {exportedAt && (
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-2">
                    📂 Browser Cached Backup version: <span className="text-slate-300">{exportedAt}</span>
                  </p>
                )}

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ngrok setup step-by-step instructions */}
            <div className="glass-panel rounded-[2rem] border border-white/5 p-8 space-y-6">
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                <Smartphone className="text-primary" size={22} />
                Step-by-Step Setup: Sync Data to Your Old Phone
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                
                {/* Step 1 */}
                <div className="space-y-3 relative p-5 bg-white/[0.02] border border-white/5 rounded-2xl text-left">
                  <div className="absolute top-4 right-4 text-3xl font-black text-primary/10">01</div>
                  <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-xl">
                    <Terminal size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white">Start Server Locally</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Make sure the Astra application server is running on your computer. Open a terminal in the project directory and run:
                  </p>
                  <pre className="bg-black/40 text-[10px] p-2 rounded-lg font-mono text-slate-300">npm run dev</pre>
                  <p className="text-[10px] text-slate-500 font-semibold">This runs the web app client on port <strong>3050</strong> and api backend on port <strong>3001</strong>.</p>
                </div>

                {/* Step 2 */}
                <div className="space-y-3 relative p-5 bg-white/[0.02] border border-white/5 rounded-2xl text-left">
                  <div className="absolute top-4 right-4 text-3xl font-black text-primary/10">02</div>
                  <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-xl">
                    <Wifi size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white">Tunnel via ngrok</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Expose your local development port securely to the internet so your old phone can connect to it. Run ngrok in a separate terminal:
                  </p>
                  <pre className="bg-black/40 text-[10px] p-2 rounded-lg font-mono text-slate-300">ngrok http 3050</pre>
                  <p className="text-[10px] text-slate-500 font-semibold">Copy the generated forwarding URL, which looks like: <code className="text-primary text-[9px]">https://xxxx.ngrok-free.app</code></p>
                </div>

                {/* Step 3 */}
                <div className="space-y-3 relative p-5 bg-white/[0.02] border border-white/5 rounded-2xl text-left">
                  <div className="absolute top-4 right-4 text-3xl font-black text-primary/10">03</div>
                  <div className="p-2.5 bg-primary/10 text-primary w-fit rounded-xl">
                    <Smartphone size={18} />
                  </div>
                  <h3 className="font-bold text-sm text-white">Connect & Back Up</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    On your old phone, open Chrome or Safari and enter the ngrok URL. Log in, then go to the Offline Backup tab and click:
                  </p>
                  <span className="inline-block text-[9px] font-black uppercase bg-primary text-black px-3 py-1.5 rounded-lg">Generate System Backup</span>
                  <p className="text-[10px] text-slate-500 font-semibold">The data is instantly stored in your phone's browser cache. You can now use this page fully offline or download it as JSON!</p>
                </div>

              </div>
            </div>

          </motion.div>
        )}

        {/* TAB 2: OFFLINE DATA BROWSER */}
        {activeTab === 'viewer' && (
          <motion.div
            key="viewer-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6 text-left"
          >
            
            {/* Fallback if no backup loaded */}
            {!localBackup ? (
              <div className="glass-panel p-16 rounded-[2rem] border border-white/5 text-center flex flex-col items-center justify-center space-y-4">
                <Database size={48} className="text-slate-600 animate-pulse" />
                <h3 className="text-lg font-black text-white tracking-tight">No Local Backup Found</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Please generate a backup first in the Connection Setup tab or upload an existing backup JSON file to browse it offline.
                </p>
                <button
                  onClick={() => setActiveTab('setup')}
                  className="px-6 py-2.5 bg-primary text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all"
                >
                  Generate Backup Now
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* Search / Filter bar */}
                <div className="flex flex-wrap gap-4 items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                    <button
                      onClick={() => setViewerTab('tasks')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewerTab === 'tasks' ? 'bg-primary text-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Tasks ({getTasks().length})
                    </button>
                    <button
                      onClick={() => setViewerTab('checklist')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewerTab === 'checklist' ? 'bg-primary text-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Rulebook Check ({getChecklist().length})
                    </button>
                    <button
                      onClick={() => setViewerTab('bom')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        viewerTab === 'bom' ? 'bg-primary text-black' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      BOM & Cost ({getBOM().length})
                    </button>
                  </div>

                  {/* Export Options */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (viewerTab === 'tasks') exportTasksToCSV(filteredTasks);
                        if (viewerTab === 'checklist') exportChecklistToCSV(filteredChecklist);
                        if (viewerTab === 'bom') exportBOMToCSV(filteredBOM);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                      <FileSpreadsheet size={12} />
                      Export Excel
                    </button>
                    <button
                      onClick={() => {
                        if (viewerTab === 'tasks') printTasksPDF(filteredTasks);
                        if (viewerTab === 'checklist') printChecklistPDF(filteredChecklist);
                        if (viewerTab === 'bom') printBOMPDF(filteredBOM);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky-400 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                    >
                      <FileText size={12} />
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search current data..."
                      className="w-full bg-white/5 border border-white/10 px-4 py-2.5 pl-10 rounded-xl text-xs focus:border-primary outline-none transition-colors text-white"
                    />
                  </div>
                  
                  <div>
                    <select
                      value={subsystemFilter}
                      onChange={e => setSubsystemFilter(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs focus:border-primary outline-none transition-colors text-slate-300 cursor-pointer uppercase font-bold tracking-wider"
                    >
                      <option value="all" className="bg-slate-900 text-slate-200">All Subsystems</option>
                      <option value="steering" className="bg-slate-900 text-slate-200">Steering</option>
                      <option value="suspension" className="bg-slate-900 text-slate-200">Suspension</option>
                      <option value="brakes" className="bg-slate-900 text-slate-200">Brakes</option>
                      <option value="transmission" className="bg-slate-900 text-slate-200">Transmission</option>
                      <option value="design" className="bg-slate-900 text-slate-200">Design</option>
                      <option value="electrical" className="bg-slate-900 text-slate-200">Electricals</option>
                      <option value="innovation" className="bg-slate-900 text-slate-200">Innovation</option>
                      <option value="autonomous" className="bg-slate-900 text-slate-200">Autonomous</option>
                      <option value="cost" className="bg-slate-900 text-slate-200">Cost</option>
                      <option value="pro" className="bg-slate-900 text-slate-200">PRO</option>
                    </select>
                  </div>

                  {viewerTab === 'tasks' ? (
                    <div>
                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs focus:border-primary outline-none transition-colors text-slate-300 cursor-pointer uppercase font-bold tracking-wider"
                      >
                        <option value="all" className="bg-slate-900 text-slate-200">All Task Statuses</option>
                        <option value="PENDING" className="bg-slate-900 text-slate-200">Pending</option>
                        <option value="IN_PROGRESS" className="bg-slate-900 text-slate-200">In Progress</option>
                        <option value="COMPLETED" className="bg-slate-900 text-slate-200">Completed</option>
                        <option value="BLOCKED" className="bg-slate-900 text-slate-200">Blocked</option>
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center text-xs text-slate-500 font-bold px-4 border border-white/5 rounded-xl bg-white/[0.01]">
                      Offline Telemetry active.
                    </div>
                  )}
                </div>

                {/* Sub Tab View rendering */}
                <div className="glass-panel rounded-[2rem] border border-white/5 p-6 overflow-hidden">
                  
                  {/* VIEWER TABS: 1. TASKS */}
                  {viewerTab === 'tasks' && (
                    <div className="overflow-x-auto">
                      {filteredTasks.length === 0 ? (
                        <div className="py-20 text-center text-slate-500 text-xs uppercase font-black tracking-widest">
                          No matching tasks found offline.
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white/5 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="px-4 py-3 text-center w-12">S.No</th>
                              <th className="px-4 py-3">Task Title</th>
                              <th className="px-4 py-3">Subsystem</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3">Priority</th>
                              <th className="px-4 py-3">Assigned To</th>
                              <th className="px-4 py-3">Deadline</th>
                              <th className="px-4 py-3">Log Update</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {filteredTasks.map((t, idx) => (
                              <tr key={t.id} className="text-xs text-slate-300 hover:bg-white/[0.01] transition-colors">
                                <td className="px-4 py-3 text-center text-slate-500 font-bold">{idx + 1}</td>
                                <td className="px-4 py-3 font-semibold text-white">{t.title}</td>
                                <td className="px-4 py-3 uppercase font-bold text-primary tracking-wide text-[10px]">{t.subsystem}</td>
                                <td className="px-4 py-3">
                                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    t.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    t.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                    t.status === 'BLOCKED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}>
                                    {t.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-bold text-[10px]">{t.priority}</td>
                                <td className="px-4 py-3">{t.assignedTo || 'Unassigned'}</td>
                                <td className="px-4 py-3 font-bold text-slate-400">{t.deadline}</td>
                                <td className="px-4 py-3 truncate max-w-xs text-slate-400" title={t.todayProgress || t.description}>
                                  {t.todayProgress || t.description || 'No updates logged.'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* VIEWER TABS: 2. CHECKLIST */}
                  {viewerTab === 'checklist' && (
                    <div className="space-y-4">
                      {filteredChecklist.length === 0 ? (
                        <div className="py-20 text-center text-slate-500 text-xs uppercase font-black tracking-widest">
                          No matching checklist items found offline.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredChecklist.map((item, idx) => (
                            <div key={item.id || idx} className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                              item.checked 
                                ? 'bg-emerald-500/5 border-emerald-500/10 text-slate-400' 
                                : 'bg-white/[0.02] border-white/5 text-slate-200'
                            }`}>
                              <div className="mt-0.5">
                                <span className={`flex h-5 w-5 rounded-lg border flex-shrink-0 items-center justify-center font-bold text-xs ${
                                  item.checked 
                                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                                    : 'border-white/20 bg-transparent text-transparent'
                                }`}>
                                  ✓
                                </span>
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <h4 className={`text-sm font-bold truncate ${item.checked ? 'line-through text-slate-500' : 'text-white'}`}>
                                  {item.title}
                                </h4>
                                {item.description && <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>}
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-[9px] font-black uppercase text-primary tracking-wide">
                                    {item.teamId.replace('_', ' ')}
                                  </span>
                                  {item.checked && (
                                    <>
                                      <span className="text-slate-600">•</span>
                                      <span className="text-[9px] font-bold text-emerald-500">
                                        Verified by {item.checkedBy || 'Lead'}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* VIEWER TABS: 3. BOM & COSTS */}
                  {viewerTab === 'bom' && (
                    <div className="overflow-x-auto">
                      {filteredBOM.length === 0 ? (
                        <div className="py-20 text-center text-slate-500 text-xs uppercase font-black tracking-widest">
                          No matching BOM parts found offline.
                        </div>
                      ) : (
                        <div>
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-white/5 text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                <th className="px-4 py-3 text-center w-12">S.No</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3">Part Name</th>
                                <th className="px-4 py-3">Vendor</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3 text-right">Cost (₹)</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {filteredBOM.map((r, idx) => (
                                <tr key={r.id || idx} className="text-xs text-slate-300 hover:bg-white/[0.01] transition-colors">
                                  <td className="px-4 py-3 text-center text-slate-500 font-bold">{r.sno || (idx + 1)}</td>
                                  <td className="px-4 py-3 font-bold text-[10px] uppercase tracking-wide text-primary">{(r.category || r.teamName || '').replace('_', ' ')}</td>
                                  <td className="px-4 py-3 font-semibold text-white">{r.partName}</td>
                                  <td>{r.vendor || 'Unknown'}</td>
                                  <td className="px-4 py-3 uppercase text-[9px] font-bold">{r.type || 'Purchased'}</td>
                                  <td className="px-4 py-3 text-right font-semibold text-white">₹{Number(r.totalMaterialCost || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-4 py-3 text-slate-500 font-bold">{r.date || ''}</td>
                                  <td className="px-4 py-3 text-slate-400 italic text-[11px] truncate max-w-xs">{r.remarks || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-primary/5 font-bold text-sm text-primary">
                                <td colSpan={5} className="px-4 py-4 text-right text-xs uppercase tracking-wider">
                                  Subsystem Filtered Cost Total
                                </td>
                                <td className="px-4 py-4 text-right">
                                  ₹{filteredBOM.reduce((sum, r) => sum + (Number(r.totalMaterialCost) || 0), 0).toLocaleString('en-IN')}
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>
            )}

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

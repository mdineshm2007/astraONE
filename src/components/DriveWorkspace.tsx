import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Cloud, Upload, ExternalLink, FileText, CheckCircle2, AlertCircle, Loader2, IndianRupee, Table2, TrendingUp, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';
import BOMTable from './BOMTable';

export default function DriveWorkspace() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'progress' | 'bills'>('progress');
  const [folders, setFolders] = useState<any>(null);
  const [finances, setFinances] = useState<any>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{id: string, success: boolean, error?: string} | null>(null);
  const [activeBOMTeam, setActiveBOMTeam] = useState<string | null>(null);
  const [costAnalysis, setCostAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [driveConnected, setDriveConnected] = useState<boolean>(false);

  useEffect(() => {
    const foldersRef = ref(rtdb, 'drive_folders');
    const financesRef = ref(rtdb, 'finances');
    const tokensRef = ref(rtdb, `drive_config/tokens`);
    
    const unsubFolders = onValue(foldersRef, (snapshot) => {
      setFolders(snapshot.val());
    });
    
    const unsubFinances = onValue(financesRef, (snapshot) => {
      setFinances(snapshot.val());
    });

    const unsubTokens = onValue(tokensRef, (snapshot) => {
      setDriveConnected(snapshot.exists());
    });
    
    return () => {
      unsubFolders();
      unsubFinances();
      unsubTokens();
    };
  }, [profile?.uid]);

  const handleUpload = async (teamId: string, category: 'progress' | 'bills', file: File) => {
    if (!file) return;
    
    setIsUploading(`${category}_${teamId}`);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('teamId', teamId);
    formData.append('category', category);
    formData.append('uid', profile?.uid || '');

    console.log(`Starting upload for ${category} team ${teamId}...`);
    try {
      // No timeout here — large files need time to upload
      const response = await fetch('/api/drive/upload', {
        method: 'POST',
        body: formData
      });
      console.log(`Upload response received: ${response.status}`);
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed (${response.status}): ${text || 'Server error — check backend logs'}`);
      }

      const result = await response.json();
      if (result.success) {
        setUploadStatus({ id: `${category}_${teamId}`, success: true });
        setTimeout(() => setUploadStatus(null), 3000);
      } else {
        setUploadStatus({ id: `${category}_${teamId}`, success: false, error: result.error });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    } catch (error: any) {
      console.error('Upload failed', error);
      setUploadStatus({ id: `${category}_${teamId}`, success: false, error: error.message });
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setIsUploading(null);
    }
  };

  const handleAIAnalysis = (teamId?: string) => {
    setIsAnalyzing(true);
    try {
      const bom = finances?.bom || {};
      const teams = finances?.teams || {};
      const lines: string[] = [];

      // Loop through all teams (or just the focused one)
      for (const [team, rows] of Object.entries(bom)) {
        if (teamId && team !== teamId) continue;
        if (!rows || typeof rows !== 'object') continue;
        for (const row of Object.values(rows as Record<string, any>)) {
          if (row.partName) {
            lines.push(`• ${row.partName} — ${team}: ₹${Number(row.totalMaterialCost || 0).toLocaleString('en-IN')}`);
          }
        }
      }

      const total = Object.values(teams).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0);

      if (lines.length === 0) {
        setCostAnalysis('No bill items found. Add parts in the BOM table first.');
      } else {
        setCostAnalysis(lines.join('\n') + `\n\nTotal: ₹${total.toLocaleString('en-IN')}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };


  const handleSetupDrive = async () => {
    if (!driveConnected) {
      if (window.confirm('Google Drive is not connected. Connect now to sync?')) {
        handleConnectGoogle();
      }
      return;
    }

    if (!window.confirm('Initialize or Sync Google Drive Folder structure?')) return;
    setIsUploading('setup');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('/api/drive/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile?.email, uid: profile?.uid }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text || 'Unknown Error'}`);
      }

      const result = await response.json();
      if (result.success) {
        alert('Drive Sync Complete!');
      } else {
        if (result.error?.includes('not connected') || result.error?.includes('auth')) {
          if (window.confirm('Drive connection expired or missing. Reconnect now?')) {
            handleConnectGoogle();
          }
        } else {
          alert(`Sync failed: ${result.error || 'Unknown error'}`);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        alert('Sync timed out. The backend server may be unreachable. Make sure the server is running and restart npm run dev.');
      } else {
        alert(`Sync Process Error: ${error.message}`);
      }
    } finally {
      setIsUploading(null);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(`/api/auth/google/url?uid=${profile?.uid}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Auth Error (${res.status}): ${text || 'Unknown Error'}`);
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        alert('Connection timed out. The backend server may be unreachable. Make sure npm run dev is running and try again.');
      } else {
        alert('Failed to get Google Auth URL: ' + e.message);
      }
    }
  };

  const handleDisconnectDrive = async () => {
    if (!window.confirm('Are you sure you want to disconnect this Google account? You will need to reconnect to upload or sync files.')) return;
    try {
      const response = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: profile?.uid })
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server Error (${response.status}): ${text || 'Unknown Error'}`);
      }

      const result = await response.json();
      if (result.success) {
        alert('Google Drive disconnected.');
      } else {
        alert('Failed to disconnect: ' + result.error);
      }
    } catch (error: any) {
      alert('Disconnect Result: ' + error.message);
    }
  };

  const subsystems = [
    "Steering", "Suspension", "Brakes", "Transmission", "Design", 
    "Electricals", "Innovation", "Autonomous", "Cost", "PRO"
  ];

  const billTeams = [
    ...subsystems, "Seat", "Others", "Safety_Equipments", 
    "Dashboard", "Wheel_Tyre", "Frame", "Drive_Train"
  ];

  if (!folders && profile?.role !== 'CAPTAIN') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Cloud size={48} className="mb-4 opacity-20" />
        <p className="uppercase tracking-widest font-black text-sm">Cloud Drive Not Initialized</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black flex items-center gap-3 tracking-tighter">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Cloud className="text-primary" size={28} />
            </div>
            Cloud Infrastructure
          </h1>
          <div className="flex items-center gap-4">
            <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${driveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {driveConnected ? 'Personal Drive Connected' : 'Drive Connection Required'} • {profile?.email}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          {profile?.role === 'CAPTAIN' && (
            <button 
              onClick={handleSetupDrive}
              disabled={isUploading === 'setup'}
              className="glass-panel-elevated bg-white/5 border border-white/10 text-white font-black px-8 py-3 rounded-2xl flex items-center gap-3 hover:bg-primary hover:text-black hover:scale-105 active:scale-95 transition-all disabled:opacity-50 group shadow-lg shadow-primary/5"
            >
              {isUploading === 'setup' ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Cloud className={driveConnected ? "text-emerald-500 group-hover:animate-bounce" : "text-primary"} size={20} />
              )}
              {driveConnected ? 'SYNC DIRECTORY' : 'CONNECT & SYNC DRIVE'}
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-3 p-1.5 bg-white/5 backdrop-blur-xl rounded-[2rem] w-fit border border-white/5">
        <button 
          onClick={() => setActiveTab('progress')}
          className={`px-8 py-3 rounded-[1.5rem] text-xs font-black tracking-widest transition-all duration-500 ${activeTab === 'progress' ? 'bg-primary text-black shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]' : 'text-slate-500 hover:text-white'}`}
        >
          PROGRESS EVIDENCE
        </button>
        <button 
          onClick={() => setActiveTab('bills')}
          className={`px-8 py-3 rounded-[1.5rem] text-xs font-black tracking-widest transition-all duration-500 ${activeTab === 'bills' ? 'bg-primary text-black shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)]' : 'text-slate-500 hover:text-white'}`}
        >
          BILLS & EXPENSES
        </button>
      </div>

      {activeTab === 'bills' && finances && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 rounded-[2rem] border border-primary/20 bg-primary/5 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-6">
            <div className="p-4 bg-primary/20 rounded-2xl">
              <TrendingUp className="text-primary" size={32} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1">Total Project Expenditure</p>
              <h2 className="text-4xl font-black text-white tracking-tighter">
                ₹{(Object.values(finances?.teams || {}).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)).toLocaleString('en-IN')}
              </h2>
            </div>
          </div>
          
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <button 
              onClick={() => handleAIAnalysis()}
              disabled={isAnalyzing}
              className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 justify-center"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} className="text-primary" />}
              AI Financial Analysis
            </button>
            {costAnalysis && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-black/40 rounded-xl border border-primary/20 text-[11px] text-slate-300 max-w-sm italic leading-relaxed relative"
              >
                <button onClick={() => setCostAnalysis(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">×</button>
                {costAnalysis}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.4 }}
          className="pb-24"
        >
          {activeTab === 'progress' ? (
            <div className="glass-panel rounded-[2rem] border border-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Subsystem Directory</span>
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">10 Active Folders</span>
              </div>
              <div className="divide-y divide-white/5">
                {subsystems.map((team) => {
                  const folder = folders?.[`progress/${team}`];
                  const uploadId = `progress_${team}`;
                  
                  return (
                    <div key={team} className="group hover:bg-white/[0.02] transition-colors p-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                          <FileText className="text-primary opacity-50 group-hover:opacity-100" size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white tracking-tight">{team}</h3>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Evidence Repository</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {folder && (
                          <a 
                            href={folder.webViewLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-all"
                            title="Open Drive Folder"
                          >
                            <ExternalLink size={18} />
                          </a>
                        )}
                        <input 
                          type="file"
                          id={`file-${uploadId}`}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(team, 'progress', file);
                          }}
                        />
                        <label 
                          htmlFor={`file-${uploadId}`}
                          className={`px-6 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black cursor-pointer transition-all ${
                            uploadStatus?.id === uploadId ? (uploadStatus.success ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white') :
                            'bg-white/5 border border-white/10 hover:border-primary text-slate-300'
                          }`}
                        >
                          {isUploading === uploadId ? <Loader2 className="animate-spin" size={14} /> : 
                           uploadStatus?.id === uploadId ? (uploadStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />) : 
                           <Upload size={14} />}
                          {isUploading === uploadId ? 'UPLOADING...' : 
                           uploadStatus?.id === uploadId ? (uploadStatus.success ? 'SYNCED' : 'FAILED') : 
                           'UPLOAD PROGRESS'}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {billTeams.map((team) => {
                const folder = folders?.[`bills/${team}`];
                const uploadId = `bills_${team}`;
                
                return (
                  <motion.div 
                    layout
                    key={team}
                    className="glass-panel p-6 rounded-[2rem] border border-white/5 hover:border-primary/30 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary/10 transition-all" />
                    
                    <div className="flex justify-between items-start mb-6 relative">
                      <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-primary/20 transition-colors">
                        <IndianRupee className="text-primary" size={24} />
                      </div>
                      {folder && (
                        <a href={folder.webViewLink} target="_blank" rel="noopener noreferrer" className="p-2.5 bg-white/5 rounded-xl text-slate-500 hover:text-primary hover:scale-110 transition-all">
                          <ExternalLink size={18} />
                        </a>
                      )}
                    </div>
                    
                    <div className="mb-6 flex justify-between items-end">
                      <div>
                        <h3 className="font-black text-xl text-white tracking-tighter mb-1">{team.replace('_', ' ')}</h3>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Financial Intelligence</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Spent</p>
                        <p className="text-sm font-black text-primary">₹{(finances?.teams?.[team] || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* BOM Table Button */}
                      <button
                        onClick={() => setActiveBOMTeam(team)}
                        className="w-full py-4 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black cursor-pointer transition-all bg-primary text-black shadow-lg shadow-primary/20 hover:brightness-110 hover:scale-[1.02] active:scale-95"
                      >
                        <Table2 size={16} />
                        MANAGE BILL OF MATERIALS
                      </button>

                      {/* Upload Bill Receipt */}
                      <div className="relative">
                        <input 
                          type="file"
                          id={`file-${uploadId}`}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(team, 'bills', file);
                          }}
                        />
                        <label 
                          htmlFor={`file-${uploadId}`}
                          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black cursor-pointer transition-all ${
                            uploadStatus?.id === uploadId ? (uploadStatus.success ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-red-500 text-white') :
                            'bg-white/5 border border-white/10 text-slate-400 hover:border-primary/50 hover:text-primary'
                          }`}
                        >
                          {isUploading === uploadId ? <Loader2 className="animate-spin" size={14} /> : 
                           uploadStatus?.id === uploadId ? (uploadStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />) : 
                           <Upload size={14} />}
                          {isUploading === uploadId ? 'UPLOADING...' : 
                           uploadStatus?.id === uploadId ? (uploadStatus.success ? 'RECEIPT SAVED' : uploadStatus.error || 'FAILED') : 
                           'UPLOAD RECEIPT'}
                        </label>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* BOM Table Modal */}
      <AnimatePresence>
        {activeBOMTeam && (
          <BOMTable teamName={activeBOMTeam} onClose={() => setActiveBOMTeam(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

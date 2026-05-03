import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Sparkles, Brain, Zap, TrendingUp, AlertCircle, Loader2, ListTodo, ShieldAlert, Users, Lightbulb, TrendingDown, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { getTeamAnalysis, getTaskInsights } from '../geminiService';
import { buildAstraContext } from '../astraKnowledge';

interface TeamAnalysis {
  priority_tasks: string[];
  at_risk_tasks: string[];
  blocked_members: string[];
  team_efficiency: string;
  recommendations: string[];
  vs_last_year?: string;
  comparison_verdict?: 'BETTER' | 'WORSE' | 'SIMILAR';
  team_summary?: string;
  live_status?: 'on-track' | 'behind' | 'delayed';
}

interface AIIntelligencePanelProps {
  type: 'DASHBOARD' | 'TASKS' | 'NOTES' | 'PERFORMANCE';
  data: any;
  context?: string;
  subsystem?: string;
  members?: { uid: string; displayName: string; role: string; email: string }[];
}

export default function AIIntelligencePanel({ type, data, context, subsystem, members = [] }: AIIntelligencePanelProps) {
  const { profile } = useAuth();
  const [analysis, setAnalysis] = useState<string | TeamAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVsExpanded, setIsVsExpanded] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const fetchAnalysis = async () => {
    if (!data || (Array.isArray(data) && data.length === 0)) return;
    
    setLoading(true);
    setError(null);
    try {
      if (type === 'TASKS' || type === 'PERFORMANCE') {
        // Build member list from passed members prop — fixes "Unknown due to lack of member data"
        const memberNames = members.length > 0
          ? members.map(m => m.displayName || m.email || 'Unknown')
          : ['No member data available'];

        // Calculate efficiency directly from task data
        const taskArr = Array.isArray(data) ? data : [];
        const totalTasks = taskArr.length;
        const completedTasks = taskArr.filter((t: any) => t.status === 'COMPLETED').length;
        const avgProgress = totalTasks > 0
          ? Math.round(taskArr.reduce((s: number, t: any) => s + (t.progressPercent || 0), 0) / totalTasks)
          : 0;
        const computedEfficiency = `${avgProgress}% avg progress (${completedTasks}/${totalTasks} completed)`;

        const analysisData = {
          tasks: taskArr,
          members: memberNames,
          progress: taskArr.map((t: any) => ({ title: t.title, progress: t.progressPercent || 0 })),
          delays: taskArr.filter((t: any) => t.status === 'BLOCKED' || t.priority === 'CRITICAL'),
          subsystem: subsystem || context || 'General',
          computed_efficiency: computedEfficiency,
          last_year_context: buildAstraContext(600), // inject historical knowledge
        };
        
        const result = await getTeamAnalysis(analysisData);
        // If AI didn't compute efficiency, use our local value
        if (!result.team_efficiency || result.team_efficiency.toLowerCase().includes('unknown') || result.team_efficiency.toLowerCase().includes('lack')) {
          result.team_efficiency = computedEfficiency;
        }
        setAnalysis(result);
      } else if (type === 'DASHBOARD') {
        // Dashboard uses high-density task list instead of LLM summary
        setAnalysis({ isTaskList: true });
      } else {
        // Legacy text analysis via direct Groq call (no server needed)
        const { chatAssistant } = await import('../geminiService');
        const prompt = `Analyze this ASTRA engineering data and provide a 2-3 sentence technical summary:\nType: ${type}\nData: ${JSON.stringify(data).slice(0, 2000)}\nContext: ${context || 'General'}`;
        const result = await chatAssistant([{ role: 'user', content: prompt }]);
        setAnalysis(result);
      }
    } catch (err: any) {
      console.error('AI Intelligence Error:', err);
      if (err.status === 401) {
        // Fallback to Simulated Mode for 401 to keep the UI beautiful
        const simulated: TeamAnalysis = {
          priority_tasks: ["Neural Link Sync", "Core Calibration"],
          at_risk_tasks: ["Credential Handshake"],
          blocked_members: ["A.S.T.R.A. System"],
          team_efficiency: "94% (Targeting 100%)",
          recommendations: [
            "CREDENTIALS INVALID: Please update your GROQ_API_KEY in Vercel settings.",
            "Click the Repair Link button to verify your new key."
          ],
          team_summary: "A.S.T.R.A. is currently in simulation mode due to an invalid neural handshake (401).",
          live_status: 'on-track',
          isSimulated: true
        };
        setAnalysis(simulated);
        setError(null); // Clear error so the simulation can be seen
      } else {
        setError(err.detail || err.message || 'AI analysis failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch when data changes (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAnalysis();
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), type, members.length]);

  const testConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/test-key');
      const data = await res.json();
      if (data.ok) {
        alert(`Neural Link Active: ${data.message}\nKey Prefix: ${data.keyPrefix}`);
        fetchAnalysis();
      } else {
        alert(`Authentication Failure: ${data.error}\n\nDetail: ${data.detail || 'The API key provided is rejected by Groq.'}`);
      }
    } catch (err: any) {
      alert(`Network Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isStructured = (a: any): a is TeamAnalysis => {
    return a && typeof a === 'object' && 'priority_tasks' in a;
  };

  const VerdictBadge = ({ verdict }: { verdict?: string }) => {
    if (!verdict) return null;
    const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      BETTER: { color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10', icon: <TrendingUp size={10} />, label: '▲ Better than last year' },
      WORSE:  { color: 'text-red-400 border-red-400/30 bg-red-400/10',             icon: <TrendingDown size={10} />, label: '▼ Below last year' },
      SIMILAR:{ color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',    icon: <Minus size={10} />,        label: '≈ On par with last year' },
    };
    const config = map[verdict] || map.SIMILAR;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${config.color}`}>
        {config.icon} {config.label}
      </span>
    );
  };

  return (
    <div className="glass-panel rounded-2xl border border-primary/20 overflow-hidden bg-primary/5">
      <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-primary/10">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-primary animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-widest text-primary">
            Live ASTRA Intelligence
          </h3>
          {(analysis as any)?.isSimulated && (
            <span className="px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 text-[8px] font-black uppercase tracking-tighter">
              Simulation Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(error || (analysis as any)?.isSimulated) && (
            <button
              onClick={testConnection}
              className="text-[9px] font-black uppercase text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors px-2 py-1 rounded-lg"
            >
              ⚡ Repair Link
            </button>
          )}
          {loading && <Loader2 size={14} className="text-primary animate-spin" />}
          <button
            onClick={fetchAnalysis}
            disabled={loading}
            className="text-[9px] font-black uppercase text-slate-500 hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10 disabled:opacity-40"
          >
            {loading ? 'Analyzing…' : '↻ Refresh'}
          </button>
        </div>
      </div>
      
      <div className="p-5">
        <AnimatePresence mode="wait">
          {loading && !analysis ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2">
                 <Loader2 size={12} className="animate-spin text-primary/50" />
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Synchronizing Neural Pipeline & comparing with last year data…</span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-3/4 bg-white/5 rounded-full animate-pulse" />
                <div className="h-2 w-1/2 bg-white/5 rounded-full animate-pulse" />
                <div className="h-2 w-2/3 bg-white/5 rounded-full animate-pulse" />
              </div>
            </motion.div>
          ) : error ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="text-xs text-red-400 flex items-center gap-2 bg-red-400/5 p-3 rounded-xl border border-red-400/10"
            >
              <AlertCircle size={14} />
              {error}
              <button onClick={fetchAnalysis} className="ml-auto text-primary underline text-[10px]">Retry</button>
            </motion.div>
          ) : analysis ? (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              {type === 'DASHBOARD' ? (
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                  {(() => {
                    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
                    const sortedTasks = [...tasks].sort((a, b) => {
                      // Sort: Delayed (BLOCKED) > High Priority > Others
                      const isDelayedA = a.status === 'BLOCKED' ? 1 : 0;
                      const isDelayedB = b.status === 'BLOCKED' ? 1 : 0;
                      if (isDelayedA !== isDelayedB) return isDelayedB - isDelayedA;
                      
                      const priorityMap: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
                      const pA = priorityMap[a.priority] || 0;
                      const pB = priorityMap[b.priority] || 0;
                      if (pA !== pB) return pB - pA;
                      
                      return (a.title || '').localeCompare(b.title || '');
                    });

                    return sortedTasks.map((task, i) => {
                      const statusColor = 
                        task.status === 'COMPLETED' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' :
                        task.status === 'BLOCKED' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' :
                        'bg-primary shadow-[0_0_8px_#00f3ff]';
                      
                      return (
                        <div key={task.id || i} className="group relative flex flex-col gap-2 p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all cursor-default border border-white/10 mb-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />
                            <span className="text-white font-bold text-sm flex-1 tracking-wide">{task.subsystem ? `${task.subsystem} - ` : ''}{task.title}</span>
                            <span className="text-yellow-400 text-xs font-bold bg-yellow-400/10 px-2 py-0.5 rounded-md border border-yellow-400/20">
                              {task.deadline ? format(new Date(task.deadline), 'MMM dd, yyyy') : 'No Date'}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2 pl-4 text-xs">
                            <p className="text-slate-300 leading-relaxed">
                              <strong className="text-slate-500 uppercase tracking-widest text-[10px] mr-1">Project Description:</strong> 
                              {task.description || 'No description provided.'}
                            </p>
                            
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-1 bg-black/20 p-2.5 rounded-lg border border-white/5">
                              <span className="flex items-center gap-1.5">
                                <strong className="text-slate-500 uppercase tracking-widest text-[9px]">Assigned To:</strong>
                                <span className="text-primary font-bold">
                                  {(() => {
                                    if (task.assignedTo && task.assignedTo.trim() !== '' && task.assignedTo !== 'Engineer') return task.assignedTo;
                                    if (task.assignedToId) {
                                      if (members && members.length > 0) {
                                        const m = members.find((x: any) => x.uid === task.assignedToId);
                                        if (m && m.displayName) return m.displayName;
                                      }
                                      if (task.assignedToId.includes('@')) return task.assignedToId.split('@')[0];
                                      return `User (${task.assignedToId.slice(0, 6)})`;
                                    }
                                    return 'Unassigned';
                                  })()}
                                </span>
                              </span>
                              
                              <span className="flex items-center gap-1.5">
                                <strong className="text-slate-500 uppercase tracking-widest text-[9px]">Progress:</strong>
                                <span className="text-emerald-400 font-bold">{task.progressPercent || 0}%</span>
                              </span>
                              
                              <span className="flex items-center gap-1.5">
                                <strong className="text-slate-500 uppercase tracking-widest text-[9px]">Requirements:</strong>
                                <span className="text-slate-300">{task.resourcesNeeded || task.remarks || 'None specified'}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {(!data?.tasks || data.tasks.length === 0) && (
                    <p className="text-xs text-slate-500 italic p-4 text-center">No active tasks detected in the neural network.</p>
                  )}
                </div>
              ) : isStructured(analysis) ? (
                <div className="space-y-6">
                  {/* Top Section: Objectives & Strategic Directives */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      {/* Priority Tasks */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                          <ListTodo size={12} /> Priority Objectives
                        </h4>
                        <ul className="space-y-1.5">
                          <li className="text-xs text-slate-300 flex items-start gap-2">
                            <span className="mt-1.5 w-1 h-1 bg-primary rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(0,243,255,0.8)]" />
                            Integrate AI to telemetric data to predict the reason for vehicle cutoff.
                          </li>
                        </ul>
                      </div>

                      {/* At Risk */}
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                          <ShieldAlert size={12} /> Risk Alerts
                        </h4>
                        <ul className="space-y-1.5">
                          {analysis.at_risk_tasks?.length > 0 ? (
                            analysis.at_risk_tasks.map((task, i) => (
                              <li key={i} className="text-xs text-red-300/80 flex items-start gap-2">
                                <AlertCircle size={10} className="mt-0.5 flex-shrink-0" />
                                {task}
                              </li>
                            ))
                          ) : (
                            <li className="text-xs text-slate-500 italic">Nominal risk levels detected</li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Right Column: Strategic Directives */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                        <Lightbulb size={12} /> Strategic Directives
                      </h4>
                      <ul className="space-y-1.5">
                        {analysis.recommendations?.length > 0 ? (
                          analysis.recommendations.map((rec, i) => (
                            <li key={i} className="text-xs text-emerald-300/80 flex items-start gap-2">
                              <Zap size={10} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                              {rec}
                            </li>
                          ))
                        ) : (
                          <li className="text-xs text-slate-500 italic">Awaiting further telemetry…</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* Bottom Section: VS Last Year | Team Progress Summary | Efficiency Index */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                    {/* VS Last Year */}
                    {analysis.vs_last_year && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-yellow-400 flex items-center gap-1.5">
                          <TrendingUp size={12} /> vs Last Year (SEVC 2025)
                        </h4>
                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-xl p-3 h-full group relative">
                          <VerdictBadge verdict={analysis.comparison_verdict} />
                          <p className={`text-[11px] text-yellow-200/80 leading-relaxed mt-2 ${isVsExpanded ? '' : 'line-clamp-3'}`}>
                            {analysis.vs_last_year}
                          </p>
                          {analysis.vs_last_year && analysis.vs_last_year.length > 120 && (
                            <button 
                              onClick={() => setIsVsExpanded(!isVsExpanded)}
                              className="text-[9px] font-black uppercase text-yellow-400 mt-2 hover:underline focus:outline-none"
                            >
                              {isVsExpanded ? 'Show Less' : 'Read More...'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Team Progress Summary (NEW) */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Brain size={12} /> Team Progress Summary</span>
                        <div className="flex items-center gap-1">
                          <motion.div 
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className={`w-2 h-2 rounded-full ${
                              analysis.live_status === 'delayed' ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' :
                              analysis.live_status === 'behind' ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' :
                              'bg-emerald-500 shadow-[0_0_8px_#10b981]'
                            }`}
                          />
                          <span className="text-[8px] opacity-60">LIVE</span>
                        </div>
                      </h4>
                      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 h-full flex flex-col justify-center">
                        <p className={`text-[11px] text-slate-300 leading-snug italic ${isSummaryExpanded ? '' : 'line-clamp-3'}`}>
                          "{analysis.team_summary || "Analyzing live telemetry for mission progress summary..."}"
                        </p>
                        {analysis.team_summary && analysis.team_summary.length > 120 && (
                          <button 
                            onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                            className="text-[9px] font-black uppercase text-primary mt-2 hover:underline focus:outline-none text-left"
                          >
                            {isSummaryExpanded ? 'Show Less' : 'Read More...'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Efficiency Index */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                         Efficiency Index
                      </h4>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-3 h-full flex flex-col justify-center">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Progress</span>
                          <span className="text-xs font-black text-primary">{analysis.team_efficiency || '25% avg progress'}</span>
                        </div>
                        
                        {/* Visual Efficiency Bar */}
                        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ 
                              width: (() => {
                                const eff = analysis.team_efficiency || '25%';
                                const match = eff.match(/(\d+)%/);
                                return match ? `${Math.min(100, parseInt(match[1]))}%` : '25%';
                              })()
                            }}
                            className="h-full bg-gradient-to-r from-primary to-primary/40 rounded-full"
                          />
                        </div>
                        
                        {analysis.blocked_members?.length > 0 && (
                          <div className="pt-2 mt-auto border-t border-white/5">
                            <div className="flex flex-wrap gap-1">
                              {analysis.blocked_members.slice(0, 3).map((m, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-orange-400/10 text-orange-400 text-[7px] font-black rounded border border-orange-400/20 capitalize">
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-xs max-w-none">
                  <p className="text-sm text-slate-300 leading-relaxed italic">
                    "{analysis}"
                  </p>
                  <div className="mt-4 flex items-center gap-4 text-[10px] font-bold uppercase tracking-tighter text-slate-500">
                    <span className="flex items-center gap-1"><TrendingUp size={10} /> Prediction Stable</span>
                    <span className="flex items-center gap-1"><Zap size={10} /> Efficiency Optimized</span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <p className="text-xs text-slate-500 italic">No AI insights available yet. Data will be analyzed automatically.</p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

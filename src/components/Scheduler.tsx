import React, { useState, useEffect } from 'react';
import { Calendar, Bot, Share2, Download, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { Schedule } from '../types';
import { subscribeToSchedule, saveSchedule } from '../services/schedulerService';
import { generateSchedule } from '../geminiService';
import { ROLE_PERMISSIONS } from '../constants';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';

import AIIntelligencePanel from './AIIntelligencePanel';

export default function Scheduler() {
    const { profile } = useAuth();
    const [schedule, setSchedule] = useState<Schedule | null>(null);
    const [raceDate, setRaceDate] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    // Only Captains can generate/edit the schedule; all roles can view it
    const canManage = ['CAPTAIN', 'VICE_CAPTAIN'].includes(profile?.role || '');

    useEffect(() => {
        const unsubscribe = subscribeToSchedule((data) => {
            setSchedule(data);
        });
        return () => unsubscribe();
    }, []);

    const handleGenerate = async () => {
        if (!raceDate) return setError("Please select a race date first.");
        setIsGenerating(true);
        setError('');

        try {
            const result = await generateSchedule(raceDate);
            if (result.phases && result.phases.length > 0) {
                const newSchedule: Schedule = {
                    id: `sch_${Date.now()}`,
                    raceDate,
                    phases: result.phases.map((p: any) => ({ ...p, id: `ph_${Math.random()}`, progress: 0 })),
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                await saveSchedule(newSchedule);
            } else {
                setError("AI failed to generate a valid schedule.");
            }
        } catch (err) {
            setError("An error occurred during AI generation.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                        <Calendar className="text-primary" />
                        Smart Scheduler
                    </h1>
                    <p className="text-slate-400 mt-1">AI-driven timeline coordination for mission critical milestones.</p>
                </div>
                {canManage && (
                    <div className="flex items-center gap-3">
                        <input
                            type="date"
                            className="bg-white/5 border border-primary/20 text-slate-200 rounded-lg px-4 py-2"
                            value={raceDate}
                            onChange={(e) => setRaceDate(e.target.value)}
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="px-4 py-2 bg-primary/20 text-primary border border-primary/50 hover:bg-primary hover:text-[#0a0e1a] rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isGenerating ? <Bot className="animate-spin" size={18} /> : <Bot size={18} />}
                            {isGenerating ? 'Synthesizing...' : 'Generate Timeline'}
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}
            
            {schedule && <AIIntelligencePanel type="TASKS" data={schedule.phases} />}

            {schedule ? (
                <div className="glass-panel p-6 rounded-2xl">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-semibold text-slate-200">Target Race Date: <span className="text-primary">{schedule.raceDate}</span></h2>
                        <div className="flex gap-2">
                            <button className="p-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"><Share2 size={20} /></button>
                            <button className="p-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"><Download size={20} /></button>
                        </div>
                    </div>

                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
                        {schedule.phases.map((phase, index) => (
                            <motion.div
                                key={phase.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                            >
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white/10 bg-[#0a0e1a] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_0_4px_#0a0e1a]">
                                    <div className={`w-3 h-3 rounded-full ${phase.progress === 100 ? 'bg-green-500' : phase.progress > 0 ? 'bg-primary' : 'bg-slate-600'}`}></div>
                                </div>

                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] glass-panel p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-200">{phase.name}</h3>
                                        <span className="text-xs px-2 py-1 bg-white/5 rounded text-primary">{phase.progress}%</span>
                                    </div>
                                    <div className="text-xs text-slate-400 flex justify-between">
                                        <span>{phase.startDate}</span>
                                        <span>to</span>
                                        <span>{phase.endDate}</span>
                                    </div>
                                    <div className="w-full bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
                                        <div
                                            className="bg-primary h-full rounded-full transition-all duration-1000"
                                            style={{ width: `${phase.progress}%` }}
                                        />
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-2xl">
                    <Calendar size={48} className="text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-300">No Active Timeline</h3>
                    <p className="text-slate-500">Configure a race date and generate an AI-optimized schedule.</p>
                </div>
            )}
        </div>
    );
}

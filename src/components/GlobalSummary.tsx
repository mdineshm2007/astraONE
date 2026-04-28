import React, { useState } from 'react';
import { Rocket, Bot, GitMerge, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { summarizeNotes } from '../geminiService';

export default function GlobalSummary() {
    const [summary, setSummary] = useState<string | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);

    const handleSynthesize = async () => {
        setIsSynthesizing(true);
        // Mock passing notes. In reality, pull from context/firebase.
        const result = await summarizeNotes([
            { title: "Brake Failure", content: "Pads burning", subsystem: "Brakes" }
        ]);
        setSummary(result);
        setIsSynthesizing(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400 flex items-center gap-3">
                        <Rocket className="text-primary" />
                        Global Command
                    </h1>
                    <p className="text-slate-400 mt-1">GPT-OSS-120B powered Mission Synthesis Dashboard.</p>
                </div>
                <button
                    onClick={handleSynthesize}
                    disabled={isSynthesizing}
                    className="px-6 py-2.5 bg-gradient-to-r from-primary to-blue-500 hover:from-primary/80 hover:to-blue-600 text-[#0a0e1a] rounded-lg font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-[0_0_20px_rgba(125,211,252,0.3)]"
                >
                    {isSynthesizing ? <Zap className="animate-pulse text-yellow-300" size={18} /> : <Bot size={18} />}
                    {isSynthesizing ? 'GPT-120B Computing...' : 'Execute Mission Synthesis'}
                </button>
            </div>

            <div className="glass-panel p-8 rounded-2xl min-h-[400px] border border-primary/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>

                {summary ? (
                    <div className="relative z-10 prose prose-invert max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: summary }} />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 relative">
                            {isSynthesizing && <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>}
                            <GitMerge size={40} className="text-primary" />
                        </div>
                        <h3 className="text-xl font-medium text-slate-200 mb-2">Awaiting Computation</h3>
                        <p className="text-slate-500 max-w-md">
                            Initialize the synthesis engine to compile all cross-departmental notes, tasks, and alerts into a singular strategic briefing.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

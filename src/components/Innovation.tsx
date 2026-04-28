import React, { useState } from 'react';
import { Lightbulb, Sparkles, Loader2, ThumbsUp, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { getInnovationSuggestions } from '../geminiService';

export default function Innovation() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const handleGenerate = async () => {
        setIsGenerating(true);
        // In a real app we'd fetch actual logs and issues from Firestore
        const mockLogs = [{ issue: "Overheating in battery pack during sustained load", subsystem: "Battery" }];
        const mockIssues = ["Weight distribution is 2kg off target"];

        const result = await getInnovationSuggestions(mockLogs, mockIssues);
        setFeedback(result);
        setIsGenerating(false);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
                        <Lightbulb className="text-primary" />
                        Innovation Engine
                    </h1>
                    <p className="text-slate-400 mt-1">AI-assisted brainstorming and engineering breakthrough suggestions.</p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="px-4 py-2 bg-primary/20 text-primary border border-primary/50 hover:bg-primary hover:text-[#0a0e1a] rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    {isGenerating ? 'Analyzing Telemetry...' : 'Generate Breakthroughs'}
                </button>
            </div>

            <div className="flex-1 grid md:grid-cols-2 gap-6">
                <div className="glass-panel p-6 rounded-2xl flex flex-col">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2"><Sparkles className="text-yellow-400" size={18} /> AI Feedback</h3>
                    <div className="flex-1 bg-[#0a0e1a]/50 rounded-xl p-4 border border-white/5 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-slate-300">
                        {isGenerating ? (
                            <div className="h-full flex items-center justify-center text-slate-500 gap-2">
                                <Loader2 className="animate-spin" /> Cross-referencing homologation constraints...
                            </div>
                        ) : feedback ? (
                            feedback
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-600">
                                Awaiting input. Click "Generate Breakthroughs" to synthesize recent logs.
                            </div>
                        )}
                    </div>
                </div>

                <div className="glass-panel p-6 rounded-2xl flex flex-col">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4">Community Brainstorm</h3>
                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/10 rounded-xl">
                        <div className="text-center">
                            <MessageSquare className="mx-auto text-slate-600 mb-2" size={32} />
                            <p className="text-slate-500">No active brainstorming sessions.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

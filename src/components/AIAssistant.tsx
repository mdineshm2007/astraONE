import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Send, Mic, MicOff, Sparkles, MessageCircle, Volume2 } from 'lucide-react';
import { chatAssistant, transcribeVoice } from '../geminiService';
import { AppView } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantProps {
    onViewChange: (view: AppView) => void;
}

export default function AIAssistant({ onViewChange }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "A.S.T.R.A. System Online. How can I assist with your engineering mission today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Track real network connectivity
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

  const handleSend = async (text?: string) => {
    const content = text || input;
    if (!content.trim()) return;

    const userMessage: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    const assistantResponse = await chatAssistant([...messages, userMessage]);
    setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);
    setIsTyping(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const result = await transcribeVoice(audioBlob);
        
        if (result) {
            if (result.action && result.action !== 'none') {
                handleAction(result.action, result.text);
            } else {
                handleSend(result.text);
            }
        }
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleAction = (action: string, originalText: string) => {
      setMessages(prev => [...prev, { role: 'user', content: `[Voice Command]: ${originalText}` }]);
      
      switch (action) {
          case 'NAVIGATE_DASHBOARD':
              onViewChange('dashboard');
              setMessages(prev => [...prev, { role: 'assistant', content: "Navigating to Mission Command Dashboard." }]);
              break;
          case 'NAVIGATE_TEAMS':
              onViewChange('teams');
              setMessages(prev => [...prev, { role: 'assistant', content: "Switching to Team Operations view." }]);
              break;
          case 'RESET_SYSTEMS':
               setMessages(prev => [...prev, { role: 'assistant', content: "Emergency Override sequence detected. Systems recalibrated (Simulated)." }]);
               break;
          default:
              handleSend(originalText);
      }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-[60] w-14 h-14 bg-primary text-background rounded-full shadow-[0_0_20px_rgba(125,211,252,0.4)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all group"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X size={24} />
            </motion.div>
          ) : (
            <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
              <Bot size={28} />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-tertiary rounded-full animate-pulse border-2 border-background" />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-[60] w-[380px] h-[550px] glass-panel-elevated flex flex-col overflow-hidden rounded-3xl"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 bg-primary/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/20 rounded-lg text-primary">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black tracking-widest text-primary">A.S.T.R.A.</h3>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Neural Assistant</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide">
                {messages.map((m, i) => (
                    <motion.div 
                        initial={{ opacity: 0, x: m.role === 'user' ? 10 : -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={i} 
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                            m.role === 'user' 
                            ? 'bg-primary text-background font-medium rounded-tr-none' 
                            : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-none'
                        }`}>
                            {m.content}
                        </div>
                    </motion.div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-surface">
                <div className="flex items-center gap-2">
                    <button 
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                        onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                        className={`p-3 rounded-xl transition-all ${
                            isRecording 
                            ? 'bg-error text-white animate-pulse' 
                            : 'bg-white/5 text-slate-400 hover:bg-white/10 active:scale-95'
                        }`}
                        title="Hold to speak"
                    >
                        {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <div className="flex-1 relative">
                        <input 
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask Astra..."
                            className="w-full bg-white/5 border border-white/10 px-4 py-3 rounded-xl text-sm focus:border-primary/40 focus:bg-white/10 transition-all outline-none"
                        />
                        <button 
                            onClick={() => handleSend()}
                            className="absolute right-2 top-1.5 p-1.5 text-primary hover:text-white transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
                <p className="mt-2 text-center text-[10px] text-slate-500 font-medium">
                    {isRecording ? "Recording... (using Whisper V3 Turbo)" : "Llama-3.1-8B-Instant powered assistant"}
                </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

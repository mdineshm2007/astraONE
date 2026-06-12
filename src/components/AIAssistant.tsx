import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, X, Send, Mic, MicOff, Sparkles, MessageCircle, Volume2, Settings, Key } from 'lucide-react';
import { chatAssistant, transcribeVoice } from '../geminiService';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantProps {
    onViewChange: (view: AppView) => void;
}

export default function AIAssistant({ onViewChange }: AIAssistantProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('astra_user_groq_api_key') || '' : '';
  });
  const [customEndpoint, setCustomEndpoint] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('astra_user_ai_endpoint') || '/api/chat' : '/api/chat';
  });
  const [customModelId, setCustomModelId] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('astra_user_ai_model_id') || 'llama-3.1-8b-instant' : 'llama-3.1-8b-instant';
  });
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

  const handleSaveSettings = () => {
    const trimmedKey = customApiKey.trim();
    const trimmedEndpoint = customEndpoint.trim();
    const trimmedModelId = customModelId.trim();

    if (trimmedKey) {
      localStorage.setItem('astra_user_groq_api_key', trimmedKey);
    } else {
      localStorage.removeItem('astra_user_groq_api_key');
    }

    if (trimmedEndpoint) {
      localStorage.setItem('astra_user_ai_endpoint', trimmedEndpoint);
    } else {
      localStorage.setItem('astra_user_ai_endpoint', '/api/chat');
    }

    if (trimmedModelId) {
      localStorage.setItem('astra_user_ai_model_id', trimmedModelId);
    } else {
      localStorage.setItem('astra_user_ai_model_id', 'llama-3.1-8b-instant');
    }

    alert('AI Settings saved successfully! A.S.T.R.A. will now reload the new settings.');
    setShowSettings(false);
  };

  const handleClearSettings = () => {
    localStorage.removeItem('astra_user_groq_api_key');
    localStorage.removeItem('astra_user_ai_endpoint');
    localStorage.removeItem('astra_user_ai_model_id');
    setCustomApiKey('');
    setCustomEndpoint('/api/chat');
    setCustomModelId('llama-3.1-8b-instant');
    alert('Settings cleared. Falling back to default system key.');
    setShowSettings(false);
  };


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

    const assistantResponse = await chatAssistant([...messages, userMessage], profile);
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
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-1 rounded-lg transition-all active:scale-95 ${showSettings ? 'text-primary bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                        title="AI Settings"
                    >
                        <Settings size={16} />
                    </button>
                    <div className="flex items-center gap-1.5">
                        <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>
            </div>

            {showSettings ? (
                /* Settings Panel */
                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide text-left">
                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2">
                            <Key size={16} /> Configure AI Model Settings
                        </h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Configure your custom Llama 3.1 fine-tuned endpoint (e.g. from Together AI, local endpoints, or Google Colab tunnels).
                        </p>
                    </div>

                    <div className="space-y-3 pt-2">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">API Endpoint URL</label>
                            <input 
                                type="text"
                                value={customEndpoint}
                                onChange={(e) => setCustomEndpoint(e.target.value)}
                                placeholder="/api/chat (local backend) or custom URL..."
                                className="w-full bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs focus:border-primary/40 focus:bg-white/10 transition-all outline-none text-slate-200"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Model Name / ID</label>
                            <input 
                                type="text"
                                value={customModelId}
                                onChange={(e) => setCustomModelId(e.target.value)}
                                placeholder="llama-3.1-8b-instant or custom..."
                                className="w-full bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs focus:border-primary/40 focus:bg-white/10 transition-all outline-none text-slate-200"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">API Key / Token</label>
                            <input 
                                type="password"
                                value={customApiKey}
                                onChange={(e) => setCustomApiKey(e.target.value)}
                                placeholder="Paste your API key here..."
                                className="w-full bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl text-xs focus:border-primary/40 focus:bg-white/10 transition-all outline-none text-slate-200"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleSaveSettings}
                                className="flex-1 bg-primary text-background font-bold py-2.5 rounded-xl text-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                            >
                                Save Settings
                            </button>
                            {(localStorage.getItem('astra_user_groq_api_key') || localStorage.getItem('astra_user_ai_endpoint') || localStorage.getItem('astra_user_ai_model_id')) && (
                                <button
                                    onClick={handleClearSettings}
                                    className="px-3 border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold py-2.5 rounded-xl text-xs active:scale-[0.98] transition-all cursor-pointer"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/5 space-y-2">
                        <h5 className="text-[10px] font-bold text-slate-400 uppercase">Colab / Together AI Integration</h5>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            To connect your Google Colab fine-tuned model, deploy it to Hugging Face and host it using **Together AI** or **Fireworks AI**, then copy their completion URL and paste it in the endpoint field along with your key.
                        </p>
                    </div>
                </div>
            ) : (
                <>
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
                            {isRecording ? "Recording... (using Whisper V3 Turbo)" : `Active Model: ${customModelId}`}
                        </p>
                    </div>
                </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

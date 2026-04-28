import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToChat, sendMessage, deleteMessage, ChatMessage } from '../services/chatService';
import { Send, Hash, Users, MessageSquareCode, ShieldAlert, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CHANNELS = [
  { id: 'general', name: 'General Support', icon: Hash },
  { id: 'admin', name: 'Admin Hub', icon: ShieldAlert, restricted: true },
  { id: 'engineer', name: 'Engineering Dev', icon: MessageSquareCode },
  { id: 'pitcrew', name: 'Pit Crew Chat', icon: Users },
];

export default function Community() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('general');
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeToChat(selectedChannel, setMessages);
  }, [selectedChannel]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    await sendMessage({
      channel: selectedChannel,
      text: inputText,
      senderId: profile?.uid || 'anonymous',
      senderName: profile?.displayName || 'Unknown',
      senderPhoto: profile?.photoURL || '',
    });
    setInputText('');
  };

  return (
    <div className="h-full min-h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6">
      {/* Sidebar - Channels */}
      <aside className="w-full md:w-64 flex flex-col gap-2">
        <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Channels</div>
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannel(ch.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${selectedChannel === ch.id ? 'bg-primary/20 text-primary' : 'text-slate-400 hover:bg-white/5'
              }`}
          >
            <ch.icon size={18} />
            <span className="text-sm font-medium">{ch.name}</span>
          </button>
        ))}
      </aside>

      {/* Chat Area */}
      <main className="flex-1 glass-panel rounded-3xl flex flex-col overflow-hidden">
        <header className="p-4 border-b border-primary/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3 text-primary">
            <Hash size={20} />
            <h2 className="font-bold uppercase tracking-widest text-sm">{selectedChannel}</h2>
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase">Astra Real-time Neural Link</span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
          {messages.map((msg, idx) => (
            <motion.div
              initial={{ opacity: 0, x: msg.senderId === profile?.uid ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              key={msg.id || idx}
              className={`flex items-start gap-3 ${msg.senderId === profile?.uid ? 'flex-row-reverse' : ''}`}
            >
              <div className="w-8 h-8 rounded-full border border-primary/20 overflow-hidden shrink-0 mt-1">
                {msg.senderPhoto ? (
                  <img src={msg.senderPhoto} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-surface-elevated text-[10px] flex items-center justify-center font-bold">
                    {msg.senderName.charAt(0)}
                  </div>
                )}
              </div>
              <div className={`max-w-[70%] space-y-1 ${msg.senderId === profile?.uid ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-baseline gap-2 ${msg.senderId === profile?.uid ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] font-bold text-primary">{msg.senderName}</span>
                    <span className="text-[8px] text-slate-500">{new Date(msg.createdAt?.toDate?.() || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {(msg.senderId === profile?.uid || profile?.role === 'CAPTAIN' || profile?.role === 'TEAM_LEAD') && (
                      <button 
                        onClick={() => deleteMessage(msg.id)} 
                        className="text-slate-500 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className={`p-3 rounded-2xl text-sm leading-relaxed ${msg.senderId === profile?.uid ? 'bg-primary text-background rounded-tr-none' : 'bg-surface-elevated text-slate-200 rounded-tl-none'
                    }`}>
                    {msg.text}
                  </div>
                </div>
              </motion.div>
          ))}
        </div>

        <footer className="p-4 bg-white/5">
          <form onSubmit={handleSendMessage} className="relative">
            <input
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Message #${selectedChannel}...`}
              className="w-full bg-[#0a0e1a]/80 border border-primary/20 rounded-2xl px-6 py-4 pr-16 focus:border-primary/50 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-3 text-primary disabled:opacity-30 transition-all hover:bg-primary/10 rounded-xl"
            >
              <Send size={20} />
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
}

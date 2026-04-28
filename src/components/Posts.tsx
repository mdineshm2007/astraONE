import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToPosts, createPost, deletePost } from '../services/postService';
import { subscribeToUsers } from '../services/userService';
import { Post, UserProfile } from '../types';
import { resolveNameFromEmail } from '../utils/userUtils';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Image as ImageIcon, Trash2, Globe, Users, Clock, ShieldCheck, X, Loader } from 'lucide-react';
import { DEFAULT_SUBSYSTEMS } from '../constants';

export default function Posts() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [mode, setMode] = useState<'GENERAL' | 'TEAM'>('GENERAL');
  
  // Default team for team mode
  const initialTeam = profile?.role === 'CAPTAIN' 
    ? DEFAULT_SUBSYSTEMS[0].id 
    : (profile?.approvedTeams?.[0] || DEFAULT_SUBSYSTEMS[0].id);
  const [selectedTeam, setSelectedTeam] = useState<string>(initialTeam);
  
  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to posts based on mode and team
  useEffect(() => {
    if (!profile) return;
    const unsubPosts = subscribeToPosts(mode, mode === 'TEAM' ? selectedTeam : null, setPosts);
    const unsubUsers = subscribeToUsers(allUsers => {
      const map: Record<string, UserProfile> = {};
      allUsers.forEach(u => map[u.uid] = u);
      setUsersMap(map);
    });
    return () => { unsubPosts(); unsubUsers(); };
  }, [mode, selectedTeam, profile]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    
    setIsUploading(true);
    try {
      const { uploadImage } = await import('../services/storageService');
      const url = await uploadImage(file, `posts/${profile.uid}`);
      setImageUrl(url);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload image. Please try a URL instead.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !profile) return;

    setIsPosting(true);
    try {
      await createPost({
        type: mode,
        teamId: mode === 'TEAM' ? selectedTeam : undefined,
        content: content.trim(),
        imageUrl: imageUrl || undefined,
        authorId: profile.uid,
        authorName: profile.displayName || 'Unknown',
        authorRole: profile.role
      });
      setContent('');
      setImageUrl('');
    } catch (error) {
      console.error('Error creating post:', error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleImageClick = () => {
    if (window.confirm("Do you want to upload a file? (Cancel to enter a URL)")) {
      fileInputRef.current?.click();
    } else {
      const url = window.prompt("Enter image URL:");
      if (url) setImageUrl(url);
    }
  };

  const canPost = profile?.role === 'CAPTAIN' || profile?.role === 'TEAM_LEAD';

  const visibleSubsystems = profile?.role === 'CAPTAIN'
    ? DEFAULT_SUBSYSTEMS
    : DEFAULT_SUBSYSTEMS.filter(s => profile?.approvedTeams?.includes(s.id));

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-700">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Globe className="text-primary" />
            Engineering Feed
          </h1>
          <p className="text-slate-500 text-sm">Official announcements and team-specific updates.</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setMode('GENERAL')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              mode === 'GENERAL' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe size={14} /> General
          </button>
          <button
            onClick={() => setMode('TEAM')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              mode === 'TEAM' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={14} /> Team Mode
          </button>
        </div>
      </div>

      {/* Team Selector for Team Mode */}
      {mode === 'TEAM' && visibleSubsystems.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        >
          {visibleSubsystems.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team.id)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap transition-all ${
                selectedTeam === team.id ? 'bg-white/10 text-primary border-primary/50' : 'bg-white/5 text-slate-500 border-white/5'
              } border`}
            >
              {team.name}
            </button>
          ))}
        </motion.div>
      )}

      {/* Post Bar (Restricted) */}
      {canPost ? (
        <div className="glass-panel p-4 rounded-2xl border border-white/10 focus-within:border-primary/40 transition-all">
          <form onSubmit={handlePost} className="space-y-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={mode === 'GENERAL' ? "Share an announcement with everyone..." : `Update ${DEFAULT_SUBSYSTEMS.find(s=>s.id===selectedTeam)?.name} members...`}
              className="w-full bg-transparent border-none outline-none text-sm placeholder:text-slate-600 resize-none min-h-[80px]"
            />
            
            <AnimatePresence>
              {imageUrl && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="relative inline-block mt-2">
                  <img src={imageUrl} alt="Attached preview" className="h-32 rounded-lg object-cover border border-white/10" />
                  <button type="button" onClick={() => setImageUrl('')} className="absolute -top-2 -right-2 bg-slate-900 border border-white/10 text-slate-400 hover:text-error p-1 rounded-full shadow-lg">
                    <X size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload} 
            />

            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleImageClick} className="p-2 text-slate-500 hover:text-primary transition-colors rounded-lg bg-white/5">
                  <ImageIcon size={18} />
                </button>
                <div className="h-4 w-[1px] bg-white/10 mx-1" />
                <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-primary/60" /> Posting as {profile.role.replace('_', ' ')}
                </span>
              </div>
              <button
                type="submit"
                disabled={!content.trim() || isPosting}
                className="bg-primary text-black font-black px-6 py-2 rounded-xl text-xs flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
              >
                {isPosting && <Loader size={14} className="animate-spin" />}
                {isPosting ? 'Posting...' : 'Post Update'} <Send size={14} />
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl flex items-center gap-3">
          <ShieldCheck className="text-primary opacity-60" size={18} />
          <p className="text-xs text-primary/80 font-bold uppercase tracking-wider">
            Only Team Captains and Team Leads can broadcast messages on the engineering feed.
          </p>
        </div>
      )}

      {/* Feed View */}
      <div className="space-y-4 pb-20">
        <AnimatePresence mode="popLayout">
          {posts.map((post) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={post.id}
              className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black">
                    {post.authorName?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm">
                        {usersMap[post.authorId]?.displayName || 
                         resolveNameFromEmail(usersMap[post.authorId]?.email) || 
                         post.authorName || 'Unknown User'}
                      </h4>
                      <span className="px-2 py-0.5 bg-white/5 text-primary text-[8px] font-black rounded-full border border-primary/20">
                        {usersMap[post.authorId]?.role || post.authorRole || 'MEMBER'}
                      </span>
                      {post.type === 'TEAM' && (
                        <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-[8px] font-black uppercase rounded-full border border-white/10">
                          {DEFAULT_SUBSYSTEMS.find(s => s.id === post.teamId)?.name || post.teamId}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                      <Clock size={10} />
                      {post.createdAt ? new Date(post.createdAt).toLocaleString() : 'Just now'}
                    </div>
                  </div>
                </div>
                {(profile?.role === 'CAPTAIN' || profile?.uid === post.authorId) && (
                  <button 
                    onClick={() => { if(window.confirm('Delete this post?')) deletePost(post.id); }}
                    className="p-2 text-slate-600 hover:text-error transition-colors bg-white/5 rounded-xl border border-white/5"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {post.content}
              </p>
              
              {post.imageUrl && (
                <div className="mt-4 rounded-xl overflow-hidden border border-white/5">
                  <img src={post.imageUrl} alt="Attachment" className="w-full h-auto object-cover max-h-[400px]" loading="lazy" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {posts.length === 0 && (
          <div className="py-20 text-center">
            <Globe size={40} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-500 italic uppercase tracking-widest text-sm">No updates in this feed yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

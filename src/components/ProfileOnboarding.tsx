import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUserProfile } from '../services/userService';
import { uploadImage } from '../services/storageService';
import { motion } from 'motion/react';
import { User, GraduationCap, ArrowRight, Rocket, Loader2 } from 'lucide-react';

export default function ProfileOnboarding() {
  const { profile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [year, setYear] = useState(profile?.year || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    try {
      setIsUploading(true);
      const url = await uploadImage(file, `profiles/${profile.uid}`);
      setPhotoURL(url);
    } catch (error) {
      console.error('Photo upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !displayName || !year || isUploading) return;

    setIsSubmitting(true);
    try {
      await updateUserProfile(profile.uid, {
        displayName,
        year,
        photoURL,
        onboarded: true
      });
      // Force reload to update AuthContext state and navigate to the dashboard
      window.location.reload();
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      alert('Failed to save profile: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 py-12">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-tertiary/10 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel-elevated p-8 md:p-12 rounded-3xl max-w-md w-full relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/20 mb-4 shadow-lg shadow-primary/10">
            <Rocket className="text-primary" size={40} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter">Complete Profile</h1>
          <p className="text-slate-400 mt-2">
            Tell us who you are before joining the engineering team.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo Upload */}
          <div className="flex flex-col items-center gap-4 mb-2">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex items-center justify-center shadow-inner">
                {photoURL ? (
                  <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={40} className="text-slate-600" />
                )}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary" size={24} />
                  </div>
                )}
              </div>
              <label className="absolute -bottom-2 -right-2 w-8 h-8 bg-primary text-[#001f2e] rounded-xl flex items-center justify-center cursor-pointer hover:scale-110 transition-transform shadow-lg">
                <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={isUploading} />
                <Rocket size={14} className="rotate-45" />
              </label>
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Profile Photo</p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
              Full Name
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                <User size={18} />
              </div>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-surface border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500 ml-1">
              Mechatronics Year
            </label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                <GraduationCap size={18} />
              </div>
              <select
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-surface border border-white/10 rounded-2xl pl-12 pr-10 py-4 text-white focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all appearance-none"
              >
                <option value="" disabled>Select Year</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="Alumni">Alumni</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <ArrowRight size={16} className="rotate-90" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isUploading || !displayName || !year}
            className="w-full bg-primary text-[#001f2e] font-black py-4 rounded-2xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 mt-4"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Continue to Teams
                <ArrowRight size={20} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-600 text-[10px] mt-6 uppercase tracking-widest font-bold">
          ASTRA SOLAR KART PLATFORM
        </p>
      </motion.div>
    </div>
  );
}

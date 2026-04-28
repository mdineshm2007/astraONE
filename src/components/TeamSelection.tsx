import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToSubsystems } from '../services/subsystemService';
import { requestToJoinTeams } from '../services/userService';
import { Subsystem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Rocket, CheckSquare, Square, LogOut, Clock, CheckCircle2, Loader2 } from 'lucide-react';

export default function TeamSelection() {
  const { profile, logout } = useAuth();
  const [subsystems, setSubsystems] = useState<Subsystem[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    return subscribeToSubsystems(setSubsystems);
  }, []);

  const pendingTeams = profile?.teams?.filter(t => t.status === 'PENDING').map(t => t.teamId) || [];
  const approvedTeams = profile?.teams?.filter(t => t.status === 'APPROVED').map(t => t.teamId) || [];
  const hasPending = pendingTeams.length > 0;

  const toggleTeam = (teamId: string) => {
    if (pendingTeams.includes(teamId) || approvedTeams.includes(teamId)) return;
    setSelectedTeams(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  const handleSubmit = async () => {
    if (selectedTeams.length === 0 || !profile) return;
    setIsSubmitting(true);
    await requestToJoinTeams(profile.uid, selectedTeams);
    setSelectedTeams([]);
    setSubmitted(true);
    setIsSubmitting(false);
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
        className="glass-panel-elevated p-8 md:p-12 rounded-3xl max-w-2xl w-full relative z-10"
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/20">
              <Rocket className="text-primary" size={32} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter">Team Selection</h1>
              <p className="text-slate-400 text-sm mt-0.5">Welcome, <span className="text-primary font-bold">{profile?.displayName}</span></p>
            </div>
          </div>
          <button onClick={logout} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5" title="Logout">
            <LogOut size={20} />
          </button>
        </div>

        {/* Pending state */}
        <AnimatePresence mode="wait">
          {hasPending && !submitted && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-5 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Loader2 size={20} className="text-yellow-400 animate-spin" />
                </div>
                <div>
                  <h3 className="font-bold text-yellow-300 mb-1">Approval Pending</h3>
                  <p className="text-sm text-slate-300 mb-2">
                    Your join request has been sent to the Team Lead(s). You will automatically get access once approved — no need to refresh.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingTeams.map(t => (
                      <span key={t} className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full font-black uppercase">
                        {t} — waiting
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {(submitted && !hasPending) && (
            <motion.div
              key="submitted"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-5 bg-green-500/10 border border-green-500/30 rounded-2xl flex items-center gap-3"
            >
              <CheckCircle2 size={20} className="text-green-400 shrink-0" />
              <div>
                <h3 className="font-bold text-green-300">Request Sent!</h3>
                <p className="text-sm text-slate-400">Waiting for Team Lead approval. You'll be redirected automatically.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Description */}
        {!hasPending && !submitted && (
          <p className="text-slate-400 mb-6 leading-relaxed text-sm">
            Select the engineering subteam(s) you belong to. Your request will be sent to the respective Team Lead for approval.
            You'll get access <strong className="text-slate-300">automatically</strong> once approved.
          </p>
        )}

        {/* Team Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 max-h-[45vh] overflow-y-auto pr-1 scrollbar-hide">
          {subsystems.map(sub => {
            const isPending = pendingTeams.includes(sub.id);
            const isApproved = approvedTeams.includes(sub.id);
            const isSelected = selectedTeams.includes(sub.id);

            return (
              <div
                key={sub.id}
                onClick={() => toggleTeam(sub.id)}
                className={`p-4 rounded-xl border flex items-center gap-3 transition-all select-none ${
                  isApproved
                    ? 'bg-green-500/10 border-green-500/30 cursor-not-allowed'
                    : isPending
                    ? 'bg-yellow-500/10 border-yellow-500/30 cursor-not-allowed'
                    : isSelected
                    ? 'bg-primary/20 border-primary cursor-pointer shadow-[0_0_12px_rgba(125,211,252,0.15)]'
                    : 'bg-surface-elevated border-white/10 cursor-pointer hover:border-primary/50 hover:bg-white/[0.04]'
                }`}
              >
                {isApproved ? (
                  <CheckSquare className="text-green-500 shrink-0" size={20} />
                ) : isPending ? (
                  <Clock className="text-yellow-400 shrink-0" size={20} />
                ) : isSelected ? (
                  <CheckSquare className="text-primary shrink-0" size={20} />
                ) : (
                  <Square className="text-slate-500 shrink-0" size={20} />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-bold text-sm block truncate">{sub.name}</span>
                  {isApproved && <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">APPROVED ✓</span>}
                  {isPending && <span className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">PENDING APPROVAL</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={selectedTeams.length === 0 || isSubmitting}
          className={`w-full font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all ${
            selectedTeams.length > 0
              ? 'bg-primary text-[#001f2e] hover:brightness-110 active:scale-[0.98]'
              : 'bg-surface-elevated text-slate-500 cursor-not-allowed'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Sending Request...
            </>
          ) : (
            `Request to Join ${selectedTeams.length > 0 ? `${selectedTeams.length} Team${selectedTeams.length > 1 ? 's' : ''}` : 'Teams'}`
          )}
        </button>

        {/* Help text */}
        <p className="text-center text-slate-600 text-xs mt-4">
          Once your Team Lead approves, you'll be automatically redirected to the dashboard.
        </p>
      </motion.div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { ShieldAlert, Users, CheckCircle2, X, Clock, AlertCircle, UserX, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToMultipleTeamsPendingMembers, approveMember, rejectMember, subscribeToUsers, updateUserProfile, fetchPendingMembers, fetchAllUsers, deleteUserAccount } from '../services/userService';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { resolveNameFromEmail } from '../utils/userUtils';

export default function AdminPanel() {
    const { profile } = useAuth();
    const [pendingRequests, setPendingRequests] = useState<UserProfile[]>([]);
    const [approvedMembers, setApprovedMembers] = useState<UserProfile[]>([]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'members' | 'users'>('pending');

    const isCaptainMode = profile?.role === 'CAPTAIN';
    const isTeamLead = profile?.role === 'TEAM_LEAD';
    const canAccess = isCaptainMode || isTeamLead;

    // Admin Panel Refresh Logic (using API polling to bypass RTDB read restrictions)
    useEffect(() => {
        if (!profile || !canAccess) return;
        
        const refreshData = async () => {
            try {
                const teamIds = isCaptainMode ? ['all'] : (profile.approvedTeams || []);
                const [pending, members] = await Promise.all([
                    fetchPendingMembers(teamIds),
                    fetchAllUsers()
                ]);
                
                setPendingRequests(pending);
                setAllUsers(members);
                
                // Approved members filter logic (mirrors previous listener logic)
                const teamIdsList = profile.approvedTeams || [];
                const approved = members.filter(u => {
                    if (isCaptainMode) return true;
                    if (u.uid === profile.uid) return false;
                    if (u.role === 'CAPTAIN') return false;
                    return u.approvedTeams?.some(t => teamIdsList.includes(t));
                });
                setApprovedMembers(approved);
            } catch (err) {
                console.error("Admin refresh failed:", err);
            }
        };

        refreshData();
        const interval = setInterval(refreshData, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, [profile, canAccess, isCaptainMode]);

    const handleApprove = async (uid: string, teamId: string) => {
        if (!uid || !teamId) {
            alert("Internal Error: Missing UID or TeamID. Contact developer.");
            return;
        }
        setActionLoading(uid + teamId);
        try {
            await approveMember(uid, teamId);
        } catch (error: any) {
            alert(error.message || "Failed to approve member.");
            console.error(error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (uid: string, teamId: string) => {
        if (!uid || !teamId) {
            alert("Internal Error: Missing UID or TeamID. Contact developer.");
            return;
        }
        setActionLoading(uid + teamId + 'reject');
        try {
            await rejectMember(uid, teamId);
        } catch (error: any) {
            alert(error.message || "Failed to reject member.");
            console.error(error);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemoveMember = async (member: UserProfile, teamId: string) => {
        if (!window.confirm(`Remove ${member.displayName || resolveNameFromEmail(member.email)} from "${teamId}"?`)) return;
        setActionLoading(member.uid + teamId + 'remove');
        try {
            // Filter out the target team from the member's teams array
            const updatedTeams = (member.teams || []).filter(t => t.teamId !== teamId);
            const updatedApprovedTeams = updatedTeams.filter(t => t.status === 'APPROVED').map(t => t.teamId);
            await updateUserProfile(member.uid, {
                teams: updatedTeams,
                approvedTeams: updatedApprovedTeams,
            });
        } catch (error: any) {
            alert("Failed to remove member: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteUser = async (uid: string, name: string) => {
        if (!window.confirm(`PERMANENTLY delete user "${name}"? This cannot be undone.`)) return;
        setActionLoading(uid + 'delete');
        try {
            await deleteUserAccount(uid);
        } catch (error: any) {
            alert("Failed to delete user: " + error.message);
        } finally {
            setActionLoading(null);
        }
    };

    if (!canAccess) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                <ShieldAlert size={64} className="text-red-500" />
                <h2 className="text-2xl font-bold text-slate-200">Access Denied</h2>
                <p className="text-slate-400">Team Lead or Captain clearance required.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-3">
                    <ShieldAlert />
                    Admin &amp; Team Control
                </h1>
                <p className="text-slate-400 mt-1">
                    {isTeamLead
                        ? `Managing requests for: ${(profile?.approvedTeams || []).join(', ')}`
                        : 'Global team management — all subsystems visible.'}
                </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-2xl w-fit border border-white/5">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pending' ? 'bg-primary text-black' : 'text-slate-500 hover:text-white'}`}
                >
                    Pending Requests
                    {pendingRequests.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-yellow-500 text-black text-[8px] font-black">
                            {pendingRequests.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'members' ? 'bg-primary text-black' : 'text-slate-500 hover:text-white'}`}
                >
                    Approved Members
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'users' ? 'bg-primary text-black' : 'text-slate-500 hover:text-white'}`}
                >
                    App Users
                    {allUsers.length > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/10 text-slate-400 text-[8px] font-black">
                            {allUsers.length}
                        </span>
                    )}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'pending' && (
                    <motion.div key="pending" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                        <div className="glass-panel p-8 rounded-3xl border-t-2 border-t-primary/50">
                            <h3 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
                                <Users size={24} />
                                Pending Member Requests
                                {pendingRequests.length > 0 && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-black border border-yellow-500/30">
                                        {pendingRequests.length} pending
                                    </span>
                                )}
                            </h3>

                            {pendingRequests.length === 0 ? (
                                <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-dashed border-white/10 space-y-3">
                                    <Users size={48} className="mx-auto text-slate-700" />
                                    <p className="text-slate-500 font-medium">No pending join requests</p>
                                    <p className="text-slate-600 text-sm">New members will appear here once they submit a team request.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <AnimatePresence>
                                        {pendingRequests.map(req => {
                                            const manageableTeams = req.teams?.filter(t => {
                                                if (t.status !== 'PENDING') return false;
                                                if (isCaptainMode) return true;
                                                return profile?.approvedTeams?.includes(t.teamId);
                                            }) || [];

                                            return (
                                                <motion.div
                                                    key={req.uid}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, x: 20 }}
                                                    className="bg-surface-elevated p-5 rounded-2xl border border-white/5 space-y-4"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-lg shrink-0">
                                                            {(req.displayName || (req.email ? resolveNameFromEmail(req.email) : `User_${(req.uid || '').slice(0, 6)}`))?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-slate-100 truncate">
                                                                {req.displayName || (req.email ? resolveNameFromEmail(req.email) : `User_${(req.uid || '').slice(0, 6)}`)}
                                                            </p>
                                                            <p className="text-xs text-slate-500 truncate">{req.email || 'No Email Provided'}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                {req.onboarded ? (
                                                                  req.year && (
                                                                    <span className="text-[10px] bg-white/5 text-slate-400 px-2 py-0.5 rounded-full border border-white/5 font-bold uppercase tracking-wider">
                                                                      {req.year}
                                                                    </span>
                                                                  )
                                                                ) : (
                                                                  <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20 font-black uppercase tracking-wider animate-pulse">
                                                                    Incomplete Profile
                                                                  </span>
                                                                )}
                                                                <div className="flex items-center gap-1">
                                                                    <Clock size={10} className="text-yellow-400" />
                                                                    <span className="text-[10px] text-yellow-400 font-bold uppercase">AWAITING APPROVAL</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {manageableTeams.map(t => (
                                                            <div key={t.teamId} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                                                                <span className="text-xs font-black text-primary uppercase tracking-wider">{t.teamId}</span>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => handleApprove(req.uid, t.teamId)}
                                                                        disabled={actionLoading === req.uid + t.teamId}
                                                                        className="flex items-center gap-1.5 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-all text-xs font-bold disabled:opacity-50"
                                                                    >
                                                                        <CheckCircle2 size={14} />
                                                                        {actionLoading === req.uid + t.teamId ? 'Approving...' : 'Approve'}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleReject(req.uid, t.teamId)}
                                                                        disabled={!!actionLoading}
                                                                        className="flex items-center gap-1.5 px-3 py-1 bg-error/20 text-error rounded-lg hover:bg-error/30 transition-all text-xs font-bold disabled:opacity-50"
                                                                    >
                                                                        <X size={14} />
                                                                        Reject
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'members' && (
                    <motion.div key="members" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                        <div className="glass-panel p-8 rounded-3xl border-t-2 border-t-primary/50">
                            <h3 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
                                <UserX size={24} />
                                Approved Members
                                <span className="ml-2 text-sm text-slate-500 font-normal">(click Remove to kick from team)</span>
                            </h3>

                            {approvedMembers.length === 0 ? (
                                <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-dashed border-white/10 space-y-3">
                                    <Users size={48} className="mx-auto text-slate-700" />
                                    <p className="text-slate-500 font-medium">No approved members yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <AnimatePresence>
                                        {approvedMembers.map(member => {
                                            const visibleTeams = (member.approvedTeams || []).filter(t => {
                                                if (isCaptainMode) return true;
                                                return profile?.approvedTeams?.includes(t);
                                            });

                                            if (!isCaptainMode && visibleTeams.length === 0) return null;

                                            return (
                                                <motion.div
                                                    key={member.uid}
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="bg-surface-elevated p-5 rounded-2xl border border-white/5 space-y-4"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-lg shrink-0">
                                                            {(member.displayName || (member.email ? resolveNameFromEmail(member.email) : `User_${(member.uid || '').slice(0, 6)}`))?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-slate-100 truncate">
                                                                {member.displayName || (member.email ? resolveNameFromEmail(member.email) : `User_${(member.uid || '').slice(0, 6)}`)}
                                                            </p>
                                                            <p className="text-xs text-slate-500 truncate">{member.email || 'No Email Provided'}</p>
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <CheckCircle2 size={10} className="text-emerald-400" />
                                                                <span className="text-[10px] text-emerald-400 font-bold uppercase">{member.role || 'MEMBER'}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Per-team remove buttons */}
                                                    <div className="space-y-2">
                                                        {visibleTeams.length === 0 ? (
                                                            <div className="text-xs text-slate-500 italic bg-white/5 px-3 py-2 rounded-xl text-center">
                                                                No teams assigned yet.
                                                            </div>
                                                        ) : (
                                                            visibleTeams.map(teamId => (
                                                                <div key={teamId} className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
                                                                    <span className="text-xs font-black text-primary uppercase tracking-wider">{teamId}</span>
                                                                    <button
                                                                        onClick={() => handleRemoveMember(member, teamId)}
                                                                        disabled={actionLoading === member.uid + teamId + 'remove'}
                                                                        className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all text-xs font-bold disabled:opacity-50"
                                                                    >
                                                                        <UserX size={12} />
                                                                        {actionLoading === member.uid + teamId + 'remove' ? 'Removing...' : 'Remove'}
                                                                    </button>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
                {activeTab === 'users' && (
                    <motion.div key="users" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                        <div className="glass-panel p-8 rounded-3xl border-t-2 border-t-primary/30">
                            <h3 className="text-xl font-bold text-slate-200 mb-6 flex items-center gap-2">
                                <Users size={24} />
                                All Registered App Users
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-white/5 text-slate-400 text-xs font-black border border-white/10">
                                    {allUsers.length} total
                                </span>
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {allUsers.map(u => (
                                    <div key={u.uid} className="bg-surface-elevated p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                                            {(u.displayName || resolveNameFromEmail(u.email)).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-200 truncate text-sm">
                                                {u.displayName || resolveNameFromEmail(u.email)}
                                            </p>
                                            <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                                            <div className="flex gap-1 mt-1">
                                                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-widest ${
                                                    u.role === 'CAPTAIN' ? 'bg-red-500/20 text-red-400' :
                                                    u.role === 'TEAM_LEAD' ? 'bg-primary/20 text-primary' :
                                                    'bg-white/5 text-slate-500'
                                                }`}>
                                                    {u.role || 'MEMBER'}
                                                </span>
                                            </div>
                                        </div>
                                        {isCaptainMode && u.role === 'MEMBER' && (!u.teams || u.teams.length === 0) && (
                                            <button
                                                onClick={() => handleDeleteUser(u.uid, u.displayName || u.email)}
                                                disabled={actionLoading === u.uid + 'delete'}
                                                className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Delete User Account"
                                            >
                                                {actionLoading === u.uid + 'delete' ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <Trash2 size={16} />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Info Banner */}
            <div className="glass-panel p-4 rounded-2xl border border-primary/10 flex items-start gap-3">
                <AlertCircle size={18} className="text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-slate-300">How it works:</strong> When a new engineer signs in, they are directed to the Team Selection page where they pick their subsystem(s) and submit a join request.
                    That request appears here for you to <strong className="text-green-400">Approve</strong> or <strong className="text-red-400">Reject</strong>.
                    Once approved, use the <strong className="text-red-400">Approved Members</strong> tab to remove members from teams at any time.
                </div>
            </div>
        </div>
    );
}

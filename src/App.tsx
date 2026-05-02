import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { seedSubsystems } from './services/subsystemService';
import Layout from './components/Layout';
import { AppView } from './types';
import Dashboard from './components/Dashboard';
import Teams from './components/Teams';
import Posts from './components/Posts';
import Queries from './components/Queries';
import Login from './components/Login';
import TeamSelection from './components/TeamSelection';
import ProfileOnboarding from './components/ProfileOnboarding';
import AdminPanel from './components/AdminPanel';
import DriveWorkspace from './components/DriveWorkspace';
import { ShieldAlert } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('dashboard');

  useEffect(() => {
    seedSubsystems().catch(e => {
       if (e.message.includes('permission_denied')) {
         console.warn("[App] Client-side seeding denied - this is expected if rules are locked.");
       } else {
         console.error("[App] Seeding failed:", e);
       }
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs font-bold tracking-widest text-primary uppercase">Initializing ASTRA...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="w-20 h-20 bg-error/10 rounded-3xl flex items-center justify-center mx-auto text-error border border-error/20">
             <ShieldAlert size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter">Profile Unavailable</h1>
            <p className="text-slate-400 leading-relaxed">
              We couldn't synchronize your engineering profile with the mission database. This usually happens during network transitions or if the database is under maintenance.
            </p>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
             Current Status: <span className="text-error">Database Handshake Failed</span>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-white text-black font-black rounded-2xl hover:bg-primary transition-all shadow-xl shadow-white/5 active:scale-[0.98]"
          >
            Reconnect to ASTRA
          </button>
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
            If this persists, contact the App Technician (25mz122@skcet.ac.in)
          </p>
        </div>
      </div>
    );
  }

  const privilegedRoles = ['CAPTAIN', 'TEAM_LEAD'];
  const isPrivileged = privilegedRoles.includes(profile?.role || '');

  if (!isPrivileged && profile?.role === 'MEMBER') {
    if (!profile.onboarded) {
      return <ProfileOnboarding />;
    }
    
    const hasApprovedTeam = profile.teams?.some(t => t.status === 'APPROVED');
    if (!hasApprovedTeam) {
      // Show TeamSelection — it handles both "choose teams" and "pending approval" states
      return <TeamSelection />;
    }
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'teams': return <Teams />;
      case 'posts': return <Posts />;
      case 'queries': return <Queries />;
      case 'admin': return <AdminPanel />;
      case 'workspace': return <DriveWorkspace />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {renderView()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

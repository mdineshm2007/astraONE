import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { seedSubsystems } from './services/subsystemService';
import Layout from './components/Layout';
import { AppView } from './types';
import Dashboard from './components/Dashboard';
import Teams from './components/Teams';
import Notebooks from './components/Notebooks';
import Posts from './components/Posts';
import Queries from './components/Queries';
import Login from './components/Login';
import TeamSelection from './components/TeamSelection';
import AdminPanel from './components/AdminPanel';
import DriveWorkspace from './components/DriveWorkspace';
import { ShieldAlert } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('dashboard');

  useEffect(() => {
    seedSubsystems();
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
        <div className="max-w-md space-y-4">
          <div className="w-16 h-16 bg-error/20 rounded-2xl flex items-center justify-center mx-auto text-error">
             <ShieldAlert size={32} />
          </div>
          <h1 className="text-2xl font-bold">Profile Unavailable</h1>
          <p className="text-slate-400">
            We couldn't load your engineering profile. This usually happens if your account doesn't have the required permissions or the database is misconfigured.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const privilegedRoles = ['CAPTAIN', 'TEAM_LEAD'];
  const isPrivileged = privilegedRoles.includes(profile?.role || '');

  if (!isPrivileged && profile?.role === 'MEMBER') {
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
      case 'notebooks': return <Notebooks />;
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

import { useAuth } from '../contexts/AuthContext';
import { Rocket, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const { signIn } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-tertiary/10 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel-elevated p-12 rounded-3xl max-w-md w-full text-center relative z-10"
      >
        <div className="w-20 h-20 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-8 border border-primary/20">
          <Rocket className="text-primary" size={40} />
        </div>
        
        <h1 className="text-4xl font-black tracking-tighter mb-4">ASTRA</h1>
        <p className="text-slate-400 mb-10 leading-relaxed">
          Solar Car Intelligence & Team Management Platform. Secure portal for engineering team only.
        </p>

        <button 
          onClick={signIn}
          className="w-full bg-primary text-[#001f2e] font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all glow-primary"
        >
          <LogIn size={20} />
          Authenticate with SSO
        </button>
        
        <div className="mt-8 pt-8 border-t border-primary/10 flex justify-center gap-4 text-[10px] uppercase font-bold tracking-widest text-slate-500">
           <span>Solar Car v2.4</span>
           <span>•</span>
           <span>R&D Hub</span>
        </div>
      </motion.div>
    </div>
  );
}

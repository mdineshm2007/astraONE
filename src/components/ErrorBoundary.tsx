import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="glass-panel max-w-md w-full p-8 rounded-3xl text-center space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-error/20 rounded-full flex items-center justify-center mx-auto mb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-error/20 animate-ping rounded-full" />
                <AlertCircle className="text-error relative z-10" size={40} />
            </div>
            
            <div>
                <h1 className="text-2xl font-black text-white mb-2 tracking-tight">System Error</h1>
                <p className="text-slate-400 text-sm">A critical failure occurred in the UI render pipeline.</p>
            </div>

            {this.state.error && (
                <div className="bg-black/50 p-4 rounded-xl text-left border border-error/20 overflow-x-auto">
                    <p className="text-error font-mono text-xs">{this.state.error.toString()}</p>
                </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <RotateCcw size={18} />
              Reboot System
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

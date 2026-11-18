import React from 'react';
import { AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react';
import { startupDiagnostics } from '../utils/startupDiagnostics';

interface Props {
  children: React.ReactNode;
  sectionName?: string;
  onReset?: () => void;
  onNavigateDashboard?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[SectionErrorBoundary:${this.props.sectionName || 'Generic'}] Render error:`, error, errorInfo);
    startupDiagnostics.record(
      'recovery_invoked',
      `Section render failure in ${this.props.sectionName || 'Workspace'}: ${error?.message || 'unknown'}`
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const sectionTitle = this.props.sectionName || 'Section';
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="p-6 sm:p-8 max-w-2xl mx-auto my-8 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-4"
        >
          <div className="mx-auto w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200/80 dark:border-amber-800/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Unable to Display {sectionTitle}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              An unexpected display issue occurred in this section. Your user session and other school workspace tools remain active.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex items-center space-x-2 bg-[#075E42] hover:bg-[#054531] text-white font-semibold text-xs sm:text-sm py-2 px-4 rounded-xl transition cursor-pointer shadow-xs active:scale-98"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Try Reloading Section</span>
            </button>

            {this.props.onNavigateDashboard && (
              <button
                type="button"
                onClick={this.props.onNavigateDashboard}
                className="inline-flex items-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm py-2 px-4 rounded-xl transition cursor-pointer border border-slate-200/80 dark:border-slate-700"
              >
                <LayoutDashboard className="w-4 h-4 text-slate-500" />
                <span>Return to Dashboard</span>
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

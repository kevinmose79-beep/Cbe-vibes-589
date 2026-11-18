import React from 'react';
import { WifiOff, ServerOff, Clock, AlertTriangle, RefreshCw, LogIn, ArrowRight } from 'lucide-react';
import { User, School } from '../types';

export type StartupRecoveryReason =
  | 'no_internet'
  | 'supabase_unavailable'
  | 'startup_timeout'
  | 'data_load_error'
  | 'general_error';

export interface StartupRecoveryScreenProps {
  reason: StartupRecoveryReason;
  school?: School;
  cachedUser?: User | null;
  customMessage?: string;
  onRetry: () => void;
  onContinueCached?: () => void;
  onProceedLogin?: () => void;
  onResetSession?: () => void;
}

export const StartupRecoveryScreen: React.FC<StartupRecoveryScreenProps> = ({
  reason,
  school,
  cachedUser,
  customMessage,
  onRetry,
  onContinueCached,
  onProceedLogin,
  onResetSession,
}) => {
  const getReasonConfig = () => {
    switch (reason) {
      case 'no_internet':
        return {
          icon: <WifiOff className="w-8 h-8 text-amber-600 dark:text-amber-400" />,
          badge: 'No Internet Connection',
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300/60',
          title: 'You Are Currently Offline',
          description:
            customMessage ||
            'No active network connection was detected on your device. You can verify your Wi-Fi or mobile data connection and try again.',
          canProceedCached: Boolean(cachedUser),
        };
      case 'supabase_unavailable':
        return {
          icon: <ServerOff className="w-8 h-8 text-rose-600 dark:text-rose-400" />,
          badge: 'Server Temporarily Unavailable',
          badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300/60',
          title: 'School Database Server Unreachable',
          description:
            customMessage ||
            'The central database server is currently taking too long to respond. This is typically temporary during maintenance or intermittent connectivity.',
          canProceedCached: Boolean(cachedUser),
        };
      case 'startup_timeout':
        return {
          icon: <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />,
          badge: 'Startup Delay',
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300/60',
          title: 'Startup Taking Longer Than Usual',
          description:
            customMessage ||
            'Connecting to the school server is taking more time than expected. You may retry or continue using your existing session.',
          canProceedCached: Boolean(cachedUser),
        };
      case 'data_load_error':
        return {
          icon: <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />,
          badge: 'Data Synchronisation Notice',
          badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300/60',
          title: 'Unable to Complete Data Refresh',
          description:
            customMessage ||
            'The application was unable to complete the initial data synchronisation. Your cached records are safe and you can retry the connection.',
          canProceedCached: Boolean(cachedUser),
        };
      default:
        return {
          icon: <AlertTriangle className="w-8 h-8 text-rose-600 dark:text-rose-400" />,
          badge: 'Startup Alert',
          badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300/60',
          title: 'Application Startup Issue',
          description:
            customMessage ||
            'An unexpected issue occurred while starting the application. Please retry or reload to continue.',
          canProceedCached: false,
        };
    }
  };

  const config = getReasonConfig();

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] text-slate-900 dark:text-slate-100 font-sans"
    >
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Status Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shadow-xs">
          {config.icon}
        </div>

        {/* Header & Status Badge */}
        <div className="space-y-2">
          <div
            className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${config.badgeColor}`}
          >
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span>{config.badge}</span>
          </div>

          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            {config.title}
          </h1>

          {school?.school_name && (
            <p className="text-xs font-medium text-[#176B45] dark:text-emerald-400">
              {school.school_name}
            </p>
          )}

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            {config.description}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="w-full flex items-center justify-center space-x-2 bg-[#075E42] hover:bg-[#054531] text-white font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer shadow-sm active:scale-98"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>

          {config.canProceedCached && cachedUser && onContinueCached && (
            <button
              type="button"
              onClick={onContinueCached}
              className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition cursor-pointer border border-slate-200/80 dark:border-slate-700"
            >
              <span>Continue with Cached Session ({cachedUser.name})</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {onProceedLogin && (
            <button
              type="button"
              onClick={onProceedLogin}
              className="w-full flex items-center justify-center space-x-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 text-xs sm:text-sm py-2 px-4 rounded-xl transition cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <LogIn className="w-4 h-4 text-slate-400" />
              <span>Go to Login Screen</span>
            </button>
          )}

          {onResetSession && (
            <button
              type="button"
              onClick={onResetSession}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline cursor-pointer pt-1"
            >
              Reset Local Session State
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

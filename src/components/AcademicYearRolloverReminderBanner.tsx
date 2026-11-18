import React from 'react';
import { Calendar, ChevronRight, X, AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { AcademicYearReminder, dismissAcademicYearReminder } from '../utils/academicYearReminderUtils';
import { getKenyaCalendarToday } from '../utils/kenyaDateUtils';

interface AcademicYearRolloverReminderBannerProps {
  reminder: AcademicYearReminder;
  onNavigateToSession: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

export const AcademicYearRolloverReminderBanner: React.FC<AcademicYearRolloverReminderBannerProps> = ({
  reminder,
  onNavigateToSession,
  onDismiss,
  compact = false,
}) => {
  const handleDismiss = () => {
    const todayStr = getKenyaCalendarToday();
    dismissAcademicYearReminder(reminder.academicYear.id, todayStr);
    if (onDismiss) {
      onDismiss();
    }
  };

  const isWarning = reminder.type === 'configuration_warning';
  const isUrgent = reminder.type === 'ready_for_review' || reminder.type === 'imminent_end';

  return (
    <div
      role="region"
      aria-label="Academic Year Rollover Reminder"
      className={`rounded-xl border shadow-xs transition-all duration-200 ${
        isWarning
          ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300/80 dark:border-amber-800 text-amber-950 dark:text-amber-100'
          : isUrgent
          ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300/80 dark:border-amber-800 text-amber-950 dark:text-amber-100'
          : 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300/80 dark:border-emerald-800 text-emerald-950 dark:text-emerald-100'
      } ${compact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5'}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Icon & Text Info */}
        <div className="flex items-start space-x-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${
              isWarning || isUrgent
                ? 'bg-amber-500 dark:bg-amber-600 text-white'
                : 'bg-[#176B45] dark:bg-[#2E7D5B] text-white'
            }`}
          >
            {isWarning ? (
              <AlertTriangle className="w-4 h-4" />
            ) : isUrgent ? (
              reminder.type === 'ready_for_review' ? (
                <CalendarDays className="w-4 h-4 animate-pulse motion-reduce:animate-none" />
              ) : (
                <Clock className="w-4 h-4" />
              )
            ) : (
              <Calendar className="w-4 h-4" />
            )}
          </div>

          <div className="space-y-0.5 min-w-0">
            {/* Badges / Metadata */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span
                className={`text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                  isWarning || isUrgent
                    ? 'bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                    : 'bg-emerald-200/70 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700'
                }`}
              >
                {reminder.type === 'configuration_warning'
                  ? 'Configuration Notice'
                  : reminder.type === 'upcoming_review'
                  ? 'Upcoming Rollover Preparation'
                  : reminder.type === 'imminent_end'
                  ? 'Academic Year Concluding'
                  : 'Rollover Review Ready'}
              </span>

              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Academic Year {reminder.academicYear.year}
              </span>

              {reminder.daysRemaining !== undefined && (
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-white/70 dark:bg-slate-800/70 px-2 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60">
                  {reminder.daysRemaining > 0
                    ? `${reminder.daysRemaining} days remaining`
                    : reminder.daysRemaining === 0
                    ? 'Concluding Today'
                    : `${Math.abs(reminder.daysRemaining)} days since conclusion`}
                </span>
              )}

              {reminder.source === 'term_3_closing_date' && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                  (via Term 3 schedule)
                </span>
              )}
            </div>

            {/* Headline */}
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 pt-0.5">
              {reminder.headline}
            </h3>

            {/* Subtext description */}
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {reminder.subtext}
            </p>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center space-x-2 w-full sm:w-auto shrink-0 justify-end pt-1 sm:pt-0">
          <button
            type="button"
            onClick={onNavigateToSession}
            className={`flex-1 sm:flex-none text-xs font-semibold px-3.5 py-2 rounded-lg transition-all flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer focus:outline-none focus:ring-2 active:scale-[0.98] ${
              isWarning || isUrgent
                ? 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-400'
                : 'bg-[#176B45] hover:bg-[#0F5132] text-white focus:ring-emerald-400'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>
              {isWarning ? 'Configure Session Dates' : 'Review Rollover Readiness'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss Reminder"
              title="Dismiss reminder for today"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

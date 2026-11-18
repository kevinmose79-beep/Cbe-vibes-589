import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import {
  getClockFormatPreference,
  formatTimeByPreference,
  CLOCK_FORMAT_STORAGE_KEY,
  ClockFormatPreference,
} from '../utils/clockPreferenceUtils';

export interface DashboardClockProps {
  className?: string;
  showIcon?: boolean;
  showDate?: boolean;
  timeClassName?: string;
  dateClassName?: string;
  iconClassName?: string;
  /** Optional custom date for deterministic rendering or testing */
  customDate?: Date;
}

/**
 * Formats a Date object to full British English calendar date.
 * Example: "Thursday, 29 October 2026"
 * Strictly uses local device time with no timezone label.
 */
export function formatDateBritish(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Alias for formatDateBritish matching common British date formatting naming */
export const formatBritishDate = formatDateBritish;

/**
 * Formats the time string strictly respecting preference and ensuring leading zeroes.
 * Replaces any ICU narrow no-break space (U+202F) with a standard space.
 */
export function formatClockTime(
  date: Date,
  format: ClockFormatPreference = getClockFormatPreference()
): string {
  const raw = formatTimeByPreference(date, format);
  // Normalize ICU narrow no-break space (U+202F) to standard ASCII space
  const normalized = raw.replace(/\u202F/g, ' ').trim();
  // Ensure two-digit hour leading zero if single digit (e.g., "9:05:08 AM" -> "09:05:08 AM")
  if (/^\d:\d\d:\d\d/.test(normalized)) {
    return '0' + normalized;
  }
  return normalized;
}

/**
 * Custom React hook for running digital clock logic.
 * Manages interval ticking, background wake refresh, storage synchronization,
 * and custom event subscriptions for format updates.
 */
export function useRunningClock(customDate?: Date) {
  const [format, setFormat] = useState<ClockFormatPreference>(() => getClockFormatPreference());
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  useEffect(() => {
    // 1. Initial format synchronization from persistent storage
    setFormat(getClockFormatPreference());

    // 2. Custom event listener for real-time format changes across components
    const handleFormatChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ format?: ClockFormatPreference }>;
      const newFormat = customEvent.detail?.format;
      if (newFormat === '12h' || newFormat === '24h') {
        setFormat(newFormat);
      } else {
        setFormat(getClockFormatPreference());
      }
    };

    // 3. Storage event listener for multi-tab synchronization
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CLOCK_FORMAT_STORAGE_KEY) {
        setFormat(getClockFormatPreference());
      }
    };

    // 4. Background return handlers: recalculate immediately from fresh Date
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        setCurrentTime(new Date());
      }
    };

    const handleFocus = () => {
      setCurrentTime(new Date());
    };

    // 5. 1-second interval ticking a fresh Date object
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    if (typeof window !== 'undefined') {
      window.addEventListener('cbe-clock-format-changed', handleFormatChange);
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('focus', handleFocus);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // 6. Complete cleanup on unmount
    return () => {
      clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('cbe-clock-format-changed', handleFormatChange);
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('focus', handleFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, []);

  const activeDate = customDate || currentTime;
  const timeString = formatClockTime(activeDate, format);
  const dateString = formatDateBritish(activeDate);

  return {
    format,
    currentTime: activeDate,
    timeString,
    dateString,
  };
}

/**
 * Reusable Running Digital Clock Component
 *
 * Displays local system time and date formatted according to the administrator's
 * configured preference ('24h' or '12h').
 *
 * Features:
 * - Continuously updating digital clock ('HH:MM:SS' or 'HH:MM:SS AM/PM').
 * - Full British-English date ('Thursday, 29 October 2026').
 * - Respects the administrator's saved clock-format preference with '24h' fallback.
 * - Subscribes to 'cbe-clock-format-changed' custom event for real-time format updates.
 * - Accurate time refresh upon returning from background (visibilitychange / focus).
 * - Full cleanup of timers and event listeners on unmount.
 * - Accessible: no audio-spamming live region polling every second.
 * - Pure local device time: no time zone, UTC label, or location indicators.
 */
export const DashboardClock: React.FC<DashboardClockProps> = ({
  className = '',
  showIcon = true,
  showDate = true,
  timeClassName = '',
  dateClassName = '',
  iconClassName = '',
  customDate,
}) => {
  const { timeString, dateString } = useRunningClock(customDate);

  return (
    <div
      className={`inline-flex items-center gap-2.5 sm:gap-3 text-slate-700 dark:text-slate-200 ${className}`}
      role="group"
      aria-label={showDate ? `Current time: ${timeString}, ${dateString}` : `Current time: ${timeString}`}
    >
      {showIcon && (
        <div className="flex items-center justify-center p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#075E42] dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
          <Clock className={`w-4 h-4 ${iconClassName}`} aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2">
        <span
          data-testid="dashboard-clock-time"
          className={`font-mono text-sm sm:text-base font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100 ${timeClassName}`}
        >
          {timeString}
        </span>
        {showDate && (
          <span
            data-testid="dashboard-clock-date"
            className={`text-xs text-slate-500 dark:text-slate-400 font-medium ${dateClassName}`}
          >
            {dateString}
          </span>
        )}
      </div>
    </div>
  );
};

export default DashboardClock;

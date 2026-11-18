import { AcademicYear, SchoolTerm } from '../types';
import { getKenyaCalendarToday, formatKenyaDate } from './kenyaDateUtils';

export type AcademicYearReminderType =
  | 'upcoming_review'        // 14–30 days remaining
  | 'imminent_end'           // 1–13 days remaining
  | 'ready_for_review'        // 0 days (today) or passed end date
  | 'configuration_warning';  // missing or invalid end date and Term 3 closing date

export interface AcademicYearReminder {
  academicYear: AcademicYear;
  type: AcademicYearReminderType;
  title: string;
  headline: string;
  subtext: string;
  endDate?: string;
  formattedEndDate?: string;
  daysRemaining?: number;
  source: 'academic_year_end_date' | 'term_3_closing_date' | 'none';
  isConfigured: boolean;
}

export interface AcademicYearReminderCheckParams {
  activeAcademicYear?: AcademicYear | null;
  schoolTerms?: SchoolTerm[];
  customDate?: Date | string | number;
  checkDismissed?: boolean;
}

const DISMISS_STORAGE_PREFIX = 'cbe_dismissed_ay_rollover_reminder_';
const memoryDismissedSet = new Set<string>();

/**
 * Validates whether a given string is a valid ISO date 'YYYY-MM-DD'.
 */
export function isValidIsoDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;

  const [year, month, day] = trimmed.split('-').map(Number);
  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

/**
 * Calculates calendar day difference between two 'YYYY-MM-DD' dates.
 * Returns targetDate - today (positive if targetDate is in the future).
 */
export function getCalendarDayDifference(todayStr: string, targetDateStr: string): number {
  const [y1, m1, d1] = todayStr.split('-').map(Number);
  const [y2, m2, d2] = targetDateStr.split('-').map(Number);

  const utc1 = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const utc2 = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utc2 - utc1) / msPerDay);
}

/**
 * Checks if a reminder for a specific academic year and date has been dismissed in the current session.
 */
export function isAcademicYearReminderDismissed(academicYearId: string, dateStr: string): boolean {
  const key = `${DISMISS_STORAGE_PREFIX}${academicYearId}_${dateStr}`;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      return window.sessionStorage.getItem(key) === 'true';
    } catch {
      return memoryDismissedSet.has(key);
    }
  }
  return memoryDismissedSet.has(key);
}

/**
 * Records dismissal of an academic year reminder for the current session/calendar day.
 */
export function dismissAcademicYearReminder(academicYearId: string, dateStr: string): void {
  const key = `${DISMISS_STORAGE_PREFIX}${academicYearId}_${dateStr}`;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(key, 'true');
    } catch {
      memoryDismissedSet.add(key);
    }
  } else {
    memoryDismissedSet.add(key);
  }
}

/**
 * Clears in-memory and session storage dismissals (for testing and session resets).
 */
export function resetDismissedAcademicYearReminders(): void {
  memoryDismissedSet.clear();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith(DISMISS_STORAGE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

/**
 * Evaluates whether an administrator reminder should be displayed for an approaching or concluded
 * academic year to prepare for rollover.
 * 
 * Strict Safety Invariants:
 * - Purely informational: Never calls perform_academic_year_rollover or mutates any records.
 * - Respects Kenya calendar day boundaries (Africa/Nairobi).
 * - Primary source: activeAcademicYear.end_date
 * - Secondary fallback: activeAcademicYear's Term 3 closing_date
 * - Missing/Invalid date: returns clear configuration warning.
 */
export function getAcademicYearRolloverReminder({
  activeAcademicYear,
  schoolTerms = [],
  customDate,
  checkDismissed = true,
}: AcademicYearReminderCheckParams): AcademicYearReminder | null {
  if (!activeAcademicYear || activeAcademicYear.status !== 'Active') {
    return null;
  }

  const todayStr = getKenyaCalendarToday(customDate);

  if (checkDismissed && isAcademicYearReminderDismissed(activeAcademicYear.id, todayStr)) {
    return null;
  }

  // 1. Resolve authoritative end date
  let resolvedEndDate: string | undefined;
  let source: 'academic_year_end_date' | 'term_3_closing_date' | 'none' = 'none';

  if (isValidIsoDate(activeAcademicYear.end_date)) {
    resolvedEndDate = activeAcademicYear.end_date?.trim();
    source = 'academic_year_end_date';
  } else {
    // 2. Fallback to Term 3 closing date
    const term3 = schoolTerms.find(
      (t) =>
        t.term_name === 'Term 3' &&
        (t.academic_year_id === activeAcademicYear.id || t.year === activeAcademicYear.year)
    );

    if (term3 && isValidIsoDate(term3.closing_date)) {
      resolvedEndDate = term3.closing_date.trim();
      source = 'term_3_closing_date';
    }
  }

  // 3. If neither end_date nor Term 3 closing_date is configured/valid -> Configuration Warning
  if (!resolvedEndDate || source === 'none') {
    return {
      academicYear: activeAcademicYear,
      type: 'configuration_warning',
      title: `⚠️ Academic Year ${activeAcademicYear.year} Timeline Notice`,
      headline: `No valid end date configured for Academic Year ${activeAcademicYear.year}.`,
      subtext: `Configure the academic year end date or Term 3 closing date in Academic Session Control to monitor the rollover timeline.`,
      source: 'none',
      isConfigured: false,
    };
  }

  const formattedEndDate = formatKenyaDate(resolvedEndDate);
  const daysRemaining = getCalendarDayDifference(todayStr, resolvedEndDate);

  // 4. On or after the end date (daysRemaining <= 0)
  if (daysRemaining <= 0) {
    return {
      academicYear: activeAcademicYear,
      type: 'ready_for_review',
      title: `🔔 Academic Year ${activeAcademicYear.year} Rollover Review Ready`,
      headline:
        daysRemaining === 0
          ? `Academic Year ${activeAcademicYear.year} reaches its scheduled conclusion today (${formattedEndDate}).`
          : `Academic Year ${activeAcademicYear.year} concluded on ${formattedEndDate}.`,
      subtext: `Review academic year readiness, verify upcoming Term 1 dates, and review learner promotion cohorts when the school is ready.`,
      endDate: resolvedEndDate,
      formattedEndDate,
      daysRemaining,
      source,
      isConfigured: true,
    };
  }

  // 5. 1–13 days before end date
  if (daysRemaining >= 1 && daysRemaining <= 13) {
    return {
      academicYear: activeAcademicYear,
      type: 'imminent_end',
      title: `🔔 Academic Year ${activeAcademicYear.year} Concluding Soon`,
      headline:
        daysRemaining === 1
          ? `Academic Year ${activeAcademicYear.year} concludes tomorrow (${formattedEndDate}).`
          : `Academic Year ${activeAcademicYear.year} concludes in ${daysRemaining} days (${formattedEndDate}).`,
      subtext: `Ensure all Term 3 marks and assessments are approved and finalized before planning learner progression and academic year rollover.`,
      endDate: resolvedEndDate,
      formattedEndDate,
      daysRemaining,
      source,
      isConfigured: true,
    };
  }

  // 6. 14–30 days before end date
  if (daysRemaining >= 14 && daysRemaining <= 30) {
    return {
      academicYear: activeAcademicYear,
      type: 'upcoming_review',
      title: `🔔 Academic Year ${activeAcademicYear.year} Rollover Preparation`,
      headline: `Academic Year ${activeAcademicYear.year} ends in ${daysRemaining} days (${formattedEndDate}).`,
      subtext: `Begin preliminary preparations for the upcoming academic year. Review curriculum allocations and term dates before initiating rollover.`,
      endDate: resolvedEndDate,
      formattedEndDate,
      daysRemaining,
      source,
      isConfigured: true,
    };
  }

  // More than 30 days before end date -> No reminder required yet
  return null;
}

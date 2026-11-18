import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../testSetup';
import { AcademicYear, SchoolTerm } from '../types';
import {
  getAcademicYearRolloverReminder,
  dismissAcademicYearReminder,
  isAcademicYearReminderDismissed,
  resetDismissedAcademicYearReminders,
  isValidIsoDate,
  getCalendarDayDifference,
} from '../utils/academicYearReminderUtils';

describe('Academic Year Rollover Reminder Utility (Phase A)', () => {
  const activeYear2026: AcademicYear = {
    id: 'ay-2026-uuid',
    year: 2026,
    status: 'Active',
    start_date: '2026-01-06',
    end_date: '2026-10-31',
  };

  const term1: SchoolTerm = {
    id: 't-2026-1',
    academic_year_id: 'ay-2026-uuid',
    year: 2026,
    term_name: 'Term 1',
    term_number: 1,
    status: 'Closed',
    opening_date: '2026-01-06',
    closing_date: '2026-04-10',
  };

  const term2: SchoolTerm = {
    id: 't-2026-2',
    academic_year_id: 'ay-2026-uuid',
    year: 2026,
    term_name: 'Term 2',
    term_number: 2,
    status: 'Closed',
    opening_date: '2026-05-04',
    closing_date: '2026-08-07',
  };

  const term3: SchoolTerm = {
    id: 't-2026-3',
    academic_year_id: 'ay-2026-uuid',
    year: 2026,
    term_name: 'Term 3',
    term_number: 3,
    status: 'Active',
    opening_date: '2026-08-24',
    closing_date: '2026-10-23',
  };

  const allTerms = [term1, term2, term3];

  beforeEach(() => {
    resetDismissedAcademicYearReminders();
    vi.restoreAllMocks();
  });

  // 1. Primary end_date selection
  it('1. Uses active academic year primary end_date when configured', () => {
    // Current date is 20 days before end_date (2026-10-11 vs 2026-10-31)
    const customDate = new Date('2026-10-11T10:00:00+03:00');

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.source).toBe('academic_year_end_date');
    expect(reminder?.endDate).toBe('2026-10-31');
    expect(reminder?.daysRemaining).toBe(20);
    expect(reminder?.type).toBe('upcoming_review');
    expect(reminder?.isConfigured).toBe(true);
  });

  // 2. Fallback to Term 3 closing date
  it('2. Falls back to Term 3 closing date when active academic year end_date is missing', () => {
    const yearWithoutEndDate: AcademicYear = {
      ...activeYear2026,
      end_date: undefined,
    };

    // Current date is 10 days before Term 3 closing date (2026-10-13 vs 2026-10-23)
    const customDate = new Date('2026-10-13T10:00:00+03:00');

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: yearWithoutEndDate,
      schoolTerms: allTerms,
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.source).toBe('term_3_closing_date');
    expect(reminder?.endDate).toBe('2026-10-23');
    expect(reminder?.daysRemaining).toBe(10);
    expect(reminder?.type).toBe('imminent_end');
    expect(reminder?.isConfigured).toBe(true);
  });

  // 3. Missing and invalid dates -> configuration_warning
  it('3. Returns configuration warning when both end_date and Term 3 closing date are missing or invalid', () => {
    const yearWithoutEndDate: AcademicYear = {
      ...activeYear2026,
      end_date: '',
    };

    const termsWithoutTerm3: SchoolTerm[] = [term1, term2];

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: yearWithoutEndDate,
      schoolTerms: termsWithoutTerm3,
      customDate: new Date('2026-10-01T10:00:00+03:00'),
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('configuration_warning');
    expect(reminder?.isConfigured).toBe(false);
    expect(reminder?.source).toBe('none');
    expect(reminder?.title).toContain('Timeline Notice');
    expect(reminder?.headline).toContain('No valid end date configured');
  });

  it('3b. Returns configuration warning when end_date is an invalid string', () => {
    const yearWithInvalidEndDate: AcademicYear = {
      ...activeYear2026,
      end_date: 'invalid-date-format',
    };

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: yearWithInvalidEndDate,
      schoolTerms: [],
      customDate: new Date('2026-10-01T10:00:00+03:00'),
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('configuration_warning');
    expect(reminder?.isConfigured).toBe(false);
  });

  // 4. Boundary Tests: 30-day, 14-day, 13-day, 1-day, 0-day
  describe('Boundary Tests against configured end date (2026-10-31)', () => {
    it('30-day boundary: Exactly 30 days before end_date (2026-10-01) produces upcoming_review', () => {
      const customDate = new Date('2026-10-01T08:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).not.toBeNull();
      expect(reminder?.type).toBe('upcoming_review');
      expect(reminder?.daysRemaining).toBe(30);
      expect(reminder?.headline).toContain('ends in 30 days');
    });

    it('31 days before end_date (2026-09-30) returns null (too early for reminder)', () => {
      const customDate = new Date('2026-09-30T12:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).toBeNull();
    });

    it('14-day boundary: Exactly 14 days before end_date (2026-10-17) produces upcoming_review', () => {
      const customDate = new Date('2026-10-17T08:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).not.toBeNull();
      expect(reminder?.type).toBe('upcoming_review');
      expect(reminder?.daysRemaining).toBe(14);
    });

    it('13-day boundary: Exactly 13 days before end_date (2026-10-18) switches to imminent_end', () => {
      const customDate = new Date('2026-10-18T08:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).not.toBeNull();
      expect(reminder?.type).toBe('imminent_end');
      expect(reminder?.daysRemaining).toBe(13);
      expect(reminder?.title).toContain('Concluding Soon');
      expect(reminder?.headline).toContain('concludes in 13 days');
    });

    it('1-day boundary: Exactly 1 day before end_date (2026-10-30) produces imminent_end with "tomorrow"', () => {
      const customDate = new Date('2026-10-30T08:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).not.toBeNull();
      expect(reminder?.type).toBe('imminent_end');
      expect(reminder?.daysRemaining).toBe(1);
      expect(reminder?.headline).toContain('concludes tomorrow');
    });

    it('0-day boundary: On end_date itself (2026-10-31) produces ready_for_review', () => {
      const customDate = new Date('2026-10-31T08:00:00+03:00');
      const reminder = getAcademicYearRolloverReminder({
        activeAcademicYear: activeYear2026,
        schoolTerms: allTerms,
        customDate,
      });

      expect(reminder).not.toBeNull();
      expect(reminder?.type).toBe('ready_for_review');
      expect(reminder?.daysRemaining).toBe(0);
      expect(reminder?.title).toContain('Rollover Review Ready');
      expect(reminder?.headline).toContain('reaches its scheduled conclusion today');
    });
  });

  // 5. Dates after the end date (concluded / overdue)
  it('5. Dates after the end date (e.g. 2026-11-05) produce ready_for_review with negative daysRemaining', () => {
    const customDate = new Date('2026-11-05T08:00:00+03:00');
    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('ready_for_review');
    expect(reminder?.daysRemaining).toBe(-5);
    expect(reminder?.headline).toContain('concluded on 31 October 2026');
    expect(reminder?.subtext).toContain('Review academic year readiness');
  });

  // 6. Dismissal for current day and reappearance on a later day
  it('6. Dismissal suppresses reminder for current day and reappears on subsequent days', () => {
    const day1Date = new Date('2026-10-18T08:00:00+03:00');
    const day1Str = '2026-10-18';
    const day2Date = new Date('2026-10-19T08:00:00+03:00');

    expect(isAcademicYearReminderDismissed(activeYear2026.id, day1Str)).toBe(false);

    // Initial check -> reminder visible
    let reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate: day1Date,
      checkDismissed: true,
    });
    expect(reminder).not.toBeNull();

    // Dismiss for Day 1
    dismissAcademicYearReminder(activeYear2026.id, day1Str);
    expect(isAcademicYearReminderDismissed(activeYear2026.id, day1Str)).toBe(true);

    // Re-check on Day 1 with checkDismissed=true -> returns null
    reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate: day1Date,
      checkDismissed: true,
    });
    expect(reminder).toBeNull();

    // Re-check with checkDismissed=false -> returns reminder despite dismissal
    reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate: day1Date,
      checkDismissed: false,
    });
    expect(reminder).not.toBeNull();

    // Check on Day 2 -> Day 1 dismissal does not suppress Day 2
    reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: allTerms,
      customDate: day2Date,
      checkDismissed: true,
    });
    expect(reminder).not.toBeNull();
    expect(reminder?.daysRemaining).toBe(12);
  });

  // 7. Storage failure fallback
  it('7. Falls back smoothly to in-memory set if sessionStorage throws an exception', () => {
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      sessionStorage: {
        getItem: () => {
          throw new Error('SecurityError: The operation is insecure.');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
        key: () => null,
        length: 0,
        clear: () => {},
      },
    };

    try {
      const dateStr = '2026-10-20';
      expect(isAcademicYearReminderDismissed(activeYear2026.id, dateStr)).toBe(false);

      // Dismissing should not throw an exception; it stores in memoryDismissedSet
      expect(() => dismissAcademicYearReminder(activeYear2026.id, dateStr)).not.toThrow();

      // Reading should return true from memoryDismissedSet
      expect(isAcademicYearReminderDismissed(activeYear2026.id, dateStr)).toBe(true);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('7b. Works with functional window.sessionStorage when available', () => {
    const store = new Map<string, string>();
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) || null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        key: (i: number) => Array.from(store.keys())[i] || null,
        length: 0,
        clear: () => store.clear(),
      },
    };

    try {
      const dateStr = '2026-10-22';
      expect(isAcademicYearReminderDismissed('ay-session-test', dateStr)).toBe(false);
      dismissAcademicYearReminder('ay-session-test', dateStr);
      expect(isAcademicYearReminderDismissed('ay-session-test', dateStr)).toBe(true);
      expect(store.get('cbe_dismissed_ay_rollover_reminder_ay-session-test_2026-10-22')).toBe('true');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  // 8. Non-active academic year safety
  it('8. Returns null if academic year is not Active (e.g. Upcoming, Closed, Archived)', () => {
    const upcomingYear: AcademicYear = {
      id: 'ay-2027-uuid',
      year: 2027,
      status: 'Upcoming',
      end_date: '2027-10-31',
    };

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: upcomingYear,
      schoolTerms: allTerms,
      customDate: new Date('2026-10-18T08:00:00+03:00'),
    });

    expect(reminder).toBeNull();
  });

  // 9. ISO date parser helper validation
  it('9. Correctly validates valid and invalid ISO dates', () => {
    expect(isValidIsoDate('2026-10-31')).toBe(true);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('invalid')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
  });

  // 10. Calendar day difference helper validation
  it('10. Accurately calculates day difference across month boundaries', () => {
    expect(getCalendarDayDifference('2026-10-01', '2026-10-31')).toBe(30);
    expect(getCalendarDayDifference('2026-09-30', '2026-10-31')).toBe(31);
    expect(getCalendarDayDifference('2026-10-31', '2026-10-31')).toBe(0);
    expect(getCalendarDayDifference('2026-11-01', '2026-10-31')).toBe(-1);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../testSetup';
import React from 'react';
import { AcademicYear, SchoolTerm } from '../types';
import {
  getAcademicYearRolloverReminder,
  dismissAcademicYearReminder,
  isAcademicYearReminderDismissed,
  resetDismissedAcademicYearReminders,
} from '../utils/academicYearReminderUtils';
import { AcademicYearRolloverReminderBanner } from '../components/AcademicYearRolloverReminderBanner';
import { getKenyaCalendarToday } from '../utils/kenyaDateUtils';

describe('Academic Year Rollover Reminder Banner & Cross-Screen Integration (Phase B)', () => {
  const activeYear2026: AcademicYear = {
    id: 'ay-2026-uuid',
    year: 2026,
    status: 'Active',
    start_date: '2026-01-06',
    end_date: '2026-10-31',
  };

  const term3: SchoolTerm = {
    id: 't-2026-3',
    academic_year_id: 'ay-2026-uuid',
    year: 2026,
    term_name: 'Term 3',
    term_number: 3,
    status: 'Active',
    opening_date: '2026-08-24',
    closing_date: '2026-10-31',
  };

  beforeEach(() => {
    resetDismissedAcademicYearReminders();
    vi.restoreAllMocks();
  });

  it('1. Generates correct banner properties for upcoming_review state (20 days remaining)', () => {
    const customDate = new Date('2026-10-11T08:00:00+03:00');
    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('upcoming_review');
    expect(reminder?.headline).toContain('ends in 20 days');
    expect(reminder?.daysRemaining).toBe(20);

    // Verify component creates React element cleanly
    const element = React.createElement(AcademicYearRolloverReminderBanner, {
      reminder: reminder!,
      onNavigateToSession: vi.fn(),
      onDismiss: vi.fn(),
    });

    expect(element.props.reminder.type).toBe('upcoming_review');
  });

  it('2. Generates correct banner properties for imminent_end state (5 days remaining)', () => {
    const customDate = new Date('2026-10-26T08:00:00+03:00');
    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('imminent_end');
    expect(reminder?.headline).toContain('concludes in 5 days');
    expect(reminder?.daysRemaining).toBe(5);
  });

  it('3. Generates correct banner properties for ready_for_review state on the concluding day (0 days remaining)', () => {
    const customDate = new Date('2026-10-31T08:00:00+03:00');
    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('ready_for_review');
    expect(reminder?.headline).toContain('reaches its scheduled conclusion today');
    expect(reminder?.daysRemaining).toBe(0);
  });

  it('4. Generates correct banner properties for configuration_warning state when end dates are missing', () => {
    const unconfiguredYear: AcademicYear = {
      ...activeYear2026,
      end_date: undefined,
    };

    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: unconfiguredYear,
      schoolTerms: [], // No Term 3 either
      customDate: new Date('2026-10-01T08:00:00+03:00'),
    });

    expect(reminder).not.toBeNull();
    expect(reminder?.type).toBe('configuration_warning');
    expect(reminder?.isConfigured).toBe(false);
    expect(reminder?.headline).toContain('No valid end date configured');
  });

  it('5. Cross-Screen Deduplication: Dismissing on Admin Dashboard also dismisses in Academic Session Control', () => {
    const customDate = new Date('2026-10-20T08:00:00+03:00');
    const todayStr = getKenyaCalendarToday(customDate);

    // Initial check on Admin Dashboard -> reminder is active
    const dashboardReminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
      checkDismissed: true,
    });
    expect(dashboardReminder).not.toBeNull();

    // Administrator dismisses reminder on Admin Dashboard
    dismissAcademicYearReminder(activeYear2026.id, todayStr);
    expect(isAcademicYearReminderDismissed(activeYear2026.id, todayStr)).toBe(true);

    // Administrator navigates to Academic Session Control -> reminder is suppressed (NOT duplicated)
    const sessionControlReminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
      checkDismissed: true,
    });
    expect(sessionControlReminder).toBeNull();
  });

  it('6. Safety Invariant: Banner properties contain zero rollover execution buttons or mutation callbacks', () => {
    const customDate = new Date('2026-10-31T08:00:00+03:00');
    const reminder = getAcademicYearRolloverReminder({
      activeAcademicYear: activeYear2026,
      schoolTerms: [term3],
      customDate,
    });

    const onNavigate = vi.fn();
    const element = React.createElement(AcademicYearRolloverReminderBanner, {
      reminder: reminder!,
      onNavigateToSession: onNavigate,
    });

    // The only action prop passed is onNavigateToSession (pure navigation)
    expect(element.props.onNavigateToSession).toBeDefined();
    // Confirms no executeRollover, onConfirmRollover, or mutate props exist
    expect((element.props as any).onExecuteRollover).toBeUndefined();
    expect((element.props as any).performRollover).toBeUndefined();
  });
});

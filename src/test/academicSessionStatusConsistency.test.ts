import { describe, it, expect } from 'vitest';
import {
  getTermStatusFromDates,
  canPlanExams,
  canEnterMarks,
  canApproveExams,
  canGenerateReports,
  isTermModifiable,
  canViewTermData,
  getTermStatusMessage,
} from '../utils/termStatusUtils';
import { api } from '../lib/storage';

describe('Intelligent Academic Session Activation & Lifecycle Tests (Phase 4A)', () => {
  const openingDateFuture = '2027-08-24';
  const closingDateFuture = '2027-10-23';

  const openingDateCurrent = '2026-01-01';
  const closingDateCurrent = '2026-12-31';

  const openingDatePast = '2025-01-06';
  const closingDatePast = '2025-04-02';

  it('Test 1 — Future term, not activated evaluates to Upcoming and locks marks', () => {
    const status = getTermStatusFromDates(openingDateFuture, closingDateFuture, 'Upcoming');
    expect(status).toBe('Upcoming');
    expect(canEnterMarks(status)).toBe(false);
    expect(canPlanExams(status)).toBe(true);
    expect(canApproveExams(status)).toBe(false);
    expect(canGenerateReports(status)).toBe(false);
    expect(isTermModifiable(status)).toBe(false);
    expect(canViewTermData(status)).toBe(true);
  });

  it('Test 2 & Test 11 — Future term cannot become operationally Active before opening date (Calendar Dominates)', () => {
    // Even if explicitStatus was set to 'Active', calendar evaluation correctly enforces 'Upcoming'
    const status = getTermStatusFromDates(openingDateFuture, closingDateFuture, 'Active');
    expect(status).toBe('Upcoming');
    expect(canEnterMarks(status)).toBe(false);
    expect(canPlanExams(status)).toBe(true); // Exam planning allowed
    expect(canApproveExams(status)).toBe(false);
  });

  it('Test 3 — Future term produces clear user-facing explanation message', () => {
    const msg = getTermStatusMessage('Upcoming');
    expect(msg).toContain('Upcoming');
    expect(msg).toContain('Marks entry and examination approvals cannot be done until the term becomes Active');
  });

  it('Test 4 & Test 5 — Opening date reached / within dates automatically evaluates to Active', () => {
    const status = getTermStatusFromDates(openingDateCurrent, closingDateCurrent, 'Upcoming');
    expect(status).toBe('Active');
    expect(canEnterMarks(status)).toBe(true);
    expect(canPlanExams(status)).toBe(true);
    expect(canApproveExams(status)).toBe(true);
    expect(canGenerateReports(status)).toBe(true);
  });

  it('Test 6 — Post-closing behavior evaluates expired terms to Closed regardless of persisted Active', () => {
    // Expired term with persisted Active must evaluate to Closed
    const expiredActiveStatus = getTermStatusFromDates(openingDatePast, closingDatePast, 'Active');
    expect(expiredActiveStatus).toBe('Closed');
    expect(canEnterMarks(expiredActiveStatus)).toBe(false);

    // Formally closed remains Closed
    const closedStatus = getTermStatusFromDates(openingDatePast, closingDatePast, 'Closed');
    expect(closedStatus).toBe('Closed');
    expect(canEnterMarks(closedStatus)).toBe(false);
    expect(canGenerateReports(closedStatus)).toBe(true);
  });

  it('Test 7 — Explicitly Locked remains Locked regardless of dates', () => {
    const status = getTermStatusFromDates(openingDateCurrent, closingDateCurrent, 'Locked');
    expect(status).toBe('Locked');
    expect(canEnterMarks(status)).toBe(false);
    expect(canPlanExams(status)).toBe(false);
    expect(canGenerateReports(status)).toBe(true);
    expect(canViewTermData(status)).toBe(true);
  });

  it('Test 8 — Explicitly Archived remains Archived regardless of dates', () => {
    const status = getTermStatusFromDates(openingDatePast, closingDatePast, 'Archived');
    expect(status).toBe('Archived');
    expect(canEnterMarks(status)).toBe(false);
    expect(canPlanExams(status)).toBe(false);
    expect(canGenerateReports(status)).toBe(true);
    expect(canViewTermData(status)).toBe(true);
  });

  it('Test 9 — Active academic year and term storage invariants', () => {
    const activeYear = api.getActiveAcademicYear();
    const activeTerm = api.getActiveTerm();
    expect(activeYear).toBeDefined();
    expect(activeTerm).toBeDefined();
    expect(activeYear.status).toBe('Active');
  });

  it('Test 10 — Missing dates gracefully fallback to explicit status or Upcoming', () => {
    expect(getTermStatusFromDates(undefined, undefined, 'Active')).toBe('Active');
    expect(getTermStatusFromDates(undefined, undefined, 'Upcoming')).toBe('Upcoming');
    expect(getTermStatusFromDates(undefined, undefined, undefined)).toBe('Upcoming');
    // Missing opening date only
    expect(getTermStatusFromDates(undefined, '2026-10-23', 'Active')).toBe('Active');
    expect(getTermStatusFromDates(undefined, '2026-10-23', undefined)).toBe('Upcoming');
    // Missing closing date only
    expect(getTermStatusFromDates('2026-01-05', undefined, 'Active')).toBe('Active');
    expect(getTermStatusFromDates('2026-01-05', undefined, undefined)).toBe('Upcoming');
  });

  it('Test 12, 13, 14 — Operational permission matrix consistency', () => {
    // Upcoming
    expect(canPlanExams('Upcoming')).toBe(true);
    expect(canEnterMarks('Upcoming')).toBe(false);
    expect(canApproveExams('Upcoming')).toBe(false);
    expect(canGenerateReports('Upcoming')).toBe(false);

    // Active
    expect(canPlanExams('Active')).toBe(true);
    expect(canEnterMarks('Active')).toBe(true);
    expect(canApproveExams('Active')).toBe(true);
    expect(canGenerateReports('Active')).toBe(true);

    // Closed
    expect(canPlanExams('Closed')).toBe(false);
    expect(canEnterMarks('Closed')).toBe(false);
    expect(canApproveExams('Closed')).toBe(false);
    expect(canGenerateReports('Closed')).toBe(true);

    // Locked
    expect(canPlanExams('Locked')).toBe(false);
    expect(canEnterMarks('Locked')).toBe(false);
    expect(canApproveExams('Locked')).toBe(false);
    expect(canGenerateReports('Locked')).toBe(true);

    // Archived
    expect(canPlanExams('Archived')).toBe(false);
    expect(canEnterMarks('Archived')).toBe(false);
    expect(canApproveExams('Archived')).toBe(false);
    expect(canGenerateReports('Archived')).toBe(true);
  });

  it('Test 15 — Academic Year and Term deletion safety constraints', () => {
    // Active year cannot be deleted
    const activeYear = api.getActiveAcademicYear();
    const canDeleteActive = api.checkAcademicYearCanBeDeletedSync(activeYear.id);
    expect(canDeleteActive).toBe(false);
  });

  describe('Stage 1 Date-Aware Term Status Invariant Tests', () => {
    const termOpening = '2026-08-24';
    const termClosing = '2026-10-23';

    it('Scenario 1: Before opening date evaluates to Upcoming', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Active', '2026-08-23');
      expect(status).toBe('Upcoming');
      expect(canEnterMarks(status)).toBe(false);
      expect(canPlanExams(status)).toBe(true);
    });

    it('Scenario 2: Exactly on opening date evaluates to Active', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Upcoming', '2026-08-24');
      expect(status).toBe('Active');
      expect(canEnterMarks(status)).toBe(true);
    });

    it('Scenario 3: Between opening and closing dates evaluates to Active', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Upcoming', '2026-09-15');
      expect(status).toBe('Active');
      expect(canEnterMarks(status)).toBe(true);
    });

    it('Scenario 4: Exactly on closing date evaluates to Active (Inclusive Closing Date)', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Upcoming', '2026-10-23');
      expect(status).toBe('Active');
      expect(canEnterMarks(status)).toBe(true);
      expect(canApproveExams(status)).toBe(true);
    });

    it('Scenario 5: One day after closing date evaluates to Closed', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Active', '2026-10-24');
      expect(status).toBe('Closed');
      expect(canEnterMarks(status)).toBe(false);
      expect(canPlanExams(status)).toBe(false);
      expect(canGenerateReports(status)).toBe(true);
    });

    it('Scenario 6: Expired term with persisted status Active evaluates to Closed', () => {
      // Real CBE Hub 2026 Term 3 case: ended 2026-10-23, persisted in DB as Active
      const status = getTermStatusFromDates('2026-08-24', '2026-10-23', 'Active', '2026-11-04');
      expect(status).toBe('Closed');
      expect(canEnterMarks(status)).toBe(false);
    });

    it('Scenario 7: Expired term with persisted status Upcoming evaluates to Closed', () => {
      const status = getTermStatusFromDates('2026-08-24', '2026-10-23', 'Upcoming', '2026-11-04');
      expect(status).toBe('Closed');
      expect(canEnterMarks(status)).toBe(false);
    });

    it('Scenario 8: Explicitly Closed term evaluates to Closed (override preserved)', () => {
      // Even if evaluated during active dates, explicit Closed takes precedence
      const status = getTermStatusFromDates(termOpening, termClosing, 'Closed', '2026-09-15');
      expect(status).toBe('Closed');
      expect(canEnterMarks(status)).toBe(false);
      expect(canGenerateReports(status)).toBe(true);
    });

    it('Scenario 9: Explicitly Locked term evaluates to Locked regardless of dates', () => {
      const statusActiveDates = getTermStatusFromDates(termOpening, termClosing, 'Locked', '2026-09-15');
      expect(statusActiveDates).toBe('Locked');
      const statusPastDates = getTermStatusFromDates(termOpening, termClosing, 'Locked', '2026-11-04');
      expect(statusPastDates).toBe('Locked');
      expect(canEnterMarks(statusActiveDates)).toBe(false);
    });

    it('Scenario 10: Explicitly Archived term evaluates to Archived regardless of dates', () => {
      const status = getTermStatusFromDates(termOpening, termClosing, 'Archived', '2026-11-04');
      expect(status).toBe('Archived');
      expect(canEnterMarks(status)).toBe(false);
      expect(canPlanExams(status)).toBe(false);
      expect(canGenerateReports(status)).toBe(true);
    });

    it('Scenario 11: Missing opening date falls back gracefully', () => {
      expect(getTermStatusFromDates(undefined, '2026-10-23', 'Active')).toBe('Active');
      expect(getTermStatusFromDates(undefined, '2026-10-23', undefined)).toBe('Upcoming');
    });

    it('Scenario 12: Missing closing date falls back gracefully', () => {
      expect(getTermStatusFromDates('2026-08-24', undefined, 'Active')).toBe('Active');
      expect(getTermStatusFromDates('2026-08-24', undefined, undefined)).toBe('Upcoming');
    });

    it('Scenario 13: Missing both dates falls back gracefully', () => {
      expect(getTermStatusFromDates(undefined, undefined, 'Active')).toBe('Active');
      expect(getTermStatusFromDates(undefined, undefined, 'Upcoming')).toBe('Upcoming');
      expect(getTermStatusFromDates(undefined, undefined, undefined)).toBe('Upcoming');
    });

    it('Scenario 14: Kenya Timezone (Africa/Nairobi UTC+3) Midnight Boundary Test', () => {
      // Term 3 closing date: 2026-10-23
      // At 23:59:59 EAT on 2026-10-23 (which corresponds to 20:59:59 UTC on 2026-10-23):
      // Calendar day in Nairobi is still 2026-10-23 -> term is operationally ACTIVE.
      const closingDayLastSecondUTC = new Date('2026-10-23T20:59:59Z');
      const statusAtLastSecond = getTermStatusFromDates(termOpening, termClosing, 'Active', closingDayLastSecondUTC);
      expect(statusAtLastSecond).toBe('Active');

      // Exactly 1 second later at 00:00:00 EAT on 2026-10-24 (which corresponds to 21:00:00 UTC on 2026-10-23):
      // Calendar day in Nairobi becomes 2026-10-24 -> term immediately becomes CLOSED.
      const nextDayFirstSecondUTC = new Date('2026-10-23T21:00:00Z');
      const statusAtMidnight = getTermStatusFromDates(termOpening, termClosing, 'Active', nextDayFirstSecondUTC);
      expect(statusAtMidnight).toBe('Closed');
    });
  });
});

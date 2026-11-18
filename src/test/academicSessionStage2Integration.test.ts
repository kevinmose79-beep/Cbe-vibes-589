import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, setStorage, KEYS } from '../lib/storage';
import { SchoolTerm, AcademicYear } from '../types';
import {
  getTermStatusFromDates,
  canEnterMarks,
  canPlanExams,
  canApproveExams,
  canViewTermData,
  canGenerateReports,
  getTermStatusMessage,
} from '../utils/termStatusUtils';

describe('Stage 2 Integration: Application-Wide Date-Aware Academic Term Status', () => {
  const mockAcademicYears: AcademicYear[] = [
    { id: 'ay_2026', year: 2026, status: 'Active', opening_date: '2026-01-06', closing_date: '2026-10-23' },
    { id: 'ay_2027', year: 2027, status: 'Upcoming', opening_date: '2027-01-05', closing_date: '2027-10-29' },
  ];

  const mockTerms: SchoolTerm[] = [
    {
      id: 't_2026_1',
      academic_year_id: 'ay_2026',
      year: 2026,
      term_name: 'Term 1',
      opening_date: '2026-01-06',
      closing_date: '2026-04-02',
      status: 'Closed',
    },
    {
      id: 't_2026_2',
      academic_year_id: 'ay_2026',
      year: 2026,
      term_name: 'Term 2',
      opening_date: '2026-04-27',
      closing_date: '2026-07-31',
      status: 'Closed',
    },
    {
      id: 't_2026_3',
      academic_year_id: 'ay_2026',
      year: 2026,
      term_name: 'Term 3',
      opening_date: '2026-08-24',
      closing_date: '2026-10-23', // Officially closed on 23 October 2026
      status: 'Active', // Persisted DB status remains Active
    },
    {
      id: 't_2027_1',
      academic_year_id: 'ay_2027',
      year: 2027,
      term_name: 'Term 1',
      opening_date: '2027-01-05',
      closing_date: '2027-04-09',
      status: 'Upcoming',
    },
  ];

  beforeEach(() => {
    setStorage(KEYS.ACADEMIC_YEARS, mockAcademicYears);
    setStorage(KEYS.SCHOOL_TERMS, mockTerms);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. api.getActiveTerm() returns null when the term has expired past its closing date (e.g. 4 Nov 2026)', () => {
    // Target scenario: 4 November 2026 (after 2026-10-23)
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const activeTerm = api.getActiveTerm();
    expect(activeTerm).toBeNull();
  });

  it('2. api.getActiveTerm() returns the active term when within opening and closing dates', () => {
    // Within term: 15 September 2026
    vi.setSystemTime(new Date('2026-09-15T09:00:00+03:00'));

    const activeTerm = api.getActiveTerm();
    expect(activeTerm).not.toBeNull();
    expect(activeTerm?.id).toBe('t_2026_3');
    expect(activeTerm?.term_name).toBe('Term 3');
  });

  it('3. api.getActiveAcademicYear() preserves administrator-controlled rollover (2026 remains active, 2027 remains upcoming)', () => {
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const activeYear = api.getActiveAcademicYear();
    expect(activeYear.year).toBe(2026);
    expect(activeYear.status).toBe('Active');

    const years = api.getAcademicYears();
    const year2027 = years.find((y) => y.year === 2027);
    expect(year2027?.status).toBe('Upcoming');
  });

  it('4. Expired Term 3 2026 evaluates to Closed operationally', () => {
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const term3 = mockTerms.find((t) => t.id === 't_2026_3')!;
    const operationalStatus = getTermStatusFromDates(term3.opening_date, term3.closing_date, term3.status);
    expect(operationalStatus).toBe('Closed');
  });

  it('5. Marks entry permissions: disabled for expired Term 3 2026 while historical marks remain viewable', () => {
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const term3 = mockTerms.find((t) => t.id === 't_2026_3')!;
    const operationalStatus = getTermStatusFromDates(term3.opening_date, term3.closing_date, term3.status);

    // Editing must be blocked
    expect(canEnterMarks(operationalStatus)).toBe(false);

    // Historical reading must remain accessible
    expect(canViewTermData(operationalStatus)).toBe(true);

    // Explanatory message provided
    const msg = getTermStatusMessage(operationalStatus);
    expect(msg).toContain('Academic Term Closed');
  });

  it('6. Assessment creation and approval: disabled for expired Term 3 2026 while report generation is permitted', () => {
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const term3 = mockTerms.find((t) => t.id === 't_2026_3')!;
    const operationalStatus = getTermStatusFromDates(term3.opening_date, term3.closing_date, term3.status);

    // Assessment creation blocked
    expect(canPlanExams(operationalStatus)).toBe(false);

    // Assessment approval blocked
    expect(canApproveExams(operationalStatus)).toBe(false);

    // Generating historical reports permitted
    expect(canGenerateReports(operationalStatus)).toBe(true);
  });

  it('7. Session selection: selecting historical Term 3 2026 does not reactivate it', () => {
    vi.setSystemTime(new Date('2026-11-04T09:00:00+03:00'));

    const term3 = mockTerms.find((t) => t.id === 't_2026_3')!;
    const activeTerm = api.getActiveTerm(); // null on 4 Nov 2026

    // Viewing term is term3
    const viewingTerm = term3;

    // isViewingActiveSession formula
    const isViewingActiveSession =
      Boolean(
        activeTerm &&
          getTermStatusFromDates(activeTerm.opening_date, activeTerm.closing_date, activeTerm.status) === 'Active'
      ) &&
      Boolean(
        viewingTerm &&
          getTermStatusFromDates(viewingTerm.opening_date, viewingTerm.closing_date, viewingTerm.status) === 'Active'
      );

    expect(isViewingActiveSession).toBe(false);
  });

  it('8. Explicit Closed status overrides active dates (administrative authority)', () => {
    // Within dates (15 Sept 2026) but admin explicitly closed the term
    vi.setSystemTime(new Date('2026-09-15T09:00:00+03:00'));

    const explicitlyClosedStatus = getTermStatusFromDates('2026-08-24', '2026-10-23', 'Closed');
    expect(explicitlyClosedStatus).toBe('Closed');
    expect(canEnterMarks(explicitlyClosedStatus)).toBe(false);
  });
});

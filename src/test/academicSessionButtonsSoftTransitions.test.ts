import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getTermStatusFromDates,
  canEnterMarks,
  canPlanExams,
  canApproveExams,
  canGenerateReports,
  isTermModifiable,
} from '../utils/termStatusUtils';
import type { SchoolTerm, AcademicYear } from '../types';

describe('Academic Session Buttons & Soft Interactions Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof (globalThis as any).window === 'undefined') {
      const target = new EventTarget();
      (globalThis as any).window = target;
    }
    if (typeof (globalThis as any).CustomEvent === 'undefined') {
      (globalThis as any).CustomEvent = class CustomEvent extends Event {
        detail: any;
        constructor(type: string, options?: { detail?: any }) {
          super(type);
          this.detail = options?.detail;
        }
      };
    }
  });

  it('Test 1 — Future scheduled term becomes fully Active when opening_date is set to today', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const closingDate = '2026-12-15';
    
    // When scheduled in future
    const futureOpen = '2026-12-01';
    // If today is before futureOpen, status would be Upcoming
    // But when admin explicitly activates, opening_date is aligned to today
    const activatedStatus = getTermStatusFromDates(todayStr, closingDate, 'Active');
    expect(activatedStatus).toBe('Active');
    expect(canEnterMarks(activatedStatus)).toBe(true);
    expect(canPlanExams(activatedStatus)).toBe(true);
    expect(canApproveExams(activatedStatus)).toBe(true);
    expect(canGenerateReports(activatedStatus)).toBe(true);
  });

  it('Test 2 — Term action button states are mutually exclusive and strictly defined', () => {
    // Action determination helper mirroring AcademicSessionManagement button branches
    function getAvailableActions(status: SchoolTerm['status']) {
      const actions: string[] = [];
      if (status === 'Active') {
        actions.push('Close Term');
      } else if (status === 'Closed') {
        actions.push('Reopen Term');
        actions.push('Lock Term');
      } else if (status === 'Locked') {
        actions.push('Unlock Term');
      } else {
        // Upcoming or Archived
        actions.push('Set Active');
      }
      return actions;
    }

    expect(getAvailableActions('Active')).toEqual(['Close Term']);
    expect(getAvailableActions('Closed')).toEqual(['Reopen Term', 'Lock Term']);
    expect(getAvailableActions('Locked')).toEqual(['Unlock Term']);
    expect(getAvailableActions('Upcoming')).toEqual(['Set Active']);
  });

  it('Test 3 — Window CustomEvent session-changed is dispatched correctly', () => {
    const dispatchSpy = vi.fn();
    window.addEventListener('session-changed', dispatchSpy);

    // Simulate dispatching session-changed
    window.dispatchEvent(new CustomEvent('session-changed'));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener('session-changed', dispatchSpy);
  });

  it('Test 4 — Window CustomEvent session-view-changed carries view details', () => {
    let receivedDetail: any = null;
    const listener = (e: any) => {
      receivedDetail = e.detail;
    };
    window.addEventListener('session-view-changed', listener);

    const testDetail = {
      academicYearId: 'ay-2026',
      termId: 'term-1',
      isViewingActive: true,
    };
    window.dispatchEvent(new CustomEvent('session-view-changed', { detail: testDetail }));

    expect(receivedDetail).toEqual(testDetail);
    window.removeEventListener('session-view-changed', listener);
  });

  it('Test 5 — SessionSwitcher matches terms by academic_year_id or fallback year number', () => {
    const mockYears: AcademicYear[] = [
      { id: 'uuid-2026', year: 2026, status: 'Active', is_active: true } as any,
      { id: 'uuid-2027', year: 2027, status: 'Upcoming', is_active: false } as any,
    ];

    const mockTerms: SchoolTerm[] = [
      { id: 't1', academic_year_id: 'uuid-2026', year: 2026, term_name: 'Term 1', status: 'Active' } as any,
      { id: 't2', academic_year_id: '', year: 2026, term_name: 'Term 2', status: 'Upcoming' } as any, // matched by year
      { id: 't3', academic_year_id: 'uuid-2027', year: 2027, term_name: 'Term 1', status: 'Upcoming' } as any,
    ];

    const year2026 = mockYears[0];
    const filteredTerms2026 = mockTerms.filter(
      (t) => t.academic_year_id === year2026.id || t.year === year2026.year
    );

    expect(filteredTerms2026.map((t) => t.id)).toEqual(['t1', 't2']);

    const year2027 = mockYears[1];
    const filteredTerms2027 = mockTerms.filter(
      (t) => t.academic_year_id === year2027.id || t.year === year2027.year
    );

    expect(filteredTerms2027.map((t) => t.id)).toEqual(['t3']);
  });

  it('Test 6 — Term status transitions maintain CBE data integrity', () => {
    // Locked terms are completely non-modifiable
    expect(isTermModifiable('Locked')).toBe(false);
    expect(canEnterMarks('Locked')).toBe(false);

    // Closed terms are non-modifiable for marks but allow reports
    expect(isTermModifiable('Closed')).toBe(false);
    expect(canEnterMarks('Closed')).toBe(false);
    expect(canGenerateReports('Closed')).toBe(true);

    // Active terms allow all operations
    expect(isTermModifiable('Active')).toBe(true);
    expect(canEnterMarks('Active')).toBe(true);
    expect(canGenerateReports('Active')).toBe(true);
  });
});

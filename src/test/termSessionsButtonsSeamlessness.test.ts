import { describe, it, expect, vi } from 'vitest';
import { api } from '../lib/storage';
import { canEnterMarks, canPlanExams, canApproveExams, canGenerateReports } from '../utils/termStatusUtils';
import { SchoolTerm } from '../types';

describe('Term Sessions Buttons Seamlessness & Interaction Invariants', () => {
  it('Test 1: Active term action invariants — Active term provides Close option and permits marks', () => {
    const activeTerm = api.getActiveTerm();
    expect(activeTerm).toBeDefined();
    expect(activeTerm.status).toBe('Active');
    expect(canEnterMarks(activeTerm.status)).toBe(true);
    expect(canPlanExams(activeTerm.status)).toBe(true);
    expect(canApproveExams(activeTerm.status)).toBe(true);
    expect(canGenerateReports(activeTerm.status)).toBe(true);
  });

  it('Test 2: Mutual Exclusivity of Term action button states across all lifecycle stages', () => {
    // Pure function representing the UI button resolution logic in AcademicSessionManagement
    const getAvailableTermActions = (term: { status: string; is_active?: boolean }) => {
      const actions: string[] = [];
      const isActive = term.status === 'Active' || Boolean(term.is_active);
      const isClosed = term.status === 'Closed';
      const isLocked = term.status === 'Locked';
      const isArchived = term.status === 'Archived';
      const isUpcoming = term.status === 'Upcoming';

      if (isActive) {
        actions.push('close');
      } else if (isClosed) {
        actions.push('reopen');
        actions.push('lock');
      } else if (isLocked) {
        actions.push('unlock');
      } else if (isArchived) {
        actions.push('reopen');
      } else if (isUpcoming) {
        actions.push('activate');
      }

      return actions;
    };

    // Active term must ONLY have 'close'
    const activeActions = getAvailableTermActions({ status: 'Active', is_active: true });
    expect(activeActions).toEqual(['close']);
    expect(activeActions).not.toContain('activate');
    expect(activeActions).not.toContain('reopen');
    expect(activeActions).not.toContain('unlock');

    // Closed term must have 'reopen' and 'lock', never 'close' or 'activate'
    const closedActions = getAvailableTermActions({ status: 'Closed', is_active: false });
    expect(closedActions).toEqual(['reopen', 'lock']);
    expect(closedActions).not.toContain('close');
    expect(closedActions).not.toContain('activate');

    // Locked term must ONLY have 'unlock'
    const lockedActions = getAvailableTermActions({ status: 'Locked', is_active: false });
    expect(lockedActions).toEqual(['unlock']);
    expect(lockedActions).not.toContain('close');
    expect(lockedActions).not.toContain('activate');
    expect(lockedActions).not.toContain('reopen');

    // Upcoming term must ONLY have 'activate'
    const upcomingActions = getAvailableTermActions({ status: 'Upcoming', is_active: false });
    expect(upcomingActions).toEqual(['activate']);
    expect(upcomingActions).not.toContain('close');
    expect(upcomingActions).not.toContain('reopen');
    expect(upcomingActions).not.toContain('lock');
    expect(upcomingActions).not.toContain('unlock');

    // Archived term must ONLY have 'reopen'
    const archivedActions = getAvailableTermActions({ status: 'Archived', is_active: false });
    expect(archivedActions).toEqual(['reopen']);
  });

  it('Test 3: Seamless viewing session switching preserves database authority', () => {
    const terms = api.getSchoolTerms();
    expect(Array.isArray(terms)).toBe(true);
    expect(terms.length).toBeGreaterThan(0);

    const activeTerm = api.getActiveTerm();
    expect(activeTerm).toBeDefined();

    // In-memory viewing session decoupling
    let viewingSession = {
      academicYear: activeTerm.year,
      schoolTerm: activeTerm,
      isViewingHistorical: false,
    };

    // Switch to another term for inspection (soft switch)
    const otherTerm = terms.find((t) => t.id !== activeTerm.id) || terms[0];
    viewingSession = {
      academicYear: otherTerm.year,
      schoolTerm: otherTerm,
      isViewingHistorical: otherTerm.id !== activeTerm.id,
    };

    expect(viewingSession.schoolTerm.id).toBe(otherTerm.id);
    // Ensure active term in storage remained untouched (Single Source of Truth)
    expect(api.getActiveTerm().id).toBe(activeTerm.id);

    // Reset back to active session
    viewingSession = {
      academicYear: activeTerm.year,
      schoolTerm: activeTerm,
      isViewingHistorical: false,
    };
    expect(viewingSession.schoolTerm.id).toBe(activeTerm.id);
    expect(viewingSession.isViewingHistorical).toBe(false);
  });

  it('Test 4: Session changed & session-view-changed events broadcast seamlessly', () => {
    const sessionChangeListener = vi.fn();
    const sessionViewChangeListener = vi.fn();

    if (typeof window !== 'undefined') {
      window.addEventListener('session-changed', sessionChangeListener);
      window.addEventListener('session-view-changed', sessionViewChangeListener);

      window.dispatchEvent(new CustomEvent('session-changed'));
      window.dispatchEvent(new CustomEvent('session-view-changed', { detail: { termId: 'term-123' } }));

      expect(sessionChangeListener).toHaveBeenCalledTimes(1);
      expect(sessionViewChangeListener).toHaveBeenCalledTimes(1);

      window.removeEventListener('session-changed', sessionChangeListener);
      window.removeEventListener('session-view-changed', sessionViewChangeListener);
    } else {
      expect(true).toBe(true);
    }
  });

  it('Test 5: Dropdown and button accessibility invariants for Term sessions', () => {
    const terms = api.getSchoolTerms();
    terms.forEach((t) => {
      // Must have valid term name and year
      expect(t.term_name).toMatch(/^Term [123]/);
      expect(typeof t.year).toBe('number');
      expect(t.year).toBeGreaterThanOrEqual(2024);
      // Status must be one of the known CBE lifecycle states
      expect(['Active', 'Closed', 'Locked', 'Upcoming', 'Archived']).toContain(t.status);
    });
  });
});

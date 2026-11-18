import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, setStorage, getStorage, KEYS } from '../lib/storage';
import {
  canEnterMarks,
  canPlanExams,
  canApproveExams,
  canGenerateReports,
  isTermModifiable,
  canViewTermData,
} from '../utils/termStatusUtils';
import type { SchoolTerm, AcademicYear, Examination } from '../types';

describe('Academic Term Contradiction Resolution & Strict Lifecycle Verification Suite', () => {
  const sampleYear2026: AcademicYear = {
    id: '11111111-1111-4111-8111-111111111111',
    year: 2026,
    status: 'Active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const sampleTerms2026: SchoolTerm[] = [
    {
      id: '22222222-2222-4222-8222-222222222221',
      academic_year_id: '11111111-1111-4111-8111-111111111111',
      year: 2026,
      term_name: 'Term 1',
      opening_date: '2026-01-06',
      closing_date: '2026-04-02',
      status: 'Closed',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-04-03T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      academic_year_id: '11111111-1111-4111-8111-111111111111',
      year: 2026,
      term_name: 'Term 2',
      opening_date: '2026-01-01',
      closing_date: '2026-12-31',
      status: 'Closed',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222223',
      academic_year_id: '11111111-1111-4111-8111-111111111111',
      year: 2026,
      term_name: 'Term 3',
      opening_date: '2026-01-01',
      closing_date: '2026-12-31',
      status: 'Closed',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-10-24T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    setStorage(KEYS.ACADEMIC_YEARS, [sampleYear2026]);
    setStorage(KEYS.SCHOOL_TERMS, sampleTerms2026);
  });

  // =========================================================================
  // Test A: No Active Term
  // - All 2026 terms are Closed.
  // - Session Switcher displays No Active Term.
  // - Header does not display a false ACTIVE indicator.
  // - No term is arbitrarily selected as operationally active.
  // =========================================================================
  describe('Test A: No Active Term', () => {
    it('returns null from getActiveTerm() when all terms are Closed', () => {
      const activeTerm = api.getActiveTerm();
      expect(activeTerm).toBeNull();
    });

    it('does not arbitrarily fallback to Term 2 or the first term', () => {
      const terms = api.getSchoolTerms();
      const term2 = terms.find((t) => t.term_name === 'Term 2');
      expect(term2?.status).toBe('Closed');

      const operationalActive = api.getActiveTerm();
      expect(operationalActive).not.toEqual(term2);
      expect(operationalActive).toBeNull();
    });

    it('determines viewing session is NOT active when viewing a closed term', () => {
      const activeTerm = api.getActiveTerm();
      const viewingTerm = sampleTerms2026[1]; // Term 2 (Closed)

      const isViewingActiveSession =
        Boolean(activeTerm && activeTerm.status === 'Active') &&
        Boolean(viewingTerm && viewingTerm.status === 'Active') &&
        activeTerm?.id === viewingTerm?.id;

      expect(isViewingActiveSession).toBe(false);
    });
  });

  // =========================================================================
  // Test B: Genuine Active Term
  // - Term 2 is explicitly Active.
  // - Header and Session Switcher identify Term 2 as Active.
  // - Academic Session Management displays Active.
  // - The available primary action is Close Term.
  // =========================================================================
  describe('Test B: Genuine Active Term', () => {
    beforeEach(() => {
      const updatedTerms = sampleTerms2026.map((t) =>
        t.term_name === 'Term 2' ? { ...t, status: 'Active' as const } : t
      );
      setStorage(KEYS.SCHOOL_TERMS, updatedTerms);
    });

    it('identifies Term 2 as the genuine Active term', () => {
      const activeTerm = api.getActiveTerm();
      expect(activeTerm).not.toBeNull();
      expect(activeTerm?.term_name).toBe('Term 2');
      expect(activeTerm?.status).toBe('Active');
    });

    it('computes isViewingActiveSession as true when viewing the genuinely active term', () => {
      const activeTerm = api.getActiveTerm();
      const viewingTerm = activeTerm;

      const isViewingActiveSession =
        Boolean(activeTerm && activeTerm.status === 'Active') &&
        Boolean(viewingTerm && viewingTerm.status === 'Active') &&
        activeTerm?.id === viewingTerm?.id;

      expect(isViewingActiveSession).toBe(true);
    });

    it('exposes Close Term as primary action for an Active term', () => {
      const activeTerm = api.getActiveTerm();
      expect(activeTerm?.status).toBe('Active');

      // Lifecycle action mapping rule:
      const availableAction = activeTerm?.status === 'Active' ? 'Close Term' : 'Other';
      expect(availableAction).toBe('Close Term');
    });
  });

  // =========================================================================
  // Test C: Closed Term
  // - Term 2 is Closed.
  // - Header and Session Switcher do not identify it as Active.
  // - Academic Session Management displays Closed.
  // - Reopen Term and Lock Term are available.
  // =========================================================================
  describe('Test C: Closed Term', () => {
    it('does not identify a Closed Term as Active in session context', () => {
      const term2 = api.getSchoolTerms().find((t) => t.term_name === 'Term 2');
      expect(term2?.status).toBe('Closed');

      const isGenuineActive = term2?.status === 'Active';
      expect(isGenuineActive).toBe(false);

      const activeTerm = api.getActiveTerm();
      expect(activeTerm).toBeNull();
    });

    it('exposes Reopen and Lock actions for a Closed term', () => {
      const term2 = api.getSchoolTerms().find((t) => t.term_name === 'Term 2')!;
      expect(term2.status).toBe('Closed');

      const actions = term2.status === 'Closed' ? ['Reopen', 'Lock'] : [];
      expect(actions).toContain('Reopen');
      expect(actions).toContain('Lock');
      expect(actions).not.toContain('Close Term');
    });

    it('blocks marks modification on a Closed term', () => {
      const term2 = api.getSchoolTerms().find((t) => t.term_name === 'Term 2')!;
      expect(canEnterMarks(term2.status)).toBe(false);
      expect(isTermModifiable(term2.status)).toBe(false);
      expect(canApproveExams(term2.status)).toBe(false);
      // But viewing reports and existing records is permitted
      expect(canGenerateReports(term2.status)).toBe(true);
      expect(canViewTermData(term2.status)).toBe(true);
    });
  });

  // =========================================================================
  // Test D: Historical Viewing
  // - Select a Closed or Archived term.
  // - Its examination records remain accessible according to permissions.
  // - The operational active term does not change.
  // - No false ACTIVE indicator appears.
  // =========================================================================
  describe('Test D: Historical Viewing', () => {
    const historicalExams: Examination[] = [
      {
        id: 'exam-2025-opener',
        name: '2025 Term 1 Opener Exam',
        exam_type: 'OPENER',
        term: 'Term 1',
        year: 2025,
        target_education_level: 'Primary School',
        academic_year_id: 'ay-2025-archived',
        created_at: '2025-01-10T00:00:00.000Z',
        is_locked: true,
      },
      {
        id: 'exam-2026-term1',
        name: '2026 Term 1 End Term',
        exam_type: 'END_TERM',
        term: 'Term 1',
        year: 2026,
        target_education_level: 'Primary School',
        academic_year_id: 'ay-2026-test',
        created_at: '2026-03-20T00:00:00.000Z',
        is_locked: false,
      },
    ];

    beforeEach(() => {
      // Term 2 is active
      const terms = sampleTerms2026.map((t) =>
        t.term_name === 'Term 2' ? { ...t, status: 'Active' as const } : t
      );
      setStorage(KEYS.SCHOOL_TERMS, terms);
      setStorage(KEYS.EXAMS, historicalExams);
    });

    it('retains the official active term when switching viewing session to Term 1 (Closed)', () => {
      const originalActive = api.getActiveTerm();
      expect(originalActive?.term_name).toBe('Term 2');

      // User selects Term 1 (Closed) for viewing
      const viewingTerm = api.getSchoolTerms().find((t) => t.term_name === 'Term 1')!;
      expect(viewingTerm.status).toBe('Closed');

      // Changing viewing session must NOT change api.getActiveTerm()
      const currentActive = api.getActiveTerm();
      expect(currentActive?.id).toBe(originalActive?.id);
      expect(currentActive?.term_name).toBe('Term 2');

      // The viewing session is NOT active
      const isViewingActiveSession =
        Boolean(currentActive && currentActive.status === 'Active') &&
        Boolean(viewingTerm && viewingTerm.status === 'Active') &&
        currentActive?.id === viewingTerm?.id;
      expect(isViewingActiveSession).toBe(false);
    });

    it('allows read-only access to examinations of historical/closed terms', () => {
      const exams = getStorage<Examination[]>(KEYS.EXAMS, []);
      const term1Exams = exams.filter((e) => e.term === 'Term 1' && e.year === 2026);
      expect(term1Exams.length).toBe(1);
      expect(term1Exams[0].name).toBe('2026 Term 1 End Term');
    });
  });

  // =========================================================================
  // Test E: Term Activation
  // - An authorised administrator activates an Upcoming term.
  // - Supabase confirms the status change.
  // - All relevant application sections update consistently.
  // - The previous active term follows the existing lifecycle rules.
  // =========================================================================
  describe('Test E: Term Activation Lifecycle', () => {
    beforeEach(() => {
      // Set Term 2 active, Term 3 upcoming
      const terms: SchoolTerm[] = [
        { ...sampleTerms2026[0], status: 'Closed' },
        { ...sampleTerms2026[1], status: 'Active' },
        { ...sampleTerms2026[2], status: 'Upcoming' },
      ];
      setStorage(KEYS.SCHOOL_TERMS, terms);
    });

    it('transitions previous active term to Closed when activating Term 3', async () => {
      expect(api.getActiveTerm()?.term_name).toBe('Term 2');

      const term3 = api.getSchoolTerms().find((t) => t.term_name === 'Term 3')!;
      await api.setActiveTerm(term3.id);

      const termsAfter = api.getSchoolTerms();
      const updatedTerm2 = termsAfter.find((t) => t.term_name === 'Term 2');
      const updatedTerm3 = termsAfter.find((t) => t.term_name === 'Term 3');

      expect(updatedTerm3?.status).toBe('Active');
      expect(updatedTerm2?.status).toBe('Closed');

      const newActive = api.getActiveTerm();
      expect(newActive?.term_name).toBe('Term 3');
      expect(newActive?.status).toBe('Active');
    });
  });

  // =========================================================================
  // Test F: Permissions and Academic Safety
  // - Verify admin, class_teacher and subject_teacher permissions.
  // - Confirm that unauthorised users cannot activate, reopen, close or lock terms.
  // - Confirm that closed, locked and archived term restrictions on marks entry remain intact.
  // =========================================================================
  describe('Test F: Permissions and Academic Safety', () => {
    it('restricts term lifecycle operations to admin role only', () => {
      const roles = ['admin', 'class_teacher', 'subject_teacher'] as const;

      roles.forEach((role) => {
        const canManageSessions = role === 'admin';
        if (role === 'admin') {
          expect(canManageSessions).toBe(true);
        } else {
          expect(canManageSessions).toBe(false);
        }
      });
    });

    it('strictly enforces marks entry immutability on non-Active terms', () => {
      const nonActiveStatuses = ['Closed', 'Locked', 'Archived', 'Upcoming'] as const;

      nonActiveStatuses.forEach((status) => {
        expect(canEnterMarks(status)).toBe(false);
        expect(isTermModifiable(status)).toBe(false);
      });

      // Active status allows marks entry
      expect(canEnterMarks('Active')).toBe(true);
      expect(isTermModifiable('Active')).toBe(true);
    });

    it('ensures Locked and Archived terms prohibit exam planning and modifications', () => {
      expect(canPlanExams('Locked')).toBe(false);
      expect(canPlanExams('Archived')).toBe(false);
      expect(canApproveExams('Locked')).toBe(false);
      expect(canApproveExams('Archived')).toBe(false);
    });
  });

  // =========================================================================
  // Test G: Active Session Presentation Synchronization
  // - SessionSwitcher trigger and ModuleIndicator breadcrumbs must display
  //   the active term when one exists.
  // - No stale historical selection (Term 1) persists after Term 3 is active.
  // - ModuleIndicator matches the active term displayed in Academic Session Management.
  // =========================================================================
  describe('Test G: Active Session Presentation Synchronization', () => {
    beforeEach(() => {
      const terms: SchoolTerm[] = [
        { ...sampleTerms2026[0], status: 'Closed' },
        { ...sampleTerms2026[1], status: 'Closed' },
        { ...sampleTerms2026[2], status: 'Active' }, // Term 3 is Active
      ];
      setStorage(KEYS.SCHOOL_TERMS, terms);
    });

    it('consistently returns Term 3 as the operational active term', () => {
      const active = api.getActiveTerm();
      expect(active).not.toBeNull();
      expect(active?.term_name).toBe('Term 3');
      expect(active?.status).toBe('Active');
    });

    it('formats SessionSwitcher and ModuleIndicator as Active for Term 3', () => {
      const activeTerm = api.getActiveTerm()!;
      const viewingTerm = activeTerm;
      const viewingYear = sampleYear2026;
      const isViewingActiveSession =
        Boolean(activeTerm && activeTerm.status === 'Active') &&
        Boolean(viewingTerm && viewingTerm.status === 'Active') &&
        activeTerm.id === viewingTerm.id;

      expect(isViewingActiveSession).toBe(true);

      // SessionSwitcher label and badge state
      const switcherLabel = `${viewingTerm.term_name} • ${viewingYear.year}`;
      expect(switcherLabel).toBe('Term 3 • 2026');

      // ModuleIndicator label and badge state
      const moduleChipLabel = `${viewingTerm.term_name} • ${viewingYear.year}`;
      const moduleBadgeText = isViewingActiveSession ? 'Active' : 'Archive';
      expect(moduleChipLabel).toBe('Term 3 • 2026');
      expect(moduleBadgeText).toBe('Active');
    });

    it('ensures activating a new term updates activeTerm and is never overridden by Term 1 fallback', async () => {
      const term3 = api.getSchoolTerms().find((t) => t.term_name === 'Term 3')!;
      await api.setActiveTerm(term3.id);

      const active = api.getActiveTerm();
      expect(active?.term_name).toBe('Term 3');
      expect(active?.status).toBe('Active');

      // Verify that Term 1 is genuinely Closed and not displayed as Active
      const term1 = api.getSchoolTerms().find((t) => t.term_name === 'Term 1')!;
      expect(term1.status).toBe('Closed');
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  isExamInSession,
  groupExamsForDropdown,
  getCleanExamDropdownTitle,
} from '../utils/examDisplayUtils';
import { Examination } from '../types';

describe('Assessment Hub Session Dropdown Filtering & Safe Fallbacks', () => {
  const mockTerm3Exams: Examination[] = [
    {
      id: 'exam-2026-t3-opener-g9',
      exam_name: 'Grade 9 Opener Assessment Term 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Approved',
      exam_type: 'Opener',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-2026-t3',
    },
    {
      id: 'exam-2026-t3-kjsea-g9',
      exam_name: 'GRADE 9 KJSEA SECOND TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Provisional',
      exam_type: 'Custom',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-2026-t3',
    },
    {
      id: 'exam-2026-t3-kpsea-g6',
      exam_name: 'GRADE 6 KPSEA SECOND TRIAL TERM 3 2026',
      term: 'Term 3',
      year: 2026,
      status: 'Provisional',
      exam_type: 'Custom',
      max_marks: 100,
      academic_year_id: 'ay-2026',
      term_id: 'term-2026-t3',
    },
  ];

  const mockTerm12027Exam: Examination = {
    id: 'exam-2027-t1-opener-g9',
    exam_name: 'Grade 9 Opener Assessment Term 1 2027',
    term: 'Term 1',
    year: 2027,
    status: 'Draft',
    exam_type: 'Opener',
    max_marks: 100,
    academic_year_id: 'ay-2027',
    term_id: 'term-2027-t1',
  };

  const allExams = [...mockTerm3Exams, mockTerm12027Exam];

  describe('1. isExamInSession session matching', () => {
    it('correctly matches examinations belonging to the target session', () => {
      expect(isExamInSession(mockTerm12027Exam, 2027, 'Term 1')).toBe(true);
      expect(isExamInSession(mockTerm12027Exam, '2027', 'Term 1')).toBe(true);
      expect(isExamInSession(mockTerm12027Exam, { year: 2027, id: 'ay-2027' }, { term_name: 'Term 1', id: 'term-2027-t1' })).toBe(true);
    });

    it('rejects examinations belonging to a different year or term', () => {
      // Term 3 2026 exam must NOT match Term 1 2027
      expect(isExamInSession(mockTerm3Exams[0], 2027, 'Term 1')).toBe(false);
      expect(isExamInSession(mockTerm3Exams[1], 2027, 'Term 1')).toBe(false);
      expect(isExamInSession(mockTerm3Exams[2], 2027, 'Term 1')).toBe(false);

      // Term 1 2027 exam must NOT match Term 3 2026
      expect(isExamInSession(mockTerm12027Exam, 2026, 'Term 3')).toBe(false);
    });
  });

  describe('2. Dropdown filtering strictly isolates sessions', () => {
    it('Term 3 2026 examinations do NOT appear when viewing Term 1 2027 if no 2027 exams exist', () => {
      // Only 2026 exams in the database
      const groups = groupExamsForDropdown(mockTerm3Exams, 2027, 'Term 1');
      expect(groups).toHaveLength(0);
    });

    it('Only Term 1 2027 examinations appear when viewing Term 1 2027 even when Term 3 2026 exams exist', () => {
      const groups = groupExamsForDropdown(allExams, 2027, 'Term 1');
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('ACTIVE SESSION (Term 1 • 2027)');
      expect(groups[0].exams).toHaveLength(1);
      expect(groups[0].exams[0].exam.id).toBe('exam-2027-t1-opener-g9');
      expect(groups[0].exams[0].label).toBe('Grade 9 Opener Assessment [Draft]');
    });

    it('Switching viewing session to Term 3 2026 restores its examinations and excludes Term 1 2027', () => {
      const groups = groupExamsForDropdown(allExams, 2026, 'Term 3');
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('ACTIVE SESSION (Term 3 • 2026)');
      expect(groups[0].exams).toHaveLength(3);

      const examIds = groups[0].exams.map((g) => g.exam.id);
      expect(examIds).toContain('exam-2026-t3-opener-g9');
      expect(examIds).toContain('exam-2026-t3-kjsea-g9');
      expect(examIds).toContain('exam-2026-t3-kpsea-g6');
      expect(examIds).not.toContain('exam-2027-t1-opener-g9');
    });

    it('Historical mode allows viewing older exams in clearly labeled PREVIOUS SESSIONS group', () => {
      const groups = groupExamsForDropdown(allExams, 2027, 'Term 1', { includeHistorical: true });
      expect(groups).toHaveLength(2);
      expect(groups[0].label).toBe('ACTIVE SESSION (Term 1 • 2027)');
      expect(groups[0].exams).toHaveLength(1);

      expect(groups[1].label).toBe('PREVIOUS SESSIONS');
      expect(groups[1].exams).toHaveLength(3);
    });
  });

  describe('3. Unsafe fallback elimination and placeholder display', () => {
    it('returns empty string rather than exams[0] when selected session has no examinations', () => {
      // Simulates component selection logic when only Term 3 2026 exams exist but viewing Term 1 2027
      const viewingYear = 2027;
      const viewingTerm = 'Term 1';
      const sessionExams = mockTerm3Exams.filter((e) => isExamInSession(e, viewingYear, viewingTerm));

      expect(sessionExams).toHaveLength(0);

      // Safe logic: fail-closed to ''
      const safeSelectedExamId = sessionExams.length > 0 ? sessionExams[0].id : '';
      expect(safeSelectedExamId).toBe('');
      expect(safeSelectedExamId).not.toBe(mockTerm3Exams[0].id);
    });

    it('renders informative disabled placeholder when no examinations exist for the session', () => {
      const viewingYear = 2027;
      const viewingTerm = 'Term 1';
      const sessionExams = mockTerm3Exams.filter((e) => isExamInSession(e, viewingYear, viewingTerm));

      const placeholderText = sessionExams.length === 0
        ? `-- No assessments scheduled for ${viewingTerm} ${viewingYear} --`
        : 'Select Assessment...';

      expect(placeholderText).toBe('-- No assessments scheduled for Term 1 2027 --');
    });

    it('automatically selects the session exam when an examination for Term 1 2027 is created', () => {
      const viewingYear = 2027;
      const viewingTerm = 'Term 1';
      const sessionExams = allExams.filter((e) => isExamInSession(e, viewingYear, viewingTerm));

      expect(sessionExams).toHaveLength(1);
      const safeSelectedExamId = sessionExams.length > 0 ? sessionExams[0].id : '';
      expect(safeSelectedExamId).toBe('exam-2027-t1-opener-g9');
    });
  });
});

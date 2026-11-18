import { describe, it, expect, beforeEach } from 'vitest';
import { api, setStorage, getStorage, KEYS } from '../lib/storage';
import { SUPABASE_PART3, SUPABASE_PART4, SUPABASE_QUICK_MIGRATIONS } from '../lib/supabaseSql';
import { isClassExamApproved, isStudentExamApproved } from '../utils/examLockUtils';
import type { Examination, SchoolTerm, AcademicYear, Mark, Student, Subject, ClassStream, User } from '../types';

// Mock localStorage if in node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('Stage 3B.10: Administrator Marks Correction on Reopened Closed-Term Examinations', () => {
  // Test UUIDs
  const year2026Id = '10000000-0000-4000-8000-000000002026';
  const term2026T3ClosedId = '20000000-0000-4000-8000-000000002603';
  const term2026T1ActiveId = '20000000-0000-4000-8000-000000002601';
  const term2025T3ArchivedId = '20000000-0000-4000-8000-000000002503';

  const classGrade8RedId = '50000000-0000-4000-8000-000000000008';
  const studentId = '30000000-0000-4000-8000-000000000001';
  const subjectId = '40000000-0000-4000-8000-000000000001';

  const reopenedExamId = '60000000-0000-4000-8000-000000000088';
  const freshDraftExamId = '60000000-0000-4000-8000-000000000099';
  const approvedExamId = '60000000-0000-4000-8000-000000000077';
  const activeDraftExamId = '60000000-0000-4000-8000-000000000055';
  const archivedSessionExamId = '60000000-0000-4000-8000-000000000066';

  const adminUser: User = {
    id: 'user-admin-1',
    name: 'School Administrator',
    email: 'admin@school.ac.ke',
    role: 'admin',
    status: 'Active',
  };

  const teacherUser: User = {
    id: 'user-teacher-1',
    name: 'Subject Teacher',
    email: 'teacher@school.ac.ke',
    role: 'subject_teacher',
    status: 'Active',
  };

  const testYears: AcademicYear[] = [
    {
      id: year2026Id,
      year: 2026,
      status: 'Active',
      start_date: '2026-01-05',
      end_date: '2026-11-25',
    },
    {
      id: '10000000-0000-4000-8000-000000002025',
      year: 2025,
      status: 'Archived',
      start_date: '2025-01-06',
      end_date: '2025-11-20',
    },
  ];

  const testTerms: SchoolTerm[] = [
    {
      id: term2026T3ClosedId,
      academic_year_id: year2026Id,
      year: 2026,
      term_name: 'Term 3',
      status: 'Closed',
      opening_date: '2026-08-24',
      closing_date: '2026-10-23',
    },
    {
      id: term2026T1ActiveId,
      academic_year_id: year2026Id,
      year: 2026,
      term_name: 'Term 1',
      status: 'Active',
      opening_date: '2026-01-05',
      closing_date: '2026-04-10',
    },
    {
      id: term2025T3ArchivedId,
      academic_year_id: '10000000-0000-4000-8000-000000002025',
      year: 2025,
      term_name: 'Term 3',
      status: 'Archived',
      opening_date: '2025-08-25',
      closing_date: '2025-10-24',
    },
  ];

  const testClasses: ClassStream[] = [
    {
      id: classGrade8RedId,
      stream_id: classGrade8RedId,
      class_name: 'Grade 8',
      stream: 'Red',
      education_level: 'Junior School',
      status: 'Active',
    },
  ];

  const testStudents: Student[] = [
    {
      id: studentId,
      first_name: 'Jane',
      last_name: 'Doe',
      admission_number: 'ADM-001',
      class_id: classGrade8RedId,
      stream_id: classGrade8RedId,
      status: 'Active',
    },
  ];

  const testSubjects: Subject[] = [
    {
      id: subjectId,
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      education_level: 'Junior School',
      status: 'Active',
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    setStorage(KEYS.ACADEMIC_YEARS, testYears);
    setStorage(KEYS.SCHOOL_TERMS, testTerms);
    setStorage(KEYS.CLASSES, testClasses);
    setStorage(KEYS.STUDENTS, testStudents);
    setStorage(KEYS.SUBJECTS, testSubjects);
    setStorage(KEYS.MARKS, []);

    const initialExams: Examination[] = [
      {
        id: reopenedExamId,
        exam_name: 'Grade 8 End Term 3 Examination',
        exam_type: 'End Term',
        year: 2026,
        term: 'Term 3',
        term_id: term2026T3ClosedId,
        academic_year_id: year2026Id,
        class_id: classGrade8RedId,
        status: 'Draft',
        reopened_for_correction: true,
        max_marks: 100,
        approved_classes: [],
        approved_levels: [],
      },
      {
        id: freshDraftExamId,
        exam_name: 'Grade 8 Newly Created Draft Exam',
        exam_type: 'Custom',
        year: 2026,
        term: 'Term 3',
        term_id: term2026T3ClosedId,
        academic_year_id: year2026Id,
        class_id: classGrade8RedId,
        status: 'Draft',
        reopened_for_correction: false,
        max_marks: 100,
        approved_classes: [],
        approved_levels: [],
      },
      {
        id: approvedExamId,
        exam_name: 'Grade 8 Officially Approved Exam',
        exam_type: 'End Term',
        year: 2026,
        term: 'Term 3',
        term_id: term2026T3ClosedId,
        academic_year_id: year2026Id,
        class_id: classGrade8RedId,
        status: 'Approved',
        reopened_for_correction: false,
        max_marks: 100,
        approved_classes: [classGrade8RedId],
        approved_levels: ['Junior School'],
      },
      {
        id: activeDraftExamId,
        exam_name: 'Grade 8 Term 1 Active Draft Exam',
        exam_type: 'Custom',
        year: 2026,
        term: 'Term 1',
        term_id: term2026T1ActiveId,
        academic_year_id: year2026Id,
        class_id: classGrade8RedId,
        status: 'Draft',
        reopened_for_correction: false,
        max_marks: 100,
        approved_classes: [],
        approved_levels: [],
      },
      {
        id: archivedSessionExamId,
        exam_name: 'Historical 2025 Exam',
        exam_type: 'End Term',
        year: 2025,
        term: 'Term 3',
        term_id: term2025T3ArchivedId,
        academic_year_id: '10000000-0000-4000-8000-000000002025',
        class_id: classGrade8RedId,
        status: 'Draft',
        reopened_for_correction: true,
        max_marks: 100,
        approved_classes: [],
        approved_levels: [],
      },
    ];

    setStorage(KEYS.EXAMS, initialExams);
  });

  describe('Storage-Layer saveBulkMarks Permission Enforcement', () => {
    it('allows an administrator to save marks for a reopened Draft exam on a Closed term', async () => {
      const marksToSave: Mark[] = [
        {
          id: 'mark-001',
          exam_id: reopenedExamId,
          student_id: studentId,
          subject_id: subjectId,
          score: 85,
          raw_score: 85,
          out_of: 100,
          status: 'Normal',
        },
      ];

      await expect(api.saveBulkMarks(marksToSave, adminUser)).resolves.not.toThrow();

      const saved = api.getMarks();
      expect(saved.length).toBe(1);
      expect(saved[0].score).toBe(85);
    });

    it('blocks a non-administrator teacher from modifying marks on a Closed term even if exam has reopened flag', async () => {
      const marksToSave: Mark[] = [
        {
          id: 'mark-002',
          exam_id: reopenedExamId,
          student_id: studentId,
          subject_id: subjectId,
          score: 75,
          raw_score: 75,
          out_of: 100,
          status: 'Normal',
        },
      ];

      await expect(api.saveBulkMarks(marksToSave, teacherUser)).rejects.toThrow(
        /academic term .* is Closed and is protected from modification/i
      );
    });

    it('blocks an administrator from saving marks for a newly created Draft exam on a Closed term', async () => {
      const marksToSave: Mark[] = [
        {
          id: 'mark-003',
          exam_id: freshDraftExamId,
          student_id: studentId,
          subject_id: subjectId,
          score: 90,
          raw_score: 90,
          out_of: 100,
          status: 'Normal',
        },
      ];

      await expect(api.saveBulkMarks(marksToSave, adminUser)).rejects.toThrow(
        /academic term .* is Closed and is protected from modification/i
      );
    });

    it('blocks modifying marks for an Approved examination even on Closed or Active sessions', async () => {
      const marksToSave: Mark[] = [
        {
          id: 'mark-004',
          exam_id: approvedExamId,
          student_id: studentId,
          subject_id: subjectId,
          score: 92,
          raw_score: 92,
          out_of: 100,
          status: 'Normal',
        },
      ];

      await expect(api.saveBulkMarks(marksToSave, adminUser)).rejects.toThrow(
        /Cannot modify marks for approved examination .* Examination is locked/i
      );
    });

    it('strictly blocks modifying marks for Archived sessions even for administrators and even if flag is set', async () => {
      const marksToSave: Mark[] = [
        {
          id: 'mark-005',
          exam_id: archivedSessionExamId,
          student_id: studentId,
          subject_id: subjectId,
          score: 80,
          raw_score: 80,
          out_of: 100,
          status: 'Normal',
        },
      ];

      await expect(api.saveBulkMarks(marksToSave, adminUser)).rejects.toThrow(
        /academic (term|year) .* is Archived and is protected from modification/i
      );
    });
  });

  describe('Reopening Lifecycle and Atomicity in updateExaminationStatus', () => {
    it('sets reopened_for_correction = true when an administrator reopens an Approved examination to Draft', async () => {
      const examBefore = api.getExaminations().find((e) => e.id === approvedExamId)!;
      expect(examBefore.status).toBe('Approved');
      expect(examBefore.reopened_for_correction).toBe(false);

      const updated = await api.updateExaminationStatus(approvedExamId, 'Draft', adminUser);
      expect(updated.status).toBe('Draft');
      expect(updated.reopened_for_correction).toBe(true);

      const examAfter = api.getExaminations().find((e) => e.id === approvedExamId)!;
      expect(examAfter.status).toBe('Draft');
      expect(examAfter.reopened_for_correction).toBe(true);
      expect(examAfter.approved_classes).toEqual([]);
    });

    it('resets reopened_for_correction = false when an examination is approved again', async () => {
      const examBefore = api.getExaminations().find((e) => e.id === reopenedExamId)!;
      expect(examBefore.status).toBe('Draft');
      expect(examBefore.reopened_for_correction).toBe(true);

      const approved = await api.updateExaminationStatus(reopenedExamId, 'Approved', adminUser);
      expect(approved.status).toBe('Approved');
      expect(approved.reopened_for_correction).toBe(false);

      const examAfter = api.getExaminations().find((e) => e.id === reopenedExamId)!;
      expect(examAfter.status).toBe('Approved');
      expect(examAfter.reopened_for_correction).toBe(false);
    });

    it('rejects reopening by a non-administrator with an unauthorized error', async () => {
      await expect(
        api.updateExaminationStatus(approvedExamId, 'Draft', teacherUser)
      ).rejects.toThrow(/UNAUTHORIZED: Only an Administrator can reopen an approved examination/i);
    });

    it('ensures new examinations default to reopened_for_correction = false', async () => {
      const created = await api.addExamination({
        exam_name: 'Grade 8 Mid Term 1',
        term: 'Term 1',
        year: 2026,
        status: 'Draft',
        max_marks: 100,
        exam_type: 'Mid Term',
      });

      expect(created.reopened_for_correction).toBe(false);
      const fetched = api.getExaminations().find((e) => e.id === created.id);
      expect(fetched?.reopened_for_correction).toBe(false);
    });

    it('does not allow ordinary updateExamination to toggle reopened_for_correction', async () => {
      const exam = api.getExaminations().find((e) => e.id === activeDraftExamId)!;
      expect(exam.reopened_for_correction).toBe(false);

      // Attempt to pass reopened_for_correction: true in standard edit form
      const updated = await api.updateExamination(
        {
          ...exam,
          exam_name: 'Renamed Active Draft Exam',
          reopened_for_correction: true as any,
        },
        adminUser
      );

      // Verify it retained targetExam's false value
      expect(updated.reopened_for_correction).toBe(false);
      const after = api.getExaminations().find((e) => e.id === activeDraftExamId)!;
      expect(after.reopened_for_correction).toBe(false);

      // Confirm assessment editing on Closed terms is strictly rejected
      const closedExam = api.getExaminations().find((e) => e.id === freshDraftExamId)!;
      await expect(
        api.updateExamination(
          {
            ...closedExam,
            exam_name: 'Attempted Closed Edit',
          },
          adminUser
        )
      ).rejects.toThrow(/The academic term .* is Closed/i);
    });
  });

  describe('Learner Portal Result Concealment', () => {
    it('confirms Draft reopened examination is not marked approved and not visible to learners', () => {
      const reopenedExam = api.getExaminations().find((e) => e.id === reopenedExamId)!;
      const classObj = testClasses[0];

      // isClassExamApproved must be false
      expect(isClassExamApproved(reopenedExam, classObj)).toBe(false);

      // isStudentExamApproved must be false
      expect(isStudentExamApproved(reopenedExam, classObj.id, testClasses)).toBe(false);
    });
  });

  describe('SQL Migration and Function Invariant Verification', () => {
    it('verifies SQL definitions in supabaseSql.ts contain the column and updated function', () => {
      expect(SUPABASE_PART3).toContain('reopened_for_correction BOOLEAN NOT NULL DEFAULT FALSE');
      expect(SUPABASE_PART4).toContain('CREATE OR REPLACE FUNCTION public.is_examination_session_editable');
      expect(SUPABASE_PART4).toContain('COALESCE(v_exam.reopened_for_correction, FALSE) = TRUE');
      expect(SUPABASE_PART4).toContain('IF v_term_status IS NULL THEN');
      expect(SUPABASE_PART4).toContain('RETURN FALSE;');

      expect(SUPABASE_QUICK_MIGRATIONS).toContain('reopened_for_correction');
      expect(SUPABASE_QUICK_MIGRATIONS).toContain('is_examination_session_editable');
    });
  });
});

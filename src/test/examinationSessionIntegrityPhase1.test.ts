import { describe, it, expect, beforeEach } from 'vitest';
import { api, setStorage, getStorage, KEYS } from '../lib/storage';
import { SUPABASE_PART3, SUPABASE_PART4, SUPABASE_QUICK_MIGRATIONS } from '../lib/supabaseSql';
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

describe('CBE Hub Phase 1: Database Integrity, Historical Marks Protection and Referential Safety', () => {
  // Test UUIDs
  const year2025Id = '10000000-0000-4000-8000-000000002025';
  const year2026Id = '10000000-0000-4000-8000-000000002026';
  const term2025T3Id = '20000000-0000-4000-8000-000000002503';
  const term2026T1Id = '20000000-0000-4000-8000-000000002601';
  const term2026T2Id = '20000000-0000-4000-8000-000000002602';

  const studentId = '30000000-0000-4000-8000-000000000001';
  const subjectId = '40000000-0000-4000-8000-000000000001';
  const classId = '50000000-0000-4000-8000-000000000001';

  const activeExamId = '60000000-0000-4000-8000-000000000001';
  const archivedTermExamDraftId = '60000000-0000-4000-8000-000000000002';
  const archivedTermExamProvisionalId = '60000000-0000-4000-8000-000000000003';
  const archivedYearExamId = '60000000-0000-4000-8000-000000000004';
  const approvedExamId = '60000000-0000-4000-8000-000000000005';
  const archivedExamId = '60000000-0000-4000-8000-000000000006';

  const testYears: AcademicYear[] = [
    {
      id: year2025Id,
      year: 2025,
      status: 'Archived',
      start_date: '2025-01-06',
      end_date: '2025-11-20',
    },
    {
      id: year2026Id,
      year: 2026,
      status: 'Active',
      start_date: '2026-01-05',
      end_date: '2026-11-25',
    },
  ];

  const testTerms: SchoolTerm[] = [
    {
      id: term2025T3Id,
      academic_year_id: year2025Id,
      year: 2025,
      term_name: 'Term 3',
      status: 'Archived',
      opening_date: '2025-08-25',
      closing_date: '2025-10-24',
    },
    {
      id: term2026T1Id,
      academic_year_id: year2026Id,
      year: 2026,
      term_name: 'Term 1',
      status: 'Active',
      opening_date: '2026-01-05',
      closing_date: '2026-04-10',
    },
    {
      id: term2026T2Id,
      academic_year_id: year2026Id,
      year: 2026,
      term_name: 'Term 2',
      status: 'Upcoming',
      opening_date: '2026-05-04',
      closing_date: '2026-08-07',
    },
  ];

  const testExams: Examination[] = [
    {
      id: activeExamId,
      exam_name: 'Term 1 2026 Mid-Term Exam',
      term: 'Term 1',
      year: 2026,
      academic_year_id: year2026Id,
      term_id: term2026T1Id,
      status: 'Draft',
      exam_type: 'Mid-Term',
      max_marks: 100,
    },
    {
      id: archivedTermExamDraftId,
      exam_name: 'Term 3 2025 End Term (Draft)',
      term: 'Term 3',
      year: 2025,
      academic_year_id: year2025Id,
      term_id: term2025T3Id,
      status: 'Draft',
      exam_type: 'End-Term',
      max_marks: 100,
    },
    {
      id: archivedTermExamProvisionalId,
      exam_name: 'Term 3 2025 Mock (Provisional)',
      term: 'Term 3',
      year: 2025,
      academic_year_id: year2025Id,
      term_id: term2025T3Id,
      status: 'Provisional',
      exam_type: 'CAT',
      max_marks: 100,
    },
    {
      id: archivedYearExamId,
      exam_name: 'Historical 2025 Assessment',
      term: 'Term 1',
      year: 2025,
      academic_year_id: year2025Id,
      status: 'Draft',
      exam_type: 'CAT',
      max_marks: 100,
    },
    {
      id: approvedExamId,
      exam_name: 'Approved Active Assessment',
      term: 'Term 1',
      year: 2026,
      academic_year_id: year2026Id,
      term_id: term2026T1Id,
      status: 'Approved',
      exam_type: 'CAT',
      max_marks: 100,
    },
    {
      id: archivedExamId,
      exam_name: 'Explicitly Archived Assessment',
      term: 'Term 1',
      year: 2026,
      academic_year_id: year2026Id,
      term_id: term2026T1Id,
      status: 'Archived',
      exam_type: 'CAT',
      max_marks: 100,
    },
  ];

  const testStudent: Student = {
    id: studentId,
    admission_number: 'ADM-2026-001',
    full_name: 'Faith Achieng',
    gender: 'F',
    class_id: classId,
    stream_id: classId,
    active: true,
  };

  const testSubject: Subject = {
    id: subjectId,
    subject_code: 'ENG',
    subject_name: 'English',
    department: 'Languages',
    education_level: 'Junior School',
  };

  const testClass: ClassStream = {
    id: classId,
    class_name: 'Grade 7',
    stream: 'Alpha',
    capacity: 40,
    education_level: 'Junior School',
    status: 'Active',
  };

  const adminUser: User = {
    id: 'user_admin_001',
    name: 'Chief Administrator',
    email: 'admin@school.ac.ke',
    role: 'admin',
  };

  const teacherUser: User = {
    id: 'user_teacher_001',
    name: 'Subject Teacher',
    email: 'teacher@school.ac.ke',
    role: 'subject_teacher',
  };

  beforeEach(() => {
    (globalThis as any).__TEST_SUPABASE_CLIENT__ = {
      from: (_table: string) => ({
        upsert: async (payloads: any[]) => ({ data: payloads, error: null }),
        update: (_payloads: any) => ({
          eq: async () => ({ data: null, error: null }),
        }),
        insert: async (payloads: any[]) => ({ data: payloads, error: null }),
        select: () => ({
          limit: () => ({ data: [], error: null }),
          eq: () => ({ data: [], error: null }),
          ilike: () => ({ data: [], error: null }),
          in: () => ({ data: [], error: null }),
        }),
      }),
    };

    setStorage(KEYS.ACADEMIC_YEARS, testYears);
    setStorage(KEYS.SCHOOL_TERMS, testTerms);
    setStorage(KEYS.EXAMS, testExams);
    setStorage(KEYS.STUDENTS, [testStudent]);
    setStorage(KEYS.SUBJECTS, [testSubject]);
    setStorage(KEYS.CLASSES, [testClass]);
    setStorage(KEYS.MARKS, [
      {
        id: 'mark_hist_001',
        student_id: studentId,
        subject_id: subjectId,
        exam_id: archivedTermExamDraftId,
        marks: 78,
        raw_score: 78,
        out_of: 100,
        special_status: 'Normal',
      },
    ]);
  });

  // Test 1: Teacher can enter marks for an eligible exam in an Active session
  it('Test 1 — Teacher can enter marks for an eligible exam in an Active session', async () => {
    const markToSave: Mark = {
      id: 'mark_active_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: activeExamId,
      marks: 85,
      raw_score: 85,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).resolves.not.toThrow();

    const currentMarks = getStorage<Mark[]>(KEYS.MARKS, []);
    const saved = currentMarks.find((m) => m.exam_id === activeExamId && m.student_id === studentId);
    expect(saved).toBeDefined();
    expect(saved?.marks).toBe(85);
  });

  // Test 2: Mark entry rejected when exam's term is Archived
  it('Test 2 — Mark entry rejected when exam\'s term is Archived', async () => {
    const markToSave: Mark = {
      id: 'mark_archived_term_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedTermExamDraftId,
      marks: 90,
      raw_score: 90,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).rejects.toThrow(
      /The academic term .* is Archived and is protected from modification/
    );
  });

  // Test 3: Mark entry rejected when exam's academic year is Closed or Archived
  it('Test 3 — Mark entry rejected when exam\'s academic year is Closed or Archived', async () => {
    const markToSave: Mark = {
      id: 'mark_archived_year_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedYearExamId,
      marks: 70,
      raw_score: 70,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).rejects.toThrow(
      /The academic year \(2025\) is Archived and is protected from modification/
    );
  });

  // Test 4: Draft exam in an archived term cannot have marks saved
  it('Test 4 — Draft exam in an archived term cannot have marks saved', async () => {
    const markToSave: Mark = {
      id: 'mark_draft_archived_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedTermExamDraftId, // status: 'Draft'
      marks: 65,
      raw_score: 65,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).rejects.toThrow(
      /The academic term .* is Archived and is protected from modification/
    );
  });

  // Test 5: Provisional exam in an archived term cannot have marks saved
  it('Test 5 — Provisional exam in an archived term cannot have marks saved', async () => {
    const markToSave: Mark = {
      id: 'mark_prov_archived_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedTermExamProvisionalId, // status: 'Provisional'
      marks: 82,
      raw_score: 82,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).rejects.toThrow(
      /The academic term .* is Archived and is protected from modification/
    );
  });

  // Test 6: Approved exam remains locked according to existing rules
  it('Test 6 — Approved exam remains locked according to existing rules', async () => {
    const markToSave: Mark = {
      id: 'mark_approved_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: approvedExamId, // status: 'Approved'
      marks: 88,
      raw_score: 88,
      out_of: 100,
      special_status: 'Normal',
    };

    await expect(api.saveBulkMarks([markToSave], teacherUser)).rejects.toThrow(
      /Cannot modify marks for approved examination "Approved Active Assessment"\. Examination is locked\./
    );
  });

  // Test 7: Administrator cannot bypass historical session mark protection in saveBulkMarks
  it('Test 7 — Administrator cannot bypass historical session mark protection in saveBulkMarks', async () => {
    const markToSave: Mark = {
      id: 'mark_admin_attempt_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedTermExamDraftId,
      marks: 99,
      raw_score: 99,
      out_of: 100,
      special_status: 'Normal',
    };

    // Even when passing adminUser, the session integrity barrier must strictly reject the write
    await expect(api.saveBulkMarks([markToSave], adminUser)).rejects.toThrow(
      /The academic term .* is Archived and is protected from modification/
    );

    // Explicitly archived examination check
    const markForArchivedExam: Mark = {
      id: 'mark_admin_attempt_002',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: archivedExamId,
      marks: 95,
      raw_score: 95,
      out_of: 100,
      special_status: 'Normal',
    };
    await expect(api.saveBulkMarks([markForArchivedExam], adminUser)).rejects.toThrow(
      /Cannot modify marks for archived examination "Explicitly Archived Assessment"\. Examination is archived and read-only\./
    );
  });

  // Test 8: Foreign keys and DDL definitions match expected referential constraints in supabaseSql.ts and migration SQL
  it('Test 8 — Foreign keys and DDL definitions match expected referential constraints in supabaseSql.ts', () => {
    // 1. SUPABASE_PART3 must define foreign keys with ON DELETE RESTRICT
    expect(SUPABASE_PART3).toContain('academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE RESTRICT');
    expect(SUPABASE_PART3).toContain('term_id UUID REFERENCES public.school_terms(id) ON DELETE RESTRICT');
    expect(SUPABASE_PART3).toContain('examinations_academic_year_id_fkey');
    expect(SUPABASE_PART3).toContain('examinations_term_id_fkey');

    // 2. SUPABASE_PART4 must define the 4 composite performance indexes
    expect(SUPABASE_PART4).toContain('idx_examinations_academic_year_id ON public.examinations(academic_year_id)');
    expect(SUPABASE_PART4).toContain('idx_examinations_term_id ON public.examinations(term_id)');
    expect(SUPABASE_PART4).toContain('idx_examinations_session_status ON public.examinations(academic_year_id, term_id, status)');
    expect(SUPABASE_PART4).toContain('idx_examinations_year_term ON public.examinations(year, term)');

    // 3. SUPABASE_PART4 must declare is_examination_session_editable and the database trigger
    expect(SUPABASE_PART4).toContain('public.is_examination_session_editable(p_exam_id UUID)');
    expect(SUPABASE_PART4).toContain('public.enforce_marks_session_immutability()');
    expect(SUPABASE_PART4).toContain('trg_enforce_marks_session_immutability');

    // 4. SUPABASE_QUICK_MIGRATIONS must declare the idempotent migration script
    expect(SUPABASE_QUICK_MIGRATIONS).toContain('examinations_academic_year_id_fkey');
    expect(SUPABASE_QUICK_MIGRATIONS).toContain('examinations_term_id_fkey');
    expect(SUPABASE_QUICK_MIGRATIONS).toContain('is_examination_session_editable');
    expect(SUPABASE_QUICK_MIGRATIONS).toContain('trg_enforce_marks_session_immutability');
  });

  // Test 9: Historical marks and reports remain intact and accessible for read
  it('Test 9 — Historical marks and reports remain intact and accessible for read', () => {
    const marks = api.getMarks();
    expect(marks.length).toBeGreaterThan(0);
    const historicalMark = marks.find((m) => m.id === 'mark_hist_001');
    expect(historicalMark).toBeDefined();
    expect(historicalMark?.marks).toBe(78);
    expect(historicalMark?.exam_id).toBe(archivedTermExamDraftId);
  });

  // Test 10: Legitimate active session marks entry continues to work cleanly
  it('Test 10 — Legitimate active session marks entry continues to work cleanly and update records', async () => {
    const markEntry1: Mark = {
      id: 'mark_legit_001',
      student_id: studentId,
      subject_id: subjectId,
      exam_id: activeExamId,
      marks: 92,
      raw_score: 92,
      out_of: 100,
      special_status: 'Normal',
    };

    await api.saveBulkMarks([markEntry1], teacherUser);

    const updated = api.getMarks().find((m) => m.exam_id === activeExamId && m.student_id === studentId);
    expect(updated?.marks).toBe(92);

    // Update the same mark with new score
    const markEntryUpdate: Mark = {
      ...markEntry1,
      marks: 95,
      raw_score: 95,
    };

    await api.saveBulkMarks([markEntryUpdate], teacherUser);
    const updatedTwice = api.getMarks().find((m) => m.exam_id === activeExamId && m.student_id === studentId);
    expect(updatedTwice?.marks).toBe(95);
  });
});

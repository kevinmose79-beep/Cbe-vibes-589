-- ==============================================================================
-- Migration: Examination Database Integrity, Referential Safety & Historical Marks Protection (Phase 1)
-- Timestamp: 2026-11-02 00:00:00 UTC
-- Description:
--   1. Adds ON DELETE RESTRICT foreign-key constraints on public.examinations
--      (academic_year_id -> public.academic_years.id, term_id -> public.school_terms.id).
--   2. Adds performance indexes on examinations (academic_year_id, term_id, session_status, year_term).
--   3. Implements SECURITY DEFINER helper public.is_examination_session_editable(UUID).
--   4. Implements database-level trigger public.enforce_marks_session_immutability()
--      to prevent INSERT/UPDATE/DELETE on marks when exam/term/year is not editable.
--   5. Hardens Row Level Security policies on public.marks so that administrators
--      cannot bypass historical session protection.
-- ==============================================================================

-- 1. Ensure foreign-key constraints on public.examinations (ON DELETE RESTRICT)
DO $$
BEGIN
  -- Foreign key to academic_years
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'examinations_academic_year_id_fkey'
      AND table_name = 'examinations'
  ) THEN
    ALTER TABLE public.examinations
      ADD CONSTRAINT examinations_academic_year_id_fkey
      FOREIGN KEY (academic_year_id)
      REFERENCES public.academic_years(id)
      ON DELETE RESTRICT;
  END IF;

  -- Foreign key to school_terms
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'examinations_term_id_fkey'
      AND table_name = 'examinations'
  ) THEN
    ALTER TABLE public.examinations
      ADD CONSTRAINT examinations_term_id_fkey
      FOREIGN KEY (term_id)
      REFERENCES public.school_terms(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 2. Indexes for efficient session scoping and examination status filtering
CREATE INDEX IF NOT EXISTS idx_examinations_academic_year_id ON public.examinations(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_examinations_term_id ON public.examinations(term_id);
CREATE INDEX IF NOT EXISTS idx_examinations_session_status ON public.examinations(academic_year_id, term_id, status);
CREATE INDEX IF NOT EXISTS idx_examinations_year_term ON public.examinations(year, term);

-- 3. Helper function: Evaluates whether an examination belongs to an editable academic session
CREATE OR REPLACE FUNCTION public.is_examination_session_editable(p_exam_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exam RECORD;
  v_term_status TEXT;
  v_year_status TEXT;
BEGIN
  IF p_exam_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, exam_name, status, academic_year_id, term_id, year, term
  INTO v_exam
  FROM public.examinations
  WHERE id = p_exam_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Examination status check: Approved and Archived examinations are strictly non-editable
  IF v_exam.status IN ('Approved', 'Archived') THEN
    RETURN FALSE;
  END IF;

  -- Term status check: If term is Archived, Closed, Locked, or Upcoming, marks cannot be entered or edited
  IF v_exam.term_id IS NOT NULL THEN
    SELECT status INTO v_term_status
    FROM public.school_terms
    WHERE id = v_exam.term_id;
  ELSE
    SELECT status INTO v_term_status
    FROM public.school_terms
    WHERE (academic_year_id = v_exam.academic_year_id OR year = v_exam.year)
      AND term_name = v_exam.term
    LIMIT 1;
  END IF;

  IF v_term_status IS NOT NULL AND v_term_status IN ('Archived', 'Closed', 'Locked', 'Upcoming') THEN
    RETURN FALSE;
  END IF;

  -- Academic Year status check: If academic year is Archived, Closed, Locked, or Upcoming, marks cannot be entered or edited
  IF v_exam.academic_year_id IS NOT NULL THEN
    SELECT status INTO v_year_status
    FROM public.academic_years
    WHERE id = v_exam.academic_year_id;
  ELSE
    SELECT status INTO v_year_status
    FROM public.academic_years
    WHERE year = v_exam.year
    LIMIT 1;
  END IF;

  IF v_year_status IS NOT NULL AND v_year_status IN ('Archived', 'Closed', 'Locked', 'Upcoming') THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_examination_session_editable(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_examination_session_editable(UUID) TO authenticated, service_role;

-- 4. Defense-in-Depth Database Trigger on public.marks:
-- Prevents any direct SQL, RPC, or application write against locked/archived sessions
CREATE OR REPLACE FUNCTION public.enforce_marks_session_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_exam_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_exam_id := OLD.exam_id;
  ELSE
    v_target_exam_id := NEW.exam_id;
  END IF;

  IF NOT public.is_examination_session_editable(v_target_exam_id) THEN
    RAISE EXCEPTION 'Operation rejected: Marks for examination % cannot be created, modified, or deleted because the examination is approved/archived or belongs to an archived, closed, locked, or upcoming academic session.', v_target_exam_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_marks_session_immutability ON public.marks;
CREATE TRIGGER trg_enforce_marks_session_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.marks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_marks_session_immutability();

-- 5. Hardened Row Level Security Policies for public.marks
-- Enforces session editability for ALL roles (including administrators)
DROP POLICY IF EXISTS "Marks insert policy" ON public.marks;
CREATE POLICY "Marks insert policy" ON public.marks FOR INSERT TO authenticated WITH CHECK (
  public.is_examination_session_editable(marks.exam_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.teachers t ON (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
        JOIN public.teacher_subjects ts ON ts.teacher_id = t.id
        WHERE s.id = marks.student_id
          AND ts.subject_id = marks.subject_id
          AND (ts.class_id IS NULL OR ts.class_id = s.class_id)
          AND (ts.stream_id IS NULL OR ts.stream_id = s.stream_id)
      )
      OR
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.streams st ON st.id = s.stream_id
        JOIN public.teachers t ON st.class_teacher_id = t.id
        WHERE s.id = marks.student_id
          AND (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
      )
    )
  )
);

DROP POLICY IF EXISTS "Marks update policy" ON public.marks;
CREATE POLICY "Marks update policy" ON public.marks FOR UPDATE TO authenticated USING (
  public.is_examination_session_editable(marks.exam_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.teachers t ON (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
        JOIN public.teacher_subjects ts ON ts.teacher_id = t.id
        WHERE s.id = marks.student_id
          AND ts.subject_id = marks.subject_id
          AND (ts.class_id IS NULL OR ts.class_id = s.class_id)
          AND (ts.stream_id IS NULL OR ts.stream_id = s.stream_id)
      )
      OR
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.streams st ON st.id = s.stream_id
        JOIN public.teachers t ON st.class_teacher_id = t.id
        WHERE s.id = marks.student_id
          AND (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
      )
    )
  )
) WITH CHECK (
  public.is_examination_session_editable(marks.exam_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.teachers t ON (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
        JOIN public.teacher_subjects ts ON ts.teacher_id = t.id
        WHERE s.id = marks.student_id
          AND ts.subject_id = marks.subject_id
          AND (ts.class_id IS NULL OR ts.class_id = s.class_id)
          AND (ts.stream_id IS NULL OR ts.stream_id = s.stream_id)
      )
      OR
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.streams st ON st.id = s.stream_id
        JOIN public.teachers t ON st.class_teacher_id = t.id
        WHERE s.id = marks.student_id
          AND (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
      )
    )
  )
);

DROP POLICY IF EXISTS "Marks delete policy" ON public.marks;
CREATE POLICY "Marks delete policy" ON public.marks FOR DELETE TO authenticated USING (
  public.is_examination_session_editable(marks.exam_id)
  AND (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.teachers t ON (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
        JOIN public.teacher_subjects ts ON ts.teacher_id = t.id
        WHERE s.id = marks.student_id
          AND ts.subject_id = marks.subject_id
          AND (ts.class_id IS NULL OR ts.class_id = s.class_id)
          AND (ts.stream_id IS NULL OR ts.stream_id = s.stream_id)
      )
      OR
      EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.streams st ON st.id = s.stream_id
        JOIN public.teachers t ON st.class_teacher_id = t.id
        WHERE s.id = marks.student_id
          AND (t.user_id = auth.uid() OR t.id = (SELECT u.teacher_id FROM public.users u WHERE u.id = auth.uid()))
      )
    )
  )
);

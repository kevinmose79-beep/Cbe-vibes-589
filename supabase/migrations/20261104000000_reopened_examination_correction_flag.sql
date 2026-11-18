-- ==============================================================================
-- Migration: Reopened Examination Administrative Marks Correction Flag & Hardened Session Editability
-- Timestamp: 2026-11-04 00:00:00 UTC
-- Description:
--   1. Adds column reopened_for_correction BOOLEAN NOT NULL DEFAULT FALSE to public.examinations.
--   2. Updates existing examinations to have reopened_for_correction = FALSE.
--   3. Updates public.is_examination_session_editable(UUID) helper with:
--      - Database-level administrator verification via public.is_admin().
--      - Fail-closed safeguards for missing or dangling academic session records.
--      - Preservation of strict session immutability for Archived, Locked, and Upcoming sessions.
--      - Controlled administrator-only exception on Closed terms for Draft examinations with reopened_for_correction = TRUE.
--   4. Preserves database trigger trg_enforce_marks_session_immutability and marks RLS policies.
-- ==============================================================================

-- 1. Schema addition on public.examinations
ALTER TABLE public.examinations 
  ADD COLUMN IF NOT EXISTS reopened_for_correction BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure existing production records receive FALSE by default
UPDATE public.examinations
SET reopened_for_correction = FALSE
WHERE reopened_for_correction IS NULL;

-- 2. Hardened public.is_examination_session_editable helper function
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

  SELECT id, exam_name, status, academic_year_id, term_id, year, term, reopened_for_correction
  INTO v_exam
  FROM public.examinations
  WHERE id = p_exam_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- 1. Examination status check: Approved and Archived examinations are strictly non-editable
  IF v_exam.status IN ('Approved', 'Archived') THEN
    RETURN FALSE;
  END IF;

  -- 2. Resolve school_term status: prioritize authoritative foreign key term_id, fallback to academic_year_id/year + term_name
  IF v_exam.term_id IS NOT NULL THEN
    SELECT status INTO v_term_status
    FROM public.school_terms
    WHERE id = v_exam.term_id;
  ELSE
    SELECT status INTO v_term_status
    FROM public.school_terms
    WHERE (academic_year_id = v_exam.academic_year_id OR (v_exam.academic_year_id IS NULL AND year = v_exam.year))
      AND term_name = v_exam.term
    LIMIT 1;
  END IF;

  -- Fail-closed safeguard: if term record cannot be resolved, reject modification
  IF v_term_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 3. Resolve academic_year status: prioritize authoritative foreign key academic_year_id, fallback to year
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

  -- Fail-closed safeguard: if academic year record cannot be resolved, reject modification
  IF v_year_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 4. Session Immutability Invariant:
  -- Archived, Locked, or Upcoming sessions are strictly immutable for all callers (including administrators)
  IF v_year_status IN ('Archived', 'Locked', 'Upcoming') OR v_term_status IN ('Archived', 'Locked', 'Upcoming') THEN
    RETURN FALSE;
  END IF;

  -- 5. Closed Session Handling:
  -- If either the term or academic year is Closed, editing is forbidden by default.
  -- The ONLY exception is for an authenticated Administrator on a Draft examination explicitly flagged as reopened_for_correction.
  IF (v_term_status = 'Closed' OR v_year_status = 'Closed') THEN
    IF v_exam.status = 'Draft' AND COALESCE(v_exam.reopened_for_correction, FALSE) = TRUE THEN
      -- Strict database-level admin verification via SECURITY DEFINER helper
      IF public.is_admin() THEN
        RETURN TRUE;
      END IF;
    END IF;
    RETURN FALSE;
  END IF;

  -- 6. Active Session: Standard editing permitted (subject to caller-specific RLS policies on public.marks)
  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_examination_session_editable(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_examination_session_editable(UUID) TO authenticated, service_role;

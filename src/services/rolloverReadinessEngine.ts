import {
  AcademicYear,
  SchoolTerm,
  ClassStream,
  Student,
  GradeName,
  ALL_GRADES,
} from '../types';
import { isValidIsoDate } from '../utils/academicYearReminderUtils';

export type ReadinessStatus = 'ready' | 'needs_attention' | 'not_configured';

/**
 * Rollover cohort grades.
 * PP1 and PP2 are completely excluded from rollover readiness cohort calculations.
 */
export const ROLLOVER_GRADES: GradeName[] = ALL_GRADES.filter(
  (g) => g !== 'PP1' && g !== 'PP2'
);

export const NEXT_GRADE_MAP: Record<GradeName, GradeName | 'Graduated'> = {
  'PP1': 'PP2',
  'PP2': 'Grade 1',
  'Grade 1': 'Grade 2',
  'Grade 2': 'Grade 3',
  'Grade 3': 'Grade 4',
  'Grade 4': 'Grade 5',
  'Grade 5': 'Grade 6',
  'Grade 6': 'Grade 7',
  'Grade 7': 'Grade 8',
  'Grade 8': 'Grade 9',
  'Grade 9': 'Graduated',
};

export interface DateReadinessCheck {
  status: ReadinessStatus;
  activeYear?: AcademicYear;
  activeYearEndDate?: string;
  activeYearEndDateSource?: 'academic_year_end_date' | 'term_3_closing_date' | 'none';
  hasValidActiveYearEndDate?: boolean;
  upcomingYear?: AcademicYear;
  upcomingYearNumber?: number;
  upcomingTerm1?: SchoolTerm;
  hasUpcomingYear: boolean;
  hasUpcomingTerm1: boolean;
  hasValidTerm1Dates: boolean;
  term1OpeningDate?: string;
  term1ClosingDate?: string;
  issues: string[];
}

export interface CohortMappingInfo {
  currentGrade: GradeName;
  targetGrade: GradeName | 'Graduated';
  currentLearnersCount: number;
  targetClassesExist: boolean;
  targetStreamsCount: number;
  availableStreams: string[];
  isSafe: boolean;
  issue?: string;
}

export interface ClassStreamReadinessCheck {
  status: ReadinessStatus;
  cohortMappings: CohortMappingInfo[];
  issues: string[];
}

export interface DuplicateAdmissionRecord {
  admissionNumber: string;
  count: number;
  studentNames: string[];
}

export interface LearnerReadinessCheck {
  status: ReadinessStatus;
  totalActiveLearners: number;
  promotableLearnersCount: number;
  graduatingLearnersCount: number;
  unassignedLearnersCount: number;
  invalidClassLearnersCount: number;
  duplicateAdmissionNumbers: DuplicateAdmissionRecord[];
  issues: string[];
}

export interface RolloverReadinessReport {
  overallStatus: ReadinessStatus;
  summaryHeadline: string;
  summaryExplanation: string;
  datesCheck: DateReadinessCheck;
  classesCheck: ClassStreamReadinessCheck;
  learnersCheck: LearnerReadinessCheck;
  canProceedToRolloverPlanning: boolean;
}

export interface AssessRolloverReadinessParams {
  academicYears: AcademicYear[];
  schoolTerms: SchoolTerm[];
  classes: ClassStream[];
  students: Student[];
}

/**
 * Checks whether a candidate string refers to pre-primary education (PP1 or PP2).
 */
export function isPrePrimary(candidate?: string | null): boolean {
  if (!candidate) return false;
  const str = candidate.trim().toLowerCase();
  return (
    /^(?:pp\s*[12]|pre-?primary\s*[12])(?:\b|[\s\-_(]|$)/i.test(str) ||
    str === 'pp1' ||
    str === 'pp2' ||
    str.startsWith('pre-primary') ||
    str.startsWith('pre primary')
  );
}

/**
 * Checks whether a learner belongs to PP1 or PP2 based on explicit grade or assigned class.
 */
export function isPrePrimaryLearner(s: Student, cls?: ClassStream): boolean {
  if (isPrePrimary(s.grade)) return true;
  if (isPrePrimary(cls?.class_name)) return true;
  return false;
}

/**
 * Safely establishes a canonical grade name without defaulting to an invented grade (like Grade 7).
 * Returns null if the grade cannot be recognized from the candidate string.
 */
export function establishGradeName(raw?: string | null): GradeName | null {
  if (!raw) return null;
  const str = raw.trim();
  if (ALL_GRADES.includes(str as GradeName)) {
    return str as GradeName;
  }

  // Pre-Primary patterns
  if (/^(?:pp|pre[\s\-_]?primary)[\s\-_]*1(?:\b|[\s\-_(]|$)/i.test(str)) return 'PP1';
  if (/^(?:pp|pre[\s\-_]?primary)[\s\-_]*2(?:\b|[\s\-_(]|$)/i.test(str)) return 'PP2';

  // Standard Grades: Grade 1 through Grade 9 strictly (e.g. Grade 1, G1, cls_1)
  const match = str.match(/^(?:cls_|grade\s*|g\s*)?([1-9])(?:\s+[a-z0-9_-]+)?$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 9) {
      return `Grade ${num}` as GradeName;
    }
  }

  return null;
}

/**
 * Safely establishes a learner's grade without defaulting to an invented grade (like Grade 7).
 * Returns null if the learner's grade cannot be established from their record or valid class.
 */
export function establishLearnerGrade(s: Student, cls?: ClassStream): GradeName | null {
  // 1. Authoritative class assignment in school registry
  if (cls?.class_name) {
    const classGrade = establishGradeName(cls.class_name);
    if (classGrade) return classGrade;
  }

  // 2. Explicit student record grade
  if (s?.grade) {
    const studentGrade = establishGradeName(s.grade);
    if (studentGrade) return studentGrade;
  }

  return null;
}

/**
 * Assesses complete readiness for academic-year rollover without making any mutations.
 * Pure, deterministic evaluation of current database state.
 */
export function assessRolloverReadiness({
  academicYears = [],
  schoolTerms = [],
  classes = [],
  students = [],
}: AssessRolloverReadinessParams): RolloverReadinessReport {
  // ==========================================
  // SECTION A: ACADEMIC YEAR & TERM DATES CHECK
  // ==========================================
  const activeYear = academicYears.find((y) => y.status === 'Active');
  const dateIssues: string[] = [];

  let upcomingYear: AcademicYear | undefined;
  let upcomingYearNumber: number | undefined;
  let upcomingTerm1: SchoolTerm | undefined;
  let hasUpcomingYear = false;
  let hasUpcomingTerm1 = false;
  let hasValidTerm1Dates = false;
  let dateCheckStatus: ReadinessStatus = 'ready';

  let activeYearEndDate: string | undefined;
  let activeYearEndDateSource: 'academic_year_end_date' | 'term_3_closing_date' | 'none' = 'none';

  if (!activeYear) {
    dateCheckStatus = 'not_configured';
    dateIssues.push('No Active academic year is configured in the database.');
  } else {
    // 1. Resolve active academic year closing date using established project conventions
    if (isValidIsoDate(activeYear.end_date)) {
      activeYearEndDate = activeYear.end_date?.trim();
      activeYearEndDateSource = 'academic_year_end_date';
    } else {
      const activeTerm3 = schoolTerms.find(
        (t) =>
          t.term_name === 'Term 3' &&
          (t.academic_year_id === activeYear.id || t.year === activeYear.year)
      );
      if (activeTerm3 && isValidIsoDate(activeTerm3.closing_date)) {
        activeYearEndDate = activeTerm3.closing_date?.trim();
        activeYearEndDateSource = 'term_3_closing_date';
      }
    }

    const hasValidActiveYearEndDate = Boolean(activeYearEndDate);

    if (!hasValidActiveYearEndDate) {
      dateCheckStatus = 'needs_attention';
      dateIssues.push(
        `Active Academic Year ${activeYear.year} has no configured closing date (neither academic_year.end_date nor Term 3 closing date is configured).`
      );
    } else if (isValidIsoDate(activeYear.start_date) && activeYearEndDate <= activeYear.start_date.trim()) {
      dateCheckStatus = 'needs_attention';
      dateIssues.push(
        `Active Academic Year ${activeYear.year} closing date (${activeYearEndDate}) must be later than opening date (${activeYear.start_date}).`
      );
    }

    // 2. Resolve destination academic year
    upcomingYearNumber = activeYear.year + 1;
    upcomingYear = academicYears.find(
      (y) => y.year === upcomingYearNumber && (y.status === 'Upcoming' || y.status === 'Active')
    );

    if (!upcomingYear) {
      dateCheckStatus = 'not_configured';
      dateIssues.push(
        `Upcoming Academic Year ${upcomingYearNumber} does not exist in the database. Please register Academic Year ${upcomingYearNumber} in Academic Session Control.`
      );
    } else {
      hasUpcomingYear = true;

      upcomingTerm1 = schoolTerms.find(
        (t) =>
          t.term_name === 'Term 1' &&
          (t.academic_year_id === upcomingYear.id || t.year === upcomingYearNumber)
      );

      if (!upcomingTerm1) {
        dateCheckStatus = 'not_configured';
        dateIssues.push(
          `Term 1 for Academic Year ${upcomingYearNumber} has not been created in the database.`
        );
      } else {
        hasUpcomingTerm1 = true;
        const validOpening = isValidIsoDate(upcomingTerm1.opening_date);
        const validClosing = isValidIsoDate(upcomingTerm1.closing_date);

        if (!validOpening || !validClosing) {
          dateCheckStatus = 'needs_attention';
          if (!validOpening && !validClosing) {
            dateIssues.push(
              `Term 1 of Academic Year ${upcomingYearNumber} has missing or invalid opening and closing dates.`
            );
          } else if (!validOpening) {
            dateIssues.push(
              `Term 1 of Academic Year ${upcomingYearNumber} has a missing or invalid opening date.`
            );
          } else {
            dateIssues.push(
              `Term 1 of Academic Year ${upcomingYearNumber} has a missing or invalid closing date.`
            );
          }
        } else {
          // Verify closing date is strictly after opening date
          if (upcomingTerm1.closing_date! <= upcomingTerm1.opening_date!) {
            dateCheckStatus = 'needs_attention';
            hasValidTerm1Dates = false;
            dateIssues.push(
              `Term 1 closing date (${upcomingTerm1.closing_date}) must be later than opening date (${upcomingTerm1.opening_date}).`
            );
          } else if (activeYearEndDate && upcomingTerm1.opening_date! <= activeYearEndDate) {
            // Verify Term 1 does not open before preceding academic year closes
            dateCheckStatus = 'needs_attention';
            hasValidTerm1Dates = false;
            dateIssues.push(
              `Upcoming Term 1 opening date (${upcomingTerm1.opening_date}) cannot be earlier than or equal to active Academic Year ${activeYear.year} closing date (${activeYearEndDate}).`
            );
          } else {
            hasValidTerm1Dates = true;
          }
        }
      }
    }
  }

  // Safety invariant: Incomplete or invalid date checks can never produce a 'ready' status
  if (dateIssues.length > 0 && dateCheckStatus === 'ready') {
    dateCheckStatus = 'needs_attention';
  }

  const datesCheck: DateReadinessCheck = {
    status: dateCheckStatus,
    activeYear,
    activeYearEndDate,
    activeYearEndDateSource,
    hasValidActiveYearEndDate: Boolean(activeYearEndDate),
    upcomingYear,
    upcomingYearNumber,
    upcomingTerm1,
    hasUpcomingYear,
    hasUpcomingTerm1,
    hasValidTerm1Dates,
    term1OpeningDate: upcomingTerm1?.opening_date,
    term1ClosingDate: upcomingTerm1?.closing_date,
    issues: dateIssues,
  };

  // ==========================================
  // SECTION B & C: LEARNER AUDIT & COHORT GROUPING
  // ==========================================
  const activeLearners = students.filter((s) => s.active);
  const knownClassOrStreamIds = new Set(classes.flatMap((c) => [c.id, c.stream_id]).filter(Boolean));

  let unassignedCount = 0;
  let invalidClassCount = 0;
  let promotableCount = 0;
  let graduatingCount = 0;
  let evaluatedLearnersCount = 0;

  const learnerIssues: string[] = [];

  // Group active students by verified grade (for rollover-eligible grades)
  const gradeStudentsMap = new Map<GradeName, Student[]>();
  ROLLOVER_GRADES.forEach((g) => gradeStudentsMap.set(g, []));

  // Track admission numbers for duplicates
  const admissionMap = new Map<string, { count: number; names: string[] }>();

  for (const s of activeLearners) {
    const cls = classes.find((c) => c.id === s.class_id || (s.stream_id && c.stream_id === s.stream_id));

    // Exclude PP1 and PP2 completely from rollover calculations
    if (isPrePrimaryLearner(s, cls)) {
      continue;
    }

    evaluatedLearnersCount += 1;

    const rawAdm = s.admission_number ? s.admission_number.trim() : '';
    if (rawAdm) {
      const normalizedAdm = rawAdm.toLowerCase();
      const existing = admissionMap.get(normalizedAdm) || { count: 0, names: [] };
      existing.count += 1;
      if (!existing.names.includes(s.full_name)) {
        existing.names.push(s.full_name);
      }
      admissionMap.set(normalizedAdm, existing);
    }

    const hasKnownClass = Boolean(s.class_id && knownClassOrStreamIds.has(s.class_id));
    const establishedGrade = establishLearnerGrade(s, cls);

    // Identify unassigned or invalid learners before cohort grouping
    if (s.class_id && !hasKnownClass) {
      // Assigned to a class ID that does not exist in the active school structure
      invalidClassCount += 1;
    } else if (!s.class_id && !establishedGrade) {
      // Neither class nor establishable grade
      unassignedCount += 1;
    } else if (!s.class_id) {
      // Has a grade text but no assigned class stream in registry
      unassignedCount += 1;
    } else if (!establishedGrade) {
      // Has a known class, but grade could not be determined
      unassignedCount += 1;
    } else {
      // Valid active learner with known class and established grade
      if (establishedGrade === 'Grade 9') {
        graduatingCount += 1;
        gradeStudentsMap.get('Grade 9')?.push(s);
      } else if (ROLLOVER_GRADES.includes(establishedGrade)) {
        promotableCount += 1;
        gradeStudentsMap.get(establishedGrade)?.push(s);
      }
    }
  }

  // Check target classes and streams for verified cohorts (Grade 1 through Grade 9)
  const activeClasses = classes.filter((c) => c.status !== 'Inactive');
  const classIssues: string[] = [];
  const cohortMappings: CohortMappingInfo[] = [];
  let classCheckStatus: ReadinessStatus = 'ready';

  for (const currentGrade of ROLLOVER_GRADES) {
    const learners = gradeStudentsMap.get(currentGrade) || [];
    const count = learners.length;
    const targetGrade = NEXT_GRADE_MAP[currentGrade];

    if (targetGrade === 'Graduated') {
      cohortMappings.push({
        currentGrade,
        targetGrade,
        currentLearnersCount: count,
        targetClassesExist: true,
        targetStreamsCount: 0,
        availableStreams: ['Exit Cohort (Graduating)'],
        isSafe: true,
      });
      continue;
    }

    // Check if target grade classes and streams exist
    const destClasses = activeClasses.filter(
      (c) => establishGradeName(c.class_name) === targetGrade
    );

    const destStreams = Array.from(new Set(destClasses.map((c) => c.stream || 'Main')));
    const hasTargetClasses = destClasses.length > 0;
    const hasStreams = destStreams.length > 0;

    let isSafe = true;
    let issue: string | undefined;

    if (count > 0 && (!hasTargetClasses || !hasStreams)) {
      isSafe = false;
      issue = `${currentGrade} has ${count} active learner${
        count === 1 ? '' : 's'
      }, but destination ${targetGrade} has no active classes or streams configured to receive promoted learners.`;
      classIssues.push(issue);
      classCheckStatus = 'needs_attention';
    }

    cohortMappings.push({
      currentGrade,
      targetGrade,
      currentLearnersCount: count,
      targetClassesExist: hasTargetClasses,
      targetStreamsCount: destClasses.length,
      availableStreams: destStreams,
      isSafe,
      issue,
    });
  }

  const classesCheck: ClassStreamReadinessCheck = {
    status: classCheckStatus,
    cohortMappings,
    issues: classIssues,
  };

  // Duplicate admission numbers aggregation
  const duplicateAdmissionNumbers: DuplicateAdmissionRecord[] = [];
  for (const [adm, info] of admissionMap.entries()) {
    if (info.count > 1) {
      duplicateAdmissionNumbers.push({
        admissionNumber: adm.toUpperCase(),
        count: info.count,
        studentNames: info.names,
      });
    }
  }

  let learnerCheckStatus: ReadinessStatus = 'ready';

  if (unassignedCount > 0) {
    learnerCheckStatus = 'needs_attention';
    learnerIssues.push(
      `${unassignedCount} active learner${
        unassignedCount === 1 ? ' has' : 's have'
      } no assigned class or grade.`
    );
  }

  if (invalidClassCount > 0) {
    learnerCheckStatus = 'needs_attention';
    learnerIssues.push(
      `${invalidClassCount} active learner${
        invalidClassCount === 1 ? ' is' : 's are'
      } assigned to a class ID that does not exist in the active school structure.`
    );
  }

  if (duplicateAdmissionNumbers.length > 0) {
    learnerCheckStatus = 'needs_attention';
    learnerIssues.push(
      `Found ${duplicateAdmissionNumbers.length} duplicate admission number${
        duplicateAdmissionNumbers.length === 1 ? '' : 's'
      } across active learners.`
    );
  }

  const learnersCheck: LearnerReadinessCheck = {
    status: learnerCheckStatus,
    totalActiveLearners: evaluatedLearnersCount,
    promotableLearnersCount: promotableCount,
    graduatingLearnersCount: graduatingCount,
    unassignedLearnersCount: unassignedCount,
    invalidClassLearnersCount: invalidClassCount,
    duplicateAdmissionNumbers,
    issues: learnerIssues,
  };

  // ==========================================
  // SECTION D: READINESS SUMMARY
  // ==========================================
  let overallStatus: ReadinessStatus = 'ready';
  let summaryHeadline = '';
  let summaryExplanation = '';

  if (
    datesCheck.status === 'not_configured' ||
    classesCheck.status === 'not_configured' ||
    learnersCheck.status === 'not_configured'
  ) {
    overallStatus = 'not_configured';
    summaryHeadline = 'Rollover Prerequisites Incomplete';
    summaryExplanation =
      'Upcoming academic year or Term 1 dates are not configured in the database. Configure the upcoming session in Academic Session Control before planning rollover.';
  } else if (
    datesCheck.status === 'needs_attention' ||
    classesCheck.status === 'needs_attention' ||
    learnersCheck.status === 'needs_attention'
  ) {
    overallStatus = 'needs_attention';
    summaryHeadline = 'Attention Required Before Rollover';
    summaryExplanation =
      'One or more checks require administrator attention (such as missing dates, incomplete destination streams, or unassigned learners). Resolve these items prior to rollover.';
  } else {
    overallStatus = 'ready';
    summaryHeadline = 'System Ready for Rollover Review';
    summaryExplanation =
      'All structural prerequisites are verified. Upcoming academic year, Term 1 schedule, destination classes/streams, and learner cohorts are ready.';
  }

  const canProceedToRolloverPlanning = overallStatus === 'ready';

  return {
    overallStatus,
    summaryHeadline,
    summaryExplanation,
    datesCheck,
    classesCheck,
    learnersCheck,
    canProceedToRolloverPlanning,
  };
}

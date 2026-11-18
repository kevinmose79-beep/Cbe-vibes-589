import { describe, it, expect } from 'vitest';
import '../testSetup';
import { AcademicYear, SchoolTerm, ClassStream, Student } from '../types';
import {
  assessRolloverReadiness,
  establishLearnerGrade,
  establishGradeName,
} from '../services/rolloverReadinessEngine';

describe('Rollover Readiness Assessment Engine (Phase C & Step 1 Audit Fix)', () => {
  const activeYear2026: AcademicYear = {
    id: 'ay-2026-uuid',
    year: 2026,
    status: 'Active',
    start_date: '2026-01-06',
    end_date: '2026-10-31',
  };

  const upcomingYear2027: AcademicYear = {
    id: 'ay-2027-uuid',
    year: 2027,
    status: 'Upcoming',
    start_date: '2027-01-05',
    end_date: '2027-10-30',
  };

  const upcomingTerm1_2027: SchoolTerm = {
    id: 't-2027-1',
    academic_year_id: 'ay-2027-uuid',
    year: 2027,
    term_name: 'Term 1',
    term_number: 1,
    status: 'Upcoming',
    opening_date: '2027-01-06',
    closing_date: '2027-04-09',
  };

  const standardClasses: ClassStream[] = [
    { id: 'c-pp1', class_name: 'PP1', stream: 'Blue', status: 'Active' },
    { id: 'c-pp2', class_name: 'PP2', stream: 'Blue', status: 'Active' },
    { id: 'c-g1', class_name: 'Grade 1', stream: 'Blue', status: 'Active' },
    { id: 'c-g2', class_name: 'Grade 2', stream: 'Blue', status: 'Active' },
    { id: 'c-g3', class_name: 'Grade 3', stream: 'Blue', status: 'Active' },
    { id: 'c-g4', class_name: 'Grade 4', stream: 'Blue', status: 'Active' },
    { id: 'c-g5', class_name: 'Grade 5', stream: 'Blue', status: 'Active' },
    { id: 'c-g6', class_name: 'Grade 6', stream: 'Blue', status: 'Active' },
    { id: 'c-g7', class_name: 'Grade 7', stream: 'East', status: 'Active' },
    { id: 'c-g8', class_name: 'Grade 8', stream: 'East', status: 'Active' },
    { id: 'c-g9', class_name: 'Grade 9', stream: 'Alpha', status: 'Active' },
  ];

  const standardStudents: Student[] = [
    { id: 's-1', admission_number: 'ADM001', full_name: 'Alice Wanjiku', grade: 'Grade 6', class_id: 'c-g6', active: true },
    { id: 's-2', admission_number: 'ADM002', full_name: 'Brian Ochieng', grade: 'Grade 7', class_id: 'c-g7', active: true },
    { id: 's-3', admission_number: 'ADM003', full_name: 'Carol Mutua', grade: 'Grade 8', class_id: 'c-g8', active: true },
    { id: 's-4', admission_number: 'ADM004', full_name: 'David Kiprono', grade: 'Grade 9', class_id: 'c-g9', active: true },
  ];

  // 1. Fully configured example
  it('1. Returns overallStatus: "ready" when all prerequisites are fully configured and valid', () => {
    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('ready');
    expect(report.canProceedToRolloverPlanning).toBe(true);
    expect(report.summaryHeadline).toBe('System Ready for Rollover Review');
    expect(report.datesCheck.status).toBe('ready');
    expect(report.datesCheck.hasUpcomingYear).toBe(true);
    expect(report.datesCheck.hasUpcomingTerm1).toBe(true);
    expect(report.datesCheck.hasValidTerm1Dates).toBe(true);
    expect(report.classesCheck.status).toBe('ready');
    expect(report.learnersCheck.status).toBe('ready');
    expect(report.learnersCheck.promotableLearnersCount).toBe(3); // G6, G7, G8
    expect(report.learnersCheck.graduatingLearnersCount).toBe(1); // G9
    expect(report.learnersCheck.totalActiveLearners).toBe(4);
  });

  // 2. Missing upcoming academic year
  it('2. Flags not_configured when upcoming academic year 2027 does not exist', () => {
    const report = assessRolloverReadiness({
      academicYears: [activeYear2026], // Missing 2027
      schoolTerms: [],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('not_configured');
    expect(report.canProceedToRolloverPlanning).toBe(false);
    expect(report.datesCheck.status).toBe('not_configured');
    expect(report.datesCheck.hasUpcomingYear).toBe(false);
    expect(report.datesCheck.issues[0]).toContain('Upcoming Academic Year 2027 does not exist');
  });

  // 3. Missing Term 1 for upcoming academic year
  it('3. Flags not_configured when Term 1 for 2027 has not been created', () => {
    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [], // No Term 1 for 2027
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('not_configured');
    expect(report.datesCheck.status).toBe('not_configured');
    expect(report.datesCheck.hasUpcomingYear).toBe(true);
    expect(report.datesCheck.hasUpcomingTerm1).toBe(false);
    expect(report.datesCheck.issues[0]).toContain('Term 1 for Academic Year 2027 has not been created');
  });

  // 4. Missing or invalid Term 1 dates
  it('4. Flags needs_attention when Term 1 has invalid or missing opening/closing dates', () => {
    const invalidDatesTerm: SchoolTerm = {
      ...upcomingTerm1_2027,
      opening_date: '',
      closing_date: 'invalid-date',
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [invalidDatesTerm],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.hasValidTerm1Dates).toBe(false);
    expect(report.datesCheck.issues[0]).toContain('missing or invalid opening and closing dates');
  });

  it('4b. Flags needs_attention when Term 1 closing date is earlier than opening date', () => {
    const backwardsDatesTerm: SchoolTerm = {
      ...upcomingTerm1_2027,
      opening_date: '2027-04-10',
      closing_date: '2027-01-05',
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [backwardsDatesTerm],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.hasValidTerm1Dates).toBe(false);
    expect(report.datesCheck.issues[0]).toContain('closing date (2027-01-05) must be later than opening date');
  });

  // 4c. Active Academic Year closing date validation & chronological conflict check
  it('4c. Flags needs_attention when active academic year closing date is missing', () => {
    const activeYearWithoutDates: AcademicYear = {
      id: 'ay-2026-no-date',
      year: 2026,
      status: 'Active',
      end_date: '', // No end_date
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYearWithoutDates, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027], // No active Term 3
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.activeYearEndDate).toBeUndefined();
    expect(report.datesCheck.issues.some((i) => i.includes('no configured closing date'))).toBe(true);
  });

  it('4d. Successfully resolves active year end date from Term 3 closing date fallback', () => {
    const activeYearFallback: AcademicYear = {
      id: 'ay-2026-fallback',
      year: 2026,
      status: 'Active',
      // end_date missing
    };

    const activeTerm3: SchoolTerm = {
      id: 't-2026-3',
      academic_year_id: 'ay-2026-fallback',
      year: 2026,
      term_name: 'Term 3',
      opening_date: '2026-08-24',
      closing_date: '2026-10-23',
      status: 'Closed',
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYearFallback, upcomingYear2027],
      schoolTerms: [activeTerm3, upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.datesCheck.status).toBe('ready');
    expect(report.datesCheck.activeYearEndDate).toBe('2026-10-23');
    expect(report.datesCheck.activeYearEndDateSource).toBe('term_3_closing_date');
    expect(report.overallStatus).toBe('ready');
  });

  it('4e. Flags chronological conflict when upcoming Term 1 opens before active year closes', () => {
    const conflictingTerm1: SchoolTerm = {
      ...upcomingTerm1_2027,
      opening_date: '2026-10-15', // Opens BEFORE active year ends on 2026-10-31
      closing_date: '2027-04-09',
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [conflictingTerm1],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.hasValidTerm1Dates).toBe(false);
    expect(report.datesCheck.issues.some((i) => i.includes('cannot be earlier than or equal to active Academic Year'))).toBe(true);
  });

  it('4f. Flags needs_attention when active academic year end_date is invalid format without Term 3 fallback', () => {
    const activeYearInvalidDate: AcademicYear = {
      id: 'ay-2026-invalid-date',
      year: 2026,
      status: 'Active',
      end_date: '2026-99-99', // Invalid date format
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYearInvalidDate, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.hasValidActiveYearEndDate).toBe(false);
    expect(report.datesCheck.issues.some((i) => i.includes('no configured closing date'))).toBe(true);
  });

  it('4g. Flags needs_attention when active academic year closing date is on or before start date', () => {
    const activeYearBackwards: AcademicYear = {
      id: 'ay-2026-backwards',
      year: 2026,
      status: 'Active',
      start_date: '2026-10-31',
      end_date: '2026-01-06', // Closes before start date
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYearBackwards, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.issues.some((i) => i.includes('must be later than opening date'))).toBe(true);
  });

  it('4h. Flags needs_attention when Term 1 closing date equals opening date', () => {
    const sameDayTerm1: SchoolTerm = {
      ...upcomingTerm1_2027,
      opening_date: '2027-01-06',
      closing_date: '2027-01-06', // Same date
    };

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [sameDayTerm1],
      classes: standardClasses,
      students: standardStudents,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.datesCheck.status).toBe('needs_attention');
    expect(report.datesCheck.hasValidTerm1Dates).toBe(false);
    expect(report.datesCheck.issues.some((i) => i.includes('must be later than opening date'))).toBe(true);
  });

  // 5. Missing destination classes or streams
  it('5. Flags needs_attention when an active cohort has no destination class/stream configured', () => {
    // Classes missing Grade 7 (so Grade 6 learners have nowhere to be promoted to)
    const classesMissingGrade7 = standardClasses.filter((c) => c.class_name !== 'Grade 7');

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: classesMissingGrade7,
      students: standardStudents, // Has 1 learner in Grade 6
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.classesCheck.status).toBe('needs_attention');

    const g6Mapping = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 6');
    expect(g6Mapping?.isSafe).toBe(false);
    expect(g6Mapping?.issue).toContain('Grade 6 has 1 active learner, but destination Grade 7 has no active classes or streams');
  });

  // 6. Learner readiness: unassigned learners, invalid class IDs, and duplicate admission numbers
  it('6. Flags needs_attention when active learners have missing class mappings or invalid classes', () => {
    const studentsWithExceptions: Student[] = [
      ...standardStudents,
      { id: 's-unassigned', admission_number: 'ADM999', full_name: 'Unassigned Learner', grade: '', class_id: '', active: true },
      { id: 's-invalid-class', admission_number: 'ADM888', full_name: 'Orphaned Learner', grade: 'Grade 5', class_id: 'non-existent-class-id', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: studentsWithExceptions,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.learnersCheck.status).toBe('needs_attention');
    expect(report.learnersCheck.unassignedLearnersCount).toBe(1);
    expect(report.learnersCheck.invalidClassLearnersCount).toBe(1);
    expect(report.learnersCheck.issues.some((i) => i.includes('no assigned class or grade'))).toBe(true);
    expect(report.learnersCheck.issues.some((i) => i.includes('assigned to a class ID that does not exist'))).toBe(true);
  });

  it('6a. REGRESSION: Unassigned learner with missing grade/class is NOT placed in Grade 7 or promotable count', () => {
    const studentsWithUnassigned: Student[] = [
      ...standardStudents,
      { id: 's-unassigned-1', admission_number: 'ADM991', full_name: 'Unassigned Empty', grade: '', class_id: '', active: true },
      { id: 's-unassigned-2', admission_number: 'ADM992', full_name: 'Unassigned Undefined', grade: undefined as any, class_id: undefined as any, active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: studentsWithUnassigned,
    });

    // 1. Grade 7 cohort mapping MUST contain ONLY Brian Ochieng (1 learner), NOT the unassigned learners
    const g7Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 7');
    expect(g7Cohort?.currentLearnersCount).toBe(1);

    // 2. Unassigned learner count must be exactly 2
    expect(report.learnersCheck.unassignedLearnersCount).toBe(2);

    // 3. Promotable count must NOT include unassigned learners (must remain 3: G6, G7, G8)
    expect(report.learnersCheck.promotableLearnersCount).toBe(3);

    // 4. Graduating count must remain 1 (G9)
    expect(report.learnersCheck.graduatingLearnersCount).toBe(1);

    // 5. Total active learners must equal exactly 6 (3 promotable + 1 graduating + 2 unassigned)
    expect(report.learnersCheck.totalActiveLearners).toBe(6);
  });

  it('6b. REGRESSION: Learner with invalid/orphaned class assignment is NOT placed in any cohort row or promotable count', () => {
    const studentsWithOrphan: Student[] = [
      ...standardStudents,
      { id: 's-orphan-1', admission_number: 'ADM881', full_name: 'Orphan Five', grade: 'Grade 5', class_id: 'deleted-class-uuid', active: true },
      { id: 's-orphan-2', admission_number: 'ADM882', full_name: 'Orphan Undefined Grade', grade: undefined as any, class_id: 'missing-class-uuid', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: studentsWithOrphan,
    });

    // Grade 5 cohort mapping must NOT include the orphaned learner (0 learners)
    const g5Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 5');
    expect(g5Cohort?.currentLearnersCount).toBe(0);

    // Grade 7 cohort mapping must NOT include the orphaned learner with undefined grade (remains 1)
    const g7Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 7');
    expect(g7Cohort?.currentLearnersCount).toBe(1);

    // Flagged as invalid class assignments
    expect(report.learnersCheck.invalidClassLearnersCount).toBe(2);

    // Promotable count must remain 3 (G6, G7, G8)
    expect(report.learnersCheck.promotableLearnersCount).toBe(3);

    // Total active learners equals 6 (3 promotable + 1 graduating + 2 invalid class)
    expect(report.learnersCheck.totalActiveLearners).toBe(6);
  });

  it('6c. Detects and reports duplicate admission numbers among active learners', () => {
    const studentsWithDuplicates: Student[] = [
      ...standardStudents,
      { id: 's-dup-1', admission_number: 'ADM001', full_name: 'Alice Clone', grade: 'Grade 6', class_id: 'c-g6', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: studentsWithDuplicates,
    });

    expect(report.overallStatus).toBe('needs_attention');
    expect(report.learnersCheck.duplicateAdmissionNumbers.length).toBe(1);
    expect(report.learnersCheck.duplicateAdmissionNumbers[0].admissionNumber).toBe('ADM001');
    expect(report.learnersCheck.duplicateAdmissionNumbers[0].count).toBe(2);
    expect(report.learnersCheck.duplicateAdmissionNumbers[0].studentNames).toEqual(['Alice Wanjiku', 'Alice Clone']);
  });

  // 7. Safety Invariant: Grade 9 Exit Cohort handling
  it('7. Treats Grade 9 as Exit Cohort (Graduated) without requiring higher school class', () => {
    const onlyGrade9Students: Student[] = [
      { id: 's-g9', admission_number: 'ADM900', full_name: 'Graduating Student', grade: 'Grade 9', class_id: 'c-g9', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: onlyGrade9Students,
    });

    const g9Mapping = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 9');
    expect(g9Mapping?.targetGrade).toBe('Graduated');
    expect(g9Mapping?.isSafe).toBe(true);
    expect(report.learnersCheck.graduatingLearnersCount).toBe(1);
    expect(report.learnersCheck.promotableLearnersCount).toBe(0);
  });

  // 8. Unit verification of establishLearnerGrade helper
  it('8. establishLearnerGrade correctly establishes valid grades and returns null for invalid/empty inputs', () => {
    expect(establishLearnerGrade({ grade: 'Grade 8' } as Student)).toBe('Grade 8');
    expect(establishLearnerGrade({ grade: 'G4' } as Student)).toBe('Grade 4');
    expect(establishLearnerGrade({ grade: 'PP1' } as Student)).toBe('PP1');
    expect(establishLearnerGrade({ grade: 'Pre-Primary 2' } as Student)).toBe('PP2');
    expect(establishLearnerGrade({} as Student, { class_name: 'Grade 3' } as ClassStream)).toBe('Grade 3');

    // Negative / unassigned cases MUST return null, NEVER Grade 7
    expect(establishLearnerGrade({ grade: '' } as Student)).toBeNull();
    expect(establishLearnerGrade({} as Student)).toBeNull();
    expect(establishLearnerGrade({ grade: 'Unknown' } as Student)).toBeNull();
    expect(establishLearnerGrade({ grade: 'Grade 10' } as Student)).toBeNull();
    expect(establishLearnerGrade({ grade: undefined, class_id: undefined } as unknown as Student)).toBeNull();
  });

  it('8b. establishGradeName establishes canonical grade names and returns null for invalid/undefined inputs without defaulting to Grade 7', () => {
    expect(establishGradeName('Grade 7')).toBe('Grade 7');
    expect(establishGradeName('G8')).toBe('Grade 8');
    expect(establishGradeName('Grade 9')).toBe('Grade 9');
    expect(establishGradeName('PP1')).toBe('PP1');
    expect(establishGradeName('Pre-Primary 2')).toBe('PP2');
    expect(establishGradeName(undefined)).toBeNull();
    expect(establishGradeName(null)).toBeNull();
    expect(establishGradeName('')).toBeNull();
    expect(establishGradeName('   ')).toBeNull();
    expect(establishGradeName('Unknown Class')).toBeNull();
    expect(establishGradeName('Special Needs')).toBeNull();
  });

  it('8c. Destination stream check never matches unconfigured classes with undefined/empty class_name to Grade 7', () => {
    // Classes where Grade 7 class exists but has undefined or invalid class_name
    const corruptedClasses: ClassStream[] = [
      { id: 'c-g6', class_name: 'Grade 6', stream: 'Main', status: 'Active' },
      { id: 'c-broken', class_name: '' as any, stream: 'Alpha', status: 'Active' }, // Empty class_name
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: corruptedClasses,
      students: [
        { id: 's-g6', admission_number: 'ADM001', full_name: 'Grade 6 Student', grade: 'Grade 6', class_id: 'c-g6', active: true },
      ],
    });

    const g6Mapping = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 6');
    expect(g6Mapping?.isSafe).toBe(false);
    expect(g6Mapping?.targetClassesExist).toBe(false);
    expect(report.classesCheck.status).toBe('needs_attention');
  });

  // 9. MANDATORY RULE: Complete PP1 and PP2 exclusion
  it('9. Completely excludes PP1 and PP2 from rollover readiness, cohort calculations, and checks', () => {
    const studentsWithPrePrimary: Student[] = [
      ...standardStudents, // 3 promotable (G6, G7, G8), 1 graduating (G9)
      { id: 's-pp1-1', admission_number: 'ADM-PP1-A', full_name: 'PP1 Learner One', grade: 'PP1', class_id: 'c-pp1', active: true },
      { id: 's-pp1-2', admission_number: 'ADM-PP1-B', full_name: 'PP1 Learner Two', grade: 'Pre-Primary 1', class_id: 'c-pp1', active: true },
      { id: 's-pp2-1', admission_number: 'ADM-PP2-A', full_name: 'PP2 Learner One', grade: 'PP2', class_id: 'c-pp2', active: true },
      // PP1 learner with missing class should NOT be marked unassigned for rollover
      { id: 's-pp1-noclass', admission_number: 'ADM-PP1-C', full_name: 'PP1 No Class', grade: 'PP1', class_id: '', active: true },
      // PP2 learner with non-existent class should NOT be marked invalid class for rollover
      { id: 's-pp2-badclass', admission_number: 'ADM-PP2-D', full_name: 'PP2 Bad Class', grade: 'PP2', class_id: 'non-existent-class', active: true },
      // Learner where grade is empty but class is PP1
      { id: 's-pp1-byclass', admission_number: 'ADM-PP1-E', full_name: 'PP1 By Class', grade: '', class_id: 'c-pp1', active: true },
      // PP1 learners sharing an admission number should NOT flag duplicate admission warnings for rollover
      { id: 's-pp1-dup', admission_number: 'ADM-PP1-A', full_name: 'PP1 Duplicate Adm', grade: 'PP1', class_id: 'c-pp1', active: true },
    ];

    // Classes where Grade 1 has NO streams (would break if PP2 was evaluated for promotion to Grade 1)
    const classesWithoutGrade1 = standardClasses.filter((c) => c.class_name !== 'Grade 1');

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: classesWithoutGrade1,
      students: studentsWithPrePrimary,
    });

    // PP1 and PP2 must NOT appear in cohortMappings
    const mappingGrades = report.classesCheck.cohortMappings.map((m) => m.currentGrade);
    expect(mappingGrades).not.toContain('PP1');
    expect(mappingGrades).not.toContain('PP2');
    expect(mappingGrades).toEqual([
      'Grade 1',
      'Grade 2',
      'Grade 3',
      'Grade 4',
      'Grade 5',
      'Grade 6',
      'Grade 7',
      'Grade 8',
      'Grade 9',
    ]);

    // Promotable learners must remain 3 (Alice G6, Brian G7, Carol G8), NOT including PP1 or PP2
    expect(report.learnersCheck.promotableLearnersCount).toBe(3);

    // Graduating count must remain 1 (David G9)
    expect(report.learnersCheck.graduatingLearnersCount).toBe(1);

    // PP1 learners with missing or invalid classes must NOT be classified as unassigned or invalid class
    expect(report.learnersCheck.unassignedLearnersCount).toBe(0);
    expect(report.learnersCheck.invalidClassLearnersCount).toBe(0);

    // Total active learners evaluated for rollover must be exactly 4 (standard non-PP learners)
    expect(report.learnersCheck.totalActiveLearners).toBe(4);

    // Duplicate admission number inside PP1 must NOT trigger a duplicate warning for rollover
    expect(report.learnersCheck.duplicateAdmissionNumbers.length).toBe(0);

    // Missing Grade 1 destination stream must NOT cause an issue because PP2 is excluded from rollover cohorts
    // (and Grade 1 currentLearnersCount is 0, so missing Grade 2 would only matter if Grade 1 had active learners)
    expect(report.classesCheck.issues.length).toBe(0);
    expect(report.classesCheck.status).toBe('ready');
    expect(report.learnersCheck.status).toBe('ready');
    expect(report.overallStatus).toBe('ready');
  });

  it('9b. REGRESSION: Pure Junior School cohort (Grades 7-9) correctly evaluates while PP1/PP2 remain excluded', () => {
    const juniorSchoolStudents: Student[] = [
      // Junior school active learners
      { id: 's-js-1', admission_number: 'ADM-JS1', full_name: 'G7 Learner One', grade: 'Grade 7', class_id: 'c-g7', active: true },
      { id: 's-js-2', admission_number: 'ADM-JS2', full_name: 'G7 Learner Two', grade: 'Grade 7', class_id: 'c-g7', active: true },
      { id: 's-js-3', admission_number: 'ADM-JS3', full_name: 'G8 Learner One', grade: 'Grade 8', class_id: 'c-g8', active: true },
      { id: 's-js-4', admission_number: 'ADM-JS4', full_name: 'G9 Learner One', grade: 'Grade 9', class_id: 'c-g9', active: true },
      // Pre-primary active learners to be excluded
      { id: 's-pp1-x', admission_number: 'ADM-PP1-X', full_name: 'PP1 Kid', grade: 'PP1', class_id: 'c-pp1', active: true },
      { id: 's-pp2-x', admission_number: 'ADM-PP2-X', full_name: 'PP2 Kid', grade: 'PP2', class_id: 'c-pp2', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: juniorSchoolStudents,
    });

    // PP1 and PP2 are completely absent from rollover evaluation
    expect(report.learnersCheck.totalActiveLearners).toBe(4); // 2 in G7 + 1 in G8 + 1 in G9
    expect(report.learnersCheck.promotableLearnersCount).toBe(3); // 2 in G7 + 1 in G8
    expect(report.learnersCheck.graduatingLearnersCount).toBe(1); // 1 in G9
    expect(report.learnersCheck.unassignedLearnersCount).toBe(0);
    expect(report.learnersCheck.invalidClassLearnersCount).toBe(0);

    // Grade 7 cohort has 2 learners advancing to Grade 8
    const g7Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 7');
    expect(g7Cohort?.currentLearnersCount).toBe(2);
    expect(g7Cohort?.targetGrade).toBe('Grade 8');
    expect(g7Cohort?.isSafe).toBe(true);

    // Grade 8 cohort has 1 learner advancing to Grade 9
    const g8Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 8');
    expect(g8Cohort?.currentLearnersCount).toBe(1);
    expect(g8Cohort?.targetGrade).toBe('Grade 9');
    expect(g8Cohort?.isSafe).toBe(true);

    // Grade 9 cohort is Graduated exit cohort
    const g9Cohort = report.classesCheck.cohortMappings.find((m) => m.currentGrade === 'Grade 9');
    expect(g9Cohort?.currentLearnersCount).toBe(1);
    expect(g9Cohort?.targetGrade).toBe('Graduated');
    expect(g9Cohort?.isSafe).toBe(true);

    expect(report.overallStatus).toBe('ready');
  });

  // 10. Mutually exclusive learner accounting (no double counting)
  it('10. Accounts for all active learners mutually exclusively without double-counting', () => {
    const mixedStudents: Student[] = [
      // 2 promotable
      { id: 's-m1', admission_number: 'ADM-M1', full_name: 'M One', grade: 'Grade 6', class_id: 'c-g6', active: true },
      { id: 's-m2', admission_number: 'ADM-M2', full_name: 'M Two', grade: 'Grade 7', class_id: 'c-g7', active: true },
      // 1 graduating
      { id: 's-m3', admission_number: 'ADM-M3', full_name: 'M Three', grade: 'Grade 9', class_id: 'c-g9', active: true },
      // 1 unassigned (no class, no grade)
      { id: 's-m4', admission_number: 'ADM-M4', full_name: 'M Four', grade: '', class_id: '', active: true },
      // 1 unassigned (has grade text but no class in registry)
      { id: 's-m5', admission_number: 'ADM-M5', full_name: 'M Five', grade: 'Grade 8', class_id: '', active: true },
      // 1 invalid class (assigned to non-existent class id)
      { id: 's-m6', admission_number: 'ADM-M6', full_name: 'M Six', grade: 'Grade 8', class_id: 'deleted-class', active: true },
      // 1 inactive student (must be completely ignored)
      { id: 's-m7', admission_number: 'ADM-M7', full_name: 'M Inactive', grade: 'Grade 7', class_id: 'c-g7', active: false },
      // 1 PP1 student (must be completely ignored)
      { id: 's-m8', admission_number: 'ADM-M8', full_name: 'M PP1', grade: 'PP1', class_id: 'c-pp1', active: true },
    ];

    const report = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: mixedStudents,
    });

    const { promotableLearnersCount, graduatingLearnersCount, unassignedLearnersCount, invalidClassLearnersCount, totalActiveLearners } = report.learnersCheck;

    expect(promotableLearnersCount).toBe(2);
    expect(graduatingLearnersCount).toBe(1);
    expect(unassignedLearnersCount).toBe(2);
    expect(invalidClassLearnersCount).toBe(1);
    expect(totalActiveLearners).toBe(6);

    // Invariant: sum of categories strictly equals totalActiveLearners
    expect(promotableLearnersCount + graduatingLearnersCount + unassignedLearnersCount + invalidClassLearnersCount).toBe(totalActiveLearners);
  });

  // 11. Incomplete dates cannot produce overall ready status
  it('11. Incomplete or invalid dates strictly prevent overall ready status', () => {
    // Case A: Missing upcoming year
    const reportNoUpcoming = assessRolloverReadiness({
      academicYears: [activeYear2026],
      schoolTerms: [],
      classes: standardClasses,
      students: standardStudents,
    });
    expect(reportNoUpcoming.overallStatus).toBe('not_configured');
    expect(reportNoUpcoming.canProceedToRolloverPlanning).toBe(false);

    // Case B: Missing Term 1
    const reportNoTerm1 = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [],
      classes: standardClasses,
      students: standardStudents,
    });
    expect(reportNoTerm1.overallStatus).toBe('not_configured');
    expect(reportNoTerm1.canProceedToRolloverPlanning).toBe(false);

    // Case C: Missing active year end date
    const reportNoActiveEndDate = assessRolloverReadiness({
      academicYears: [{ ...activeYear2026, end_date: '' }, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
    });
    expect(reportNoActiveEndDate.overallStatus).toBe('needs_attention');
    expect(reportNoActiveEndDate.canProceedToRolloverPlanning).toBe(false);

    // Case D: Chronological conflict
    const reportConflict = assessRolloverReadiness({
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [{ ...upcomingTerm1_2027, opening_date: '2026-10-01' }],
      classes: standardClasses,
      students: standardStudents,
    });
    expect(reportConflict.overallStatus).toBe('needs_attention');
    expect(reportConflict.canProceedToRolloverPlanning).toBe(false);
  });
});

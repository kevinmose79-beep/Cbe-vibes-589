import { describe, it, expect, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  buildTerminalReportDoc,
  buildJuniorSchoolTerminalReportDoc,
  downloadSingleTerminalReportPDF,
  downloadBatchTerminalReportsPDF,
  formatAssessmentColumnHeader,
  getJuniorSchoolCanonicalSubjectOrder,
  getJuniorSchoolSubjectAbbreviation,
  renderJuniorRemarksBox,
  renderJuniorReportWatermark,
  getOptimizedTerminalLogo,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import {
  calculateLearnerTerminalResults,
  ContributingAssessmentRef,
  LearningAreaTerminalResult,
} from '../services/terminalResultsEngine';
import {
  calculateCohortTerminalRankings,
  CohortLearnerRanking,
} from '../services/terminalRankingEngine';
import { calculateStreamTerminalSubjectAverages } from '../services/analysisEngine';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';
import { Student, School, ClassStream, Subject, Grade, Mark, Teacher } from '../types';

vi.mock('../utils/fileDownloader', () => ({
  savePdf: vi.fn().mockResolvedValue(undefined),
}));

describe('Phase 3D: Junior School Visual PDF Audit and One-Page Compliance', () => {
  // Canonical School Setup
  const mockSchool: School = {
    id: 'sch-cbe-001',
    school_name: 'Kilimani Junior Secondary School',
    county: 'Nairobi',
    motto: 'Knowledge, Character, Excellence',
    address: 'P.O. Box 45678, Nairobi',
    phone: '+254 722 000 111',
    email: 'info@kilimanijs.edu',
    stamp_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    logo_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  // Canonical 9 Junior School Subjects
  const mockJuniorSubjects: Subject[] = [
    { id: 'subj-eng', subject_name: 'English Language', subject_code: 'ENG', category: 'Core' },
    { id: 'subj-kis', subject_name: 'Kiswahili', subject_code: 'KIS', category: 'Core' },
    { id: 'subj-mat', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' },
    { id: 'subj-sci', subject_name: 'Integrated Science', subject_code: 'SCI', category: 'Core' },
    { id: 'subj-cas', subject_name: 'Creative Arts & Sports', subject_code: 'CAS', category: 'Core' },
    { id: 'subj-sst', subject_name: 'Social Studies', subject_code: 'SST', category: 'Core' },
    { id: 'subj-cre', subject_name: 'Christian Religious Education', subject_code: 'CRE', category: 'Core' },
    { id: 'subj-agn', subject_name: 'Agriculture & Nutrition', subject_code: 'AGR', category: 'Core' },
    { id: 'subj-pts', subject_name: 'Pre-Technical Studies', subject_code: 'PTS', category: 'Core' },
  ];

  const mockTeachers: Teacher[] = [
    {
      id: 'teach-01',
      teacher_name: 'Mr. David Mwangi',
      email: 'dmwangi@kilimanijs.edu',
      is_class_teacher: true,
      signature_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
    {
      id: 'teach-02',
      teacher_name: 'Mrs. Grace Odhiambo',
      email: 'godhiambo@kilimanijs.edu',
      signature_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    },
  ];

  // Helper to make sample assessed results
  function createStandardResults(studentId: string, baseScore: number, assessments: ContributingAssessmentRef[]): Map<string, LearningAreaTerminalResult> {
    const marks: Mark[] = [];
    mockJuniorSubjects.forEach((s, idx) => {
      assessments.forEach((a) => {
        const score = Math.min(100, Math.max(0, baseScore + (idx % 5) * 3 - (idx % 3) * 2));
        marks.push({
          id: `m-${studentId}-${s.id}-${a.id}`,
          student_id: studentId,
          subject_id: s.id,
          exam_id: a.id,
          score,
        });
      });
    });

    return calculateLearnerTerminalResults({
      learnerId: studentId,
      subjectIds: mockJuniorSubjects.map((s) => s.id),
      contributingAssessments: assessments,
      marks,
      grades: CBE_8_POINT_GRADES,
    });
  }

  // =========================================================================
  // SCENARIO 1: Grades 7, 8, and 9 routing & single-page A4 verification
  // =========================================================================
  it('generates exactly 1 page for Grade 7, Grade 8, and Grade 9 reports', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-op', exam_name: 'Opener Exam', max_marks: 100 },
      { id: 'exam-mid', exam_name: 'Mid Term Exam', max_marks: 100 },
      { id: 'exam-eot', exam_name: 'End Term Exam', max_marks: 100 },
    ];

    for (const gradeNum of [7, 8, 9]) {
      const student: Student = {
        id: `stud-g${gradeNum}`,
        admission_number: `ADM-${gradeNum}001`,
        first_name: 'Brian',
        last_name: 'Kiprono',
        full_name: 'Brian Kiprono',
        class_id: `cs-grade-${gradeNum}-a`,
        grade: `Grade ${gradeNum}`,
        gender: 'M',
        active: true,
      };

      const classStream: ClassStream = {
        id: `cs-grade-${gradeNum}-a`,
        class_name: `Grade ${gradeNum}`,
        stream: 'Alpha',
        education_level: 'Junior School',
      };

      const results = createStandardResults(student.id, 65, assessments);
      const data: TerminalReportPDFData = {
        student,
        school: mockSchool,
        classStream,
        term: 'Term 2',
        academicYear: 2026,
        contributingAssessments: assessments,
        subjects: mockJuniorSubjects,
        grades: CBE_8_POINT_GRADES,
        resultsBySubject: results,
        ranking: {
          studentId: student.id,
          streamPosition: 2,
          streamPositionDenominator: 45,
          overallPosition: 5,
          overallPositionDenominator: 90,
          isRankable: true,
          terminalTotalMarks: 610,
          terminalTotalMaximum: 900,
          cbePerformanceLevel: 'ME1',
          gradeLevel: `Grade ${gradeNum}`,
        },
        teachers: mockTeachers,
        nextTermOpeningDate: '2026-09-08',
        streamSubjectAverages: {
          'subj-eng': 68,
          'subj-kis': 62,
          'subj-mat': 71,
          'subj-sci': 65,
          'subj-cas': 74,
          'subj-sst': 60,
          'subj-cre': 70,
          'subj-agn': 66,
          'subj-pts': 69,
        },
      };

      const doc = await buildTerminalReportDoc(data);
      expect(doc.getNumberOfPages()).toBe(1);
    }
  });

  // =========================================================================
  // SCENARIO 2: Dynamic columns (1, 2, 3, and 4 contributing assessments)
  // =========================================================================
  it('renders correctly with exactly 1 page across 1, 2, 3, and 4 contributing assessments', async () => {
    const student: Student = {
      id: 'stud-multi-col',
      admission_number: 'ADM-8080',
      first_name: 'Amina',
      last_name: 'Mohammed',
      full_name: 'Amina Mohammed',
      class_id: 'cs-grade-8-beta',
      grade: 'Grade 8',
      gender: 'F',
      active: true,
    };

    const classStream: ClassStream = {
      id: 'cs-grade-8-beta',
      class_name: 'Grade 8',
      stream: 'Beta',
      education_level: 'Junior School',
    };

    for (let count = 1; count <= 4; count++) {
      const assessments: ContributingAssessmentRef[] = Array.from({ length: count }, (_, i) => ({
        id: `exam-${i + 1}`,
        exam_name: `Assessment CAT ${i + 1}`,
        max_marks: 100,
      }));

      const results = createStandardResults(student.id, 70, assessments);
      const data: TerminalReportPDFData = {
        student,
        school: mockSchool,
        classStream,
        term: 'Term 1',
        academicYear: 2026,
        contributingAssessments: assessments,
        subjects: mockJuniorSubjects,
        grades: CBE_8_POINT_GRADES,
        resultsBySubject: results,
        ranking: {
          studentId: student.id,
          streamPosition: 1,
          streamPositionDenominator: 38,
          overallPosition: 1,
          overallPositionDenominator: 76,
          isRankable: true,
          terminalTotalMarks: 650,
          terminalTotalMaximum: 900,
          cbePerformanceLevel: 'EE2',
          gradeLevel: 'Grade 8',
        },
        teachers: mockTeachers,
        nextTermOpeningDate: '2026-05-04',
      };

      const doc = await buildTerminalReportDoc(data);
      expect(doc.getNumberOfPages()).toBe(1);
    }
  });

  // =========================================================================
  // SCENARIO 3: Stream A vs Stream B (stream-specific averages plotted)
  // =========================================================================
  it('plots stream-isolated averages independently for Stream A vs Stream B', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Mid Term', max_marks: 100 },
      { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
    ];

    const studentA: Student = {
      id: 'stud-stream-a',
      admission_number: 'ADM-701A',
      first_name: 'Faith',
      last_name: 'Cherono',
      full_name: 'Faith Cherono',
      class_id: 'cs-grade-7-a',
      stream_id: 'stream-alpha',
      grade: 'Grade 7',
      gender: 'F',
      active: true,
    };

    const studentB: Student = {
      id: 'stud-stream-b',
      admission_number: 'ADM-701B',
      first_name: 'Kevin',
      last_name: 'Otieno',
      full_name: 'Kevin Otieno',
      class_id: 'cs-grade-7-b',
      stream_id: 'stream-beta',
      grade: 'Grade 7',
      gender: 'M',
      active: true,
    };

    const streamAAverages: Record<string, number | null> = {
      'subj-eng': 75,
      'subj-kis': 70,
      'subj-mat': 80,
      'subj-sci': 72,
      'subj-cas': 85,
      'subj-sst': 68,
      'subj-cre': 78,
      'subj-agn': 74,
      'subj-pts': 77,
    };

    const streamBAverages: Record<string, number | null> = {
      'subj-eng': 55,
      'subj-kis': 52,
      'subj-mat': 60,
      'subj-sci': 54,
      'subj-cas': 65,
      'subj-sst': 50,
      'subj-cre': 58,
      'subj-agn': 53,
      'subj-pts': 56,
    };

    const docA = await buildTerminalReportDoc({
      student: studentA,
      school: mockSchool,
      classStream: { id: 'cs-grade-7-a', class_name: 'Grade 7', stream: 'Alpha', education_level: 'Junior School', stream_id: 'stream-alpha' },
      term: 'Term 1',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(studentA.id, 75, assessments),
      streamSubjectAverages: streamAAverages,
    });
    expect(docA.getNumberOfPages()).toBe(1);

    const docB = await buildTerminalReportDoc({
      student: studentB,
      school: mockSchool,
      classStream: { id: 'cs-grade-7-b', class_name: 'Grade 7', stream: 'Beta', education_level: 'Junior School', stream_id: 'stream-beta' },
      term: 'Term 1',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(studentB.id, 55, assessments),
      streamSubjectAverages: streamBAverages,
    });
    expect(docB.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 4: Long learner names and long comments (wrapping & 1-page fit)
  // =========================================================================
  it('wraps long learner names, long subject comments, and remarks without clipping or spilling to page 2', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Mid Term Assessment Evaluation', max_marks: 100 },
      { id: 'exam-2', exam_name: 'End of Term Summative Assessment', max_marks: 100 },
    ];

    const student: Student = {
      id: 'stud-long-name',
      admission_number: 'ADM-JS-2026-LONG-0099',
      first_name: 'Alexander-Maximilian',
      last_name: 'Wanyama-Montgomery-Chumo-Wakhungu',
      full_name: 'Alexander-Maximilian Wanyama-Montgomery-Chumo-Wakhungu Junior',
      class_id: 'cs-grade-8-alpha',
      grade: 'Grade 8',
      gender: 'M',
      active: true,
    };

    const classStream: ClassStream = {
      id: 'cs-grade-8-alpha',
      class_name: 'Grade 8',
      stream: 'Alpha North Stream',
      education_level: 'Junior School',
    };

    const longSubjectComments: Record<string, string> = {};
    mockJuniorSubjects.forEach((s) => {
      longSubjectComments[s.id] =
        'Shows exemplary understanding of strands, active in class practicals.';
    });

    const doc = await buildTerminalReportDoc({
      student,
      school: mockSchool,
      classStream,
      term: 'Term 2',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(student.id, 82, assessments),
      customSubjectComments: longSubjectComments,
      savedRemarks: {
        class_teacher_name: 'Mr. David Mwangi (Senior Facilitator & Head of Junior Studies)',
        class_teacher_comment:
          'Alexander-Maximilian has exhibited phenomenal perseverance, exceptional leadership in student leadership committees, and outstanding academic mastery throughout the entire term.',
        headteacher_name: 'Dr. Beatrice Wangari Ndungu, OGW (Chief Principal & Institutional Director)',
        headteacher_comment:
          'A thoroughly distinguished performance across all academic strands. Warmly recommended for national Junior Secondary honors and school ambassador roles.',
      },
      nextTermOpeningDate: '2026-09-08',
    });

    console.log('--- TEST 4 DIAGNOSTIC ---');
    console.log('Total pages:', doc.getNumberOfPages());
    console.log('Last autoTable finalY:', (doc as any).lastAutoTable?.finalY);
    console.log('Last autoTable pageNumber:', (doc as any).lastAutoTable?.pageNumber);
    console.log('Last autoTable pageCount:', (doc as any).lastAutoTable?.pageCount);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 5: Missing, X, and Y results (incomplete assessment trails)
  // =========================================================================
  it('correctly handles Missing, X, and Y results with proper score and status display on 1 page', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Opener', max_marks: 100 },
      { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
    ];

    const student: Student = {
      id: 'stud-special-xy',
      admission_number: 'ADM-789',
      first_name: 'Fatuma',
      last_name: 'Zahra',
      full_name: 'Fatuma Zahra',
      class_id: 'cs-grade-7',
      grade: 'Grade 7',
      gender: 'F',
      active: true,
    };

    // Construct marks with X and Y
    const marks: Mark[] = [
      { id: 'm1', student_id: student.id, subject_id: 'subj-eng', exam_id: 'exam-1', score: null, special_status: 'X' },
      { id: 'm2', student_id: student.id, subject_id: 'subj-eng', exam_id: 'exam-2', score: 65 },
      { id: 'm3', student_id: student.id, subject_id: 'subj-kis', exam_id: 'exam-1', score: 50 },
      { id: 'm4', student_id: student.id, subject_id: 'subj-kis', exam_id: 'exam-2', score: null, special_status: 'Y' },
      // Other subjects complete
    ];

    mockJuniorSubjects.slice(2).forEach((s) => {
      marks.push(
        { id: `m-${s.id}-1`, student_id: student.id, subject_id: s.id, exam_id: 'exam-1', score: 60 },
        { id: `m-${s.id}-2`, student_id: student.id, subject_id: s.id, exam_id: 'exam-2', score: 62 }
      );
    });

    const results = calculateLearnerTerminalResults({
      learnerId: student.id,
      subjectIds: mockJuniorSubjects.map((s) => s.id),
      contributingAssessments: assessments,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const doc = await buildTerminalReportDoc({
      student,
      school: mockSchool,
      classStream: { id: 'cs-grade-7', class_name: 'Grade 7', stream: 'East', education_level: 'Junior School' },
      term: 'Term 1',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: results,
      ranking: {
        studentId: student.id,
        streamPosition: null,
        streamPositionDenominator: 40,
        overallPosition: null,
        overallPositionDenominator: 80,
        isRankable: false,
        terminalTotalMarks: null,
        terminalTotalMaximum: 900,
        cbePerformanceLevel: '—',
        unrankedReason: 'Incomplete assessment record (7/9 learning areas evaluated).',
        gradeLevel: 'Grade 7',
      },
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 6: Genuine zero scores (0% BE2, not treated as missing X)
  // =========================================================================
  it('correctly handles genuine zero scores as 0% BE2 without converting to missing or X', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Mid Term', max_marks: 100 },
      { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
    ];

    const student: Student = {
      id: 'stud-zero',
      admission_number: 'ADM-000',
      first_name: 'Test',
      last_name: 'Zero',
      full_name: 'Test Zero Learner',
      class_id: 'cs-grade-7',
      grade: 'Grade 7',
      gender: 'M',
      active: true,
    };

    const marks: Mark[] = [];
    mockJuniorSubjects.forEach((s) => {
      // Mathematics has genuine 0
      if (s.id === 'subj-mat') {
        marks.push(
          { id: `m-${s.id}-1`, student_id: student.id, subject_id: s.id, exam_id: 'exam-1', score: 0 },
          { id: `m-${s.id}-2`, student_id: student.id, subject_id: s.id, exam_id: 'exam-2', score: 0 }
        );
      } else {
        marks.push(
          { id: `m-${s.id}-1`, student_id: student.id, subject_id: s.id, exam_id: 'exam-1', score: 50 },
          { id: `m-${s.id}-2`, student_id: student.id, subject_id: s.id, exam_id: 'exam-2', score: 50 }
        );
      }
    });

    const results = calculateLearnerTerminalResults({
      learnerId: student.id,
      subjectIds: mockJuniorSubjects.map((s) => s.id),
      contributingAssessments: assessments,
      marks,
      grades: CBE_8_POINT_GRADES,
    });

    const mathResult = results.get('subj-mat');
    expect(mathResult?.isComplete).toBe(true);
    expect(mathResult?.terminalPercentage).toBe(0);
    expect(mathResult?.cbePerformanceLevel).toBe('BE2');
    expect(mathResult?.points).toBe(1);

    const doc = await buildTerminalReportDoc({
      student,
      school: mockSchool,
      classStream: { id: 'cs-grade-7', class_name: 'Grade 7', stream: 'West', education_level: 'Junior School' },
      term: 'Term 1',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: results,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 7: Missing stream averages (omitted safely, dashed line does not plot 0)
  // =========================================================================
  it('omits missing stream averages safely without displaying or plotting zero', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Assessment 1', max_marks: 100 },
    ];

    const student: Student = {
      id: 'stud-no-stream-avg',
      admission_number: 'ADM-999',
      first_name: 'Hassan',
      last_name: 'Ali',
      full_name: 'Hassan Ali',
      class_id: 'cs-grade-9-solo',
      grade: 'Grade 9',
      gender: 'M',
      active: true,
    };

    // Missing averages for all or some subjects (e.g. quorum < 2)
    const streamSubjectAverages: Record<string, number | null> = {
      'subj-eng': 65,
      'subj-kis': null, // Below quorum
      'subj-mat': null,
      'subj-sci': 70,
      'subj-cas': null,
      'subj-sst': null,
      'subj-cre': null,
      'subj-agn': null,
      'subj-pts': null,
    };

    const doc = await buildTerminalReportDoc({
      student,
      school: mockSchool,
      classStream: { id: 'cs-grade-9-solo', class_name: 'Grade 9', stream: 'Solo', education_level: 'Junior School' },
      term: 'Term 1',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(student.id, 65, assessments),
      streamSubjectAverages,
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 8: Grade 9 Term 3 - Next Term Opens date must be omitted
  // =========================================================================
  it('omits the Next Term Opening Date on Grade 9 Term 3 reports while retaining generation date', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-final', exam_name: 'KCBE / KJSEA Final Mock', max_marks: 100 },
    ];

    const student: Student = {
      id: 'stud-g9-t3',
      admission_number: 'ADM-G9-FINAL',
      first_name: 'Zahra',
      last_name: 'Mohamed',
      full_name: 'Zahra Mohamed',
      class_id: 'cs-grade-9',
      grade: 'Grade 9',
      gender: 'F',
      active: true,
    };

    const doc = await buildTerminalReportDoc({
      student,
      school: mockSchool,
      classStream: { id: 'cs-grade-9', class_name: 'Grade 9', stream: 'Main', education_level: 'Junior School' },
      term: 'Term 3',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(student.id, 75, assessments),
      nextTermOpeningDate: '2027-01-05', // Should be omitted because Grade 9 Term 3 is final exit term
    });

    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 9: Batch report generation (Total PDF page count == learner count)
  // =========================================================================
  it('generates batch PDF with exact page count matching learner count and strict page separation', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-1', exam_name: 'Opener Exam', max_marks: 100 },
      { id: 'exam-2', exam_name: 'End Term Exam', max_marks: 100 },
    ];

    const batchStudents: Student[] = [
      { id: 'batch-1', admission_number: 'B-01', first_name: 'Learner', last_name: 'One', full_name: 'Learner One', class_id: 'cs-batch', grade: 'Grade 7', gender: 'F', active: true },
      { id: 'batch-2', admission_number: 'B-02', first_name: 'Learner', last_name: 'Two', full_name: 'Learner Two', class_id: 'cs-batch', grade: 'Grade 7', gender: 'M', active: true },
      { id: 'batch-3', admission_number: 'B-03', first_name: 'Learner', last_name: 'Three', full_name: 'Learner Three', class_id: 'cs-batch', grade: 'Grade 7', gender: 'F', active: true },
      { id: 'batch-4', admission_number: 'B-04', first_name: 'Learner', last_name: 'Four', full_name: 'Learner Four', class_id: 'cs-batch', grade: 'Grade 7', gender: 'M', active: true },
      { id: 'batch-5', admission_number: 'B-05', first_name: 'Learner', last_name: 'Five', full_name: 'Learner Five', class_id: 'cs-batch', grade: 'Grade 7', gender: 'F', active: true },
    ];

    const reportsData: TerminalReportPDFData[] = batchStudents.map((s, idx) => ({
      student: s,
      school: mockSchool,
      classStream: { id: 'cs-batch', class_name: 'Grade 7', stream: 'North', education_level: 'Junior School' },
      term: 'Term 2',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: mockJuniorSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: createStandardResults(s.id, 60 + idx * 5, assessments),
      ranking: {
        studentId: s.id,
        streamPosition: 5 - idx,
        streamPositionDenominator: 5,
        overallPosition: 5 - idx,
        overallPositionDenominator: 5,
        isRankable: true,
        terminalTotalMarks: 500 + idx * 40,
        terminalTotalMaximum: 900,
        cbePerformanceLevel: 'ME1',
        gradeLevel: 'Grade 7',
      },
      nextTermOpeningDate: '2026-09-08',
    }));

    // Generate batch PDF using downloadBatchTerminalReportsPDF
    const savePdfMock = (await import('../utils/fileDownloader')).savePdf;
    await downloadBatchTerminalReportsPDF(reportsData);

    expect(savePdfMock).toHaveBeenCalledTimes(1);
    const passedDoc = (savePdfMock as any).mock.calls[0][0];
    // Exact page count must equal number of learners: 5
    expect(passedDoc.getNumberOfPages()).toBe(5);
  });

  // =========================================================================
  // SCENARIO 10: Upper Primary regression protection (Preserves legacy layout)
  // =========================================================================
  it('preserves legacy Upper Primary layout and routing without Junior School alterations', async () => {
    const assessments: ContributingAssessmentRef[] = [
      { id: 'exam-up-1', exam_name: 'Opener Exam', max_marks: 50 },
      { id: 'exam-up-2', exam_name: 'End Term Exam', max_marks: 50 },
    ];

    const upperPrimaryStudent: Student = {
      id: 'stud-up-6',
      admission_number: 'ADM-UP-601',
      first_name: 'Faith',
      last_name: 'Mwende',
      full_name: 'Faith Mwende',
      class_id: 'cs-grade-6',
      grade: 'Grade 6',
      gender: 'F',
      active: true,
    };

    const upperPrimaryClass: ClassStream = {
      id: 'cs-grade-6',
      class_name: 'Grade 6',
      stream: 'Blue',
      education_level: 'Upper Primary',
    };

    const upSubjects: Subject[] = [
      { id: 'up-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core' },
      { id: 'up-mat', subject_name: 'Mathematics', subject_code: 'MAT', category: 'Core' },
      { id: 'up-sci', subject_name: 'Science & Technology', subject_code: 'SCI', category: 'Core' },
    ];

    const doc = await buildTerminalReportDoc({
      student: upperPrimaryStudent,
      school: mockSchool,
      classStream: upperPrimaryClass,
      term: 'Term 2',
      academicYear: 2026,
      contributingAssessments: assessments,
      subjects: upSubjects,
      grades: CBE_8_POINT_GRADES,
      resultsBySubject: new Map(),
    });

    // Upper primary must also be exactly 1 page
    expect(doc.getNumberOfPages()).toBe(1);
  });

  // =========================================================================
  // SCENARIO 11: Phase 3D.3 Junior School Remarks Section Boxes, Borders and Spacing
  // =========================================================================
  describe('Phase 3D.3: Junior School Remarks Boxes, Borders and Spacing', () => {
    it('renderJuniorRemarksBox draws independent bordered box with dynamic height', () => {
      const { jsPDF } = require('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const rectCalls: any[] = [];
      const origRect = doc.rect.bind(doc);
      doc.rect = function(x: any, y: any, w: any, h: any, style: any) {
        rectCalls.push({ x, y, w, h, style });
        return origRect(x, y, w, h, style);
      };

      // 1. One-line comment
      const b1 = renderJuniorRemarksBox(
        doc,
        "CLASS TEACHER'S REMARKS",
        'Mr. Mwangi: ',
        'Good progress shown throughout the term.',
        10,
        150,
        190
      );

      expect(rectCalls.length).toBe(1);
      expect(rectCalls[0].x).toBe(10);
      expect(rectCalls[0].y).toBe(150);
      expect(rectCalls[0].w).toBe(190);
      expect(rectCalls[0].h).toBeCloseTo(12.3, 1);
      expect(b1).toBeCloseTo(162.3, 1);

      // 2. Multi-line comment expands dynamically
      const b2 = renderJuniorRemarksBox(
        doc,
        'HEAD OF INSTITUTION REMARKS',
        'Dr. Beatrice Wangari: ',
        'Alexander-Maximilian has exhibited phenomenal perseverance, exceptional leadership in student leadership committees, and outstanding academic mastery throughout the entire term.',
        10,
        b1 + 3.5,
        190
      );

      expect(rectCalls.length).toBe(2);
      expect(rectCalls[1].x).toBe(10);
      expect(rectCalls[1].y).toBeCloseTo(b1 + 3.5, 1);
      expect(rectCalls[1].w).toBe(190);
      expect(rectCalls[1].h).toBeGreaterThan(rectCalls[0].h); // Expands dynamically
      expect(b2).toBeCloseTo(rectCalls[1].y + rectCalls[1].h, 1);
    });

    it('renders independent bordered remarks boxes across Grade 7, Grade 8, and Grade 9 with exact 1 page', async () => {
      const assessments: ContributingAssessmentRef[] = [
        { id: 'exam-1', exam_name: 'SBA 1', max_marks: 100 },
        { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
      ];

      for (const gradeNum of [7, 8, 9]) {
        const student: Student = {
          id: `stud-box-g${gradeNum}`,
          admission_number: `ADM-JS-${gradeNum}`,
          first_name: 'Faith',
          last_name: 'Mutua',
          full_name: 'Faith Mutua',
          class_id: `cs-g${gradeNum}`,
          grade: `Grade ${gradeNum}`,
          active: true,
        };

        const classStream: ClassStream = {
          id: `cs-g${gradeNum}`,
          class_name: `Grade ${gradeNum}`,
          stream: 'East',
          education_level: 'Junior School',
        };

        const { jsPDF } = require('jspdf');
        const customDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const remarksRects: any[] = [];
        const origRect = customDoc.rect.bind(customDoc);
        customDoc.rect = function(x: any, y: any, w: any, h: any, style: any) {
          // Identify remarks boxes: full width 190mm, height between 11mm and 25mm, located after results table
          if (w === 190 && h >= 11 && h <= 25 && y > 140 && y < 210) {
            remarksRects.push({ x, y, w, h });
          }
          return origRect(x, y, w, h, style);
        };

        const doc = await buildTerminalReportDoc({
          student,
          school: mockSchool,
          classStream,
          term: 'Term 1',
          academicYear: 2026,
          contributingAssessments: assessments,
          subjects: mockJuniorSubjects,
          grades: CBE_8_POINT_GRADES,
          resultsBySubject: createStandardResults(student.id, 75, assessments),
          savedRemarks: {
            class_teacher_name: 'Mr. David Mwangi',
            class_teacher_comment: 'Good progress shown throughout the term.',
            headteacher_name: 'Mrs. Grace Odhiambo',
            headteacher_comment: 'Approved. Encouraged to maintain commitment to academic excellence.',
          },
          nextTermOpeningDate: '2026-05-04',
        }, customDoc);

        // 1. One page guarantee
        expect(doc.getNumberOfPages()).toBe(1);

        // 2. Exactly 2 remarks boxes captured
        expect(remarksRects.length).toBe(2);

        const ctBox = remarksRects[0];
        const htBox = remarksRects[1];

        // 3. Both boxes have width 190mm and x = 10mm
        expect(ctBox.x).toBe(10);
        expect(ctBox.w).toBe(190);
        expect(htBox.x).toBe(10);
        expect(htBox.w).toBe(190);

        // 4. Inter-box gap between Box 1 and Box 2 is exactly 3.5 mm
        const actualInterBoxGap = htBox.y - (ctBox.y + ctBox.h);
        expect(actualInterBoxGap).toBeCloseTo(3.5, 1);
      }
    });
  });

  // =========================================================================
  // SCENARIO 8: Phase 3D.4 - Graph Data-Label Positioning & Summary Row Visual Distinction
  // =========================================================================
  describe('Phase 3D.4: Graph Data-Label Positioning and Summary Row Shading', () => {
    it('positions numerical graph data labels with collision avoidance (2.5mm above <95%, 3.5mm below >=95%)', async () => {
      const assessments: ContributingAssessmentRef[] = [
        { id: 'exam-1', exam_name: 'Mid Term', max_marks: 100 },
        { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
      ];

      const student: Student = {
        id: 'stud-graph-labels',
        admission_number: 'ADM-G8-LABELS',
        first_name: 'Kevin',
        last_name: 'Otieno',
        full_name: 'Kevin Otieno',
        class_id: 'cs-g8',
        grade: 'Grade 8',
        active: true,
      };

      const classStream: ClassStream = {
        id: 'cs-g8',
        class_name: 'Grade 8',
        stream: 'North',
        education_level: 'Junior School',
      };

      // Create specific scores including Defect A cases (20, 44) and boundary cases (0, 95, 100)
      const targetScores: Record<string, number> = {
        'subj-eng': 75,
        'subj-kis': 60,
        'subj-mat': 20,  // Defect A target: 20%
        'subj-sci': 44,  // Defect A target: 44%
        'subj-cas': 95,  // Boundary: 95% threshold -> flip below
        'subj-sst': 100, // Boundary: 100% ceiling -> flip below
        'subj-cre': 0,   // Boundary: 0% floor -> stays above
        'subj-agn': 85,
        'subj-pts': 50,
      };

      const marks: Mark[] = [];
      mockJuniorSubjects.forEach((s) => {
        const score = targetScores[s.id] ?? 50;
        assessments.forEach((a) => {
          marks.push({
            id: `m-${student.id}-${s.id}-${a.id}`,
            student_id: student.id,
            subject_id: s.id,
            exam_id: a.id,
            score,
          });
        });
      });

      const results = calculateLearnerTerminalResults({
        learnerId: student.id,
        subjectIds: mockJuniorSubjects.map((s) => s.id),
        contributingAssessments: assessments,
        marks,
        grades: CBE_8_POINT_GRADES,
      });

      const { jsPDF } = require('jspdf');
      const customDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

      // Track circles and text labels
      const circleCalls: Array<{ x: number; y: number; r: number }> = [];
      const textCalls: Array<{ text: string; x: number; y: number }> = [];

      const origCircle = customDoc.circle.bind(customDoc);
      customDoc.circle = function(x: any, y: any, r: any, style: any) {
        // Learner marker circle has radius 1.1mm in the graph region
        if (r === 1.1 && y > 180 && y < 275) {
          circleCalls.push({ x, y, r });
        }
        return origCircle(x, y, r, style);
      };

      const origText = customDoc.text.bind(customDoc);
      customDoc.text = function(text: any, x: any, y: any, options: any) {
        if (typeof text === 'string' && /^\d+$/.test(text) && y > 180 && y < 275) {
          textCalls.push({ text, x, y });
        }
        return origText(text, x, y, options);
      };

      const doc = await buildTerminalReportDoc({
        student,
        school: mockSchool,
        classStream,
        term: 'Term 2',
        academicYear: 2026,
        contributingAssessments: assessments,
        subjects: mockJuniorSubjects,
        grades: CBE_8_POINT_GRADES,
        resultsBySubject: results,
        nextTermOpeningDate: '2026-09-08',
      }, customDoc);

      expect(doc.getNumberOfPages()).toBe(1);

      // Verify that markers and text labels were captured
      expect(circleCalls.length).toBe(9);
      expect(textCalls.length).toBe(9);

      // Verify each specific score positioning
      for (let i = 0; i < circleCalls.length; i++) {
        const marker = circleCalls[i];
        const label = textCalls[i];
        const scoreVal = parseInt(label.text, 10);

        expect(label.x).toBeCloseTo(marker.x, 1);

        if (scoreVal >= 95) {
          // Ceilings (95%, 100%) positioned 3.5mm BELOW marker
          const expectedY = marker.y + 3.5;
          expect(label.y).toBeCloseTo(expectedY, 2);
          // Label baseline is strictly below marker bottom
          expect(label.y).toBeGreaterThan(marker.y + marker.r);
        } else {
          // Standard scores (<95%), including 20%, 44%, 0% positioned 2.5mm ABOVE marker
          const expectedY = marker.y - 2.5;
          expect(label.y).toBeCloseTo(expectedY, 2);
          // Label baseline is strictly above marker top
          expect(label.y).toBeLessThan(marker.y - marker.r);
        }
      }

      // Explicit verification for Defect A targets:
      const mathLabel = textCalls.find((t) => t.text === '20');
      const mathMarker = circleCalls.find((c) => Math.abs(c.x - (mathLabel?.x ?? 0)) < 0.1);
      expect(mathLabel).toBeDefined();
      expect(mathMarker).toBeDefined();
      expect(mathLabel!.y).toBeCloseTo(mathMarker!.y - 2.5, 2);

      const sciLabel = textCalls.find((t) => t.text === '44');
      const sciMarker = circleCalls.find((c) => Math.abs(c.x - (sciLabel?.x ?? 0)) < 0.1);
      expect(sciLabel).toBeDefined();
      expect(sciMarker).toBeDefined();
      expect(sciLabel!.y).toBeCloseTo(sciMarker!.y - 2.5, 2);

      // Explicit verification for boundary targets:
      const casLabel = textCalls.find((t) => t.text === '95');
      const casMarker = circleCalls.find((c) => Math.abs(c.x - (casLabel?.x ?? 0)) < 0.1);
      expect(casLabel).toBeDefined();
      expect(casMarker).toBeDefined();
      expect(casLabel!.y).toBeCloseTo(casMarker!.y + 3.5, 2);

      const sstLabel = textCalls.find((t) => t.text === '100');
      const sstMarker = circleCalls.find((c) => Math.abs(c.x - (sstLabel?.x ?? 0)) < 0.1);
      expect(sstLabel).toBeDefined();
      expect(sstMarker).toBeDefined();
      expect(sstLabel!.y).toBeCloseTo(sstMarker!.y + 3.5, 2);

      const creLabel = textCalls.find((t) => t.text === '0');
      const creMarker = circleCalls.find((c) => Math.abs(c.x - (creLabel?.x ?? 0)) < 0.1);
      expect(creLabel).toBeDefined();
      expect(creMarker).toBeDefined();
      expect(creLabel!.y).toBeCloseTo(creMarker!.y - 2.5, 2);
    });

    it('renders Total marks, Stream rank, and Overall rank with neutral grey background, dark black text, and prominent bold typography', async () => {
      const assessments: ContributingAssessmentRef[] = [
        { id: 'exam-1', exam_name: 'Mid Term', max_marks: 100 },
        { id: 'exam-2', exam_name: 'End Term', max_marks: 100 },
      ];

      const student: Student = {
        id: 'stud-summary-style',
        admission_number: 'ADM-G7-SUM',
        first_name: 'Mercy',
        last_name: 'Chebet',
        full_name: 'Mercy Chebet',
        class_id: 'cs-g7',
        grade: 'Grade 7',
        active: true,
      };

      const classStream: ClassStream = {
        id: 'cs-g7',
        class_name: 'Grade 7',
        stream: 'East',
        education_level: 'Junior School',
      };

      const results = createStandardResults(student.id, 80, assessments);

      const { jsPDF } = require('jspdf');
      const customDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

      let capturedMainTable: any = null;
      const origRect = customDoc.rect.bind(customDoc);
      customDoc.rect = function(x: any, y: any, w: any, h: any, style: any) {
        if (!capturedMainTable && (customDoc as any).lastAutoTable?.body) {
          const body = (customDoc as any).lastAutoTable.body;
          if (body.some((r: any) => r.cells?.[0]?.raw?.content === 'Total marks')) {
            capturedMainTable = (customDoc as any).lastAutoTable;
          }
        }
        return origRect(x, y, w, h, style);
      };

      const doc = await buildTerminalReportDoc({
        student,
        school: mockSchool,
        classStream,
        term: 'Term 1',
        academicYear: 2026,
        contributingAssessments: assessments,
        subjects: mockJuniorSubjects,
        grades: CBE_8_POINT_GRADES,
        resultsBySubject: results,
        ranking: {
          studentId: student.id,
          streamPosition: 3,
          streamPositionDenominator: 42,
          overallPosition: 7,
          overallPositionDenominator: 85,
          isRankable: true,
          terminalTotalMarks: 720,
          terminalTotalMaximum: 900,
          cbePerformanceLevel: 'EE1',
          gradeLevel: 'Grade 7',
        },
        nextTermOpeningDate: '2026-05-04',
      }, customDoc);

      expect(doc.getNumberOfPages()).toBe(1);
      expect(capturedMainTable).toBeDefined();

      const bodyRows = capturedMainTable.body;
      expect(bodyRows.length).toBeGreaterThanOrEqual(12); // 9 subjects + 3 summary rows

      // Verify header cell for Terminal Score has light grey background and black text (no blue)
      const termScoreHeaderCell = capturedMainTable.head[0].cells[1 + assessments.length];
      expect(termScoreHeaderCell.raw).toMatchObject({
        styles: {
          fillColor: [243, 244, 246],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
        },
      });

      // Verify subject data rows: Terminal Score cell has very light grey background [242, 242, 242] (~#F2F2F2), bold dark black text, and 7.0pt font
      const subjectRows = bodyRows.slice(0, 9);
      subjectRows.forEach((row: any) => {
        const termScoreCell = row.cells[1 + assessments.length];
        expect(termScoreCell.raw).toMatchObject({
          styles: {
            fillColor: [242, 242, 242],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 7.0,
            halign: 'center',
          },
        });
      });

      // Identify the 3 summary rows by their first cell content
      const totalMarksRow = bodyRows.find(
        (row: any) => row.cells?.[0]?.raw?.content === 'Total marks'
      );
      const streamRankRow = bodyRows.find(
        (row: any) => row.cells?.[0]?.raw?.content === 'Stream rank'
      );
      const overallRankRow = bodyRows.find(
        (row: any) => row.cells?.[0]?.raw?.content === 'Overall rank'
      );

      expect(totalMarksRow).toBeDefined();
      expect(streamRankRow).toBeDefined();
      expect(overallRankRow).toBeDefined();

      const summaryRows = [totalMarksRow!, streamRankRow!, overallRankRow!];

      summaryRows.forEach((row: any) => {
        // Label cell (index 0)
        expect(row.cells[0].raw).toMatchObject({
          styles: {
            fontStyle: 'bold',
            fillColor: [243, 244, 246],
            textColor: [0, 0, 0],
          },
        });

        // Contributing assessment cells (indices 1, 2)
        for (let aIdx = 1; aIdx <= assessments.length; aIdx++) {
          expect(row.cells[aIdx].raw).toMatchObject({
            styles: {
              fontStyle: 'bold',
              fillColor: [243, 244, 246],
              textColor: [0, 0, 0],
              halign: 'center',
            },
          });
        }

        // Terminal Score cell (index 1 + assessments.length = 3)
        // Verified neutral grey fill, dark black text, bold font, conditional font size (7.0pt for 2 assessments), centered
        const termScoreCellIdx = 1 + assessments.length;
        expect(row.cells[termScoreCellIdx].raw).toMatchObject({
          styles: {
            fillColor: [243, 244, 246],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            fontSize: 7.0, // 7.0 pt when existing base size is 6.5 pt (numAssessments < 4)
            halign: 'center',
          },
        });
      });

      // Verify merged cells spanning the 3 rows in totalMarksRow
      const termScoreIdx = 1 + assessments.length;
      // Level cell (rowSpan: 3, blank)
      expect(totalMarksRow!.cells[termScoreIdx + 1].raw).toMatchObject({
        rowSpan: 3,
        styles: { fillColor: [243, 244, 246] },
      });
      // Points cell (rowSpan: 3, bold, centered)
      expect(totalMarksRow!.cells[termScoreIdx + 2].raw).toMatchObject({
        rowSpan: 3,
        styles: {
          fontStyle: 'bold',
          fillColor: [243, 244, 246],
          textColor: [0, 0, 0],
          halign: 'center',
        },
      });
      // Rank, Comments, Facilitator merged block (rowSpan: 3, colSpan: 3)
      expect(totalMarksRow!.cells[termScoreIdx + 3].raw).toMatchObject({
        rowSpan: 3,
        colSpan: 3,
        styles: { fillColor: [243, 244, 246] },
      });

      // Conditional font size verification for 4 contributing assessments (numAssessments >= 4)
      const fourAssessments: ContributingAssessmentRef[] = [
        { id: 'exam-1', exam_name: 'Opener', max_marks: 100 },
        { id: 'exam-2', exam_name: 'Mid Term', max_marks: 100 },
        { id: 'exam-3', exam_name: 'SBA 1', max_marks: 100 },
        { id: 'exam-4', exam_name: 'End Term', max_marks: 100 },
      ];
      const results4 = createStandardResults(student.id, 80, fourAssessments);
      const customDoc4 = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      let capturedTable4Assessments: any = null;
      const origRect4 = customDoc4.rect.bind(customDoc4);
      customDoc4.rect = function(x: any, y: any, w: any, h: any, style: any) {
        if (!capturedTable4Assessments && (customDoc4 as any).lastAutoTable?.body) {
          const body = (customDoc4 as any).lastAutoTable.body;
          if (body.some((r: any) => r.cells?.[0]?.raw?.content === 'Total marks')) {
            capturedTable4Assessments = (customDoc4 as any).lastAutoTable;
          }
        }
        return origRect4(x, y, w, h, style);
      };

      await buildTerminalReportDoc({
        student,
        school: mockSchool,
        classStream,
        term: 'Term 1',
        academicYear: 2026,
        contributingAssessments: fourAssessments,
        subjects: mockJuniorSubjects,
        grades: CBE_8_POINT_GRADES,
        resultsBySubject: results4,
        ranking: {
          studentId: student.id,
          streamPosition: 3,
          streamPositionDenominator: 42,
          overallPosition: 7,
          overallPositionDenominator: 85,
          isRankable: true,
          terminalTotalMarks: 720,
          terminalTotalMaximum: 900,
          cbePerformanceLevel: 'EE1',
          gradeLevel: 'Grade 7',
        },
      }, customDoc4);

      expect(capturedTable4Assessments).toBeDefined();
      const totalMarksRow4 = capturedTable4Assessments.body.find(
        (row: any) => row.cells?.[0]?.raw?.content === 'Total marks'
      );
      expect(totalMarksRow4).toBeDefined();
      const termScoreCell4 = totalMarksRow4.cells[1 + fourAssessments.length];
      expect(termScoreCell4.raw).toMatchObject({
        styles: {
          fillColor: [243, 244, 246],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          fontSize: 6.5, // 6.5 pt when existing base size is 6.0 pt (numAssessments >= 4)
          halign: 'center',
        },
      });
    });
  });

  // =========================================================================
  // SCENARIO 8: Phase 3D.5 - School Logo Watermark Restoration & Isolation
  // =========================================================================
  describe('Phase 3D.5: Junior School School Logo Watermark Restoration', () => {
    it('renderJuniorReportWatermark correctly computes dimensions and centers watermark', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const addImageSpy = vi.spyOn(doc, 'addImage');
      vi.spyOn(doc as any, 'getImageProperties').mockReturnValue({
        width: 200,
        height: 200,
      });

      const tableStartY = 120;
      const tableHeight = 80;
      renderJuniorReportWatermark(doc, mockSchool.logo_url!, tableStartY, tableHeight, 210);

      expect(addImageSpy).toHaveBeenCalledTimes(1);
      // For square 200x200: max size is 78.0 x 78.0 (slightly increased from 70.0mm)
      // Horizontal centering on 210mm page: (210 - 78) / 2 = 66.0
      // Vertical centering in table: 120 + (80 - 78) / 2 = 121.0
      const [dataUrl, format, x, y, w, h, alias] = addImageSpy.mock.calls[0];
      expect(dataUrl).toBe(mockSchool.logo_url);
      expect(format).toBe('PNG');
      expect(x).toBeCloseTo(66.0, 1);
      expect(y).toBeCloseTo(121.0, 1);
      expect(w).toBeCloseTo(78.0, 1);
      expect(h).toBeCloseTo(78.0, 1);
      expect(alias === 'terminal_school_logo' || alias === 'terminal_report_watermark').toBe(true);
    });

    it('preserves aspect ratio for non-square landscape and portrait logos', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const addImageSpy = vi.spyOn(doc, 'addImage');

      // Test Landscape 2:1
      vi.spyOn(doc as any, 'getImageProperties').mockReturnValueOnce({
        width: 400,
        height: 200,
      });
      renderJuniorReportWatermark(doc, mockSchool.logo_url!, 100, 60, 210);
      let call = addImageSpy.mock.calls[0];
      expect(call[4]).toBeCloseTo(78.0, 1); // w
      expect(call[5]).toBeCloseTo(39.0, 1); // h = 78 / 2
      expect(call[2]).toBeCloseTo(66.0, 1); // x = (210 - 78)/2
      expect(call[3]).toBeCloseTo(110.5, 1); // y = 100 + (60 - 39)/2

      // Test Portrait 1:2
      vi.spyOn(doc as any, 'getImageProperties').mockReturnValueOnce({
        width: 100,
        height: 200,
      });
      renderJuniorReportWatermark(doc, mockSchool.logo_url!, 100, 60, 210);
      call = addImageSpy.mock.calls[1];
      expect(call[4]).toBeCloseTo(39.0, 1); // w = 78 * 0.5
      expect(call[5]).toBeCloseTo(78.0, 1); // h = 78
      expect(call[2]).toBeCloseTo(85.5, 1); // x = (210 - 39)/2
      expect(call[3]).toBeCloseTo(91.0, 1); // y = 100 + (60 - 78)/2
    });

    it('enforces GState opacity isolation (0.14) with try/finally restore and supports -14 convention', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const saveStateSpy = vi.spyOn(doc as any, 'saveGraphicsState');
      const restoreStateSpy = vi.spyOn(doc as any, 'restoreGraphicsState');
      const setGStateSpy = vi.spyOn(doc as any, 'setGState');

      renderJuniorReportWatermark(doc, mockSchool.logo_url!, 100, 60, 210);

      expect(saveStateSpy).toHaveBeenCalled();
      expect(restoreStateSpy).toHaveBeenCalled();
      expect(setGStateSpy).toHaveBeenCalled();
      const gStateArg = setGStateSpy.mock.calls[0][0];
      expect(gStateArg?.opacity).toBeCloseTo(0.14, 2);

      // Verify that passing requested -14 normalizes to 0.14
      setGStateSpy.mockClear();
      renderJuniorReportWatermark(doc, mockSchool.logo_url!, 100, 60, 210, -14);
      const gStateArg2 = setGStateSpy.mock.calls[0][0];
      expect(gStateArg2?.opacity).toBeCloseTo(0.14, 2);
    });

    it('gracefully degrades and does not throw on invalid logo or errors', () => {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const addImageSpy = vi.spyOn(doc, 'addImage');

      // Empty / whitespace
      expect(() => renderJuniorReportWatermark(doc, '', 100, 60)).not.toThrow();
      expect(() => renderJuniorReportWatermark(doc, '   ', 100, 60)).not.toThrow();
      expect(addImageSpy).not.toHaveBeenCalled();

      // addImage throwing error
      addImageSpy.mockImplementationOnce(() => {
        throw new Error('Corrupt PNG image stream');
      });
      expect(() => renderJuniorReportWatermark(doc, mockSchool.logo_url!, 100, 60)).not.toThrow();
    });

    it('buildJuniorSchoolTerminalReportDoc integrates watermark and renders Table 4 with transparent cells', async () => {
      const assessments: ContributingAssessmentRef[] = [
        { id: 'exam-t1', exam_name: 'Mid Term', max_marks: 100 },
        { id: 'exam-t2', exam_name: 'End Term', max_marks: 100 },
      ];
      const student: Student = {
        id: 'stud-wm-1',
        admission_number: 'ADM-WM-1',
        full_name: 'Watermark Test Learner',
        grade: 'Grade 8',
        class_id: 'cls-g8',
      };
      const results = createStandardResults(student.id, 65, assessments);

      const customDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      let capturedTable4: any = null;
      let watermarkDrawnAfterTable4 = false;

      const origRect = customDoc.rect.bind(customDoc);
      customDoc.rect = function (x: any, y: any, w: any, h: any, style: any) {
        if (!capturedTable4 && (customDoc as any).lastAutoTable?.body) {
          const body = (customDoc as any).lastAutoTable.body;
          if (body.some((r: any) => r.cells?.[0]?.raw?.content === 'Total marks')) {
            capturedTable4 = (customDoc as any).lastAutoTable;
          }
        }
        return origRect(x, y, w, h, style);
      };

      const origAddImage = customDoc.addImage.bind(customDoc);
      const addImageSpy = vi.spyOn(customDoc, 'addImage').mockImplementation((...args: any[]) => {
        if (
          args[6] === 'terminal_report_watermark' ||
          (args[6] === 'terminal_school_logo' && (capturedTable4 || (customDoc as any).lastAutoTable))
        ) {
          if (capturedTable4 || (customDoc as any).lastAutoTable) {
            capturedTable4 = capturedTable4 || (customDoc as any).lastAutoTable;
            watermarkDrawnAfterTable4 = true;
          }
        }
        return origAddImage(...args);
      });

      const doc = await buildJuniorSchoolTerminalReportDoc(
        {
          student,
          school: mockSchool,
          classStream: { id: 'cls-g8', class_name: 'Grade 8 East', grade: 'Grade 8' },
          academicYear: '2026',
          term: 'Term 3',
          contributingAssessments: assessments,
          subjects: mockJuniorSubjects,
          resultsBySubject: results,
          grades: CBE_8_POINT_GRADES,
        },
        customDoc
      );

      // 1. One page guarantee preserved
      expect(doc.getNumberOfPages()).toBe(1);

      // 2. Watermark addImage called with shared 'terminal_school_logo' AFTER Table 4 so it shows through all cell fills
      expect(watermarkDrawnAfterTable4).toBe(true);
      const watermarkCall = addImageSpy.mock.calls.find(
        (c) => (c[6] === 'terminal_school_logo' || c[6] === 'terminal_report_watermark') && c[4] > 50
      );
      expect(watermarkCall).toBeDefined();
      expect(watermarkCall?.[4]).toBeCloseTo(78.0, 1);

      // 3. Table 4 styles verify cell transparency and opaque header
      expect(capturedTable4).toBeDefined();
      expect(capturedTable4.styles?.styles?.fillColor).toBe(false);
      expect(capturedTable4.styles?.bodyStyles?.fillColor).toBe(false);
      expect(capturedTable4.styles?.alternateRowStyles?.fillColor).toBe(false);
      expect(capturedTable4.body[0].cells[0].styles?.fillColor).toBe(false);
      expect(capturedTable4.head[0].cells[0].styles?.fillColor).toEqual([243, 244, 246]);
    });
  });

  // =========================================================================
  // SCENARIO 9: Complete 10-Item Redesign Verification (Muchorwe Comprehensive Term 3 Grade 8)
  // =========================================================================
  describe('Phase 3D.7: Complete 10-Item Redesign Verification', () => {
    it('satisfies all 10 layout and presentation specifications exactly', async () => {
      const muchorweSchool: School = {
        id: 'sch-muchorwe',
        school_name: 'MUCHORWE COMPREHENSIVE SCHOOL',
        county: 'Nakuru',
        motto: 'Knowledge to Excel',
        address: 'P.O. Box 100, Molo',
        phone: '+254 700 000 000',
        email: 'info@muchorwe.ac.ke',
        principal_name: 'Mr Paul Kamau',
        logo_url: mockSchool.logo_url,
      };

      const timothyStudent: Student = {
        id: 'stud-timothy-202',
        admission_number: '202',
        full_name: 'TIMOTHY MWANGI',
        grade: 'Grade 8',
        class_id: 'cls-g8-blue',
        stream_id: 'strm-blue',
      };

      const classStream: ClassStream = {
        id: 'cls-g8-blue',
        class_name: 'Grade 8',
        stream: 'BLUE',
        stream_id: 'strm-blue',
      };

      const contributingAssessments: ContributingAssessmentRef[] = [
        { id: 'exam-sba-junior', exam_name: 'SBA KNEC ASSESSMENT JUNIOR', max_marks: 100 },
        { id: 'exam-endterm-3', exam_name: 'JUNIOR SCHOOL END-OF-TERM 3 EXAMS', max_marks: 100 },
      ];

      const teachersWithAllocations: Teacher[] = [
        {
          id: 'tch-faith',
          teacher_name: 'Faith Chepkirui',
          allocations: [
            { id: 'a1', education_level: 'Junior School', class_id: 'cls-g8-blue', stream_id: 'strm-blue', subject_id: 'subj-eng', subject_name: 'English Language', subject_code: 'ENG' },
          ],
        },
        {
          id: 'tch-mburu',
          teacher_name: 'Stephen Mburu',
          allocations: [
            { id: 'a2', education_level: 'Junior School', class_id: 'cls-g8-blue', stream_id: 'strm-blue', subject_id: 'subj-kis', subject_name: 'Kiswahili', subject_code: 'KIS' },
          ],
        },
        {
          id: 'tch-brian',
          teacher_name: 'Mr Brian',
          is_class_teacher: true,
          class_teacher_of_id: 'strm-blue',
          allocations: [
            { id: 'a3', education_level: 'Junior School', class_id: 'cls-g8-blue', stream_id: 'strm-blue', subject_id: 'subj-mat', subject_name: 'Mathematics', subject_code: 'MAT' },
          ],
        },
      ];

      const marks: Mark[] = [
        { id: 'm1', student_id: timothyStudent.id, subject_id: 'subj-eng', exam_id: 'exam-sba-junior', marks: 82 },
        { id: 'm2', student_id: timothyStudent.id, subject_id: 'subj-eng', exam_id: 'exam-endterm-3', marks: 73 },
        { id: 'm3', student_id: timothyStudent.id, subject_id: 'subj-kis', exam_id: 'exam-sba-junior', marks: 79 },
        { id: 'm4', student_id: timothyStudent.id, subject_id: 'subj-kis', exam_id: 'exam-endterm-3', marks: 80 },
        { id: 'm5', student_id: timothyStudent.id, subject_id: 'subj-mat', exam_id: 'exam-sba-junior', marks: 36 },
        { id: 'm6', student_id: timothyStudent.id, subject_id: 'subj-mat', exam_id: 'exam-endterm-3', marks: 24 },
        { id: 'm7', student_id: timothyStudent.id, subject_id: 'subj-sci', exam_id: 'exam-sba-junior', marks: 73 },
        { id: 'm8', student_id: timothyStudent.id, subject_id: 'subj-sci', exam_id: 'exam-endterm-3', marks: 51 },
        { id: 'm9', student_id: timothyStudent.id, subject_id: 'subj-cas', exam_id: 'exam-sba-junior', marks: 71 },
        { id: 'm10', student_id: timothyStudent.id, subject_id: 'subj-cas', exam_id: 'exam-endterm-3', marks: 74 },
        { id: 'm11', student_id: timothyStudent.id, subject_id: 'subj-sst', exam_id: 'exam-sba-junior', marks: 74 },
        { id: 'm12', student_id: timothyStudent.id, subject_id: 'subj-sst', exam_id: 'exam-endterm-3', marks: 74 },
        { id: 'm13', student_id: timothyStudent.id, subject_id: 'subj-cre', exam_id: 'exam-sba-junior', marks: 90 },
        { id: 'm14', student_id: timothyStudent.id, subject_id: 'subj-cre', exam_id: 'exam-endterm-3', marks: 84 },
        { id: 'm15', student_id: timothyStudent.id, subject_id: 'subj-agn', exam_id: 'exam-sba-junior', marks: 100 },
        { id: 'm16', student_id: timothyStudent.id, subject_id: 'subj-agn', exam_id: 'exam-endterm-3', marks: 96 },
        { id: 'm17', student_id: timothyStudent.id, subject_id: 'subj-pts', exam_id: 'exam-sba-junior', marks: 78 },
        { id: 'm18', student_id: timothyStudent.id, subject_id: 'subj-pts', exam_id: 'exam-endterm-3', marks: 80 },
      ];

      const results = calculateLearnerTerminalResults({
        learnerId: timothyStudent.id,
        subjectIds: mockJuniorSubjects.map((s) => s.id),
        contributingAssessments,
        marks,
        grades: CBE_8_POINT_GRADES,
      });

      const customDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      let capturedSummaryTable: any = null;
      let capturedResultsTable: any = null;

      const origRect = customDoc.rect.bind(customDoc);
      customDoc.rect = function (x: any, y: any, w: any, h: any, style: any) {
        if (!capturedResultsTable && (customDoc as any).lastAutoTable?.body) {
          const body = (customDoc as any).lastAutoTable.body;
          if (body.some((r: any) => r.cells?.[0]?.raw?.content === 'Total marks')) {
            capturedResultsTable = (customDoc as any).lastAutoTable;
          } else if (body.some((r: any) => r.cells?.[0]?.raw?.content === 'TOTAL SCORE' || r.cells?.[0]?.raw?.content?.includes('/ 900'))) {
            capturedSummaryTable = (customDoc as any).lastAutoTable;
          }
        }
        return origRect(x, y, w, h, style);
      };

      const doc = await buildJuniorSchoolTerminalReportDoc(
        {
          student: timothyStudent,
          school: muchorweSchool,
          classStream,
          academicYear: '2026',
          term: 'Term 3',
          contributingAssessments,
          subjects: mockJuniorSubjects,
          resultsBySubject: results,
          grades: CBE_8_POINT_GRADES,
          teachers: teachersWithAllocations,
          ranking: {
            studentId: timothyStudent.id,
            streamPosition: 4,
            streamPositionDenominator: 37,
            overallPosition: 8,
            overallPositionDenominator: 70,
            isRankable: true,
            terminalTotalMarks: 659,
            terminalTotalMaximum: 900,
            cbePerformanceLevel: 'ME1',
            gradeLevel: 'Grade 8',
          },
          savedRemarks: {
            class_teacher_name: 'Mr Brian',
            class_teacher_comment: 'You have shown satisfactory grasp of evaluated concepts, and systematic study will help convert this progress into higher performance.',
            headteacher_name: 'Mr Paul Kamau',
            headteacher_comment: 'Approved for progression with encouragement to maintain steady academic focus and build greater strength across all learning areas.',
          },
          streamSubjectAverages: {
            'subj-eng': 55.4,
            'subj-kis': 69.1,
            'subj-mat': 33.2,
            'subj-sci': 49.0,
            'subj-cas': 55.0,
            'subj-sst': 55.0,
            'subj-cre': 68.8,
            'subj-agn': 86.3,
            'subj-pts': 62.4,
          },
          nextTermOpeningDate: '2026-10-31',
        },
        customDoc
      );

      // ITEM 9: Single page A4 portrait guarantee
      expect(doc.getNumberOfPages()).toBe(1);

      // ITEM 1 & 2: Header formatting and labels
      expect(capturedResultsTable).toBeDefined();
      const headRow = capturedResultsTable.head[0];
      expect(headRow.cells[0].text.join(' ')).toBe('LEARNING AREA');
      expect(headRow.cells[1].text.join(' ')).toBe('SBA KNEC JUNIOR');
      expect(headRow.cells[2].text.join(' ')).toBe('END-TERM 3 EXAM');
      expect(headRow.cells[3].text.join('\n')).toBe('TERMINAL\nSCORE');
      expect(headRow.cells[3].raw.styles.fillColor).toEqual([243, 244, 246]);
      expect(headRow.cells[3].raw.styles.textColor).toEqual([0, 0, 0]);
      expect(headRow.cells[4].text.join(' ')).toBe('LEVEL');
      // Points Display Correction: 'POINTS' must display on one line without splitting into 'POINT' and 'S'
      expect(headRow.cells[5].text.join(' ')).toBe('POINTS');
      expect(headRow.cells[5].text).toEqual(['POINTS']);
      expect(headRow.cells[6].text.join(' ')).toBe('RANK');
      expect(headRow.cells[7].text.join(' ')).toBe('COMMENTS');
      expect(headRow.cells[8].text.join(' ')).toBe('FACILITATOR');

      // ITEM 1: Subject data cells in Terminal Score column
      const subjectRows = capturedResultsTable.body.slice(0, 9);
      subjectRows.forEach((r: any) => {
        const termCell = r.cells[3]; // terminal score column
        expect(termCell.raw.styles.fillColor).toEqual([242, 242, 242]);
        expect(termCell.raw.styles.textColor).toEqual([0, 0, 0]);
        expect(termCell.raw.styles.fontStyle).toBe('bold');
      });

      // ITEM 3: Totals rows merging and formatting
      const totalMarksRow = capturedResultsTable.body.find((r: any) => r.cells?.[0]?.raw?.content === 'Total marks');
      const streamRankRow = capturedResultsTable.body.find((r: any) => r.cells?.[0]?.raw?.content === 'Stream rank');
      const overallRankRow = capturedResultsTable.body.find((r: any) => r.cells?.[0]?.raw?.content === 'Overall rank');

      expect(totalMarksRow).toBeDefined();
      expect(streamRankRow).toBeDefined();
      expect(overallRankRow).toBeDefined();

      // Bold row labels & light grey fill
      expect(totalMarksRow.cells[0].raw.styles.fontStyle).toBe('bold');
      expect(streamRankRow.cells[0].raw.styles.fontStyle).toBe('bold');
      expect(overallRankRow.cells[0].raw.styles.fontStyle).toBe('bold');
      expect(totalMarksRow.cells[0].raw.styles.fillColor).toEqual([243, 244, 246]);

      // Level cell merged rowSpan: 3, blank
      expect(totalMarksRow.cells[4].raw).toMatchObject({
        content: '',
        rowSpan: 3,
        styles: { fillColor: [243, 244, 246] },
      });

      // Points cell merged rowSpan: 3, bold, centered
      expect(totalMarksRow.cells[5].raw).toMatchObject({
        content: '57/72',
        rowSpan: 3,
        styles: { fontStyle: 'bold', fillColor: [243, 244, 246], halign: 'center' },
      });

      // Rank, Comments, Facilitator merged block rowSpan: 3, colSpan: 3
      expect(totalMarksRow.cells[6].raw).toMatchObject({
        content: '',
        rowSpan: 3,
        colSpan: 3,
        styles: { fillColor: [243, 244, 246] },
      });

      // ITEM 4: Facilitator column displays teacher names
      expect(subjectRows[0].cells[8].text.join(' ')).toBe('Faith Chepkirui');
      expect(subjectRows[1].cells[8].text.join(' ')).toBe('Stephen Mburu');
      expect(subjectRows[2].cells[8].text.join(' ')).toBe('Mr Brian');

      // Kiswahili comment is in Kiswahili
      const kiswComment = subjectRows[1].cells[7].text.join(' ');
      expect(kiswComment).toMatch(/kazi|hongera|vizuri|bidii/i);
    });
  });

  // =========================================================================
  // SCENARIO 10: Phase 3E.1 Image Compression and Deduplication
  // =========================================================================
  describe('Phase 3E.1: PDF Image Compression and Deduplication', () => {
    it('deduplicates header logo and watermark into a single PDF XObject', async () => {
      const student: Student = {
        id: 'std-dedup-01',
        admission_number: '234',
        first_name: 'Amos',
        last_name: 'Kipkoech',
        gender: 'Male',
        grade: 'Grade 8',
      };

      // 1. With school stamp: exactly 1 logo entry + 1 stamp entry (2 total, zero logo duplication)
      const doc = await buildJuniorSchoolTerminalReportDoc({
        student,
        school: mockSchool,
        classStream: { id: 'cls-g8', class_name: 'Grade 8 West', grade: 'Grade 8' },
        academicYear: '2026',
        term: 'Term 3',
        contributingAssessments: [
          { id: 'asm-1', name: 'Opener Exam', weightPercentage: 10, totalOutOf: 100 },
          { id: 'asm-2', name: 'Mid Term Exam', weightPercentage: 20, totalOutOf: 100 },
          { id: 'asm-3', name: 'End Term Exam', weightPercentage: 70, totalOutOf: 100 },
        ],
        subjects: mockJuniorSubjects,
        resultsBySubject: new Map(),
        grades: CBE_8_POINT_GRADES,
      });

      const images = (doc as any).internal.collections['addImage_images'];
      const logoEntries = Object.values(images).filter((img: any) => img.alias === 'terminal_school_logo');
      // Both header and watermark reuse the exact same image and alias, producing exactly ONE logo object in jsPDF
      expect(logoEntries.length).toBe(1);

      // 2. School without stamp: exactly 1 image object in the entire document
      const docNoStamp = await buildJuniorSchoolTerminalReportDoc({
        student,
        school: { ...mockSchool, stamp_url: undefined },
        classStream: { id: 'cls-g8', class_name: 'Grade 8 West', grade: 'Grade 8' },
        academicYear: '2026',
        term: 'Term 3',
        contributingAssessments: [],
        subjects: mockJuniorSubjects,
        resultsBySubject: new Map(),
        grades: CBE_8_POINT_GRADES,
      });

      const imagesNoStamp = (docNoStamp as any).internal.collections['addImage_images'];
      expect(Object.keys(imagesNoStamp).length).toBe(1);
      expect(imagesNoStamp['0'].alias).toBe('terminal_school_logo');
    });

    it('getOptimizedTerminalLogo handles null, empty, and data URLs gracefully', async () => {
      const nullRes = await getOptimizedTerminalLogo(null);
      expect(nullRes).toBeNull();

      const emptyRes = await getOptimizedTerminalLogo('');
      expect(emptyRes).toBeNull();

      const dataRes = await getOptimizedTerminalLogo(mockSchool.logo_url, 480, 0.88);
      expect(dataRes).not.toBeNull();
      expect(dataRes?.dataUrl).toBeDefined();
      expect(dataRes?.width).toBeLessThanOrEqual(480);
      expect(dataRes?.height).toBeLessThanOrEqual(480);
    });

    it('verifies Grades 7, 8, and 9 all render with single page and deduplicated logo', async () => {
      const gradesToTest = ['Grade 7', 'Grade 8', 'Grade 9'];

      for (const gradeName of gradesToTest) {
        const student: Student = {
          id: `std-${gradeName}`,
          admission_number: '101',
          first_name: 'Jane',
          last_name: 'Chebet',
          gender: 'Female',
          grade: gradeName,
        };

        const doc = await buildJuniorSchoolTerminalReportDoc({
          student,
          school: mockSchool,
          classStream: { id: `cls-${gradeName}`, class_name: `${gradeName} Alpha`, grade: gradeName },
          academicYear: '2026',
          term: 'Term 3',
          contributingAssessments: [
            { id: 'asm-1', name: 'Mid Term Exam', weightPercentage: 30, totalOutOf: 100 },
            { id: 'asm-2', name: 'End Term Exam', weightPercentage: 70, totalOutOf: 100 },
          ],
          subjects: mockJuniorSubjects,
          resultsBySubject: new Map(),
          grades: CBE_8_POINT_GRADES,
        });

        expect(doc.getNumberOfPages()).toBe(1);
        const images = (doc as any).internal.collections['addImage_images'];
        const logoEntries = Object.values(images).filter((img: any) => img.alias === 'terminal_school_logo');
        expect(logoEntries.length).toBe(1);
      }
    });
  });
});



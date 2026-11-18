import { describe, it, expect, vi } from 'vitest';
import { calculateStreamTerminalSubjectAverages } from '../services/terminalResultsEngine';
import {
  buildTerminalReportDoc,
  downloadSingleTerminalReportPDF,
  downloadBatchTerminalReportsPDF,
  TerminalReportPDFData,
} from '../services/terminalReportPdfGenerator';
import { Student, School, ClassStream, Subject, Grade, Teacher } from '../types';
import { CBE_8_POINT_GRADES } from '../services/analysisEngine';
import { savePdf } from '../utils/fileDownloader';

vi.mock('../utils/fileDownloader', () => ({
  savePdf: vi.fn().mockResolvedValue(undefined),
}));

describe('Phase 3C — Stream Average UI Data Integration', () => {
  const mockSchool: School = {
    id: 'sch-001',
    school_name: 'St. Marys Junior Academy',
    county: 'Nairobi',
    motto: 'Excellence in Action',
  };

  const streamEast: ClassStream = {
    id: 'cs-g7-east',
    class_name: 'Grade 7',
    stream: 'East',
    stream_id: 'str-east',
    education_level: 'Junior School',
  };

  const streamWest: ClassStream = {
    id: 'cs-g7-west',
    class_name: 'Grade 7',
    stream: 'West',
    stream_id: 'str-west',
    education_level: 'Junior School',
  };

  const subjects: Subject[] = [
    { id: 'sb-eng', subject_name: 'English', subject_code: 'ENG', category: 'Core', education_level: 'Junior School' },
    { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
    { id: 'sb-sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI', category: 'Core', education_level: 'Junior School' },
  ];

  const eastStudent1: Student = {
    id: 's-east-1',
    admission_number: 'ADM-E1',
    full_name: 'David East One',
    grade: 'Grade 7',
    class_id: 'cs-g7-east',
    stream_id: 'str-east',
    gender: 'M',
    active: true,
  };

  const eastStudent2: Student = {
    id: 's-east-2',
    admission_number: 'ADM-E2',
    full_name: 'Grace East Two',
    grade: 'Grade 7',
    class_id: 'cs-g7-east',
    stream_id: 'str-east',
    gender: 'F',
    active: true,
  };

  const westStudent1: Student = {
    id: 's-west-1',
    admission_number: 'ADM-W1',
    full_name: 'John West One',
    grade: 'Grade 7',
    class_id: 'cs-g7-west',
    stream_id: 'str-west',
    gender: 'M',
    active: true,
  };

  const westStudent2: Student = {
    id: 's-west-2',
    admission_number: 'ADM-W2',
    full_name: 'Mary West Two',
    grade: 'Grade 7',
    class_id: 'cs-g7-west',
    stream_id: 'str-west',
    gender: 'F',
    active: true,
  };

  // --------------------------------------------------------------------------
  // TEST 1: calculateStreamTerminalSubjectAverages calculates stream averages accurately
  // --------------------------------------------------------------------------
  it('1. Calculates accurate stream averages strictly per stream cohort without grade contamination', () => {
    // East: student 1 has Eng 80%, Math 70%; student 2 has Eng 90%, Math 50%
    // Expected East averages: Eng = Math.round(170/2) = 85%, Math = Math.round(120/2) = 60%, Sci = null (quorum < 2)
    const eastCohort = [
      {
        studentId: 's-east-1',
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 80 } as any],
          ['sb-math', { isComplete: true, status: 'Complete', terminalPercentage: 70 } as any],
        ]),
      },
      {
        studentId: 's-east-2',
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 90 } as any],
          ['sb-math', { isComplete: true, status: 'Complete', terminalPercentage: 50 } as any],
        ]),
      },
    ];

    // West: student 1 has Eng 40%, Math 40%; student 2 has Eng 50%, Math 60%
    // Expected West averages: Eng = 45%, Math = 50%, Sci = null
    const westCohort = [
      {
        studentId: 's-west-1',
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 40 } as any],
          ['sb-math', { isComplete: true, status: 'Complete', terminalPercentage: 40 } as any],
        ]),
      },
      {
        studentId: 's-west-2',
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 50 } as any],
          ['sb-math', { isComplete: true, status: 'Complete', terminalPercentage: 60 } as any],
        ]),
      },
    ];

    const eastAverages = calculateStreamTerminalSubjectAverages(eastCohort, subjects);
    const westAverages = calculateStreamTerminalSubjectAverages(westCohort, subjects);

    expect(eastAverages['sb-eng']).toBe(85);
    expect(eastAverages['sb-math']).toBe(60);
    expect(eastAverages['sb-sci']).toBeNull(); // Minimum quorum rule (0 learners evaluated)

    expect(westAverages['sb-eng']).toBe(45);
    expect(westAverages['sb-math']).toBe(50);
    expect(westAverages['sb-sci']).toBeNull();

    // Verify isolation: East average (85) != West average (45)
    expect(eastAverages['sb-eng']).not.toBe(westAverages['sb-eng']);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Single Learner Terminal Report PDF receives and plots stream averages
  // --------------------------------------------------------------------------
  it('2. Passes stream averages into single learner terminal report PDF builder without error', async () => {
    const singleData: TerminalReportPDFData = {
      student: eastStudent1,
      school: mockSchool,
      classStream: streamEast,
      academicYear: 2026,
      term: 'Term 3',
      contributingAssessments: [
        { id: 'ex-1', exam_name: 'Opener Assessment', max_marks: 100 },
        { id: 'ex-2', exam_name: 'Mid Term Assessment', max_marks: 100 },
      ],
      subjects,
      resultsBySubject: new Map([
        ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 80, points: 7, cbePerformanceLevel: 'EE2' } as any],
        ['sb-math', { isComplete: true, status: 'Complete', terminalPercentage: 70, points: 6, cbePerformanceLevel: 'ME1' } as any],
        ['sb-sci', { isComplete: true, status: 'Complete', terminalPercentage: 75, points: 7, cbePerformanceLevel: 'EE2' } as any],
      ]),
      grades: CBE_8_POINT_GRADES,
      streamSubjectAverages: {
        'sb-eng': 85,
        'sb-math': 60,
        'sb-sci': null, // Partial data: sci average missing, learner average present
      },
    };

    const doc = await buildTerminalReportDoc(singleData);
    expect(doc).toBeDefined();
    expect(doc.internal.getNumberOfPages()).toBe(1);

    // Also verify downloadSingleTerminalReportPDF executes with streamSubjectAverages
    await downloadSingleTerminalReportPDF(singleData);
    expect(savePdf).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // TEST 3: Batch Learner Terminal Reports PDF passes isolated stream averages per learner
  // --------------------------------------------------------------------------
  it('3. Generates multi-learner batch PDF with isolated stream averages for each learner', async () => {
    const batchReports: TerminalReportPDFData[] = [
      {
        student: eastStudent1,
        school: mockSchool,
        classStream: streamEast,
        academicYear: 2026,
        term: 'Term 3',
        contributingAssessments: [
          { id: 'ex-1', exam_name: 'Opener', max_marks: 100 },
        ],
        subjects,
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 80, points: 7 } as any],
        ]),
        streamSubjectAverages: {
          'sb-eng': 85, // East average
          'sb-math': 60,
        },
      },
      {
        student: westStudent1,
        school: mockSchool,
        classStream: streamWest,
        academicYear: 2026,
        term: 'Term 3',
        contributingAssessments: [
          { id: 'ex-1', exam_name: 'Opener', max_marks: 100 },
        ],
        subjects,
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 40, points: 4 } as any],
        ]),
        streamSubjectAverages: {
          'sb-eng': 45, // West average
          'sb-math': 50,
        },
      },
    ];

    const progressReports: Array<{ current: number; total: number }> = [];
    await downloadBatchTerminalReportsPDF(batchReports, (current, total) => {
      progressReports.push({ current, total });
    });

    expect(progressReports).toHaveLength(2);
    expect(progressReports[0]).toEqual({ current: 1, total: 2 });
    expect(progressReports[1]).toEqual({ current: 2, total: 2 });
    expect(savePdf).toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // TEST 4: Null preservation and minimum quorum rule (fewer than 2 valid learners)
  // --------------------------------------------------------------------------
  it('4. Preserves null values when fewer than 2 valid learners exist for a subject', () => {
    const soloCohort = [
      {
        studentId: 's-east-1',
        resultsBySubject: new Map([
          ['sb-eng', { isComplete: true, status: 'Complete', terminalPercentage: 80 } as any],
        ]),
      },
    ];

    const averages = calculateStreamTerminalSubjectAverages(soloCohort, subjects);
    expect(averages['sb-eng']).toBeNull(); // Quorum of 2 not met
    expect(averages['sb-math']).toBeNull();
    expect(averages['sb-sci']).toBeNull();
  });
});

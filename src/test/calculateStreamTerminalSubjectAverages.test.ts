import './setupLocalStorage';
import { describe, it, expect } from 'vitest';
import {
  calculateStreamTerminalSubjectAverages,
  LearningAreaTerminalResult,
  StreamCohortLearnerTerminalData,
} from '../services/terminalResultsEngine';
import { Subject, Student } from '../types';

describe('calculateStreamTerminalSubjectAverages (Phase 3A)', () => {
  const subjects: Subject[] = [
    {
      id: 'sub_math',
      subject_name: 'Mathematics',
      subject_code: 'MATH',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
    {
      id: 'sub_eng',
      subject_name: 'English',
      subject_code: 'ENG',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
    {
      id: 'sub_sci',
      subject_name: 'Integrated Science',
      subject_code: 'INT-SCI',
      category: 'Core',
      education_level: 'Junior School',
      applicable_grades: ['Grade 7', 'Grade 8', 'Grade 9'],
      status: 'Active',
    },
  ];

  const makeResult = (
    subjectId: string,
    percentage: number | null,
    status: 'Complete' | 'INCOMPLETE (X)' | 'INCOMPLETE (Y)' | 'INCOMPLETE (X/Y)' = 'Complete'
  ): LearningAreaTerminalResult => ({
    subjectId,
    isComplete: status === 'Complete' && percentage !== null,
    status,
    terminalPercentage: percentage,
    unroundedTerminalPercentage: percentage,
    cbePerformanceLevel: status === 'Complete' ? 'ME1' : null,
    points: status === 'Complete' ? 6 : null,
    assessmentTrail: [],
  });

  const makeLearner = (
    id: string,
    results: Record<string, { pct: number | null; status?: any }>
  ): StreamCohortLearnerTerminalData => {
    const map = new Map<string, LearningAreaTerminalResult>();
    for (const [subjId, val] of Object.entries(results)) {
      map.set(subjId, makeResult(subjId, val.pct, val.status || (val.pct !== null ? 'Complete' : 'INCOMPLETE (X)')));
    }
    return {
      student: { id, first_name: `Learner_${id}`, last_name: 'Test' } as Student,
      resultsBySubject: map,
    };
  };

  it('1. Exactly two valid learners: calculates correct arithmetic mean', () => {
    const learner1 = makeLearner('L1', { sub_math: { pct: 80 } });
    const learner2 = makeLearner('L2', { sub_math: { pct: 60 } });

    const averages = calculateStreamTerminalSubjectAverages([learner1, learner2], [subjects[0]]);
    expect(averages['sub_math']).toBe(70); // (80 + 60) / 2 = 70
  });

  it('2. Several valid learners: calculates correct arithmetic mean', () => {
    const learner1 = makeLearner('L1', { sub_math: { pct: 75 } });
    const learner2 = makeLearner('L2', { sub_math: { pct: 85 } });
    const learner3 = makeLearner('L3', { sub_math: { pct: 95 } });

    const averages = calculateStreamTerminalSubjectAverages([learner1, learner2, learner3], [subjects[0]]);
    expect(averages['sub_math']).toBe(85); // (75 + 85 + 95) / 3 = 85
  });

  it('3. Genuine zero inclusion: 0% is valid and participates in sum and denominator', () => {
    const learnerA = makeLearner('A', { sub_math: { pct: 80 } });
    const learnerB = makeLearner('B', { sub_math: { pct: 60 } });
    const learnerD = makeLearner('D', { sub_math: { pct: 0 } }); // genuine zero

    const averages = calculateStreamTerminalSubjectAverages([learnerA, learnerB, learnerD], [subjects[0]]);
    // (80 + 60 + 0) / 3 = 140 / 3 = 46.666... => Math.round is 47
    expect(averages['sub_math']).toBe(47);
  });

  it('4. X and Y exclusion: learners with X or Y do not participate in sum or denominator', () => {
    const learnerA = makeLearner('A', { sub_math: { pct: 80 } });
    const learnerB = makeLearner('B', { sub_math: { pct: 60 } });
    const learnerX = makeLearner('X', { sub_math: { pct: null, status: 'INCOMPLETE (X)' } });
    const learnerY = makeLearner('Y', { sub_math: { pct: null, status: 'INCOMPLETE (Y)' } });

    const averages = calculateStreamTerminalSubjectAverages([learnerA, learnerB, learnerX, learnerY], [subjects[0]]);
    // Only A (80) and B (60) participate => (80 + 60) / 2 = 70
    expect(averages['sub_math']).toBe(70);
  });

  it('5. Null and unassessed exclusion: learners without subject or with null pct are excluded', () => {
    const learnerA = makeLearner('A', { sub_math: { pct: 80 } });
    const learnerB = makeLearner('B', { sub_math: { pct: 60 } });
    const learnerEmpty = makeLearner('Empty', {}); // no entry for sub_math
    const learnerNull = makeLearner('Null', { sub_math: { pct: null, status: 'Complete' } }); // null pct

    const averages = calculateStreamTerminalSubjectAverages([learnerA, learnerB, learnerEmpty, learnerNull], [subjects[0]]);
    expect(averages['sub_math']).toBe(70);
  });

  it('6. Independent learner completeness: valid in Mathematics despite incomplete in other subjects', () => {
    // Learner A: complete in Math (80), incomplete in Science
    const learnerA = makeLearner('A', {
      sub_math: { pct: 80 },
      sub_sci: { pct: null, status: 'INCOMPLETE (X)' },
    });
    // Learner B: complete in Math (60), complete in Science (90)
    const learnerB = makeLearner('B', {
      sub_math: { pct: 60 },
      sub_sci: { pct: 90 },
    });
    // Learner C: complete in Math (40), complete in Science (80)
    const learnerC = makeLearner('C', {
      sub_math: { pct: 40 },
      sub_sci: { pct: 80 },
    });

    const averages = calculateStreamTerminalSubjectAverages([learnerA, learnerB, learnerC], [subjects[0], subjects[2]]);
    // Math: 3 valid learners (80, 60, 40) => (80 + 60 + 40) / 3 = 60
    expect(averages['sub_math']).toBe(60);
    // Science: 2 valid learners (90, 80) => (90 + 80) / 2 = 85
    expect(averages['sub_sci']).toBe(85);
  });

  it('7. Exactly one valid learner returns null (quorum rule < 2)', () => {
    const learnerA = makeLearner('A', { sub_math: { pct: 80 } });
    const learnerX = makeLearner('X', { sub_math: { pct: null, status: 'INCOMPLETE (X)' } });

    const averages = calculateStreamTerminalSubjectAverages([learnerA, learnerX], [subjects[0]]);
    expect(averages['sub_math']).toBeNull();
  });

  it('8. Zero valid learners returns null', () => {
    const learnerX1 = makeLearner('X1', { sub_math: { pct: null, status: 'INCOMPLETE (X)' } });
    const learnerX2 = makeLearner('X2', { sub_math: { pct: null, status: 'INCOMPLETE (Y)' } });

    const averages = calculateStreamTerminalSubjectAverages([learnerX1, learnerX2], [subjects[0]]);
    expect(averages['sub_math']).toBeNull();
  });

  it('9. Independent calculations across multiple learning areas', () => {
    const learner1 = makeLearner('L1', {
      sub_math: { pct: 70 },
      sub_eng: { pct: 80 },
      sub_sci: { pct: 50 },
    });
    const learner2 = makeLearner('L2', {
      sub_math: { pct: 90 },
      sub_eng: { pct: 60 },
      sub_sci: { pct: null, status: 'INCOMPLETE (X)' },
    });
    const learner3 = makeLearner('L3', {
      sub_math: { pct: 80 },
      sub_eng: { pct: null, status: 'INCOMPLETE (Y)' },
      sub_sci: { pct: null, status: 'INCOMPLETE (X)' },
    });

    const averages = calculateStreamTerminalSubjectAverages([learner1, learner2, learner3], subjects);
    // Math: L1(70), L2(90), L3(80) => 240 / 3 = 80
    expect(averages['sub_math']).toBe(80);
    // English: L1(80), L2(60) => 140 / 2 = 70 (quorum met with 2)
    expect(averages['sub_eng']).toBe(70);
    // Science: only L1(50) is valid => quorum < 2 => null
    expect(averages['sub_sci']).toBeNull();
  });

  it('10. Correct integer rounding (e.g. 46.67 rounds to 47, 46.4 rounds to 46)', () => {
    // 46.67% case from worked example: 80, 60, 0
    const learnerA = makeLearner('A', { sub_math: { pct: 80 } });
    const learnerB = makeLearner('B', { sub_math: { pct: 60 } });
    const learnerC = makeLearner('C', { sub_math: { pct: 0 } });
    const avg1 = calculateStreamTerminalSubjectAverages([learnerA, learnerB, learnerC], [subjects[0]]);
    expect(avg1['sub_math']).toBe(47);

    // 46.4% case: 46, 47, 46, 47, 46 => sum = 232 / 5 = 46.4 => rounds to 46
    const l1 = makeLearner('1', { sub_math: { pct: 46 } });
    const l2 = makeLearner('2', { sub_math: { pct: 47 } });
    const l3 = makeLearner('3', { sub_math: { pct: 46 } });
    const l4 = makeLearner('4', { sub_math: { pct: 47 } });
    const l5 = makeLearner('5', { sub_math: { pct: 46 } });
    const avg2 = calculateStreamTerminalSubjectAverages([l1, l2, l3, l4, l5], [subjects[0]]);
    expect(avg2['sub_math']).toBe(46);
  });

  it('11. Input data remains completely unchanged (pure and side-effect free)', () => {
    const map1 = new Map<string, LearningAreaTerminalResult>([
      ['sub_math', makeResult('sub_math', 85)],
    ]);
    const map2 = new Map<string, LearningAreaTerminalResult>([
      ['sub_math', makeResult('sub_math', 65)],
    ]);
    const learner1: StreamCohortLearnerTerminalData = { resultsBySubject: map1 };
    const learner2: StreamCohortLearnerTerminalData = { resultsBySubject: map2 };

    const originalInput = [learner1, learner2];
    const originalInputLength = originalInput.length;
    const originalMap1Size = map1.size;

    calculateStreamTerminalSubjectAverages(originalInput, [subjects[0]]);

    expect(originalInput.length).toBe(originalInputLength);
    expect(map1.size).toBe(originalMap1Size);
    expect(map1.get('sub_math')?.terminalPercentage).toBe(85);
  });

  it('12. Works transparently with Map array as direct input', () => {
    const map1 = new Map<string, LearningAreaTerminalResult>([
      ['sub_math', makeResult('sub_math', 70)],
    ]);
    const map2 = new Map<string, LearningAreaTerminalResult>([
      ['sub_math', makeResult('sub_math', 90)],
    ]);

    const averages = calculateStreamTerminalSubjectAverages([map1, map2], [subjects[0]]);
    expect(averages['sub_math']).toBe(80);
  });
});

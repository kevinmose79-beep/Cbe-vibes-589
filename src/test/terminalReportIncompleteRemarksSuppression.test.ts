import { describe, it, expect } from 'vitest';
import {
  getDefaultSubjectComment,
  resolveJuniorSchoolSubjectComment,
  resolveTerminalReportRemarks,
} from '../services/terminalReportPdfGenerator';
import { Subject, Student, School, ClassStream, Teacher } from '../types';
import { LearningAreaTerminalResult } from '../services/terminalResultsEngine';

describe('Terminal Report Form: Incomplete Marks Remarks Suppression', () => {
  const mockSubject: Subject = {
    id: 'sb-math',
    subject_name: 'Mathematics',
    subject_code: 'MATH',
    education_level: 'Junior School',
  };

  const mockKiswahili: Subject = {
    id: 'sb-kis',
    subject_name: 'Kiswahili',
    subject_code: 'KIS',
    education_level: 'Junior School',
  };

  const mockStudent: Student = {
    id: 'std-test-1',
    first_name: 'Abigael',
    last_name: 'Tonui',
    full_name: 'Abigael Chepkoech Tonui',
    admission_number: '233',
    gender: 'F',
    grade: 'Grade 8',
    class_id: 'cls-8',
    stream_id: 'str-8-blue',
    active: true,
  };

  const mockSchool: School = {
    id: 'sch-1',
    name: 'Sample Academy',
    principal_name: 'Dr. Jane Kimani',
  };

  const mockClassStream: ClassStream = {
    id: 'cls-8',
    class_name: 'Grade 8',
    stream: 'Blue',
    stream_id: 'str-8-blue',
    class_teacher_id: 'tch-ct-1',
    active: true,
  };

  const mockTeacher: Teacher = {
    id: 'tch-ct-1',
    teacher_name: 'Mr. Peter Omondi',
    phone: '0700000000',
    email: 'peter@test.com',
  };

  describe('1. Subject Comments (COMMENT Column) Suppression on Incomplete Marks', () => {
    it('returns "—" when result is undefined or missing', () => {
      expect(getDefaultSubjectComment(mockSubject, undefined)).toBe('—');
      expect(resolveJuniorSchoolSubjectComment(mockSubject, undefined)).toBe('—');
    });

    it('returns "—" when result is marked as INCOMPLETE (X)', () => {
      const incompleteXResult: LearningAreaTerminalResult = {
        subjectId: 'sb-math',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (X)',
        assessmentTrail: [],
      };

      expect(getDefaultSubjectComment(mockSubject, incompleteXResult)).toBe('—');
      expect(resolveJuniorSchoolSubjectComment(mockSubject, incompleteXResult)).toBe('—');
    });

    it('returns "—" when result is marked as INCOMPLETE (Y) (Irregularity)', () => {
      const incompleteYResult: LearningAreaTerminalResult = {
        subjectId: 'sb-math',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (Y)',
        assessmentTrail: [],
      };

      expect(getDefaultSubjectComment(mockSubject, incompleteYResult)).toBe('—');
      expect(resolveJuniorSchoolSubjectComment(mockSubject, incompleteYResult)).toBe('—');
    });

    it('returns "—" for Kiswahili when result is incomplete', () => {
      const incompleteKisResult: LearningAreaTerminalResult = {
        subjectId: 'sb-kis',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (X)',
        assessmentTrail: [],
      };

      expect(getDefaultSubjectComment(mockKiswahili, incompleteKisResult)).toBe('—');
      expect(resolveJuniorSchoolSubjectComment(mockKiswahili, incompleteKisResult)).toBe('—');
    });

    it('preserves teacher-written custom comments even if marks are incomplete', () => {
      const incompleteResult: LearningAreaTerminalResult = {
        subjectId: 'sb-math',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (X)',
        assessmentTrail: [],
      };

      const customComment = 'Teacher manually noted: Missed exam due to illness.';
      expect(resolveJuniorSchoolSubjectComment(mockSubject, incompleteResult, customComment)).toBe(customComment);
    });

    it('generates normal developmental remark when result is complete', () => {
      const completeResult: LearningAreaTerminalResult = {
        subjectId: 'sb-math',
        terminalPercentage: 84,
        unroundedTerminalPercentage: 84,
        isComplete: true,
        cbePerformanceLevel: 'EE2',
        points: 7,
        status: 'Complete',
        assessmentTrail: [],
      };

      const comment = resolveJuniorSchoolSubjectComment(mockSubject, completeResult);
      expect(comment).not.toBe('—');
      expect(comment.length).toBeGreaterThan(5);
    });
  });

  describe('2. General Report Remarks (Class Teacher & Head Teacher) Suppression on Incomplete Marks', () => {
    it('suppresses automated Class Teacher and Head Teacher remarks when any subject is incomplete', () => {
      const resultsMap = new Map<string, LearningAreaTerminalResult>();
      resultsMap.set('sb-math', {
        subjectId: 'sb-math',
        terminalPercentage: 75,
        unroundedTerminalPercentage: 75,
        isComplete: true,
        status: 'Complete',
        assessmentTrail: [],
      });
      // Incomplete English subject
      resultsMap.set('sb-kis', {
        subjectId: 'sb-kis',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (X)',
        assessmentTrail: [],
      });

      const resolved = resolveTerminalReportRemarks({
        student: mockStudent,
        school: mockSchool,
        classStream: mockClassStream,
        teachers: [mockTeacher],
        subjects: [mockSubject, mockKiswahili],
        resultsBySubject: resultsMap,
      });

      // Name resolution works
      expect(resolved.class_teacher_name).toBe('Mr. Peter Omondi');
      expect(resolved.headteacher_name).toBe('Dr. Jane Kimani');

      // But comments are strictly empty so clean writing lines render
      expect(resolved.class_teacher_comment).toBe('');
      expect(resolved.headteacher_comment).toBe('');
    });

    it('preserves teacher-written custom remarks even when marks are incomplete', () => {
      const resultsMap = new Map<string, LearningAreaTerminalResult>();
      resultsMap.set('sb-math', {
        subjectId: 'sb-math',
        terminalPercentage: null,
        unroundedTerminalPercentage: null,
        isComplete: false,
        status: 'INCOMPLETE (X)',
        assessmentTrail: [],
      });

      const customRemarks = {
        class_teacher_comment: 'Student sat only one assessment.',
        headteacher_comment: 'Special paper scheduled next term.',
      };

      const resolved = resolveTerminalReportRemarks({
        student: mockStudent,
        school: mockSchool,
        classStream: mockClassStream,
        teachers: [mockTeacher],
        savedRemarks: customRemarks,
        subjects: [mockSubject],
        resultsBySubject: resultsMap,
      });

      expect(resolved.class_teacher_comment).toBe('Student sat only one assessment.');
      expect(resolved.headteacher_comment).toBe('Special paper scheduled next term.');
    });

    it('generates personalized pedagogical remarks when all marks are complete', () => {
      const resultsMap = new Map<string, LearningAreaTerminalResult>();
      resultsMap.set('sb-math', {
        subjectId: 'sb-math',
        terminalPercentage: 80,
        unroundedTerminalPercentage: 80,
        isComplete: true,
        status: 'Complete',
        assessmentTrail: [],
      });
      resultsMap.set('sb-kis', {
        subjectId: 'sb-kis',
        terminalPercentage: 74,
        unroundedTerminalPercentage: 74,
        isComplete: true,
        status: 'Complete',
        assessmentTrail: [],
      });

      const resolved = resolveTerminalReportRemarks({
        student: mockStudent,
        school: mockSchool,
        classStream: mockClassStream,
        teachers: [mockTeacher],
        subjects: [mockSubject, mockKiswahili],
        resultsBySubject: resultsMap,
      });

      expect(resolved.class_teacher_comment).toBeTruthy();
      expect(resolved.class_teacher_comment.length).toBeGreaterThan(15);
      expect(resolved.headteacher_comment).toBeTruthy();
      expect(resolved.headteacher_comment.length).toBeGreaterThan(15);
    });
  });
});

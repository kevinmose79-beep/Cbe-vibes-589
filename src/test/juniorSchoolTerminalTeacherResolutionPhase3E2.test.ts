import { describe, it, expect } from 'vitest';
import { resolveSubjectTeacher } from '../utils/teacherResolutionUtils';
import { resolveJuniorSchoolFacilitator } from '../services/terminalReportPdfGenerator';
import { Teacher, Subject, ClassStream, Student } from '../types';

describe('Phase 3E.2: Junior School Terminal Report Teacher Resolution', () => {
  // Test 1: Cross-Grade Stream Isolation
  describe('Test 1: Cross-grade stream isolation (Blue and Red streams)', () => {
    const teacherG7Blue: Teacher = {
      id: 'tch-g7-blue',
      teacher_name: 'Madam Vivian',
      phone: '0700000001',
      email: 'vivian@test.com',
      allocations: [
        {
          id: 'alloc-1',
          education_level: 'Junior School',
          class_id: 'class-g7',
          stream_id: 'stream-g7-blue',
          subject_id: 'subj-kisw',
          stream: 'Blue',
          class_name: 'Grade 7',
        },
      ],
    };

    const teacherG8Blue: Teacher = {
      id: 'tch-g8-blue',
      teacher_name: 'Mr Charles',
      phone: '0700000002',
      email: 'charles@test.com',
      allocations: [
        {
          id: 'alloc-2',
          education_level: 'Junior School',
          class_id: 'class-g8',
          stream_id: 'stream-g8-blue',
          subject_id: 'subj-kisw',
          stream: 'Blue',
          class_name: 'Grade 8',
        },
      ],
    };

    const teacherG9Blue: Teacher = {
      id: 'tch-g9-blue',
      teacher_name: 'Madam Angela',
      phone: '0700000003',
      email: 'angela@test.com',
      allocations: [
        {
          id: 'alloc-3',
          education_level: 'Junior School',
          class_id: 'class-g9',
          stream_id: 'stream-g9-blue',
          subject_id: 'subj-kisw',
          stream: 'Blue',
          class_name: 'Grade 9',
        },
      ],
    };

    const teachers = [teacherG7Blue, teacherG8Blue, teacherG9Blue];
    const kiswSubject: Subject = {
      id: 'subj-kisw',
      subject_name: 'Kiswahili',
      subject_code: 'KIS',
    };

    it('Grade 7 Blue teacher cannot be selected for Grade 8 Blue or Grade 9 Blue', () => {
      // Grade 8 Blue lookup
      const resG8 = resolveSubjectTeacher(teachers, 'subj-kisw', 'class-g8', 'stream-g8-blue');
      expect(resG8?.teacher_name).toBe('Mr Charles');

      const facG8 = resolveJuniorSchoolFacilitator(teachers, kiswSubject, 'class-g8', 'stream-g8-blue');
      expect(facG8).toBe('Mr Charles');

      // Grade 9 Blue lookup
      const resG9 = resolveSubjectTeacher(teachers, 'subj-kisw', 'class-g9', 'stream-g9-blue');
      expect(resG9?.teacher_name).toBe('Madam Angela');

      const facG9 = resolveJuniorSchoolFacilitator(teachers, kiswSubject, 'class-g9', 'stream-g9-blue');
      expect(facG9).toBe('Madam Angela');

      // Grade 7 Blue lookup
      const resG7 = resolveSubjectTeacher(teachers, 'subj-kisw', 'class-g7', 'stream-g7-blue');
      expect(resG7?.teacher_name).toBe('Madam Vivian');

      const facG7 = resolveJuniorSchoolFacilitator(teachers, kiswSubject, 'class-g7', 'stream-g7-blue');
      expect(facG7).toBe('Madam Vivian');
    });

    it('Grade 8 Blue teacher cannot leak into Grade 7 or Grade 9 Blue', () => {
      // If Grade 7 Blue had no Kiswahili teacher, it must return undefined / empty, not Mr Charles
      const teachersWithoutG7 = [teacherG8Blue, teacherG9Blue];
      expect(resolveSubjectTeacher(teachersWithoutG7, 'subj-kisw', 'class-g7', 'stream-g7-blue')).toBeUndefined();
      expect(resolveJuniorSchoolFacilitator(teachersWithoutG7, kiswSubject, 'class-g7', 'stream-g7-blue')).toBe('');
    });

    it('Red streams are isolated across grades identically', () => {
      const teacherG7Red: Teacher = {
        id: 'tch-g7-red',
        teacher_name: 'Mr Brian',
        phone: '0700000004',
        email: 'brian@test.com',
        allocations: [
          {
            id: 'alloc-r1',
            education_level: 'Junior School',
            class_id: 'class-g7',
            stream_id: 'stream-g7-red',
            subject_id: 'subj-eng',
            stream: 'Red',
            class_name: 'Grade 7',
          },
        ],
      };

      const teacherG8Red: Teacher = {
        id: 'tch-g8-red',
        teacher_name: 'Madam Grace',
        phone: '0700000005',
        email: 'grace@test.com',
        allocations: [
          {
            id: 'alloc-r2',
            education_level: 'Junior School',
            class_id: 'class-g8',
            stream_id: 'stream-g8-red',
            subject_id: 'subj-eng',
            stream: 'Red',
            class_name: 'Grade 8',
          },
        ],
      };

      const redTeachers = [teacherG7Red, teacherG8Red];
      const engSubject: Subject = { id: 'subj-eng', subject_name: 'English', subject_code: 'ENG' };

      // Grade 8 Red must resolve Madam Grace, not Mr Brian
      expect(resolveSubjectTeacher(redTeachers, 'subj-eng', 'class-g8', 'stream-g8-red')?.teacher_name).toBe('Madam Grace');
      expect(resolveJuniorSchoolFacilitator(redTeachers, engSubject, 'class-g8', 'stream-g8-red')).toBe('Madam Grace');

      // Grade 7 Red must resolve Mr Brian, not Madam Grace
      expect(resolveSubjectTeacher(redTeachers, 'subj-eng', 'class-g7', 'stream-g7-red')?.teacher_name).toBe('Mr Brian');
      expect(resolveJuniorSchoolFacilitator(redTeachers, engSubject, 'class-g7', 'stream-g7-red')).toBe('Mr Brian');
    });
  });

  // Test 2: Latest Assignment Wins
  describe('Test 2: Latest assignment wins when conflicting allocations exist for exact same class & stream', () => {
    it('selects the teacher with the latest valid assignment timestamp regardless of array order', () => {
      const olderTeacher: Teacher = {
        id: 'tch-older',
        teacher_name: 'Older Teacher',
        phone: '0700000010',
        email: 'older@test.com',
        allocations: [
          {
            id: 'alloc-old',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-math',
            created_at: '2026-10-01T10:00:00.000Z',
          } as any,
        ],
      };

      const newerTeacher: Teacher = {
        id: 'tch-newer',
        teacher_name: 'Newer Teacher',
        phone: '0700000011',
        email: 'newer@test.com',
        allocations: [
          {
            id: 'alloc-new',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-math',
            created_at: '2026-10-15T10:00:00.000Z',
          } as any,
        ],
      };

      // Array order 1: [older, newer] -> newer must win
      const result1 = resolveSubjectTeacher([olderTeacher, newerTeacher], 'subj-math', 'cls-1', 'str-1');
      expect(result1?.teacher_name).toBe('Newer Teacher');

      // Array order 2: [newer, older] -> newer must still win
      const result2 = resolveSubjectTeacher([newerTeacher, olderTeacher], 'subj-math', 'cls-1', 'str-1');
      expect(result2?.teacher_name).toBe('Newer Teacher');
    });

    it('returns undefined and warns without guessing when conflicting allocations lack timestamps', () => {
      const teacher1: Teacher = {
        id: 'tch-1',
        teacher_name: 'Teacher One',
        phone: '0700000012',
        email: 'one@test.com',
        allocations: [
          {
            id: 'alloc-no-ts-1',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-sci',
          },
        ],
      };

      const teacher2: Teacher = {
        id: 'tch-2',
        teacher_name: 'Teacher Two',
        phone: '0700000013',
        email: 'two@test.com',
        allocations: [
          {
            id: 'alloc-no-ts-2',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-sci',
          },
        ],
      };

      // When timestamps are missing on conflicting allocations, do not guess
      const result = resolveSubjectTeacher([teacher1, teacher2], 'subj-sci', 'cls-1', 'str-1');
      expect(result).toBeUndefined();

      const mathSubj: Subject = { id: 'subj-sci', subject_name: 'Integrated Science', subject_code: 'INT-SCI' };
      expect(resolveJuniorSchoolFacilitator([teacher1, teacher2], mathSubj, 'cls-1', 'str-1')).toBe('');
    });

    it('returns undefined when conflicting allocations have tied timestamps', () => {
      const teacher1: Teacher = {
        id: 'tch-1',
        teacher_name: 'Teacher One',
        phone: '0700000012',
        email: 'one@test.com',
        allocations: [
          {
            id: 'alloc-tied-1',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-sci',
            created_at: '2026-10-10T12:00:00.000Z',
          } as any,
        ],
      };

      const teacher2: Teacher = {
        id: 'tch-2',
        teacher_name: 'Teacher Two',
        phone: '0700000013',
        email: 'two@test.com',
        allocations: [
          {
            id: 'alloc-tied-2',
            education_level: 'Junior School',
            class_id: 'cls-1',
            stream_id: 'str-1',
            subject_id: 'subj-sci',
            created_at: '2026-10-10T12:00:00.000Z',
          } as any,
        ],
      };

      const result = resolveSubjectTeacher([teacher1, teacher2], 'subj-sci', 'cls-1', 'str-1');
      expect(result).toBeUndefined();
    });
  });

  // Test 3: Grade 8 Blue Conflict Cases
  describe('Test 3: Grade 8 Blue real conflict cases with actual DB timestamps', () => {
    // 1. Mathematics:
    // Mr Maina: created_at: 2026-10-12T09:36:37.230179+00:00
    // Ismael:   created_at: 2026-10-07T14:26:03.084612+00:00
    it('Grade 8 Blue Mathematics resolves to Mr Maina (2026-10-12 > 2026-10-07)', () => {
      const ismael: Teacher = {
        id: 'dffbe284-a086-4a57-972b-aa40e7c036bb',
        teacher_name: 'Ismael',
        phone: '',
        email: 'ismael@test.com',
        allocations: [
          {
            id: 'ed278f34-c436-4ad3-b9e9-e2977f646277',
            education_level: 'Junior School',
            class_id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
            stream_id: '8a9c07bb-1bbf-4d99-85be-3468a6457305',
            subject_id: '4441b054-2d20-4d5c-852d-f31d16fbc145',
            created_at: '2026-10-07T14:26:03.084612+00:00',
          } as any,
        ],
      };

      const mrMaina: Teacher = {
        id: '5e41bef7-8d3b-40fa-85d9-acd47614affe',
        teacher_name: 'Mr Maina',
        phone: '',
        email: 'maina@test.com',
        allocations: [
          {
            id: 'c8ac68fb-d368-4e03-98a3-9d2d30691d84',
            education_level: 'Junior School',
            class_id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
            stream_id: '8a9c07bb-1bbf-4d99-85be-3468a6457305',
            subject_id: '4441b054-2d20-4d5c-852d-f31d16fbc145',
            created_at: '2026-10-12T09:36:37.230179+00:00',
          } as any,
        ],
      };

      const mathSubj: Subject = {
        id: '4441b054-2d20-4d5c-852d-f31d16fbc145',
        subject_name: 'Mathematics',
        subject_code: 'MATH',
      };

      // Even if Ismael appears first in array (as in DB teacher order)
      const teachers = [ismael, mrMaina];
      const res = resolveSubjectTeacher(
        teachers,
        '4441b054-2d20-4d5c-852d-f31d16fbc145',
        'c79816ee-1324-4abb-b5ad-d974f232b2ad',
        '8a9c07bb-1bbf-4d99-85be-3468a6457305'
      );
      expect(res?.teacher_name).toBe('Mr Maina');

      const fac = resolveJuniorSchoolFacilitator(
        teachers,
        mathSubj,
        'c79816ee-1324-4abb-b5ad-d974f232b2ad',
        '8a9c07bb-1bbf-4d99-85be-3468a6457305'
      );
      expect(fac).toBe('Mr Maina');
    });

    // 2. Social Studies:
    // Madam Caroline: created_at: 2026-09-04T18:46:46.441105+00:00
    // Ismael:         created_at: 2026-10-07T14:26:03.084612+00:00
    it('Grade 8 Blue Social Studies resolves to Ismael (2026-10-07 > 2026-09-04)', () => {
      const madamCaroline: Teacher = {
        id: '32525b95-5e8b-4dbc-914a-8036f2bc761e',
        teacher_name: 'Madam Caroline',
        phone: '',
        email: 'caroline@test.com',
        allocations: [
          {
            id: 'e2272277-8598-46c3-84db-d98ae7440905',
            education_level: 'Junior School',
            class_id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
            stream_id: '8a9c07bb-1bbf-4d99-85be-3468a6457305',
            subject_id: 'dff8e7fc-bb0d-41c5-b451-e6b6f3361409',
            created_at: '2026-09-04T18:46:46.441105+00:00',
          } as any,
        ],
      };

      const ismael: Teacher = {
        id: 'dffbe284-a086-4a57-972b-aa40e7c036bb',
        teacher_name: 'Ismael',
        phone: '',
        email: 'ismael@test.com',
        allocations: [
          {
            id: '145369c0-4604-4a74-8bf5-660e491dd3bf',
            education_level: 'Junior School',
            class_id: 'c79816ee-1324-4abb-b5ad-d974f232b2ad',
            stream_id: '8a9c07bb-1bbf-4d99-85be-3468a6457305',
            subject_id: 'dff8e7fc-bb0d-41c5-b451-e6b6f3361409',
            created_at: '2026-10-07T14:26:03.084612+00:00',
          } as any,
        ],
      };

      const sstSubj: Subject = {
        id: 'dff8e7fc-bb0d-41c5-b451-e6b6f3361409',
        subject_name: 'Social Studies',
        subject_code: 'SST',
      };

      // Even if Madam Caroline appears first in array
      const teachers = [madamCaroline, ismael];
      const res = resolveSubjectTeacher(
        teachers,
        'dff8e7fc-bb0d-41c5-b451-e6b6f3361409',
        'c79816ee-1324-4abb-b5ad-d974f232b2ad',
        '8a9c07bb-1bbf-4d99-85be-3468a6457305'
      );
      expect(res?.teacher_name).toBe('Ismael');

      const fac = resolveJuniorSchoolFacilitator(
        teachers,
        sstSubj,
        'c79816ee-1324-4abb-b5ad-d974f232b2ad',
        '8a9c07bb-1bbf-4d99-85be-3468a6457305'
      );
      expect(fac).toBe('Ismael');
    });
  });

  // Test 5: In-App Preview and PDF Consistency
  describe('Test 5: Preview and PDF resolver parity', () => {
    it('preview resolveSubjectTeacher and PDF resolveJuniorSchoolFacilitator always agree', () => {
      const mockTeachers: Teacher[] = [
        {
          id: 't1',
          teacher_name: 'Tr. Agnes',
          email: 'agnes@test.com',
          phone: '',
          allocations: [
            {
              id: 'a1',
              education_level: 'Junior School',
              class_id: 'cls-8',
              stream_id: 'str-8-blue',
              subject_id: 'subj-1',
              created_at: '2026-09-01T00:00:00.000Z',
            } as any,
          ],
        },
      ];

      const subj: Subject = { id: 'subj-1', subject_name: 'Agriculture', subject_code: 'AGN' };
      const classStream: ClassStream = {
        id: 'cls-8',
        stream_id: 'str-8-blue',
        class_name: 'Grade 8',
        stream: 'Blue',
      };
      const student: Student = {
        id: 'std-1',
        full_name: 'Timothy Mwangi',
        admission_number: '202',
        class_id: 'cls-8',
        stream_id: 'str-8-blue',
        grade: 'Grade 8',
      } as any;

      const previewTeacher = resolveSubjectTeacher(mockTeachers, subj.id, 'cls-8', 'str-8-blue');
      const pdfTeacherName = resolveJuniorSchoolFacilitator(
        mockTeachers,
        subj,
        'cls-8',
        'str-8-blue',
        classStream,
        student
      );

      expect(previewTeacher?.teacher_name).toBe('Tr. Agnes');
      expect(pdfTeacherName).toBe(previewTeacher?.teacher_name);
    });
  });
});

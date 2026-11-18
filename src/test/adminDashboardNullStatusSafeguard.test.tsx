import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AdminDashboard } from '../components/AdminDashboard';
import { MarksEntryTable } from '../components/MarksEntryTable';
import { ExaminationManagement } from '../components/ExaminationManagement';
import { AcademicSessionContext } from '../contexts/AcademicSessionContext';
import { School, Teacher, ClassStream, Student, Subject, Examination, Mark, Grade, AcademicYear, SchoolTerm } from '../types';
import { api } from '../lib/storage';

describe('AdminDashboard Null Status & Active Term Safeguard Suite', () => {
  const mockSchool: School = {
    id: 'school-1',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Strive for Excellence',
    county: 'Nakuru',
    address: 'P.O. Box 100',
    email: 'info@school.ke',
  };

  const mockYear: AcademicYear = {
    id: 'year-2026',
    year: 2026,
    status: 'Active',
    start_date: '2026-01-05',
    end_date: '2026-11-20',
  };

  const mockActiveTerm: SchoolTerm = {
    id: 'term-1-2026',
    academic_year_id: 'year-2026',
    term_name: 'Term 1',
    year: 2026,
    status: 'Active',
    opening_date: '2026-01-05',
    closing_date: '2026-04-03',
    mid_term_opening_date: '2026-02-18',
    mid_term_closing_date: '2026-02-22',
  };

  const mockClosedTerm: SchoolTerm = {
    id: 'term-3-2025',
    academic_year_id: 'year-2025',
    term_name: 'Term 3',
    year: 2025,
    status: 'Closed',
    opening_date: '2025-08-25',
    closing_date: '2025-10-24',
  };

  const mockClasses: ClassStream[] = [
    { id: 'c1', class_name: 'Grade 7', stream: 'East', education_level: 'Junior School', stream_id: 'c1' },
  ];

  const mockStudents: Student[] = [
    {
      id: 's1',
      admission_number: 'ADM001',
      full_name: 'Jane Doe',
      gender: 'F',
      class_id: 'c1',
      stream_id: 'c1',
      grade: 'Grade 7',
      education_level: 'Junior School',
      status: 'Active',
    },
  ];

  const mockSubjects: Subject[] = [
    { id: 'sub1', subject_name: 'Mathematics', subject_code: 'MAT', education_level: 'Junior School' },
  ];

  const mockExams: Examination[] = [
    {
      id: 'exam1',
      exam_name: 'Grade 7 Opener Assessment',
      year: 2026,
      term: 'Term 1',
      status: 'Open',
      class_id: 'c1',
      education_level: 'Junior School',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renders cleanly with Active Term present and displays active status and session details', () => {
    const contextValue = {
      activeYear: mockYear,
      activeTerm: mockActiveTerm,
      viewingYear: mockYear,
      viewingTerm: mockActiveTerm,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: true,
    };

    const html = renderToString(
      <AcademicSessionContext.Provider value={contextValue}>
        <AdminDashboard
          school={mockSchool}
          userName="Administrator"
          teachers={[]}
          classes={mockClasses}
          students={mockStudents}
          subjects={mockSubjects}
          exams={mockExams}
          marks={[]}
          grades={[]}
          onNavigate={vi.fn()}
        />
      </AcademicSessionContext.Provider>
    );

    expect(html).toContain('Muchorwe Comprehensive School');
    expect(html).toContain('Academic Year 2026');
    expect(html).toContain('Term 1');
    expect(html).toContain('Active');
    expect(html).toContain('All examinations and marks records are automatically tagged to this session.');
  });

  it('2. Does NOT crash when activeTerm is null (No Active Term), and safely renders "No Active Term"', () => {
    const contextValue = {
      activeYear: mockYear,
      activeTerm: null,
      viewingYear: mockYear,
      viewingTerm: null,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    let renderedHtml = '';
    expect(() => {
      renderedHtml = renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <AdminDashboard
            school={mockSchool}
            userName="Administrator"
            teachers={[]}
            classes={mockClasses}
            students={mockStudents}
            subjects={mockSubjects}
            exams={mockExams}
            marks={[]}
            grades={[]}
            onNavigate={vi.fn()}
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();

    expect(renderedHtml).toContain('Muchorwe Comprehensive School');
    expect(renderedHtml).toContain('Academic Year 2026');
    expect(renderedHtml).toContain('No Active Term');
    expect(renderedHtml).toContain('No active academic term configured');
    expect(renderedHtml).toContain('Opening Date');
    expect(renderedHtml).toContain('Closing Date');
  });

  it('3. Does NOT crash when activeTerm and activeAcademicYear are temporarily null during loading', () => {
    const contextValue = {
      activeYear: null as any,
      activeTerm: null,
      viewingYear: null as any,
      viewingTerm: null,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    let renderedHtml = '';
    expect(() => {
      renderedHtml = renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <AdminDashboard
            school={mockSchool}
            userName="Administrator"
            teachers={[]}
            classes={[]}
            students={[]}
            subjects={[]}
            exams={[]}
            marks={[]}
            grades={[]}
            onNavigate={vi.fn()}
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();

    expect(renderedHtml).toContain('Muchorwe Comprehensive School');
    expect(renderedHtml).toContain('No Active Term');
  });

  it('4. Correctly preserves historical-term viewing when viewingTerm is a Closed past term', () => {
    const pastYear: AcademicYear = {
      id: 'year-2025',
      year: 2025,
      status: 'Closed',
      start_date: '2025-01-06',
      end_date: '2025-10-24',
    };

    const contextValue = {
      activeYear: mockYear,
      activeTerm: mockActiveTerm,
      viewingYear: pastYear,
      viewingTerm: mockClosedTerm,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    let renderedHtml = '';
    expect(() => {
      renderedHtml = renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <AdminDashboard
            school={mockSchool}
            userName="Administrator"
            teachers={[]}
            classes={mockClasses}
            students={mockStudents}
            subjects={mockSubjects}
            exams={mockExams}
            marks={[]}
            grades={[]}
            onNavigate={vi.fn()}
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();

    expect(renderedHtml).toContain('Academic Year 2025');
    expect(renderedHtml).toContain('Term 3');
    expect(renderedHtml).toContain('Closed');
  });

  it('5. Safe null handling for exam.status and subject.status prevents crashes on corrupted entity data', () => {
    const contextValue = {
      activeYear: mockYear,
      activeTerm: null,
      viewingYear: mockYear,
      viewingTerm: null,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    const corruptedExams: any[] = [
      {
        id: 'corrupt-exam-1',
        exam_name: 'Unspecified Exam',
        year: 2026,
        term: 'Term 1',
        status: null, // Null status on exam
      },
      null, // Null entry in exams array
    ];

    const corruptedSubjects: any[] = [
      { id: 'corrupt-sub-1', subject_name: 'Science', education_level: 'Junior School', status: null },
      null, // Null entry in subjects array
    ];

    expect(() => {
      renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <AdminDashboard
            school={mockSchool}
            userName="Administrator"
            teachers={[]}
            classes={mockClasses}
            students={mockStudents}
            subjects={corruptedSubjects}
            exams={corruptedExams}
            marks={[]}
            grades={[]}
            onNavigate={vi.fn()}
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();
  });

  it('6. MarksEntryTable does NOT crash when activeTerm is null and displays a clear session notice', () => {
    const contextValue = {
      activeYear: mockYear,
      activeTerm: null,
      viewingYear: mockYear,
      viewingTerm: null,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    let renderedHtml = '';
    expect(() => {
      renderedHtml = renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <MarksEntryTable
            exams={mockExams}
            classes={mockClasses}
            subjects={mockSubjects}
            students={mockStudents}
            marks={[]}
            grades={[]}
            userRole="admin"
            onSaveMarks={vi.fn()}
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();

    expect(renderedHtml).toContain('No active academic term configured. Marks entry requires an active academic session.');
  });

  it('7. ExaminationManagement does NOT crash when activeTerm is null and safely displays locked notice', () => {
    const contextValue = {
      activeYear: mockYear,
      activeTerm: null,
      viewingYear: mockYear,
      viewingTerm: null,
      setViewingSession: vi.fn(),
      resetToActiveSession: vi.fn(),
      refreshSessionState: vi.fn(),
      isViewingActiveSession: false,
    };

    let renderedHtml = '';
    expect(() => {
      renderedHtml = renderToString(
        <AcademicSessionContext.Provider value={contextValue}>
          <ExaminationManagement
            exams={mockExams}
            classes={mockClasses}
            subjects={mockSubjects}
            onAddExamination={vi.fn()}
            userRole="admin"
          />
        </AcademicSessionContext.Provider>
      );
    }).not.toThrow();

    expect(renderedHtml).toContain('Assessment Setup');
    expect(renderedHtml).toContain('Assessment Creation Locked');
  });
});

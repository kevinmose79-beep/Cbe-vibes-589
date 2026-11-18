import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  generateJuniorSchoolReportPDF,
  generateUpperPrimaryReportPDF,
  generateLowerPrimaryReportPDF,
  generatePrePrimaryReportPDF,
  PDFReportData,
} from '../services/pdfReportGenerator';
import { School, Student, Examination, ClassStream, Subject, Mark, Grade, Teacher } from '../types';

describe('Learner Assessment Report Form Remarks Formatting (Label Duplication Removal)', () => {
  const mockSchool: School = {
    id: '00000000-0000-0000-0000-000000000001',
    school_name: 'Muchorwe Comprehensive School',
    motto: 'Knowledge to Excel',
    county: 'Nakuru',
    postal_code: 'P.O. Box 100-20100',
    email: 'info@muchorwe.ac.ke',
    principal_name: 'Dr. Jane Muthoni',
  };

  const mockExam: Examination = {
    id: 'ex-t2-2026',
    exam_name: 'Term 2 Evaluation 2026',
    term: 'Term 2',
    year: 2026,
    academic_year_id: 'ay-2026',
    education_level: 'Junior School',
    status: 'Approved',
    exam_type: 'End-Term',
    max_marks: 100,
  };

  const mockClasses: ClassStream[] = [
    { id: 'cls-g8', class_name: 'Grade 8', stream: 'East', education_level: 'Junior School', class_teacher_id: 'tch-brian' },
    { id: 'cls-g5', class_name: 'Grade 5', stream: 'North', education_level: 'Upper Primary', class_teacher_id: 'tch-brian' },
    { id: 'cls-g2', class_name: 'Grade 2', stream: 'South', education_level: 'Lower Primary', class_teacher_id: 'tch-brian' },
    { id: 'cls-pp1', class_name: 'PP1', stream: 'West', education_level: 'Pre-Primary', class_teacher_id: 'tch-brian' },
  ];

  const mockTeacher: Teacher = {
    id: 'tch-brian',
    teacher_name: 'Tr. Mr. Brian',
    is_class_teacher: true,
  };

  const mockSubjects: Subject[] = [
    { id: 'sb-math', subject_name: 'Mathematics', subject_code: 'MATH', category: 'Core', education_level: 'Junior School' },
    { id: 'sb-agri', subject_name: 'Agriculture', subject_code: 'AGRI', category: 'Core', education_level: 'Junior School' },
  ];

  const mockStudent: Student = {
    id: 'std-001',
    admission_number: 'ADM-001',
    full_name: 'Alice Wambui',
    gender: 'F',
    grade: 'Grade 8',
    class_id: 'cls-g8',
    stream_id: 'cls-g8',
    active: true,
  };

  const mockMarks: Mark[] = [
    { id: 'mk-1', student_id: 'std-001', subject_id: 'sb-math', exam_id: 'ex-t2-2026', marks: 82, raw_score: 82, out_of: 100, special_status: 'Normal' },
    { id: 'mk-2', student_id: 'std-001', subject_id: 'sb-agri', exam_id: 'ex-t2-2026', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
  ];

  const mockGrades: Grade[] = [
    { id: 'g-ee', grade: 'EE', grade_code: 'EE', performance_level: 'EE', minimum_score: 80, maximum_score: 100, points: 4, remarks: 'Exceeding Expectations' },
    { id: 'g-me', grade: 'ME', grade_code: 'ME', performance_level: 'ME', minimum_score: 50, maximum_score: 79, points: 3, remarks: 'Meeting Expectations' },
  ];

  interface RecordedText {
    text: string | string[];
    x: number;
    y: number;
    fontStyle: string;
    fontSize: number;
  }

  function interceptPdfDoc(): { doc: jsPDF; texts: RecordedText[] } {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: false });
    const texts: RecordedText[] = [];
    const origText = doc.text.bind(doc);

    doc.text = function (text: any, x?: any, y?: any, options?: any) {
      const font = doc.getFont();
      texts.push({
        text,
        x: typeof x === 'number' ? x : 0,
        y: typeof y === 'number' ? y : 0,
        fontStyle: font.fontStyle,
        fontSize: doc.getFontSize(),
      });
      return (origText as any)(text, x, y, options);
    } as any;

    return { doc, texts };
  }

  it('1. Verifies Class Teacher remarks render bold name prefix without repeating "Class Teacher" role label', async () => {
    const { doc, texts } = interceptPdfDoc();
    const ctCommentText = 'Your positive results in Agriculture provide a good baseline, while guided practice in Mathematics will help elevate your overall subject average.';
    const hoiCommentText = 'Official approval granted with encouragement to consolidate core concepts and strive for greater academic consistency.';

    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent],
      nextTermOpeningDate: '15th September 2026',
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: 'Tr. Mr. Brian',
        class_teacher_comment: ctCommentText,
        hoi_name: 'Dr. Jane Muthoni',
        hoi_comment: hoiCommentText,
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Section headers must remain intact
    const hasCtHeading = texts.some(
      (t) => typeof t.text === 'string' && t.text === "CLASS TEACHER'S REMARKS" && t.fontStyle === 'bold'
    );
    expect(hasCtHeading).toBe(true);

    const hasHoiHeading = texts.some(
      (t) => typeof t.text === 'string' && t.text === 'HEAD OF INSTITUTION REMARKS' && t.fontStyle === 'bold'
    );
    expect(hasHoiHeading).toBe(true);

    // Assert that the redundant "Class Teacher" role label is NOT repeated in the remark body
    const hasRedundantCtLabel = texts.some(
      (t) =>
        (typeof t.text === 'string' && t.text.includes('Class Teacher (')) ||
        (Array.isArray(t.text) && t.text.some((line) => line.includes('Class Teacher (')))
    );
    expect(hasRedundantCtLabel).toBe(false);

    // Assert that the teacher's dynamic name and colon are rendered in BOLD
    const boldTeacherPrefix = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'Tr. Mr. Brian: ' && t.fontStyle === 'bold'
    );
    expect(boldTeacherPrefix).toBeDefined();

    // Assert that the comment body is rendered in NORMAL font weight
    const normalCommentPart = texts.find(
      (t) =>
        t.fontStyle === 'normal' &&
        (typeof t.text === 'string'
          ? t.text.includes('Your positive results in Agriculture')
          : Array.isArray(t.text) && t.text.some((line) => line.includes('Your positive results in Agriculture')))
    );
    expect(normalCommentPart).toBeDefined();
  });

  it('2. Verifies Head of Institution remarks render comment directly without redundant role or name prefix', async () => {
    const { doc, texts } = interceptPdfDoc();
    const hoiCommentText = 'Official approval granted with encouragement to consolidate core concepts and strive for greater academic consistency.';

    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent],
      nextTermOpeningDate: '15th September 2026',
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: 'T. M. Brian',
        class_teacher_comment: 'Consistent academic dedication and steady mastery across learning areas.',
        hoi_name: 'Dr. Jane Muthoni',
        hoi_comment: hoiCommentText,
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Redundant role label "Head of Institution" must NOT be in any text under the remarks
    const hasRedundantHoiPrefix = texts.some(
      (t) =>
        (typeof t.text === 'string' && (t.text.includes('Head of Institution (') || t.text.startsWith('Head of Institution:'))) ||
        (Array.isArray(t.text) && t.text.some((line) => line.includes('Head of Institution (') || line.startsWith('Head of Institution:')))
    );
    expect(hasRedundantHoiPrefix).toBe(false);

    // The comment itself must be rendered in normal font style, preserving original wording
    const renderedHoiComment = texts.find(
      (t) =>
        t.fontStyle === 'normal' &&
        (typeof t.text === 'string'
          ? t.text === hoiCommentText
          : Array.isArray(t.text) && t.text.join(' ') === hoiCommentText)
    );
    expect(renderedHoiComment).toBeDefined();
  });

  it('3. Verifies missing teacher name is handled gracefully without empty colon or role duplication', async () => {
    const { doc, texts } = interceptPdfDoc();
    const ctCommentText = 'The learner shows good developmental milestones in all learning activities.';

    const reportData: PDFReportData = {
      student: mockStudent,
      school: mockSchool,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [], // No teacher assigned
      allStudents: [mockStudent],
      nextTermOpeningDate: '15th September 2026',
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: '', // Empty teacher name
        class_teacher_comment: ctCommentText,
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // No bold colon or prefix like ": " or "Class Teacher:"
    const hasAwkwardPrefix = texts.some(
      (t) => typeof t.text === 'string' && (t.text === ': ' || t.text === 'Class Teacher: ' || t.text.includes('Class Teacher ('))
    );
    expect(hasAwkwardPrefix).toBe(false);

    // The comment itself is rendered in normal font
    const renderedComment = texts.find(
      (t) =>
        t.fontStyle === 'normal' &&
        (typeof t.text === 'string'
          ? t.text.includes('developmental milestones')
          : Array.isArray(t.text) && t.text.some((line) => line.includes('developmental milestones')))
    );
    expect(renderedComment).toBeDefined();
  });

  it('4. Verifies Upper Primary, Lower Primary, and Pre-Primary reports also benefit from the fix', async () => {
    const confirmedDate = '15th September 2026';
    const ctCommentText = 'Commendable effort shown throughout the term with steady competence.';
    const hoiCommentText = 'Approved with congratulations for strong foundation.';

    // Upper Primary
    const upIntercept = interceptPdfDoc();
    await generateUpperPrimaryReportPDF({
      student: { ...mockStudent, grade: 'Grade 5', class_id: 'cls-g5' },
      school: mockSchool,
      exam: { ...mockExam, education_level: 'Upper Primary' },
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent],
      nextTermOpeningDate: confirmedDate,
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: 'Tr. Mr. Brian',
        class_teacher_comment: ctCommentText,
        hoi_comment: hoiCommentText,
      },
    }, upIntercept.doc);

    expect(
      upIntercept.texts.some(t => typeof t.text === 'string' && t.text === 'Tr. Mr. Brian: ' && t.fontStyle === 'bold')
    ).toBe(true);
    expect(
      upIntercept.texts.some(t => typeof t.text === 'string' && t.text.includes('Class Teacher ('))
    ).toBe(false);
    expect(
      upIntercept.texts.some(t => typeof t.text === 'string' && t.text.includes('Head of Institution ('))
    ).toBe(false);

    // Lower Primary
    const lpIntercept = interceptPdfDoc();
    await generateLowerPrimaryReportPDF({
      student: { ...mockStudent, grade: 'Grade 2', class_id: 'cls-g2' },
      school: mockSchool,
      exam: { ...mockExam, education_level: 'Lower Primary' },
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent],
      nextTermOpeningDate: confirmedDate,
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: 'Tr. Mr. Brian',
        class_teacher_comment: ctCommentText,
        hoi_comment: hoiCommentText,
      },
    }, lpIntercept.doc);

    expect(
      lpIntercept.texts.some(t => typeof t.text === 'string' && t.text === 'Tr. Mr. Brian: ' && t.fontStyle === 'bold')
    ).toBe(true);

    // Pre-Primary
    const ppIntercept = interceptPdfDoc();
    await generatePrePrimaryReportPDF({
      student: { ...mockStudent, grade: 'PP1', class_id: 'cls-pp1' },
      school: mockSchool,
      exam: { ...mockExam, education_level: 'Pre-Primary' },
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent],
      nextTermOpeningDate: confirmedDate,
      savedRemarks: {
        student_id: mockStudent.id,
        exam_id: mockExam.id,
        class_teacher_name: 'Tr. Mr. Brian',
        class_teacher_comment: ctCommentText,
        hoi_comment: hoiCommentText,
      },
    }, ppIntercept.doc);

    expect(
      ppIntercept.texts.some(t => typeof t.text === 'string' && t.text === 'Tr. Mr. Brian: ' && t.fontStyle === 'bold')
    ).toBe(true);
  });
});

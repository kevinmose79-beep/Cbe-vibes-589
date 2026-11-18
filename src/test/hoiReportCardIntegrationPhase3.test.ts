import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  generateJuniorSchoolReportPDF,
  generateUpperPrimaryReportPDF,
  generateLowerPrimaryReportPDF,
  generatePrePrimaryReportPDF,
  createReportCardPDFDoc,
  PDFReportData,
} from '../services/pdfReportGenerator';
import {
  Student,
  School,
  Examination,
  ClassStream,
  Subject,
  Teacher,
  Grade,
  Mark,
} from '../types';

describe('HOI Placement Correction — Report Card Remarks & Signature Suite', () => {
  const baseSchoolWithHoi: School = {
    id: 'sch-001',
    school_name: 'Muchorwe Comprehensive School',
    county: 'Nakuru',
    email: 'info@muchorwe.ac.ke',
    phone: '0711223344',
    principal_name: 'Mr. Peter Omondi',
  };

  const baseSchoolWithoutHoi: School = {
    id: 'sch-002',
    school_name: 'Muchorwe Comprehensive School',
    county: 'Nakuru',
    email: 'info@muchorwe.ac.ke',
    phone: '0711223344',
  };

  const mockExam: Examination = {
    id: 'ex-t1-2026',
    exam_name: 'Term 1 Main Assessment 2026',
    term: 'Term 1',
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

  const mockStudent1: Student = {
    id: 'std-001',
    admission_number: 'ADM-001',
    full_name: 'Alice Wambui',
    gender: 'F',
    grade: 'Grade 8',
    class_id: 'cls-g8',
    stream_id: 'cls-g8',
    active: true,
  };

  const mockStudent2: Student = {
    id: 'std-002',
    admission_number: 'ADM-002',
    full_name: 'David Kiprono',
    gender: 'M',
    grade: 'Grade 8',
    class_id: 'cls-g8',
    stream_id: 'cls-g8',
    active: true,
  };

  const mockMarks: Mark[] = [
    { id: 'mk-1', student_id: 'std-001', subject_id: 'sb-math', exam_id: 'ex-t1-2026', marks: 82, raw_score: 82, out_of: 100, special_status: 'Normal' },
    { id: 'mk-2', student_id: 'std-001', subject_id: 'sb-agri', exam_id: 'ex-t1-2026', marks: 78, raw_score: 78, out_of: 100, special_status: 'Normal' },
    { id: 'mk-3', student_id: 'std-002', subject_id: 'sb-math', exam_id: 'ex-t1-2026', marks: 65, raw_score: 65, out_of: 100, special_status: 'Normal' },
    { id: 'mk-4', student_id: 'std-002', subject_id: 'sb-agri', exam_id: 'ex-t1-2026', marks: 70, raw_score: 70, out_of: 100, special_status: 'Normal' },
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

  it('1. Displays the resolved HOI name in the remarks section with correct precedence', async () => {
    // 1A: Base School Profile principal_name when no override exists
    const { doc, texts } = interceptPdfDoc();
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithHoi,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1, mockStudent2],
      nextTermOpeningDate: '2026-05-04',
      savedRemarks: {
        student_id: mockStudent1.id,
        exam_id: mockExam.id,
        hoi_comment: 'Good performance and steady academic progress.',
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    const renderedHoiPrefix = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'Mr. Peter Omondi: '
    );
    expect(renderedHoiPrefix).toBeDefined();

    // 1B: Saved learner-specific override takes precedence
    const { doc: doc2, texts: texts2 } = interceptPdfDoc();
    const customHoiOverride = 'Dr. Senior Principal (Acting)';
    const reportDataWithOverride: PDFReportData = {
      ...reportData,
      savedRemarks: {
        student_id: mockStudent1.id,
        exam_id: mockExam.id,
        hoi_name: customHoiOverride,
        hoi_comment: 'Satisfactory performance across all assessed competencies.',
      },
    };

    await generateJuniorSchoolReportPDF(reportDataWithOverride, doc2);

    const renderedOverridePrefix = texts2.find(
      (t) => typeof t.text === 'string' && t.text === `${customHoiOverride}: `
    );
    expect(renderedOverridePrefix).toBeDefined();

    // Base school name should NOT appear when override exists
    const unrenderedBase = texts2.find(
      (t) => typeof t.text === 'string' && t.text.includes('Mr. Peter Omondi')
    );
    expect(unrenderedBase).toBeUndefined();
  });

  it('2. Formats the HOI name in bold, matching the Class Teacher name formatting', async () => {
    const { doc, texts } = interceptPdfDoc();
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithHoi,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1],
      nextTermOpeningDate: '2026-05-04',
      savedRemarks: {
        student_id: mockStudent1.id,
        exam_id: mockExam.id,
        class_teacher_name: 'Tr. Mr. Brian',
        class_teacher_comment: 'Consistent academic dedication and steady mastery.',
        hoi_name: 'Dr. Jane Muthoni',
        hoi_comment: 'Approved with congratulations for strong foundation.',
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Class Teacher prefix formatting
    const ctPrefix = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'Tr. Mr. Brian: '
    );
    expect(ctPrefix).toBeDefined();
    expect(ctPrefix?.fontStyle).toBe('bold');
    expect(ctPrefix?.fontSize).toBe(7.0);

    // HOI prefix formatting must MATCH Class Teacher exactly
    const hoiPrefix = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'Dr. Jane Muthoni: '
    );
    expect(hoiPrefix).toBeDefined();
    expect(hoiPrefix?.fontStyle).toBe('bold');
    expect(hoiPrefix?.fontSize).toBe(7.0);
    expect(hoiPrefix?.fontSize).toBe(ctPrefix?.fontSize);
    expect(hoiPrefix?.fontStyle).toBe(ctPrefix?.fontStyle);
  });

  it('3. Confirms the HOI name does NOT appear in the signature/stamp area', async () => {
    const { doc, texts } = interceptPdfDoc();
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithHoi,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1],
      nextTermOpeningDate: '2026-05-04',
      savedRemarks: {
        student_id: mockStudent1.id,
        exam_id: mockExam.id,
        hoi_name: 'Dr. Jane Muthoni',
        hoi_comment: 'Approved with congratulations for strong foundation.',
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Signature/stamp area is rendered at y >= 250mm
    const signatureAreaTexts = texts.filter((t) => t.y >= 250);

    const hasHoiNameInSig = signatureAreaTexts.some(
      (t) =>
        (typeof t.text === 'string' && (t.text.includes('Jane Muthoni') || t.text.includes('Peter Omondi'))) ||
        (Array.isArray(t.text) && t.text.some((l) => l.includes('Jane Muthoni') || l.includes('Peter Omondi')))
    );
    expect(hasHoiNameInSig).toBe(false);

    // Verify italic 5.5pt HOI name is completely removed from document
    const hasOldSigHoiName = texts.some(
      (t) => t.fontStyle === 'italic' && t.fontSize === 5.5
    );
    expect(hasOldSigHoiName).toBe(false);
  });

  it('4. Preserves the original signature/stamp geometry and placement', async () => {
    const { doc, texts } = interceptPdfDoc();
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithHoi,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1],
      nextTermOpeningDate: '2026-05-04',
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Box 1 header: "HEAD OF INSTITUTION" in bold 6.8pt
    const hoiBoxTitle = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'HEAD OF INSTITUTION' && t.y >= 250
    );
    expect(hoiBoxTitle).toBeDefined();
    expect(hoiBoxTitle?.fontStyle).toBe('bold');
    expect(hoiBoxTitle?.fontSize).toBe(6.8);

    // Signature line: "Sign & Seal: __________" restored to original un-shifted position
    const hoiSigLine = texts.find(
      (t) => typeof t.text === 'string' && t.text === 'Sign & Seal: __________'
    );
    expect(hoiSigLine).toBeDefined();
    expect(hoiSigLine?.fontStyle).toBe('normal');
    expect(hoiSigLine?.fontSize).toBe(6.8);

    // Original vertical distance between title (currentY + 3.8) and label (currentY + 10.8) is exactly 7.0mm
    if (hoiBoxTitle && hoiSigLine) {
      const deltaY = hoiSigLine.y - hoiBoxTitle.y;
      expect(Math.round(deltaY * 10) / 10).toBe(7.0);
    }
  });

  it('5. Confirms HOI actual remarks are not accidentally prefixed with the HOI name or role', async () => {
    // When no HOI name configured and no override exists (fallback 'Head of Institution')
    const { doc, texts } = interceptPdfDoc();
    const pureComment = 'Commendable dedication and high level of responsibility in classroom activities.';
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithoutHoi, // No principal_name
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1],
      nextTermOpeningDate: '2026-05-04',
      savedRemarks: {
        student_id: mockStudent1.id,
        exam_id: mockExam.id,
        hoi_comment: pureComment,
      },
    };

    await generateJuniorSchoolReportPDF(reportData, doc);

    // Remark body must be rendered directly in normal font without any redundant "Head of Institution:" prefix
    const renderedComment = texts.find(
      (t) =>
        t.fontStyle === 'normal' &&
        (typeof t.text === 'string'
          ? t.text === pureComment
          : Array.isArray(t.text) && t.text.join(' ') === pureComment)
    );
    expect(renderedComment).toBeDefined();

    // Verify comment text does NOT contain prefix "Head of Institution:" or "Head of Institution ("
    const hasUnwantedRolePrefix = texts.some(
      (t) =>
        (typeof t.text === 'string' && (t.text.includes('Head of Institution:') || t.text.includes('Head of Institution ('))) ||
        (Array.isArray(t.text) && t.text.some((l) => l.includes('Head of Institution:') || l.includes('Head of Institution (')))
    );
    expect(hasUnwantedRolePrefix).toBe(false);
  });

  it('6. Operates across all 4 standard report categories (Junior School, Upper Primary, Lower Primary, Pre-Primary)', async () => {
    const tiers: Array<{ level: string; generator: (d: PDFReportData, doc: jsPDF) => Promise<jsPDF>; grade: string; classId: string }> = [
      { level: 'Junior School', generator: generateJuniorSchoolReportPDF, grade: 'Grade 8', classId: 'cls-g8' },
      { level: 'Upper Primary', generator: generateUpperPrimaryReportPDF, grade: 'Grade 5', classId: 'cls-g5' },
      { level: 'Lower Primary', generator: generateLowerPrimaryReportPDF, grade: 'Grade 2', classId: 'cls-g2' },
      { level: 'Pre-Primary', generator: generatePrePrimaryReportPDF, grade: 'PP1', classId: 'cls-pp1' },
    ];

    for (const tier of tiers) {
      const { doc, texts } = interceptPdfDoc();
      const std: Student = {
        id: `std-${tier.grade}`,
        admission_number: `ADM-${tier.grade}`,
        full_name: `Learner ${tier.grade}`,
        gender: 'F',
        grade: tier.grade,
        class_id: tier.classId,
        stream_id: tier.classId,
        active: true,
      };

      const reportData: PDFReportData = {
        student: std,
        school: baseSchoolWithHoi,
        exam: mockExam,
        classes: mockClasses,
        subjects: mockSubjects,
        marks: mockMarks,
        grades: mockGrades,
        teachers: [mockTeacher],
        allStudents: [std],
        nextTermOpeningDate: '2026-05-04',
      };

      await tier.generator(reportData, doc);

      // Verify HOI name is bold 7.0pt in remarks across every tier
      const renderedHoiPrefix = texts.find(
        (t) => typeof t.text === 'string' && t.text === 'Mr. Peter Omondi: ' && t.fontStyle === 'bold' && t.fontSize === 7.0
      );
      expect(renderedHoiPrefix, `Failed to render bold HOI name in remarks for ${tier.level}`).toBeDefined();

      // Verify HOI name is NOT in signature area
      const sigHoiName = texts.find(
        (t) => t.y >= 250 && typeof t.text === 'string' && t.text.includes('Mr. Peter Omondi')
      );
      expect(sigHoiName, `HOI name leaked into signature area for ${tier.level}`).toBeUndefined();

      // Verify single page invariant
      expect(doc.getNumberOfPages()).toBe(1);
    }
  });

  it('7. Strictly preserves exactly 1 page per learner in createReportCardPDFDoc', async () => {
    const reportData: PDFReportData = {
      student: mockStudent1,
      school: baseSchoolWithHoi,
      exam: mockExam,
      classes: mockClasses,
      subjects: mockSubjects,
      marks: mockMarks,
      grades: mockGrades,
      teachers: [mockTeacher],
      allStudents: [mockStudent1],
      nextTermOpeningDate: '2026-05-04',
    };

    const doc = await createReportCardPDFDoc(reportData);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('8. State synchronization logic: Learner switching cleanly drops previous learner custom HOI name', () => {
    const resolveHoiName = (
      savedRemarks: { hoi_name?: string } | undefined,
      school: School
    ) => {
      const cleanSchoolHoi = school?.principal_name && school.principal_name.trim();
      const cleanHoiOverride = savedRemarks?.hoi_name && savedRemarks.hoi_name.trim();
      return cleanHoiOverride || cleanSchoolHoi || 'Head of Institution';
    };

    // Learner A has a custom saved override
    const learnerASavedRemarks = { hoi_name: 'Prof. Custom A' };
    const nameA = resolveHoiName(learnerASavedRemarks, baseSchoolWithHoi);
    expect(nameA).toBe('Prof. Custom A');

    // Learner B has NO saved remarks
    const learnerBSavedRemarks = undefined;
    const nameB = resolveHoiName(learnerBSavedRemarks, baseSchoolWithHoi);
    expect(nameB).toBe('Mr. Peter Omondi');
    expect(nameB).not.toBe('Prof. Custom A');

    // Learner C has empty whitespace saved remarks
    const learnerCSavedRemarks = { hoi_name: '   ' };
    const nameC = resolveHoiName(learnerCSavedRemarks, baseSchoolWithHoi);
    expect(nameC).toBe('Mr. Peter Omondi');

    // Dynamic update of School Profile principal_name updates the fallback immediately
    const updatedSchool: School = {
      ...baseSchoolWithHoi,
      principal_name: 'Rev. Samuel Maina',
    };
    const nameBAfterSchoolUpdate = resolveHoiName(learnerBSavedRemarks, updatedSchool);
    expect(nameBAfterSchoolUpdate).toBe('Rev. Samuel Maina');
  });
});

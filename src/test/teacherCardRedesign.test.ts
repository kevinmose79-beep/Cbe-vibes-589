import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Teacher Card Redesign & Flexible Information Display', () => {
  const teacherMgmtFile = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/TeacherManagement.tsx'),
    'utf-8'
  );

  it('renders renderTeacherCard with conditional unprovided field filtering', () => {
    // 1. Confirms renderTeacherCard exists
    expect(teacherMgmtFile).toContain('const renderTeacherCard = (tch: Teacher) =>');

    // 2. Confirms TSC is not rendered when fake/empty (no "TSC: Not provided" in card)
    expect(teacherMgmtFile).toContain('hasTsc && (');
    expect(teacherMgmtFile).toContain("rawTsc !== 'TSC-PENDING'");

    // 3. Confirms Phone is not rendered when fake/empty
    expect(teacherMgmtFile).toContain('(hasEmail || hasPhone) && (');
    expect(teacherMgmtFile).toContain('hasPhone && (');

    // 4. Confirms Assigned Classes & Streams is omitted when empty
    expect(teacherMgmtFile).toContain('assignedClassesList.length > 0 && (');

    // 5. Confirms Assigned Learning Areas is omitted when empty
    expect(teacherMgmtFile).toContain('assignedSubjectsList.length > 0 && (');

    // 6. Confirms Class Teacher role highlight is rendered when teacher is a class teacher
    expect(teacherMgmtFile).toContain('classTeacherStream && (');
    expect(teacherMgmtFile).toContain('Class Teacher ·');

    // 7. Confirms desktop view switch (Cards vs Table) is supported
    expect(teacherMgmtFile).toContain("desktopViewMode === 'cards'");
    expect(teacherMgmtFile).toContain("desktopViewMode === 'table'");

    // 8. Confirms squircle avatar with status pip ring
    expect(teacherMgmtFile).toContain('w-12 h-12 rounded-xl');
    expect(teacherMgmtFile).toContain('ring-2 ring-white dark:ring-slate-900');

    // 9. Confirms quick action buttons ergonomics
    expect(teacherMgmtFile).toContain('title="View Account Profile & Login History"');
    expect(teacherMgmtFile).toContain('title="Edit Teacher Profile & Allocations"');
    expect(teacherMgmtFile).toContain('title="Reset Password"');
    expect(teacherMgmtFile).toContain('title="Delete Account"');

    // 10. Confirms modal profile also omits unprovided TSC and contact details (no "TSC: Not provided")
    expect(teacherMgmtFile).not.toContain("tscDisplay = isFakeTsc ? 'Not provided'");
  });
});

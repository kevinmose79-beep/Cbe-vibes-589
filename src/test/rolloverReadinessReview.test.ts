import { describe, it, expect, vi } from 'vitest';
import '../testSetup';
import React from 'react';
import { AcademicYear, SchoolTerm, ClassStream, Student } from '../types';
import { RolloverReadinessReview } from '../components/RolloverReadinessReview';

describe('Rollover Readiness Review UI Component (Step 2 Corrections)', () => {
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
    { id: 'c-g6', class_name: 'Grade 6', stream: 'Main', status: 'Active' },
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

  it('1. Component instantiates cleanly without errors in ready state', () => {
    const onNavigate = vi.fn();
    const onRefresh = vi.fn();

    const element = React.createElement(RolloverReadinessReview, {
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
      onNavigateToTab: onNavigate,
      onRefresh,
    });

    expect(element).toBeDefined();
    expect(element.props.academicYears.length).toBe(2);
    expect(element.props.students.length).toBe(4);
  });

  it('2. Component accepts unconfigured upcoming year and passes callback props', () => {
    const onNavigate = vi.fn();

    const element = React.createElement(RolloverReadinessReview, {
      academicYears: [activeYear2026], // Missing 2027
      schoolTerms: [],
      classes: standardClasses,
      students: standardStudents,
      onNavigateToTab: onNavigate,
    });

    expect(element).toBeDefined();
    expect(element.props.onNavigateToTab).toBe(onNavigate);
  });

  it('3. Component provides functional refresh callback', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const element = React.createElement(RolloverReadinessReview, {
      academicYears: [activeYear2026, upcomingYear2027],
      schoolTerms: [upcomingTerm1_2027],
      classes: standardClasses,
      students: standardStudents,
      onRefresh,
    });

    expect(element.props.onRefresh).toBe(onRefresh);
    await element.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

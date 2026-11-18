import { describe, it, expect } from 'vitest';

describe('Admin Learner Assessment Summary Header Layout & Formatting', () => {
  const getLearnerInitials = (fullName?: string): string => {
    if (!fullName) return 'L';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'L';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  it('1. correctly formats two-word learner initials', () => {
    expect(getLearnerInitials('BRALINE CHEPKORIR')).toBe('BC');
    expect(getLearnerInitials('Alice Wambui')).toBe('AW');
    expect(getLearnerInitials('John Doe')).toBe('JD');
  });

  it('2. correctly handles multi-word names (first and last letter monogram)', () => {
    expect(getLearnerInitials('Mary Jane Watson')).toBe('MW');
    expect(getLearnerInitials('David Kiprono Koech')).toBe('DK');
  });

  it('3. gracefully falls back for single-word or empty names', () => {
    expect(getLearnerInitials('Cheruiyot')).toBe('CH');
    expect(getLearnerInitials('')).toBe('L');
    expect(getLearnerInitials(undefined)).toBe('L');
  });
});

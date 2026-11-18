import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  getClockFormatPreference,
  setClockFormatPreference,
  formatTimeByPreference,
  CLOCK_FORMAT_STORAGE_KEY,
  DEFAULT_CLOCK_FORMAT,
  ClockFormatPreference,
} from '../utils/clockPreferenceUtils';
import { ROLE_ALLOWED_TABS, isTabAllowedForRole } from '../utils/rbacUtils';
import { User } from '../types';

describe('CBE HUB Clock Format Preference — Phase 1 Setting & Persistence', () => {
  beforeEach(() => {
    safeLocalStorage.removeItem(CLOCK_FORMAT_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('1. Defaults strictly to 24-hour format ("24h") when no preference is saved', () => {
    expect(safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY)).toBeNull();
    const current = getClockFormatPreference();
    expect(current).toBe('24h');
    expect(current).toBe(DEFAULT_CLOCK_FORMAT);
  });

  it('2. Loads an existing saved "12h" preference correctly from persistent storage', () => {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '12h');
    const current = getClockFormatPreference();
    expect(current).toBe('12h');
  });

  it('3. Loads an existing saved "24h" preference correctly from persistent storage', () => {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '24h');
    const current = getClockFormatPreference();
    expect(current).toBe('24h');
  });

  it('4. Reverts safely to "24h" default if invalid or corrupted data is found in storage', () => {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, 'invalid_format_xyz');
    expect(getClockFormatPreference()).toBe('24h');

    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '');
    expect(getClockFormatPreference()).toBe('24h');
  });

  it('5. Successfully saves "12h" preference and verifies persistent storage', () => {
    const result = setClockFormatPreference('12h');
    expect(result.success).toBe(true);
    expect(result.format).toBe('12h');
    expect(safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY)).toBe('12h');
    expect(getClockFormatPreference()).toBe('12h');
  });

  it('6. Successfully saves "24h" preference and verifies persistent storage', () => {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '12h');
    const result = setClockFormatPreference('24h');
    expect(result.success).toBe(true);
    expect(result.format).toBe('24h');
    expect(safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY)).toBe('24h');
    expect(getClockFormatPreference()).toBe('24h');
  });

  it('7. Rejects invalid formats without modifying storage', () => {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '24h');
    const result = setClockFormatPreference('invalid' as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid clock format preference');
    expect(safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY)).toBe('24h');
  });

  it('8. Handles persistence failures gracefully without reporting false success', () => {
    // Simulate safeLocalStorage.setItem failure or mock throw
    vi.spyOn(safeLocalStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError: Local storage is full');
    });

    const result = setClockFormatPreference('12h');
    expect(result.success).toBe(false);
    expect(result.error).toContain('QuotaExceededError');
  });

  it('9. Formats time correctly with leading zeroes for 24-hour display ("HH:MM:SS")', () => {
    const testDateMorning = new Date(2026, 9, 29, 9, 5, 8); // 09:05:08
    const formatted24h = formatTimeByPreference(testDateMorning, '24h');
    expect(formatted24h).toBe('09:05:08');

    const testDateAfternoon = new Date(2026, 9, 29, 14, 25, 45); // 14:25:45
    expect(formatTimeByPreference(testDateAfternoon, '24h')).toBe('14:25:45');

    const midnight = new Date(2026, 9, 29, 0, 0, 0); // 00:00:00
    expect(formatTimeByPreference(midnight, '24h')).toBe('00:00:00');
  });

  it('10. Formats time correctly with leading zeroes and AM/PM for 12-hour display ("HH:MM:SS AM/PM")', () => {
    const testDateMorning = new Date(2026, 9, 29, 9, 5, 8); // 09:05:08 AM
    const formatted12hMorning = formatTimeByPreference(testDateMorning, '12h');
    expect(formatted12hMorning).toMatch(/09:05:08\s?AM/i);

    const testDateAfternoon = new Date(2026, 9, 29, 14, 25, 45); // 02:25:45 PM
    const formatted12hAfternoon = formatTimeByPreference(testDateAfternoon, '12h');
    expect(formatted12hAfternoon).toMatch(/02:25:45\s?PM/i);
  });

  it('11. Enforces Role-Based Access Control: system-settings is restricted to administrators only', () => {
    const adminUser: User = {
      id: 'admin-1',
      name: 'System Administrator',
      email: 'admin@cbe.school.ke',
      role: 'admin',
    };

    const classTeacherUser: User = {
      id: 'ct-1',
      name: 'Class Teacher',
      email: 'teacher@cbe.school.ke',
      role: 'class_teacher',
    };

    const subjectTeacherUser: User = {
      id: 'st-1',
      name: 'Subject Teacher',
      email: 'subject@cbe.school.ke',
      role: 'subject_teacher',
    };

    const learnerUser: User = {
      id: 'lrn-1',
      name: 'Learner User',
      email: 'learner@cbe.school.ke',
      role: 'learner',
    };

    // Role-allowed tabs verification
    expect(ROLE_ALLOWED_TABS.admin).toContain('system-settings');
    expect(ROLE_ALLOWED_TABS.class_teacher).not.toContain('system-settings');
    expect(ROLE_ALLOWED_TABS.subject_teacher).not.toContain('system-settings');
    expect(ROLE_ALLOWED_TABS.learner).not.toContain('system-settings');

    // Tab authorization check verification
    expect(isTabAllowedForRole(adminUser, 'system-settings', null, [])).toBe(true);
    expect(isTabAllowedForRole(classTeacherUser, 'system-settings', null, [])).toBe(false);
    expect(isTabAllowedForRole(subjectTeacherUser, 'system-settings', null, [])).toBe(false);
    expect(isTabAllowedForRole(learnerUser, 'system-settings', null, [])).toBe(false);
  });
});

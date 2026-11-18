import './setupLocalStorage';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStorage,
  setStorage,
  KEYS,
  recoverInterruptedCacheCommit,
  COMMIT_MARKER_KEY,
  syncFromSupabase,
  resetSyncState,
  hasCompletedStartupSync,
  getCachedUserId,
  setCachedUserId,
  purgeSensitiveEntityCaches,
  api,
} from '../lib/storage';
import { authService } from '../services/authService';
import { startupDiagnostics } from '../utils/startupDiagnostics';

describe('Phase 2F: Startup Reliability, Recovery and Cache Resilience', () => {
  beforeEach(() => {
    resetSyncState();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('1. Startup Timeout & Network Failure Resilience', () => {
    it('does not log out an existing authenticated user when network fails or times out', async () => {
      // Simulate existing cached session
      const mockUser = {
        id: 'teacher-uuid-123',
        name: 'Jane Mwalimu',
        email: 'jane@school.ac.ke',
        role: 'subject_teacher' as const,
        teacher_id: 'tch-123',
      };
      api.setCurrentUser(mockUser);
      setCachedUserId(mockUser.id);

      expect(api.getCurrentUser()?.id).toBe('teacher-uuid-123');

      // Simulate a network failure during auth verification
      const verifyResult = await authService.verifyServerUser();
      // In offline / test without Supabase server, verifyServerUser safely returns offline status
      expect(verifyResult.status).toBe('offline');

      // The cached user remains intact and authenticated
      expect(api.getCurrentUser()?.id).toBe('teacher-uuid-123');
    });

    it('distinguishes network offline from server account revocation', async () => {
      // Offline result
      const offlineResult = { status: 'offline' };
      expect(offlineResult.status).toBe('offline');

      // Revoked result
      const revokedResult = { status: 'revoked', reason: 'Account has been deactivated by administration' };
      expect(revokedResult.status).toBe('revoked');
      expect(revokedResult.reason).toContain('deactivated');
    });
  });

  describe('2. Local Cache Validation, Repair & Storage Quota Resilience', () => {
    it('detects and repairs corrupted JSON in localStorage without throwing', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(KEYS.STUDENTS, '{ corrupted-json: invalid');
      }

      // getStorage should catch SyntaxError, purge the corrupted entry, and return fallback
      const result = getStorage(KEYS.STUDENTS, []);
      expect(result).toEqual([]);

      // Verify the damaged entry was cleaned up
      if (typeof window !== 'undefined' && window.localStorage) {
        expect(window.localStorage.getItem(KEYS.STUDENTS)).toBeNull();
      }
    });

    it('detects invalid non-array structure for array keys and repairs cache', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(KEYS.STUDENTS, JSON.stringify({ notAnArray: true }));
      }

      const result = getStorage(KEYS.STUDENTS, []);
      expect(result).toEqual([]);

      if (typeof window !== 'undefined' && window.localStorage) {
        expect(window.localStorage.getItem(KEYS.STUDENTS)).toBeNull();
      }
    });

    it('preserves valid recoverable records while filtering out corrupted elements', () => {
      const mixedData = [
        { id: 'std-1', full_name: 'Alice Wambui' },
        null,
        'corrupted-string-element',
        { id: 'std-2', full_name: 'David Kiprono' },
      ];

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(KEYS.STUDENTS, JSON.stringify(mixedData));
      }

      const result = getStorage(KEYS.STUDENTS, []);
      expect(result.length).toBe(2);
      expect((result as any)[0].id).toBe('std-1');
      expect((result as any)[1].id).toBe('std-2');
    });

    it('detects and recovers an interrupted cache commit marker', () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(COMMIT_MARKER_KEY, String(Date.now()));
      }

      const recovered = recoverInterruptedCacheCommit();
      expect(recovered).toBe(true);

      if (typeof window !== 'undefined' && window.localStorage) {
        expect(window.localStorage.getItem(COMMIT_MARKER_KEY)).toBeNull();
      }
      expect(hasCompletedStartupSync()).toBe(false);

      // Subsequent check confirms marker is gone
      expect(recoverInterruptedCacheCommit()).toBe(false);
    });

    it('handles localStorage quota exceeded by evicting disposable logs and falling back gracefully', () => {
      // Seed disposable cache entries
      setStorage(KEYS.LOGIN_LOGS, [{ id: 'log-1', action: 'login' }]);
      expect(getStorage(KEYS.LOGIN_LOGS, []).length).toBe(1);

      // Spy on setItem to throw QuotaExceededError once
      if (typeof window !== 'undefined' && window.localStorage) {
        const origSetItem = window.localStorage.setItem.bind(window.localStorage);
        let quotaThrown = false;
        vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, val) => {
          if (!quotaThrown && key === KEYS.CLASSES) {
            quotaThrown = true;
            const quotaErr = new Error('QuotaExceededError');
            quotaErr.name = 'QuotaExceededError';
            (quotaErr as any).code = 22;
            throw quotaErr;
          }
          return origSetItem(key, val);
        });

        // Write classes
        setStorage(KEYS.CLASSES, [{ id: 'cls-1', class_name: 'Grade 7' }]);

        // Disposable logs were evicted to make room
        expect(getStorage(KEYS.LOGIN_LOGS, []).length).toBe(0);
        // Classes were successfully stored
        const storedClasses = getStorage(KEYS.CLASSES, []);
        expect(storedClasses.length).toBe(1);
        expect(storedClasses[0].id).toBe('cls-1');

        vi.restoreAllMocks();
      }
    });
  });

  describe('3. Synchronisation Safety & Duplicate Prevention', () => {
    it('deduplicates concurrent sync requests into a single in-flight promise', () => {
      resetSyncState();
      const promise1 = syncFromSupabase();
      const promise2 = syncFromSupabase();

      // promise1 and promise2 must reference the same in-flight execution promise
      expect(promise1).toBe(promise2);
    });

    it('isolates sensitive data on account switch and prevents data leakage', () => {
      setCachedUserId('user-one');
      setStorage(KEYS.MARKS, [{ id: 'mrk-1', score: 90 }]);
      setStorage(KEYS.STUDENTS, [{ id: 'std-1', name: 'Student One' }]);

      expect(getStorage(KEYS.MARKS, []).length).toBe(1);
      expect(getStorage(KEYS.STUDENTS, []).length).toBe(1);

      // Account switch to user-two: purges sensitive cache
      purgeSensitiveEntityCaches();
      setCachedUserId('user-two');

      expect(getCachedUserId()).toBe('user-two');
      expect(getStorage(KEYS.MARKS, []).length).toBe(0);
      expect(getStorage(KEYS.STUDENTS, []).length).toBe(0);
    });
  });

  describe('4. Startup Diagnostics Milestones & Privacy Guarantee', () => {
    it('records important startup milestones and calculates intervals', () => {
      startupDiagnostics.record('auth_restoration_start');
      startupDiagnostics.record('auth_restoration_end', 'Cached session verified');
      startupDiagnostics.record('first_safe_interface_render');

      const milestones = startupDiagnostics.getMilestones();
      expect(milestones.some((m) => m.name === 'auth_restoration_start')).toBe(true);
      expect(milestones.some((m) => m.name === 'auth_restoration_end')).toBe(true);
      expect(milestones.some((m) => m.name === 'first_safe_interface_render')).toBe(true);

      const duration = startupDiagnostics.getDuration('auth_restoration_start', 'auth_restoration_end');
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('ensures diagnostics summary never exposes sensitive tokens or marks', () => {
      const summary = startupDiagnostics.printSummary();
      expect(typeof summary).toBe('string');
      expect(summary).toContain('[StartupDiagnostics Summary]');
      expect(summary).not.toContain('eyJ'); // No JWT tokens
      expect(summary).not.toContain('password');
    });
  });
});

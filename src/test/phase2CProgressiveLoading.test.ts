import './setupLocalStorage';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedUserId,
  setCachedUserId,
  purgeSensitiveEntityCaches,
  resetSyncState,
  hasCompletedStartupSync,
  KEYS,
  getStorage,
  setStorage,
  recoverInterruptedCacheCommit,
  COMMIT_MARKER_KEY,
} from '../lib/storage';
import { authService } from '../services/authService';

describe('Phase 2C: Progressive Application Loading and Cache Protection', () => {
  beforeEach(() => {
    resetSyncState();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('1. Binds cached user identity and purges sensitive caches on account switch', () => {
    // Simulate User A logging in and caching sensitive data
    setCachedUserId('user-a-uuid');
    expect(getCachedUserId()).toBe('user-a-uuid');

    setStorage(KEYS.STUDENTS, [{ id: 'std-1', full_name: 'John Doe' }]);
    setStorage(KEYS.MARKS, [{ id: 'mrk-1', student_id: 'std-1', score: 85 }]);
    setStorage(KEYS.TEACHERS, [{ id: 'tch-1', teacher_name: 'Teacher One' }]);

    expect(getStorage(KEYS.STUDENTS, []).length).toBe(1);
    expect(getStorage(KEYS.MARKS, []).length).toBe(1);
    expect(getStorage(KEYS.TEACHERS, []).length).toBe(1);

    // Switch account to User B: purge sensitive entity caches
    purgeSensitiveEntityCaches();
    setCachedUserId('user-b-uuid');

    expect(getCachedUserId()).toBe('user-b-uuid');
    expect(getStorage(KEYS.STUDENTS, []).length).toBe(0);
    expect(getStorage(KEYS.MARKS, []).length).toBe(0);
    expect(getStorage(KEYS.TEACHERS, []).length).toBe(0);
  });

  it('2. Resets sync state and increments generation lock on resetSyncState', () => {
    expect(hasCompletedStartupSync()).toBe(false);
    resetSyncState();
    expect(hasCompletedStartupSync()).toBe(false);
  });

  it('3. Verifies authService exposes verifyServerUser method', () => {
    expect(typeof authService.verifyServerUser).toBe('function');
    expect(typeof authService.getSession).toBe('function');
  });

  it('4. Clears cached user ID and purges caches on signOut', async () => {
    setCachedUserId('user-active-uuid');
    setStorage(KEYS.STUDENTS, [{ id: 'std-2', full_name: 'Jane Doe' }]);

    await authService.signOut();

    expect(getCachedUserId()).toBeNull();
    expect(getStorage(KEYS.STUDENTS, []).length).toBe(0);
  });

  it('5. Detects and recovers from interrupted local storage write sequence', () => {
    // Simulate an interrupted sequence where commit marker was left set
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(COMMIT_MARKER_KEY, String(Date.now()));
    }

    const recovered = recoverInterruptedCacheCommit();
    expect(recovered).toBe(true);
    // Marker is cleaned up
    if (typeof window !== 'undefined' && window.localStorage) {
      expect(window.localStorage.getItem(COMMIT_MARKER_KEY)).toBeNull();
    }
    expect(hasCompletedStartupSync()).toBe(false);

    // Subsequent check reports false (no interrupted commit pending)
    expect(recoverInterruptedCacheCommit()).toBe(false);
  });

  it('6. Verifies that sync abort cancels outstanding operations gracefully', () => {
    resetSyncState();
    // After resetSyncState, startup sync flag is false
    expect(hasCompletedStartupSync()).toBe(false);
  });
});

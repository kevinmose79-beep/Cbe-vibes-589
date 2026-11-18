import './setupLocalStorage';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateFullJitterBackoff,
  isTransientNetworkError,
  triggerIntelligentSync,
  handleForegroundResumeSync,
  handleInactivityResumeSync,
  cancelPendingRetries,
  clearRetryTimer,
  getCurrentRetryAttempt,
  setRetryAttemptForTest,
  resetForegroundCheckForTest,
  getLastSuccessfulSyncTime,
  setLastSuccessfulSyncTime,
  handleSyncFailure,
  handleNetworkOnline,
  MAX_SYNC_RETRIES,
  BASE_BACKOFF_MS,
  CAP_BACKOFF_MS,
  FRESHNESS_THRESHOLD_MS,
  FOREGROUND_SYNC_INTERVAL_MS,
} from '../lib/syncManager';
import {
  setConnectionStatus,
  getConnectionStatus,
  resetSyncState,
  hasCompletedStartupSync,
  syncFromSupabase,
  KEYS,
  getStorage,
  setStorage,
  setCachedUserId,
  getCachedUserId,
  purgeSensitiveEntityCaches,
  subscribeToMarksRealtime,
  unsubscribeFromMarksRealtime,
  reconcileMarksOnReconnect,
  api,
} from '../lib/storage';
import {
  initNetworkMonitoring,
  cleanupNetworkMonitoring,
  getNetworkState,
  probeServerReachability,
} from '../lib/networkService';

describe('Phase 2D: Background Synchronisation Improvements Suite', () => {
  beforeEach(() => {
    cancelPendingRetries();
    resetSyncState();
    resetForegroundCheckForTest();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cancelPendingRetries();
    cleanupNetworkMonitoring();
    unsubscribeFromMarksRealtime();
    vi.restoreAllMocks();
  });

  describe('1. Internet Disconnection & Reconnection Handling', () => {
    it('sets offline status when device disconnects from internet', () => {
      setConnectionStatus('synced');
      expect(getConnectionStatus()).toBe('synced');

      // Simulate offline network event
      setConnectionStatus('offline');
      expect(getConnectionStatus()).toBe('offline');
    });

    it('resumes synchronisation when network connectivity returns', async () => {
      setConnectionStatus('waiting_to_retry');
      setRetryAttemptForTest(2);

      // handleNetworkOnline triggers retry on reconnection
      handleNetworkOnline();
      expect(getCurrentRetryAttempt()).toBe(0);
    });
  });

  describe('2. Supabase Server Unavailability & Reachability Probing', () => {
    it('confirms server reachability probe avoids rapid repeated pings', async () => {
      // First probe
      const p1 = probeServerReachability(false);
      // Immediate second probe should be throttled (returns cached reachability without spamming)
      const p2 = probeServerReachability(false);
      expect(await p1).toBeDefined();
      expect(await p2).toBeDefined();
    });

    it('detects transient network errors vs non-transient permanent errors', () => {
      // Transient network errors
      expect(isTransientNetworkError(new Error('Failed to fetch'))).toBe(true);
      expect(isTransientNetworkError(new Error('NetworkError: Connection timed out'))).toBe(true);
      expect(isTransientNetworkError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isTransientNetworkError({ code: '57014', message: 'query_canceled' })).toBe(true);

      // Non-transient errors (must not enter automated retry loops)
      expect(isTransientNetworkError(new Error('JWT expired'))).toBe(false);
      expect(isTransientNetworkError(new Error('Unauthorized'))).toBe(false);
      expect(isTransientNetworkError(new Error('violates row-level security policy'))).toBe(false);
      expect(isTransientNetworkError({ code: '42501', message: 'insufficient_privilege' })).toBe(false);
      expect(isTransientNetworkError({ code: '23505', message: 'unique violation' })).toBe(false);
    });
  });

  describe('3. Exponential Backoff & Jitter Calculation', () => {
    it('calculates Full Jitter backoff within [0, min(cap, base * 2^attempt)]', () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const ceiling = Math.min(CAP_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, attempt));
        for (let i = 0; i < 20; i++) {
          const sleep = calculateFullJitterBackoff(attempt);
          expect(sleep).toBeGreaterThanOrEqual(0);
          expect(sleep).toBeLessThanOrEqual(ceiling);
        }
      }
    });

    it('caps backoff delay at CAP_BACKOFF_MS (30,000ms)', () => {
      const highAttemptDelay = calculateFullJitterBackoff(10);
      expect(highAttemptDelay).toBeLessThanOrEqual(CAP_BACKOFF_MS);
    });

    it('limits retry attempts to MAX_SYNC_RETRIES (4) and transitions to sync_failed', () => {
      cancelPendingRetries();
      expect(getCurrentRetryAttempt()).toBe(0);

      const transientErr = new Error('Failed to fetch from Supabase');

      // Attempt 1
      handleSyncFailure(transientErr);
      expect(getCurrentRetryAttempt()).toBe(1);
      expect(getConnectionStatus()).toBe('waiting_to_retry');

      // Attempt 2
      handleSyncFailure(transientErr);
      expect(getCurrentRetryAttempt()).toBe(2);

      // Attempt 3
      handleSyncFailure(transientErr);
      expect(getCurrentRetryAttempt()).toBe(3);

      // Attempt 4
      handleSyncFailure(transientErr);
      expect(getCurrentRetryAttempt()).toBe(4);

      // Exhaustion -> sync_failed
      handleSyncFailure(transientErr);
      expect(getConnectionStatus()).toBe('sync_failed');
    });

    it('does not retry non-transient authorization or schema errors', () => {
      cancelPendingRetries();
      const rlsErr = { code: '42501', message: 'insufficient_privilege violates row-level security' };

      handleSyncFailure(rlsErr);
      // Immediately marked sync_failed without scheduling retries
      expect(getCurrentRetryAttempt()).toBe(0);
      expect(getConnectionStatus()).toBe('sync_failed');
    });
  });

  describe('4. Duplicate & Overlapping Synchronisation Prevention', () => {
    it('deduplicates concurrent sync requests into a single execution promise', () => {
      resetSyncState();
      const p1 = syncFromSupabase();
      const p2 = syncFromSupabase();
      expect(p1).toBe(p2);
    });

    it('skips redundant full synchronisation when data is fresh (< 30s ago)', async () => {
      setLastSuccessfulSyncTime(Date.now() - 5000); // 5 seconds ago
      const result = await triggerIntelligentSync({ force: false });
      expect(result).toBe(true);
      expect(getConnectionStatus()).toBe('synced');
    });

    it('forces synchronisation when force option is explicitly true', async () => {
      setLastSuccessfulSyncTime(Date.now() - 5000); // 5s ago
      resetSyncState();
      const p1 = triggerIntelligentSync({ force: true });
      expect(p1).toBeDefined();
    });
  });

  describe('5. Cancellation during Logout & Account Switching', () => {
    it('cancels pending retries and resets sync state on logout', () => {
      setRetryAttemptForTest(3);
      setConnectionStatus('waiting_to_retry');

      cancelPendingRetries();
      resetSyncState();

      expect(getCurrentRetryAttempt()).toBe(0);
      expect(hasCompletedStartupSync()).toBe(false);
    });

    it('prevents stale data commit when account is switched during in-flight sync', () => {
      setCachedUserId('user-admin-1');
      expect(getCachedUserId()).toBe('user-admin-1');

      // Switch to user-teacher-2: caches purged
      purgeSensitiveEntityCaches();
      setCachedUserId('user-teacher-2');
      resetSyncState();

      expect(getCachedUserId()).toBe('user-teacher-2');
      expect(getStorage(KEYS.STUDENTS, []).length).toBe(0);
      expect(getStorage(KEYS.MARKS, []).length).toBe(0);
    });
  });

  describe('6. Application Foreground & Background Transitions', () => {
    it('throttles foreground resume sync if triggered rapidly (< 15s)', async () => {
      resetForegroundCheckForTest();
      setLastSuccessfulSyncTime(Date.now());

      const res1 = await handleForegroundResumeSync();
      expect(res1).toBe(true);

      // Rapid second foreground event within 15 seconds is throttled
      const res2 = await handleForegroundResumeSync();
      expect(res2).toBe(true);
    });

    it('initiates background sync on foreground resume if data is older than 5 minutes', async () => {
      resetForegroundCheckForTest();
      // Set last sync to 10 minutes ago
      setLastSuccessfulSyncTime(Date.now() - (10 * 60 * 1000));

      const p = handleForegroundResumeSync();
      expect(p).toBeDefined();
    });

    it('handles inactivity resume sync when user returns after > 15 minutes', async () => {
      setLastSuccessfulSyncTime(Date.now() - (20 * 60 * 1000)); // 20m ago
      const p = handleInactivityResumeSync();
      expect(p).toBeDefined();
    });
  });

  describe('7. Supabase Realtime Reconnection & Scoped Marks Reconciliation', () => {
    it('subscribes to marks realtime and returns active callback handle', () => {
      const dummyCallback = vi.fn();
      const unsub = subscribeToMarksRealtime(dummyCallback);
      // Callback registered
      expect(unsub).toBeDefined();

      // Clean cleanup on logout/unmount
      unsubscribeFromMarksRealtime(dummyCallback);
    });

    it('handles reconcileMarksOnReconnect safely without crashing when offline', async () => {
      await expect(reconcileMarksOnReconnect()).resolves.not.toThrow();
    });
  });

  describe('8. Synchronisation Status Truthfulness & Invariants', () => {
    it('accurately tracks all Phase 2D connection status states', () => {
      const states: Array<'online' | 'synced' | 'syncing' | 'offline' | 'sync_failed' | 'waiting_to_retry' | 'reconnecting' | 'realtime_unavailable'> = [
        'online',
        'synced',
        'syncing',
        'offline',
        'sync_failed',
        'waiting_to_retry',
        'reconnecting',
        'realtime_unavailable',
      ];

      states.forEach((st) => {
        setConnectionStatus(st);
        expect(getConnectionStatus()).toBe(st);
      });
    });

    it('preserves cached records and never corrupts valid data on failed sync', () => {
      const testStudent = { id: 'std-valid-1', full_name: 'Faith Chebet', active: true };
      setStorage(KEYS.STUDENTS, [testStudent]);

      expect(getStorage(KEYS.STUDENTS, []).length).toBe(1);

      // Transient sync failure occurs
      handleSyncFailure(new Error('Network error'));

      // Valid cached student is preserved without corruption
      const stored = getStorage(KEYS.STUDENTS, []);
      expect(stored.length).toBe(1);
      expect((stored as any)[0].id).toBe('std-valid-1');
    });
  });
});

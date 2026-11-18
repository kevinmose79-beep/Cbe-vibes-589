import {
  syncFromSupabase,
  setConnectionStatus,
  getConnectionStatus,
  ConnectionStatus,
  resetSyncState,
  api,
} from './storage';
import { safeLocalStorage } from '../utils/safeStorage';
import { startupDiagnostics } from '../utils/startupDiagnostics';
import { subscribeToNetworkState, getNetworkState } from './networkService';

export const LAST_SYNC_KEY = 'cbe_last_sync_timestamp';
export const MAX_SYNC_RETRIES = 4;
export const BASE_BACKOFF_MS = 1500;
export const CAP_BACKOFF_MS = 30000;
export const FRESHNESS_THRESHOLD_MS = 30000; // 30 seconds debounce window for non-forced syncs
export const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let currentRetryAttempt = 0;
let pendingRetryTimer: any = null;
let lastForegroundSyncCheck = 0;
let isNetworkListenerSubscribed = false;

/**
 * Calculates Full Jitter backoff according to AWS Architecture / Marc Brooker research:
 * sleep = random_between(0, min(cap, base * 2^attempt))
 *
 * This prevents the "thundering herd" retry storms by uniformly distributing retry requests across time.
 */
export function calculateFullJitterBackoff(
  attempt: number,
  baseMs = BASE_BACKOFF_MS,
  capMs = CAP_BACKOFF_MS
): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 10));
  const exponentialCap = Math.min(capMs, baseMs * Math.pow(2, safeAttempt));
  return Math.floor(Math.random() * (exponentialCap + 1));
}

export function isDeviceOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Distinguishes temporary network/server failures from permanent auth, permission, or validation errors.
 * Never retries operations that cannot succeed without user or administrator intervention.
 */
export function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.details || err || '').toLowerCase();
  const code = String(err.code || '');

  // Permanent / non-retryable authentication, authorization, or schema errors
  if (
    msg.includes('jwt expired') ||
    msg.includes('invalid claim') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('permission denied') ||
    msg.includes('violates row-level security') ||
    msg.includes('auth/invalid') ||
    msg.includes('invalid credentials') ||
    msg.includes('user not found') ||
    msg.includes('revoked') ||
    code === 'PGRST301' || // JWT expired
    code === '42501' ||    // insufficient_privilege
    code === '23505'       // unique_violation
  ) {
    return false;
  }

  // Transient network, timeout, or server unavailable errors
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('service unavailable') ||
    code === '57014' || // query_canceled
    !isDeviceOnline()
  );
}

/**
 * Retrieves the timestamp of the last successful full database synchronisation.
 */
export function getLastSuccessfulSyncTime(): number | null {
  try {
    const raw = safeLocalStorage.getItem(LAST_SYNC_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      return isNaN(parsed) ? null : parsed;
    }
  } catch {}
  return null;
}

/**
 * Persists the timestamp of the last successful full database synchronisation.
 */
export function setLastSuccessfulSyncTime(timestamp: number): void {
  try {
    safeLocalStorage.setItem(LAST_SYNC_KEY, String(timestamp));
  } catch {}
}

/**
 * Clears the active retry timer without resetting the attempt count.
 */
export function clearRetryTimer(): void {
  if (pendingRetryTimer) {
    clearTimeout(pendingRetryTimer);
    pendingRetryTimer = null;
  }
}

/**
 * Clears any scheduled retry timers and completely resets the retry counter.
 * Called upon successful sync, explicit user cancellation, or logout.
 */
export function cancelPendingRetries(): void {
  clearRetryTimer();
  currentRetryAttempt = 0;
}

export function getCurrentRetryAttempt(): number {
  return currentRetryAttempt;
}

export function setRetryAttemptForTest(attempt: number): void {
  currentRetryAttempt = attempt;
}

export function resetForegroundCheckForTest(): void {
  lastForegroundSyncCheck = 0;
}

/**
 * Handles synchronisation failures, distinguishing between transient and permanent errors.
 * Schedules exponential backoff with jitter when appropriate.
 */
export function handleSyncFailure(err: any): void {
  clearRetryTimer();

  if (!isDeviceOnline()) {
    setConnectionStatus('offline');
    return;
  }

  const isTransient = isTransientNetworkError(err);
  if (!isTransient) {
    console.warn('[SyncManager] Non-transient or authentication error encountered; skipping automated retries:', err);
    setConnectionStatus('sync_failed');
    return;
  }

  if (currentRetryAttempt < MAX_SYNC_RETRIES) {
    const delayMs = calculateFullJitterBackoff(currentRetryAttempt);
    currentRetryAttempt++;
    setConnectionStatus('waiting_to_retry');
    startupDiagnostics.record(
      'recovery_invoked',
      `Scheduled sync retry attempt ${currentRetryAttempt}/${MAX_SYNC_RETRIES} in ${delayMs}ms`
    );
    console.log(
      `[SyncManager] Transient sync error. Retrying in ${delayMs}ms (Attempt ${currentRetryAttempt}/${MAX_SYNC_RETRIES})...`
    );

    pendingRetryTimer = setTimeout(() => {
      pendingRetryTimer = null;
      triggerIntelligentSync({ isRetry: true, force: true }).catch((retryErr) => {
        console.warn('[SyncManager] Scheduled retry attempt failed:', retryErr);
      });
    }, delayMs);
  } else {
    console.warn(`[SyncManager] Exhausted all ${MAX_SYNC_RETRIES} sync retry attempts.`);
    setConnectionStatus('sync_failed');
    startupDiagnostics.record('recovery_invoked', `Exhausted ${MAX_SYNC_RETRIES} sync retries; marked sync_failed`);
  }
}

/**
 * Executes a background synchronisation with deduplication, freshness check, and error handling.
 */
export async function triggerIntelligentSync(options?: {
  force?: boolean;
  isRetry?: boolean;
}): Promise<boolean> {
  if (!isDeviceOnline()) {
    setConnectionStatus('offline');
    return false;
  }

  // Freshness check: if data was successfully synced less than 30 seconds ago, skip redundant download
  if (!options?.force && !options?.isRetry) {
    const lastSync = getLastSuccessfulSyncTime();
    if (lastSync && Date.now() - lastSync < FRESHNESS_THRESHOLD_MS) {
      console.log('[SyncManager] Data is fresh (synced < 30s ago); skipping redundant full download.');
      setConnectionStatus('synced');
      return true;
    }
  }

  try {
    const succeeded = await syncFromSupabase({ ...options, throwOnError: true });
    if (succeeded) {
      cancelPendingRetries();
      setLastSuccessfulSyncTime(Date.now());
      setConnectionStatus('synced');
      return true;
    } else {
      // Sync returned false (superseded, aborted, or empty)
      return false;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted')) {
      console.log('[SyncManager] Sync cancelled or aborted gracefully.');
      return false;
    }
    handleSyncFailure(err);
    return false;
  }
}

/**
 * Handles Android lifecycle foreground resume.
 * Debounces foreground sync checks to avoid redundant sync storms if user toggles apps rapidly.
 */
export async function handleForegroundResumeSync(): Promise<boolean> {
  const now = Date.now();
  if (now - lastForegroundSyncCheck < 15000) {
    console.log('[SyncManager] Foreground resume check throttled (< 15s since last check).');
    return true;
  }
  lastForegroundSyncCheck = now;

  const lastSync = getLastSuccessfulSyncTime();
  const shouldSync = !lastSync || now - lastSync > FOREGROUND_SYNC_INTERVAL_MS;

  if (shouldSync) {
    console.log('[SyncManager] Foreground resume: data older than 5m, initiating background sync.');
    return triggerIntelligentSync({ force: false });
  }

  return true;
}

/**
 * Handles inactivity recovery: when an idle user returns after > 15 minutes,
 * re-verify data freshness from the server.
 */
export async function handleInactivityResumeSync(): Promise<boolean> {
  const now = Date.now();
  const lastSync = getLastSuccessfulSyncTime();
  if (!lastSync || now - lastSync > 15 * 60 * 1000) {
    console.log('[SyncManager] Inactivity resume: data older than 15m, initiating background sync.');
    return triggerIntelligentSync({ force: false });
  }
  return true;
}

/**
 * Triggered when network returns and server reachability is verified.
 * Resumes any paused retries and synchronises fresh state from Supabase.
 */
export function handleNetworkOnline(): void {
  if (!isDeviceOnline()) return;

  const currentStatus = getConnectionStatus();
  if (
    currentStatus === 'offline' ||
    currentStatus === 'waiting_to_retry' ||
    currentStatus === 'sync_failed' ||
    currentRetryAttempt > 0
  ) {
    console.log('[SyncManager] Network online restored; resuming background sync...');
    cancelPendingRetries();
    triggerIntelligentSync({ force: true, isRetry: true }).catch(() => {});
  }
}

/**
 * Set up network state listener so network restoration triggers background sync.
 */
export function initSyncManagerNetworkBinding(): () => void {
  if (isNetworkListenerSubscribed) return () => {};
  isNetworkListenerSubscribed = true;

  return subscribeToNetworkState((state) => {
    if (state.isConnected && state.isServerReachable) {
      handleNetworkOnline();
    } else if (!state.isConnected) {
      setConnectionStatus('offline');
    }
  });
}

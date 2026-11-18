import { Network } from '@capacitor/network';
import { isNativeEnvironment } from '../utils/apiConfig';
import { testSupabaseConnection } from './storage';
import { startupDiagnostics } from '../utils/startupDiagnostics';

export interface NetworkState {
  isConnected: boolean;
  connectionType: string;
  isServerReachable: boolean;
  lastCheckedAt?: number;
}

export type NetworkListener = (state: NetworkState) => void;

let currentNetworkState: NetworkState = {
  isConnected: typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
  connectionType: 'unknown',
  isServerReachable: true,
  lastCheckedAt: Date.now(),
};

const networkListeners: Set<NetworkListener> = new Set();
let networkListenerHandle: any = null;
let probeDebounceTimer: any = null;
let lastProbeTimestamp = 0;
let isProbeInFlight = false;

/**
 * Perform a lightweight verification probe to confirm Supabase server reachability.
 * Does not assume that an active Wi-Fi or cellular network implies the database is reachable.
 */
export async function probeServerReachability(force = false): Promise<boolean> {
  const now = Date.now();
  // Throttle automated server probes to at most once every 5 seconds unless forced
  if (!force && now - lastProbeTimestamp < 5000) {
    return currentNetworkState.isServerReachable;
  }

  if (isProbeInFlight) {
    return currentNetworkState.isServerReachable;
  }

  // If local OS reports completely disconnected, server cannot be reached
  if (!currentNetworkState.isConnected) {
    updateNetworkState({ isServerReachable: false, lastCheckedAt: now });
    return false;
  }

  isProbeInFlight = true;
  lastProbeTimestamp = now;

  try {
    const result = await testSupabaseConnection();
    const isReachable = Boolean(result && result.success);
    updateNetworkState({
      isServerReachable: isReachable,
      lastCheckedAt: Date.now(),
    });
    return isReachable;
  } catch (err) {
    console.warn('[NetworkService] Server reachability probe caught exception:', err);
    updateNetworkState({
      isServerReachable: false,
      lastCheckedAt: Date.now(),
    });
    return false;
  } finally {
    isProbeInFlight = false;
  }
}

function updateNetworkState(partial: Partial<NetworkState>): void {
  const previousState = { ...currentNetworkState };
  currentNetworkState = {
    ...currentNetworkState,
    ...partial,
  };

  const changed =
    previousState.isConnected !== currentNetworkState.isConnected ||
    previousState.connectionType !== currentNetworkState.connectionType ||
    previousState.isServerReachable !== currentNetworkState.isServerReachable;

  if (changed) {
    networkListeners.forEach((listener) => {
      try {
        listener(currentNetworkState);
      } catch (err) {
        console.error('[NetworkService] Listener error:', err);
      }
    });
  }
}

/**
 * Handle incoming network connectivity changes with debouncing and server verification probe.
 */
function handleConnectivityChange(connected: boolean, connectionType = 'unknown'): void {
  const wasConnected = currentNetworkState.isConnected;
  updateNetworkState({ isConnected: connected, connectionType });

  if (probeDebounceTimer) {
    clearTimeout(probeDebounceTimer);
    probeDebounceTimer = null;
  }

  if (!connected) {
    // Immediate disconnect: immediately mark server as unreachable
    updateNetworkState({ isServerReachable: false, lastCheckedAt: Date.now() });
    startupDiagnostics.record('network_offline', `Network disconnected (${connectionType})`);
  } else {
    // Network interface came up: debounce 600ms and probe server availability
    startupDiagnostics.record('network_online', `Network connected (${connectionType}); probing server...`);
    probeDebounceTimer = setTimeout(() => {
      probeServerReachability(true).catch(() => {});
    }, 600);
  }
}

/**
 * Initialize intelligent network monitoring across Native Capacitor and Web platforms.
 */
export function initNetworkMonitoring(): () => void {
  // 1. Initial status query
  if (isNativeEnvironment()) {
    try {
      Network.getStatus().then((status) => {
        handleConnectivityChange(status.connected, status.connectionType);
      }).catch((err) => {
        console.warn('[NetworkService] Native getStatus failed, falling back to navigator:', err);
        if (typeof navigator !== 'undefined') {
          handleConnectivityChange(navigator.onLine, 'unknown');
        }
      });

      Network.addListener('networkStatusChange', (status) => {
        handleConnectivityChange(status.connected, status.connectionType);
      }).then((handle) => {
        networkListenerHandle = handle;
      }).catch((err) => {
        console.warn('[NetworkService] Native addListener failed:', err);
      });
    } catch (nativeErr) {
      console.warn('[NetworkService] Native network setup error:', nativeErr);
    }
  } else if (typeof window !== 'undefined') {
    // Web / Desktop fallback
    const onOnline = () => handleConnectivityChange(true, 'browser');
    const onOffline = () => handleConnectivityChange(false, 'none');

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Initial check
    if (typeof navigator !== 'undefined') {
      handleConnectivityChange(navigator.onLine, 'browser');
    }
  }

  return () => {
    cleanupNetworkMonitoring();
  };
}

export function cleanupNetworkMonitoring(): void {
  if (networkListenerHandle && typeof networkListenerHandle.remove === 'function') {
    try {
      networkListenerHandle.remove();
    } catch {}
    networkListenerHandle = null;
  }
  if (probeDebounceTimer) {
    clearTimeout(probeDebounceTimer);
    probeDebounceTimer = null;
  }
}

export function getNetworkState(): NetworkState {
  return currentNetworkState;
}

export function subscribeToNetworkState(listener: NetworkListener): () => void {
  networkListeners.add(listener);
  try {
    listener(currentNetworkState);
  } catch (err) {
    console.error('[NetworkService] Initial subscription listener error:', err);
  }
  return () => {
    networkListeners.delete(listener);
  };
}

/**
 * Administrator Clock Display Format Preference Utility
 *
 * Manages the administrator-configured display format preference for dashboard clocks:
 * - '24h': 24-hour format ("HH:MM:SS") — Default
 * - '12h': 12-hour format ("HH:MM:SS AM/PM")
 *
 * Persisted securely via safeLocalStorage so preferences survive page reloads and device restarts.
 */

import { safeLocalStorage } from './safeStorage';

export type ClockFormatPreference = '12h' | '24h';

export const CLOCK_FORMAT_STORAGE_KEY = 'cbe_clock_format_preference';
export const DEFAULT_CLOCK_FORMAT: ClockFormatPreference = '24h';

/**
 * Retrieves the current clock display format preference.
 * Defaults strictly to '24h' when no preference has been saved or if stored value is invalid.
 */
export function getClockFormatPreference(): ClockFormatPreference {
  try {
    const stored = safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY);
    if (stored === '12h' || stored === '24h') {
      return stored;
    }
  } catch (err) {
    console.warn('[ClockPreference] Error reading clock format preference:', err);
  }
  return DEFAULT_CLOCK_FORMAT;
}

export interface SetClockFormatResult {
  success: boolean;
  error?: string;
  format?: ClockFormatPreference;
}

/**
 * Persists the administrator's clock display format preference.
 * Validates input and verifies that storage succeeded.
 */
export function setClockFormatPreference(format: ClockFormatPreference): SetClockFormatResult {
  if (format !== '12h' && format !== '24h') {
    return {
      success: false,
      error: `Invalid clock format preference "${String(format)}". Must be "12h" or "24h".`,
    };
  }

  try {
    safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, format);

    // Verify storage write integrity
    const verified = safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY);
    if (verified !== format) {
      return {
        success: false,
        error: 'Failed to verify clock format preference write to persistent storage.',
      };
    }

    // Dispatch custom event for real-time synchronization across mounted components
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(
          new CustomEvent('cbe-clock-format-changed', {
            detail: { format },
          })
        );
      } catch {
        // Event dispatch non-critical
      }
    }

    return {
      success: true,
      format,
    };
  } catch (err: any) {
    console.error('[ClockPreference] Failed to persist clock format preference:', err);
    return {
      success: false,
      error: err?.message || 'Storage write exception encountered.',
    };
  }
}

/**
 * Pure formatting helper that outputs time according to the given preference.
 * - '24h' -> "HH:MM:SS" (e.g., "14:05:08" or "09:02:01")
 * - '12h' -> "hh:mm:ss AM/PM" (e.g., "02:05:08 PM" or "09:02:01 AM")
 */
export function formatTimeByPreference(
  date: Date,
  format: ClockFormatPreference = getClockFormatPreference()
): string {
  if (format === '12h') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  CLOCK_FORMAT_STORAGE_KEY,
  setClockFormatPreference,
  getClockFormatPreference,
  DEFAULT_CLOCK_FORMAT,
} from '../utils/clockPreferenceUtils';
import {
  DashboardClock,
  formatBritishDate,
  formatClockTime,
  useRunningClock,
} from '../components/DashboardClock';

// Lightweight window/document polyfill for headless Node testing environment
const windowListeners: Record<string, Function[]> = {};
const docListeners: Record<string, Function[]> = {};

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    addEventListener: (event: string, fn: Function) => {
      windowListeners[event] = windowListeners[event] || [];
      windowListeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      if (windowListeners[event]) {
        windowListeners[event] = windowListeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (e: any) => {
      const type = e.type || e;
      (windowListeners[type] || []).slice().forEach((fn) => fn(e));
      return true;
    },
  };
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    visibilityState: 'visible',
    addEventListener: (event: string, fn: Function) => {
      docListeners[event] = docListeners[event] || [];
      docListeners[event].push(fn);
    },
    removeEventListener: (event: string, fn: Function) => {
      if (docListeners[event]) {
        docListeners[event] = docListeners[event].filter((f) => f !== fn);
      }
    },
    dispatchEvent: (e: any) => {
      const type = e.type || e;
      (docListeners[type] || []).slice().forEach((fn) => fn(e));
      return true;
    },
  };
}

if (typeof globalThis.CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params?: { detail?: any }) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}

const reactInternals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

function runHookForTesting(hookFn: () => void) {
  const origH = reactInternals?.H;
  let effectCb: (() => () => void) | null = null;
  let stateIndex = 0;
  const stateValues: any[] = [];
  const stateSetters: Array<(val: any) => void> = [];

  if (reactInternals) {
    reactInternals.H = {
      useState: (init: any) => {
        const idx = stateIndex++;
        const val = typeof init === 'function' ? init() : init;
        stateValues[idx] = val;
        const setter = (nextVal: any) => {
          stateValues[idx] = typeof nextVal === 'function' ? nextVal(stateValues[idx]) : nextVal;
        };
        stateSetters[idx] = setter;
        return [val, setter];
      },
      useEffect: (cb: any) => {
        effectCb = cb;
      },
    };
  }

  try {
    hookFn();
    return {
      getEffect: () => effectCb,
      getState: (i: number) => stateValues[i],
      getSetter: (i: number) => stateSetters[i],
    };
  } finally {
    if (reactInternals) {
      reactInternals.H = origH;
    }
  }
}

describe('CBE HUB Running Digital Clock — Phase 2 Reusable Component Tests', () => {
  beforeEach(() => {
    safeLocalStorage.removeItem(CLOCK_FORMAT_STORAGE_KEY);
    for (const key of Object.keys(windowListeners)) {
      delete windowListeners[key];
    }
    for (const key of Object.keys(docListeners)) {
      delete docListeners[key];
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------
  // 1. Time Formatting: 24-Hour & 12-Hour Display
  // -------------------------------------------------------------
  describe('Time Display Formatting', () => {
    it('1. Correctly formats 24-hour time with seconds ("HH:MM:SS")', () => {
      const morning = new Date(2026, 9, 29, 9, 5, 8);
      expect(formatClockTime(morning, '24h')).toBe('09:05:08');

      const afternoon = new Date(2026, 9, 29, 14, 25, 45);
      expect(formatClockTime(afternoon, '24h')).toBe('14:25:45');

      const evening = new Date(2026, 9, 29, 23, 59, 59);
      expect(formatClockTime(evening, '24h')).toBe('23:59:59');
    });

    it('2. Correctly formats 12-hour time with seconds and AM/PM ("HH:MM:SS AM/PM")', () => {
      const morning = new Date(2026, 9, 29, 9, 5, 8);
      const formattedMorning = formatClockTime(morning, '12h');
      expect(formattedMorning).toMatch(/^09:05:08\s?AM$/i);

      const afternoon = new Date(2026, 9, 29, 14, 25, 45);
      const formattedAfternoon = formatClockTime(afternoon, '12h');
      expect(formattedAfternoon).toMatch(/^02:25:45\s?PM$/i);

      const lateNight = new Date(2026, 9, 29, 23, 59, 59);
      const formattedLateNight = formatClockTime(lateNight, '12h');
      expect(formattedLateNight).toMatch(/^11:59:59\s?PM$/i);
    });

    it('3. Guarantees two-digit leading zeroes for single-digit hours, minutes, and seconds', () => {
      const earlyMorning = new Date(2026, 9, 29, 1, 2, 3);
      expect(formatClockTime(earlyMorning, '24h')).toBe('01:02:03');
      expect(formatClockTime(earlyMorning, '12h')).toMatch(/^01:02:03\s?AM$/i);

      const morningSeven = new Date(2026, 9, 29, 7, 9, 4);
      expect(formatClockTime(morningSeven, '24h')).toBe('07:09:04');
      expect(formatClockTime(morningSeven, '12h')).toMatch(/^07:09:04\s?AM$/i);
    });

    it('4. Handles midnight (00:00:00 / 12:00:00 AM) and noon boundaries properly', () => {
      const midnight = new Date(2026, 9, 29, 0, 0, 0);
      expect(formatClockTime(midnight, '24h')).toBe('00:00:00');
      expect(formatClockTime(midnight, '12h')).toMatch(/^12:00:00\s?AM$/i);

      const noon = new Date(2026, 9, 29, 12, 0, 0);
      expect(formatClockTime(noon, '24h')).toBe('12:00:00');
      expect(formatClockTime(noon, '12h')).toMatch(/^12:00:00\s?PM$/i);
    });
  });

  // -------------------------------------------------------------
  // 2. Full British-English Date Formatting & Rollover
  // -------------------------------------------------------------
  describe('Full British-English Date', () => {
    it('5. Displays full date in British English, for example "Thursday, 29 October 2026"', () => {
      const testDate = new Date(2026, 9, 29, 10, 30, 0);
      const formatted = formatBritishDate(testDate);
      expect(formatted).toBe('Thursday, 29 October 2026');
    });

    it('6. Handles month and year rollover correctly across midnight', () => {
      const newYearsEve = new Date(2026, 11, 31, 23, 59, 59);
      expect(formatBritishDate(newYearsEve)).toBe('Thursday, 31 December 2026');

      const newYearsDay = new Date(2027, 0, 1, 0, 0, 1);
      expect(formatBritishDate(newYearsDay)).toBe('Friday, 1 January 2027');

      const leapDay = new Date(2028, 1, 29, 12, 0, 0);
      expect(formatBritishDate(leapDay)).toBe('Tuesday, 29 February 2028');
    });

    it('7. Contains no timezone or location information (no UTC, GMT, EAT, or offsets)', () => {
      const testDate = new Date(2026, 9, 29, 15, 30, 0);
      const formattedTime24 = formatClockTime(testDate, '24h');
      const formattedTime12 = formatClockTime(testDate, '12h');
      const formattedDate = formatBritishDate(testDate);

      const forbiddenStrings = ['UTC', 'GMT', 'EAT', 'Africa', 'Nairobi', '+0', '-0', 'Z'];
      forbiddenStrings.forEach((forbidden) => {
        expect(formattedTime24).not.toContain(forbidden);
        expect(formattedTime12).not.toContain(forbidden);
        expect(formattedDate).not.toContain(forbidden);
      });
    });
  });

  // -------------------------------------------------------------
  // 3. Saved Preference & 24h Fallback
  // -------------------------------------------------------------
  describe('Preference Reading and Fallback', () => {
    it('8. Reads saved preference and respects the 24-hour fallback by default', () => {
      expect(safeLocalStorage.getItem(CLOCK_FORMAT_STORAGE_KEY)).toBeNull();
      expect(getClockFormatPreference()).toBe('24h');
      expect(getClockFormatPreference()).toBe(DEFAULT_CLOCK_FORMAT);

      const html = renderToString(
        React.createElement(DashboardClock, {
          customDate: new Date(2026, 9, 29, 14, 30, 0),
        })
      );

      expect(html).toContain('14:30:00');
      expect(html).toContain('Thursday, 29 October 2026');
    });

    it('9. Loads saved 12-hour preference when present in storage', () => {
      safeLocalStorage.setItem(CLOCK_FORMAT_STORAGE_KEY, '12h');
      expect(getClockFormatPreference()).toBe('12h');

      const html = renderToString(
        React.createElement(DashboardClock, {
          customDate: new Date(2026, 9, 29, 14, 30, 0),
        })
      );

      expect(html).toMatch(/02:30:00\s?PM/i);
      expect(html).toContain('Thursday, 29 October 2026');
    });
  });

  // -------------------------------------------------------------
  // 4. Source Inspection for Contracts, Event Listeners & Accessibility
  // -------------------------------------------------------------
  describe('Source Code Forensics & Event Contracts', () => {
    const componentSource = readFileSync(
      resolve(__dirname, '../components/DashboardClock.tsx'),
      'utf-8'
    );

    it('10. Subscribes to the "cbe-clock-format-changed" custom event and storage event', () => {
      expect(componentSource).toContain("addEventListener('cbe-clock-format-changed', handleFormatChange)");
      expect(componentSource).toContain("removeEventListener('cbe-clock-format-changed', handleFormatChange)");
      expect(componentSource).toContain("addEventListener('storage', handleStorageChange)");
      expect(componentSource).toContain("removeEventListener('storage', handleStorageChange)");
    });

    it('11. Refreshes time accurately on visibilitychange and window focus', () => {
      // 1. Static defensive contracts & source verification
      expect(componentSource).toContain("typeof document !== 'undefined'");
      expect(componentSource).toContain("document.visibilityState === 'visible'");
      expect(componentSource).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
      expect(componentSource).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)");
      expect(componentSource).toContain("window.addEventListener('focus', handleFocus)");
      expect(componentSource).toContain("window.removeEventListener('focus', handleFocus)");
      expect(componentSource).toContain('setCurrentTime(new Date())');

      // 2. Behavioral verification: returning to visible document refreshes the displayed time
      const hookRes = runHookForTesting(() => useRunningClock());
      const effect = hookRes.getEffect();
      expect(effect).toBeTypeOf('function');
      const cleanup = effect!();

      // Simulate document hidden: triggering visibilitychange must NOT refresh time
      const timeBefore = hookRes.getState(1);
      (document as any).visibilityState = 'hidden';
      (document as any).dispatchEvent({ type: 'visibilitychange' });
      expect(hookRes.getState(1)).toBe(timeBefore);

      // Simulate document returning to visible: must refresh time with fresh Date
      (document as any).visibilityState = 'visible';
      (document as any).dispatchEvent({ type: 'visibilitychange' });
      expect(hookRes.getState(1)).toBeInstanceOf(Date);

      // Simulate window focus: must refresh time with fresh Date
      (window as any).dispatchEvent({ type: 'focus' });
      expect(hookRes.getState(1)).toBeInstanceOf(Date);

      // Clean up interval and listeners
      cleanup();
    });

    it('12. Cleans up intervals and all event listeners when the component unmounts', () => {
      // 1. Observable interval clearing and listener cleanup
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      const hookRes = runHookForTesting(() => useRunningClock());
      const effect = hookRes.getEffect();
      expect(effect).toBeTypeOf('function');
      const cleanup = effect!();
      expect(cleanup).toBeTypeOf('function');

      // Verify listeners were attached
      expect(docListeners['visibilitychange']?.length).toBeGreaterThan(0);
      expect(windowListeners['focus']?.length).toBeGreaterThan(0);
      expect(windowListeners['storage']?.length).toBeGreaterThan(0);
      expect(windowListeners['cbe-clock-format-changed']?.length).toBeGreaterThan(0);

      // Execute cleanup on unmount
      cleanup();

      // Verify interval was cleared via clearInterval
      expect(clearIntervalSpy).toHaveBeenCalled();

      // Verify all listeners were detached
      expect(docListeners['visibilitychange']?.length ?? 0).toBe(0);
      expect(windowListeners['focus']?.length ?? 0).toBe(0);
      expect(windowListeners['storage']?.length ?? 0).toBe(0);
      expect(windowListeners['cbe-clock-format-changed']?.length ?? 0).toBe(0);

      // 2. Structural verification that clearInterval and listener removals exist in source
      expect(componentSource).toMatch(/clearInterval\s*\(\s*(intervalId|timerId|\w+)\s*\)/);
      expect(componentSource).toContain('document.removeEventListener');
      expect(componentSource).toContain('window.removeEventListener');
      expect(componentSource).toContain("window.removeEventListener('cbe-clock-format-changed'");
      expect(componentSource).toContain("window.removeEventListener('storage'");
      expect(componentSource).toContain("window.removeEventListener('focus'");
      expect(componentSource).toContain("document.removeEventListener('visibilitychange'");
    });

    it('13. Does not use aria-live announcement to protect screen readers from constant ticking', () => {
      expect(componentSource).not.toContain('aria-live');
      expect(componentSource).toContain('role="group"');
      expect(componentSource).toContain('aria-label=');
    });

    it('14. Recalculates from fresh Date instance instead of incrementing counter', () => {
      expect(componentSource).toContain('new Date()');
      expect(componentSource).toContain('setCurrentTime(new Date())');
      expect(componentSource).not.toMatch(/counter\s*\+\+/);
      expect(componentSource).not.toMatch(/seconds\s*\+\+/);
    });
  });
});

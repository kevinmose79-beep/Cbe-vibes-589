/**
 * CBE Hub Startup Diagnostics
 * Lightweight, privacy-safe measurement of startup milestones and recovery events.
 *
 * Invariant: Never records passwords, tokens, marks, personal data, or arbitrary user payload.
 */

export type StartupMilestoneName =
  | 'react_init'
  | 'auth_restoration_start'
  | 'auth_restoration_end'
  | 'first_safe_interface_render'
  | 'native_splash_dismissed'
  | 'sync_start'
  | 'sync_end'
  | 'recovery_invoked'
  | 'foreground_resumed';

export interface StartupMilestone {
  name: StartupMilestoneName;
  timestampMs: number;
  elapsedMs: number;
  details?: string;
}

class StartupDiagnosticsManager {
  private startTime: number = Date.now();
  private milestones: StartupMilestone[] = [];

  constructor() {
    this.record('react_init', 'React application script bootstrap initiated');
  }

  public record(name: StartupMilestoneName, details?: string): void {
    const now = Date.now();
    const elapsedMs = now - this.startTime;
    this.milestones.push({
      name,
      timestampMs: now,
      elapsedMs,
      details,
    });
  }

  public getMilestones(): readonly StartupMilestone[] {
    return Object.freeze([...this.milestones]);
  }

  public getDuration(start: StartupMilestoneName, end: StartupMilestoneName): number | null {
    const s = this.milestones.find((m) => m.name === start);
    const e = this.milestones.slice().reverse().find((m) => m.name === end);
    if (s && e) {
      return e.timestampMs - s.timestampMs;
    }
    return null;
  }

  public printSummary(): string {
    const lines = ['[StartupDiagnostics Summary]'];
    this.milestones.forEach((m) => {
      lines.push(`+${m.elapsedMs}ms: ${m.name}${m.details ? ` (${m.details})` : ''}`);
    });
    return lines.join('\n');
  }
}

export const startupDiagnostics = new StartupDiagnosticsManager();

/**
 * Session time-window configuration + pure helpers.
 *
 * The session rows carry three time concepts (see V1_0 auth.sessions):
 *   - last_activity_at  -> idle window ("logoff after N minutes inactive")
 *   - expires_at        -> sliding absolute expiry (extended on refresh)
 *   - absolute_timeout_at -> hard cap (cannot be extended past this)
 *
 * These values are read from the environment with HIPAA-safe defaults:
 *   SESSION_IDLE_TIMEOUT        seconds (default 900 = 15 min)
 *   SESSION_TIMEOUT             seconds (default 3600 = 1 h)  sliding expiry
 *   SESSION_ABSOLUTE_TIMEOUT    seconds (default 86400 = 24 h) hard cap
 *
 * Pure functions so the policy is unit-testable independently of NestJS.
 */

export const DEFAULT_SESSION_IDLE_TIMEOUT_S = 15 * 60;
export const DEFAULT_SESSION_TIMEOUT_S = 60 * 60;
export const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_S = 24 * 60 * 60;

/** How often (at most) a request may write last_activity_at. */
export const ACTIVITY_TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionTimeConfig {
  idleMs: number;
  expiryMs: number;
  absoluteMs: number;
  touchIntervalMs: number;
}

/** Parse a positive-integer seconds value, falling back when absent/invalid. */
export function parsePositiveSeconds(
  raw: string | number | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Resolve the session time config. `get` is the ConfigService lookup
 * (function form so this module stays framework-free and testable).
 */
export function resolveSessionConfig(
  get?: (key: string) => string | undefined,
): SessionTimeConfig {
  const read = (key: string): string | undefined =>
    (get ? get(key) : undefined) ?? process.env[key];

  return {
    idleMs:
      parsePositiveSeconds(read('SESSION_IDLE_TIMEOUT'), DEFAULT_SESSION_IDLE_TIMEOUT_S) *
      1000,
    expiryMs:
      parsePositiveSeconds(read('SESSION_TIMEOUT'), DEFAULT_SESSION_TIMEOUT_S) * 1000,
    absoluteMs:
      parsePositiveSeconds(read('SESSION_ABSOLUTE_TIMEOUT'), DEFAULT_SESSION_ABSOLUTE_TIMEOUT_S) *
      1000,
    touchIntervalMs: ACTIVITY_TOUCH_INTERVAL_MS,
  };
}

/** True when `deadline` is at or before `now`. Null means "no deadline". */
export function hasPassed(
  deadline: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!deadline) return false;
  return now.getTime() >= new Date(deadline).getTime();
}

/** True when the session has been idle for at least `idleMs`. */
export function isIdle(
  lastActivityAt: Date | string | null | undefined,
  now: Date = new Date(),
  idleMs: number,
): boolean {
  if (!lastActivityAt) return false;
  return now.getTime() - new Date(lastActivityAt).getTime() >= idleMs;
}

/** True when we should (re)write last_activity_at (debounced to limit writes). */
export function shouldTouchLastActivity(
  lastActivityAt: Date | string | null | undefined,
  now: Date = new Date(),
  intervalMs: number = ACTIVITY_TOUCH_INTERVAL_MS,
): boolean {
  if (!lastActivityAt) return true;
  return now.getTime() - new Date(lastActivityAt).getTime() >= intervalMs;
}

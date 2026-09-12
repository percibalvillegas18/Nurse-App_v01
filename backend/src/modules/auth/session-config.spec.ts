import {
  DEFAULT_SESSION_IDLE_TIMEOUT_S,
  DEFAULT_SESSION_TIMEOUT_S,
  DEFAULT_SESSION_ABSOLUTE_TIMEOUT_S,
  ACTIVITY_TOUCH_INTERVAL_MS,
  parsePositiveSeconds,
  resolveSessionConfig,
  hasPassed,
  isIdle,
  shouldTouchLastActivity,
} from './session-config';

describe('parsePositiveSeconds', () => {
  it.each([
    ['900', 900],
    ['3600', 3600],
    [1234, 1234],
  ])('parses %p to %p', (raw, expected) => {
    expect(parsePositiveSeconds(raw as any, 0)).toBe(expected);
  });

  it.each([
    [undefined, 42],
    [null, 42],
    ['', 42],
    ['abc', 42],
    ['0', 42],
    ['-5', 42],
  ])('falls back to %p for %p', (raw, expected) => {
    expect(parsePositiveSeconds(raw as any, expected)).toBe(expected);
  });
});

describe('resolveSessionConfig', () => {
  afterEach(() => {
    delete process.env.SESSION_IDLE_TIMEOUT;
    delete process.env.SESSION_TIMEOUT;
    delete process.env.SESSION_ABSOLUTE_TIMEOUT;
  });

  it('returns HIPAA-safe defaults when nothing is configured', () => {
    const cfg = resolveSessionConfig();
    expect(cfg.idleMs).toBe(DEFAULT_SESSION_IDLE_TIMEOUT_S * 1000); // 15 min
    expect(cfg.expiryMs).toBe(DEFAULT_SESSION_TIMEOUT_S * 1000); // 1 h
    expect(cfg.absoluteMs).toBe(DEFAULT_SESSION_ABSOLUTE_TIMEOUT_S * 1000); // 24 h
    expect(cfg.touchIntervalMs).toBe(ACTIVITY_TOUCH_INTERVAL_MS);
  });

  it('reads overrides from the environment', () => {
    process.env.SESSION_IDLE_TIMEOUT = '600';
    process.env.SESSION_TIMEOUT = '7200';
    process.env.SESSION_ABSOLUTE_TIMEOUT = '43200';
    const cfg = resolveSessionConfig();
    expect(cfg.idleMs).toBe(600 * 1000);
    expect(cfg.expiryMs).toBe(7200 * 1000);
    expect(cfg.absoluteMs).toBe(43200 * 1000);
  });

  it('prefers the config getter over process.env', () => {
    process.env.SESSION_IDLE_TIMEOUT = '600';
    const cfg = resolveSessionConfig((k) =>
      k === 'SESSION_IDLE_TIMEOUT' ? '120' : undefined,
    );
    expect(cfg.idleMs).toBe(120 * 1000);
  });
});

describe('time-window helpers', () => {
  const t = (msAgo: number) => new Date(Date.now() - msAgo);

  it('hasPassed compares a deadline against now', () => {
    expect(hasPassed(t(1000))).toBe(true);
    expect(hasPassed(new Date(Date.now() + 1000))).toBe(false);
    expect(hasPassed(null)).toBe(false);
  });

  it('isIdle triggers only past the idle window', () => {
    const idleMs = 15 * 60 * 1000;
    expect(isIdle(t(idleMs + 1), new Date(), idleMs)).toBe(true);
    expect(isIdle(t(idleMs - 1), new Date(), idleMs)).toBe(false);
    expect(isIdle(null, new Date(), idleMs)).toBe(false);
  });

  it('shouldTouchLastActivity debounces writes', () => {
    expect(shouldTouchLastActivity(null)).toBe(true);
    expect(shouldTouchLastActivity(t(ACTIVITY_TOUCH_INTERVAL_MS + 1))).toBe(true);
    expect(shouldTouchLastActivity(t(ACTIVITY_TOUCH_INTERVAL_MS - 1))).toBe(false);
  });
});

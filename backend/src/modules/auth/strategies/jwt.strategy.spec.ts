/**
 * JwtStrategy - session time-window enforcement.
 * Tests validate() directly (the method Passport calls per request) with a
 * fake Prisma and ConfigService, so no passport internals are exercised.
 */
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('JwtStrategy (session time windows)', () => {
  let strategy: JwtStrategy;
  let fakePrisma: any;
  let findSession: jest.Mock;
  let updateMany: jest.Mock;

  const userRow = {
    id: 7,
    status: 'Active',
    locked_until: null,
    username: 'nurse.one',
    email: 'nurse.one@hospital.local',
    full_name: 'Nurse One',
    primary_role: { code: 'RN', name: 'Registered Nurse' },
    primary_role_id: 1,
    user_role_assignments: [],
  };

  const sessionRow = (overrides: Record<string, any> = {}) => ({
    status: 'Active',
    user_id: 7,
    expires_at: new Date(Date.now() + HOUR),
    absolute_timeout_at: new Date(Date.now() + 24 * HOUR),
    last_activity_at: new Date(),
    ...overrides,
  });

  const payload = (sessionId = 'sess_1'): JwtPayload => ({
    sub: 7,
    username: 'nurse.one',
    role: 'RN',
    primaryRoleId: 1,
    sessionId,
  });

  beforeEach(() => {
    findSession = jest.fn();
    updateMany = jest.fn(async () => ({ count: 1 }));
    fakePrisma = {
      auth_users: {
        findUnique: jest.fn(async () => userRow),
      },
      auth_sessions: {
        findUnique: findSession,
        updateMany,
      },
    };
    const fakeConfig = {
      get: (k: string) =>
        ({ JWT_SECRET: 'x'.repeat(64), SESSION_IDLE_TIMEOUT: '900' } as any)[k],
    };
    strategy = new JwtStrategy(fakeConfig as any, fakePrisma);
  });

  it('accepts an active session within all time windows', async () => {
    findSession.mockResolvedValue(sessionRow());
    const user = await strategy.validate(payload());
    expect(user.id).toBe(7);
    expect(user.username).toBe('nurse.one');
  });

  it('touches last_activity_at only when stale (debounced)', async () => {
    // Recent activity -> no write.
    findSession.mockResolvedValue(sessionRow({ last_activity_at: new Date() }));
    await strategy.validate(payload());
    expect(updateMany).not.toHaveBeenCalled();

    // Stale activity -> one write.
    findSession.mockResolvedValue(
      sessionRow({ last_activity_at: new Date(Date.now() - 2 * MINUTE) }),
    );
    await strategy.validate(payload());
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'sess_1', status: 'Active' },
      data: { last_activity_at: expect.any(Date) },
    });
  });

  it('rejects an idle session (15 min default)', async () => {
    findSession.mockResolvedValue(
      sessionRow({ last_activity_at: new Date(Date.now() - 16 * MINUTE) }),
    );
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session whose sliding expiry has passed', async () => {
    findSession.mockResolvedValue(
      sessionRow({ expires_at: new Date(Date.now() - MINUTE) }),
    );
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session past its absolute timeout', async () => {
    findSession.mockResolvedValue(
      sessionRow({ absolute_timeout_at: new Date(Date.now() - MINUTE) }),
    );
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a revoked session', async () => {
    findSession.mockResolvedValue(sessionRow({ status: 'Revoked' }));
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a session bound to a different user', async () => {
    findSession.mockResolvedValue(sessionRow({ user_id: 999 }));
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows legacy tokens without a session binding (no session check)', async () => {
    const user = await strategy.validate({
      sub: 7,
      username: 'nurse.one',
      role: 'RN',
      primaryRoleId: 1,
    });
    expect(user.id).toBe(7);
    expect(findSession).not.toHaveBeenCalled();
  });

  it('rejects a missing user', async () => {
    fakePrisma.auth_users.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

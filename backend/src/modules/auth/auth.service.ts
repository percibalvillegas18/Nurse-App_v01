import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from './prisma.service';
import { resolveJwtSecret } from '../../config/jwt.env';
import { AuditService } from '../audit/audit.service';
import {
  resolveSessionConfig,
  hasPassed,
  isIdle,
} from './session-config';
import {
  LoginThrottleService,
  LOCK_DURATION_SECONDS,
  MAX_ATTEMPTS_PER_ACCOUNT,
  MAX_ATTEMPTS_PER_IP,
} from './login-throttle.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private throttle: LoginThrottleService,
  ) {
    this.bcryptRounds = parseInt(configService.get('BCRYPT_ROUNDS', '12'), 10);
  }

  /**
   * Validate credentials.
   *
   * Throttling is per account (and per client IP for usernames that do not
   * exist) - see LoginThrottleService. It used to be one process-wide counter,
   * where five failures from anyone locked every account in the hospital for
   * ten minutes: a one-request denial of service against a clinical system.
   */
  async validateUser(username: string, password: string, ip?: string) {
    const clientIp = ip || 'unknown';

    // Validate input presence for better UX
    if (!username || username.trim() === '') {
      throw new BadRequestException('Username is required. Please enter your username or email.');
    }
    if (!password || password.trim() === '') {
      throw new BadRequestException('Password is required. Please enter your password.');
    }

    const trimmedUsername = username.trim();

    // An existing lock on this account (or on this client IP) blocks the
    // attempt before any credential check happens.
    const blocking = await this.throttle.getBlockingLock(trimmedUsername, clientIp);
    if (blocking) {
      const remainingMin = Math.ceil(blocking.remainingSeconds / 60);
      throw new ForbiddenException({
        success: false,
        errorCode: 'ACCOUNT_LOCKED',
        message:
          blocking.scope === 'account'
            ? `Too many failed attempts. This account is locked for ${remainingMin} more minute(s).`
            : `Too many failed attempts from this device. Try again in ${remainingMin} minute(s).`,
        details: {
          failedAttempts: blocking.failedAttempts,
          maxAttempts: blocking.maxAttempts,
          remainingAttempts: 0,
          remainingSeconds: blocking.remainingSeconds,
          lockedUntil: blocking.lockedUntil?.toISOString() ?? null,
          lockScope: blocking.scope,
        },
      });
    }

    const user = await this.prisma.auth_users.findFirst({
      where: {
        OR: [{ username: trimmedUsername }, { email: trimmedUsername }],
      },
      include: {
        primary_role: true,
      },
    });

    if (!user) {
      // Unknown username: throttle the client IP only, never a shared counter.
      const status = await this.throttle.registerFailure(trimmedUsername, clientIp, false);

      await this.auditService.log({
        action: 'LOGIN_FAILURE',
        entityType: 'Auth',
        description: `Login failed - user not found: ${trimmedUsername} (attempt ${status.failedAttempts}/${status.maxAttempts})`,
        status: 'Failure',
        errorMessage: 'User not found',
      });
      // The error code stays specific so the UI can highlight the right field,
      // but the message no longer confirms whether the account exists, lists
      // valid usernames, or advertises a demo password.
      throw new UnauthorizedException({
        success: false,
        errorCode: 'USER_NOT_FOUND',
        message: 'Invalid username or password.',
        details: {
          failedAttempts: status.failedAttempts,
          remainingAttempts: status.remainingAttempts,
          maxAttempts: status.maxAttempts,
          lockScope: status.scope,
        },
      });
    }

    // Durable per-account lockout persisted on the user row, so it survives a
    // restart. If the lock has expired, reset the counter (fix for the old
    // "1 attempt shows 5/5" bug).
    if (user.locked_until) {
      if (user.locked_until > new Date()) {
        const remainingMs = user.locked_until.getTime() - Date.now();
        const remainingSec = Math.ceil(remainingMs / 1000);
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new ForbiddenException({
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
          message: `This account is locked after ${MAX_ATTEMPTS_PER_ACCOUNT} failed attempts. Try again in ${remainingMin} minute(s), or ask an administrator to unlock it.`,
          details: {
            failedAttempts: user.failed_login_attempts,
            maxAttempts: MAX_ATTEMPTS_PER_ACCOUNT,
            remainingAttempts: 0,
            remainingSeconds: remainingSec,
            lockedUntil: user.locked_until.toISOString(),
            lockScope: 'account',
          },
        });
      } else {
        // Lock expired - reset counter to 0 so next fail is 1/5 not 6/5
        await this.prisma.auth_users.update({
          where: { id: user.id },
          data: {
            failed_login_attempts: 0,
            locked_until: null,
          },
        });
        user.failed_login_attempts = 0;
        user.locked_until = null;
        this.logger.log(`Lock expired for ${user.username}, reset counter to 0`);
      }
    }

    if (user.status !== 'Active') {
      throw new ForbiddenException(
        `Account "${user.username}" status is ${user.status}. Account is not active. Please contact HR administrator.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      const status = await this.throttle.registerFailure(user.username, clientIp, true);

      // Persisted per-account lockout as well, so it survives a restart.
      const failedAttempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (failedAttempts >= MAX_ATTEMPTS_PER_ACCOUNT) {
        lockedUntil = new Date(Date.now() + LOCK_DURATION_SECONDS * 1000);
      }

      await this.prisma.auth_users.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: failedAttempts,
          locked_until: lockedUntil,
        },
      });

      await this.auditService.log({
        userId: user.id,
        username: user.username,
        action: 'LOGIN_FAILURE',
        entityType: 'Auth',
        description: `Failed login attempt ${failedAttempts}/${MAX_ATTEMPTS_PER_ACCOUNT} for ${trimmedUsername}${lockedUntil ? ` - LOCKED until ${lockedUntil.toISOString()}` : ''}`,
        status: 'Failure',
      });

      if (status.isLocked || failedAttempts >= MAX_ATTEMPTS_PER_ACCOUNT) {
        const until = status.lockedUntil || lockedUntil;
        throw new UnauthorizedException({
          success: false,
          errorCode: 'ACCOUNT_LOCKED',
          message: `Too many failed attempts. This account is locked until ${until?.toISOString()}.`,
          details: {
            failedAttempts,
            maxAttempts: MAX_ATTEMPTS_PER_ACCOUNT,
            remainingAttempts: 0,
            lockedUntil: until?.toISOString() ?? null,
            remainingSeconds: status.remainingSeconds || LOCK_DURATION_SECONDS,
            lockScope: 'account',
          },
        });
      }

      throw new UnauthorizedException({
        success: false,
        errorCode: 'INVALID_PASSWORD',
        message: 'Invalid username or password.',
        details: {
          failedAttempts,
          maxAttempts: MAX_ATTEMPTS_PER_ACCOUNT,
          remainingAttempts: Math.max(0, MAX_ATTEMPTS_PER_ACCOUNT - failedAttempts),
          lockScope: 'account',
        },
      });
    }

    // Successful login clears this account's counter and this IP's counter.
    await this.throttle.registerSuccess(user.username, clientIp);
    await this.prisma.auth_users.update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
      },
    });

    return user;
  }

  /** Signing key for access tokens (never a hardcoded fallback). */
  private get accessSecret(): string {
    return resolveJwtSecret('JWT_SECRET', (k) => this.configService.get<string>(k)).value;
  }

  /** Signing key for refresh tokens (never a hardcoded fallback). */
  private get refreshSecret(): string {
    return resolveJwtSecret('JWT_REFRESH_SECRET', (k) =>
      this.configService.get<string>(k),
    ).value;
  }

  async login(username: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.validateUser(username, password, ip);

    // Create the session first: its id is embedded in both tokens so
    // JwtStrategy can reject them once the session is logged out or revoked.
    const cfg = resolveSessionConfig((k) => this.configService.get<string>(k));
    const sessionId = `sess_${Date.now()}_${user.id}`;
    const expiresAt = new Date(Date.now() + cfg.expiryMs); // sliding (extended on refresh)
    const absoluteTimeoutAt = new Date(Date.now() + cfg.absoluteMs); // hard cap

    await this.prisma.auth_sessions.create({
      data: {
        id: sessionId,
        user_id: user.id,
        ip_address: ip || '127.0.0.1',
        user_agent: userAgent,
        expires_at: expiresAt,
        absolute_timeout_at: absoluteTimeoutAt,
        status: 'Active',
      },
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.primary_role?.code || 'READONLY_USER',
      primaryRoleId: user.primary_role_id,
      sessionId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.configService.get('JWT_EXPIRY', '3600s'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRY', '7d'),
    });

    await this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
      entityType: 'Auth',
      description: `User ${user.username} logged in`,
      ipAddress: ip,
      userAgent,
      sessionId,
      status: 'Success',
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.primary_role?.code,
        roleName: user.primary_role?.name,
        status: user.status,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: cfg.expiryMs / 1000,
        sessionId,
      },
    };
  }

  async logout(userId: number, sessionId?: string) {
    if (sessionId) {
      await this.prisma.auth_sessions.updateMany({
        where: { id: sessionId, user_id: userId },
        data: {
          status: 'Revoked',
          revoked_at: new Date(),
          revoked_reason: 'User logout',
        },
      });
    }

    await this.auditService.log({
      userId,
      action: 'LOGOUT',
      entityType: 'Auth',
      description: `User ${userId} logged out`,
      status: 'Success',
      sessionId,
    });

    return { message: 'Logout successful' };
  }

  async refreshToken(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.auth_users.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'Active') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A revoked/logged-out session must not be able to mint new access tokens.
    if (payload.sessionId) {
      const session = await this.prisma.auth_sessions.findUnique({
        where: { id: payload.sessionId },
      });
      if (!session || session.user_id !== user.id || session.status !== 'Active') {
        throw new UnauthorizedException('Session is no longer active');
      }

      const cfg = resolveSessionConfig((k) => this.configService.get<string>(k));
      const now = new Date();

      // The hard cap and the idle window also end the refresh capability, so
      // an idle (or over-long) session cannot silently keep minting tokens.
      if (hasPassed(session.absolute_timeout_at, now)) {
        throw new UnauthorizedException('Session absolute timeout reached');
      }
      if (isIdle(session.last_activity_at, now, cfg.idleMs)) {
        throw new UnauthorizedException('Session idle timeout reached');
      }

      // Slide the expiry forward (capped by the absolute timeout) and mark
      // activity so the refreshed session stays alive while in use.
      const absoluteDeadline = new Date(session.absolute_timeout_at).getTime();
      await this.prisma.auth_sessions.update({
        where: { id: session.id },
        data: {
          expires_at: new Date(Math.min(now.getTime() + cfg.expiryMs, absoluteDeadline)),
          last_activity_at: now,
        },
      });
    }

    const newPayload = {
      sub: user.id,
      username: user.username,
      role: payload.role,
      primaryRoleId: user.primary_role_id,
      // Carry the binding over so the refreshed token is still revocable.
      sessionId: payload.sessionId,
    };

    const accessToken = this.jwtService.sign(newPayload, {
      secret: this.accessSecret,
      expiresIn: this.configService.get('JWT_EXPIRY', '3600s'),
    });

    const cfg = resolveSessionConfig((k) => this.configService.get<string>(k));
    return {
      accessToken,
      expiresIn: cfg.expiryMs / 1000,
    };
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  /** Look a user up by username or email (used by the admin unlock utility). */
  async findUserByIdentifier(identifier: string): Promise<any | null> {
    return this.prisma.auth_users.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
  }

  /** Clear a persisted per-account lockout (admin action). */
  async clearAccountLockout(userId: number): Promise<void> {
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: { failed_login_attempts: 0, locked_until: null },
    });
  }

  /**
   * Admin/dev utility behind POST /auth/reset-attempts (RBAC-protected).
   * Clears the per-account and per-IP throttle counters.
   */
  async resetAttempts(username?: string, ip?: string): Promise<{ cleared: number; backend: string }> {
    if (username) {
      await this.throttle.clear('account', username);
      if (ip) await this.throttle.clear('ip', ip);
      return { cleared: 1, backend: this.throttle.storageBackend };
    }
    const cleared = await this.throttle.clearAll();
    return { cleared, backend: this.throttle.storageBackend };
  }

  /** Lockout status for one account (admin view / unlock flow). */
  async getAttemptStatus(username: string) {
    const status = await this.throttle.getAccountStatus(username);
    return {
      username,
      failedAttempts: status.failedAttempts,
      remainingAttempts: status.remainingAttempts,
      maxAttempts: status.maxAttempts,
      isLocked: status.isLocked,
      lockedUntil: status.lockedUntil?.toISOString() ?? null,
      remainingSeconds: status.remainingSeconds,
      lockScope: status.scope,
      backend: this.throttle.storageBackend,
      // Field-name parity with the mock server so either backend can serve the
      // same client. Both are permanently false: lockout is per-account/per-IP.
      perUserAttempts: status.failedAttempts,
      isGlobal: false,
      isGlobalLocked: false,
    };
  }

  /** Overview of the throttle state - admin only. */
  getThrottleOverview() {
    return {
      maxAttemptsPerAccount: MAX_ATTEMPTS_PER_ACCOUNT,
      maxAttemptsPerIp: MAX_ATTEMPTS_PER_IP,
      lockDurationSeconds: LOCK_DURATION_SECONDS,
      backend: this.throttle.storageBackend,
      isGlobal: false,
      message: 'Per-account and per-IP throttling - there is no global lockout',
    };
  }
}

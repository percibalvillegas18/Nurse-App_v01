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
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds: number;
  // GLOBAL counter for username+password errors share same count (user requested global)
  private globalAttempts = { count: 0, lockedUntil: null as Date | null, lastAttemptAt: null as Date | null };
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 10 * 60 * 1000; // 10 min

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.bcryptRounds = parseInt(configService.get('BCRYPT_ROUNDS', '12'), 10);
  }

  private isGlobalLocked(): boolean {
    if (!this.globalAttempts.lockedUntil) return false;
    if (this.globalAttempts.lockedUntil > new Date()) return true;
    // Expired, reset
    this.globalAttempts.count = 0;
    this.globalAttempts.lockedUntil = null;
    return false;
  }

  private getGlobalRemainingSeconds(): number {
    if (!this.globalAttempts.lockedUntil) return 0;
    return Math.max(0, Math.ceil((this.globalAttempts.lockedUntil.getTime() - Date.now()) / 1000));
  }

  async validateUser(username: string, password: string) {
    // Check GLOBAL lock first - same counter for username+password errors
    if (this.isGlobalLocked()) {
      const remainingSec = this.getGlobalRemainingSeconds();
      const remainingMin = Math.ceil(remainingSec / 60);
      throw new ForbiddenException(
        `GLOBAL lock: All logins locked due to ${this.MAX_ATTEMPTS} failed attempts (username+password share same counter). Try again in ${remainingMin} min (${remainingSec}s). Global count ${this.globalAttempts.count}/${this.MAX_ATTEMPTS}. Locked until ${this.globalAttempts.lockedUntil?.toISOString()}`,
      );
    }

    // Validate input presence for better UX
    if (!username || username.trim() === '') {
      throw new BadRequestException('Username is required. Please enter your username or email.');
    }
    if (!password || password.trim() === '') {
      throw new BadRequestException('Password is required. Please enter your password.');
    }

    const trimmedUsername = username.trim();

    const user = await this.prisma.auth_users.findFirst({
      where: {
        OR: [{ username: trimmedUsername }, { email: trimmedUsername }],
      },
      include: {
        primary_role: true,
      },
    });

    if (!user) {
      // GLOBAL counter increment for USER_NOT_FOUND too (same count)
      this.globalAttempts.count += 1;
      this.globalAttempts.lastAttemptAt = new Date();
      if (this.globalAttempts.count >= this.MAX_ATTEMPTS) {
        this.globalAttempts.lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
      }

      await this.auditService.log({
        action: 'LOGIN_FAILURE',
        entityType: 'Auth',
        description: `Login failed - user not found: ${trimmedUsername} - GLOBAL ${this.globalAttempts.count}/${this.MAX_ATTEMPTS}`,
        status: 'Failure',
        errorMessage: 'User not found',
      });
      throw new UnauthorizedException(
        `Username "${trimmedUsername}" not found. GLOBAL Attempt ${this.globalAttempts.count}/${this.MAX_ATTEMPTS}. ${Math.max(0, this.MAX_ATTEMPTS - this.globalAttempts.count)} left before 10-min GLOBAL lock (username+password share same counter). Valid: admin.system, susan.lee, etc.`,
      );
    }

    // Check lockout - 5 attempts -> 10 min lock (user requested)
    // If lock expired, reset counter (fix for 1 attempt -> 5/5 bug after expiry)
    if (user.locked_until) {
      if (user.locked_until > new Date()) {
        const unlockTime = user.locked_until.toISOString();
        const remainingMs = user.locked_until.getTime() - Date.now();
        const remainingSec = Math.ceil(remainingMs / 1000);
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new ForbiddenException(
          `Account "${user.username}" is locked due to 5 failed attempts. Locked until ${unlockTime} (${remainingMin} min / ${remainingSec}s left). Please wait 10 minutes or contact administrator. Attempts: ${user.failed_login_attempts}/5 - GLOBAL ${this.globalAttempts.count}/5`,
        );
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
      // GLOBAL counter
      this.globalAttempts.count += 1;
      this.globalAttempts.lastAttemptAt = new Date();
      if (this.globalAttempts.count >= this.MAX_ATTEMPTS) {
        this.globalAttempts.lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
      }

      // Per-user also
      const failedAttempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (failedAttempts >= this.MAX_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + this.LOCK_DURATION_MS);
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
        description: `Failed login attempt ${failedAttempts}/${this.MAX_ATTEMPTS} for ${trimmedUsername} - GLOBAL ${this.globalAttempts.count}/${this.MAX_ATTEMPTS}${lockedUntil ? ` - LOCKED until ${lockedUntil.toISOString()}` : ''}`,
        status: 'Failure',
      });

      if (this.globalAttempts.count >= this.MAX_ATTEMPTS || failedAttempts >= this.MAX_ATTEMPTS) {
        throw new UnauthorizedException(
          `Incorrect password for "${user.username}". GLOBAL locked after ${this.globalAttempts.count}/${this.MAX_ATTEMPTS} fails (username+password share same). Locked for 10 minutes until ${this.globalAttempts.lockedUntil?.toISOString() || lockedUntil?.toISOString()}. Demo: Password123!`,
        );
      }

      throw new UnauthorizedException(
        `Incorrect password for "${user.username}" (GLOBAL attempt ${this.globalAttempts.count}/${this.MAX_ATTEMPTS}, per-user ${failedAttempts}/${this.MAX_ATTEMPTS}). ${this.MAX_ATTEMPTS - this.globalAttempts.count} left before 10-min GLOBAL lock. Demo: Password123!`,
      );
    }

    // Reset both GLOBAL and per-user on success
    this.globalAttempts.count = 0;
    this.globalAttempts.lockedUntil = null;
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

  async login(username: string, password: string, ip?: string, userAgent?: string) {
    const user = await this.validateUser(username, password);

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.primary_role?.code || 'READONLY_USER',
      primaryRoleId: user.primary_role_id,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRY', '3600s'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRY', '7d'),
    });

    // Create session
    const sessionId = `sess_${Date.now()}_${user.id}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1h
    const absoluteTimeoutAt = new Date(Date.now() + 86400 * 1000); // 24h

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

    await this.auditService.log({
      userId: user.id,
      username: user.username,
      action: 'LOGIN_SUCCESS',
      entityType: 'Auth',
      description: `User ${user.username} logged in - GLOBAL counter reset`,
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
        expiresIn: 3600,
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
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.auth_users.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'Active') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = {
        sub: user.id,
        username: user.username,
        role: payload.role,
      };

      const accessToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: this.configService.get('JWT_EXPIRY', '3600s'),
      });

      return {
        accessToken,
        expiresIn: 3600,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.bcryptRounds);
  }

  // For reset endpoint
  resetGlobalAttempts() {
    this.globalAttempts.count = 0;
    this.globalAttempts.lockedUntil = null;
    this.globalAttempts.lastAttemptAt = null;
  }

  getGlobalAttempts() {
    return {
      ...this.globalAttempts,
      remainingSeconds: this.globalAttempts.lockedUntil ? Math.max(0, Math.ceil((this.globalAttempts.lockedUntil.getTime() - Date.now()) / 1000)) : 0,
    };
  }
}

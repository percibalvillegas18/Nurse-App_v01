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

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.bcryptRounds = parseInt(configService.get('BCRYPT_ROUNDS', '12'), 10);
  }

  async validateUser(username: string, password: string) {
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
      await this.auditService.log({
        action: 'LOGIN_FAILURE',
        entityType: 'Auth',
        description: `Login failed - user not found: ${trimmedUsername}`,
        status: 'Failure',
        errorMessage: 'User not found',
      });
      // More helpful message for UX - tell user what they entered and valid options
      throw new UnauthorizedException(
        `Username "${trimmedUsername}" not found. Please check spelling. Valid demo accounts: admin.system, susan.lee, james.wilson, maria.garcia, ahmed.hassan, jennifer.smith, david.kim, rachel.brown, patricia.johnson, michael.wong`,
      );
    }

    // Check lockout - specific message
    if (user.locked_until && user.locked_until > new Date()) {
      const unlockTime = user.locked_until.toISOString();
      throw new ForbiddenException(
        `Account "${user.username}" is locked due to 5 failed attempts. Locked until ${unlockTime}. Please try again after 15 minutes or contact administrator.`,
      );
    }

    if (user.status !== 'Active') {
      throw new ForbiddenException(
        `Account "${user.username}" status is ${user.status}. Account is not active. Please contact HR administrator.`,
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const failedAttempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
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
        description: `Failed login attempt ${failedAttempts} for ${trimmedUsername}`,
        status: 'Failure',
      });

      if (failedAttempts >= 5) {
        throw new UnauthorizedException(
          `Incorrect password for "${user.username}". Account locked after ${failedAttempts} failed attempts until ${lockedUntil?.toISOString()}. Demo password is Password123!`,
        );
      }

      throw new UnauthorizedException(
        `Incorrect password for user "${user.username}" (attempt ${failedAttempts}/5). Password must be Password123! for demo accounts. Hint: capital P, 123, ! at end. Check Caps Lock.`,
      );
    }

    // Reset failed attempts on success
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
}

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { resolveJwtSecret } from '../../../config/jwt.env';
import {
  resolveSessionConfig,
  hasPassed,
  isIdle,
  shouldTouchLastActivity,
} from '../session-config';

export interface JwtPayload {
  sub: number; // user id
  username: string;
  role: string;
  primaryRoleId?: number;
  /** Bound login session; tokens issued before session binding omit it. */
  sessionId?: string;
  iat?: number;
  exp?: number;
}

interface SessionTimeWindow {
  status: string;
  user_id: bigint | number;
  expires_at: Date;
  absolute_timeout_at: Date;
  last_activity_at: Date;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Same resolution as the signing side - never a published default.
      secretOrKey: resolveJwtSecret('JWT_SECRET', (k) =>
        configService.get<string>(k),
      ).value,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.auth_users.findUnique({
      where: { id: payload.sub },
      include: {
        primary_role: true,
        user_role_assignments: {
          where: {
            status: 'Active',
            OR: [
              { effective_from: null },
              { effective_from: { lte: new Date() } },
            ],
            AND: [
              {
                OR: [
                  { effective_to: null },
                  { effective_to: { gte: new Date() } },
                ],
              },
            ],
          },
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'Active') {
      throw new UnauthorizedException(`User status is ${user.status}`);
    }

    if (user.locked_until && user.locked_until > new Date()) {
      throw new UnauthorizedException('Account is locked');
    }

    // Reject tokens whose bound session has been logged out or revoked, is
    // past its expiry/absolute timeout, or has been idle beyond the limit.
    // Mock/preview mode keeps sessions in memory, so this is enforced there too.
    if (payload.sessionId) {
      const session = (await this.prisma.auth_sessions.findUnique({
        where: { id: payload.sessionId },
        select: {
          status: true,
          user_id: true,
          expires_at: true,
          absolute_timeout_at: true,
          last_activity_at: true,
        },
      })) as SessionTimeWindow | null;

      if (!session || Number(session.user_id) !== user.id) {
        throw new UnauthorizedException('Session no longer exists');
      }
      if (session.status !== 'Active') {
        throw new UnauthorizedException(`Session is ${session.status}`);
      }
      this.assertSessionWithinTimeWindow(session);
      await this.touchLastActivityIfDue(payload.sessionId, session.last_activity_at);
    }

    // NOTE: do not spread `payload` here. It used to end with `...payload`,
    // which re-added the raw `sub` claim *after* `userId`, so `req.user.sub`
    // silently overrode the mapped id and `req.user.id` became undefined -
    // logout then revoked `where: { id: <sessionId>, user_id: undefined }`,
    // i.e. nothing, and the token stayed valid after logout.
    return {
      id: user.id,
      userId: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      primaryRole: user.primary_role,
      roles: user.user_role_assignments.map((ura) => ura.role),
      roleCode: user.primary_role?.code,
      roleName: user.primary_role?.name,
      // Keep legacy fields for compatibility
      primaryRoleId: user.primary_role_id,
      sessionId: payload.sessionId,
    };
  }

  /**
   * Enforce the session time windows server-side (the JWT `exp` alone does not
   * cover idle time, and refresh tokens outlive the session expiry).
   */
  private assertSessionWithinTimeWindow(session: SessionTimeWindow): void {
    const cfg = resolveSessionConfig((k) => this.configService.get<string>(k));
    const now = new Date();

    if (hasPassed(session.absolute_timeout_at, now)) {
      throw new UnauthorizedException('Session absolute timeout reached');
    }
    if (hasPassed(session.expires_at, now)) {
      throw new UnauthorizedException('Session expired');
    }
    if (isIdle(session.last_activity_at, now, cfg.idleMs)) {
      throw new UnauthorizedException('Session idle timeout reached');
    }
  }

  /** Best-effort, debounced activity touch (never fail a request over it). */
  private async touchLastActivityIfDue(
    sessionId: string,
    lastActivityAt: Date | null,
  ): Promise<void> {
    try {
      if (shouldTouchLastActivity(lastActivityAt, new Date())) {
        await this.prisma.auth_sessions.updateMany({
          where: { id: sessionId, status: 'Active' },
          data: { last_activity_at: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Could not update session last_activity_at for ${sessionId}: ${(error as Error).message}`,
      );
    }
  }
}

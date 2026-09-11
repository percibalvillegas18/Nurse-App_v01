import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

export interface JwtPayload {
  sub: number; // user id
  username: string;
  role: string;
  primaryRoleId?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
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

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      status: user.status,
      primaryRole: user.primary_role,
      roles: user.user_role_assignments.map((ura) => ura.role),
      // Keep legacy fields for compatibility
      primaryRoleId: user.primary_role_id,
    };
  }
}

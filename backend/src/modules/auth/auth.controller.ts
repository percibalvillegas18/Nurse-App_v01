import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { Request } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];
    const result = await this.authService.login(dto.username, dto.password, ip, userAgent);
    
    return {
      success: true,
      statusCode: 200,
      data: result,
      message: 'Login successful',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    const userId = req.user.id;
    const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
    const result = await this.authService.logout(userId, sessionId);
    
    return {
      success: true,
      statusCode: 200,
      data: result,
      message: 'Logout successful',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refreshToken(dto.refreshToken);
    
    return {
      success: true,
      statusCode: 200,
      data: result,
      message: 'Token refreshed',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: any) {
    return {
      success: true,
      statusCode: 200,
      data: {
        user: req.user,
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('attempts/:username')
  async getAttempts(@Req() req: any) {
    // For preview, try to get from prisma mock
    const username = req.params.username;
    try {
      const user = await (this.authService as any).prisma.auth_users.findFirst({
        where: { OR: [{ username }, { email: username }] },
      });
      if (!user) {
        return {
          success: true,
          data: { username, failedAttempts: 0, remainingAttempts: 5, maxAttempts: 5, isLocked: false },
          timestamp: new Date().toISOString(),
        };
      }
      const isLocked = user.locked_until && new Date(user.locked_until) > new Date();
      const remainingMs = isLocked ? new Date(user.locked_until).getTime() - Date.now() : 0;
      return {
        success: true,
        data: {
          username,
          failedAttempts: user.failed_login_attempts || 0,
          remainingAttempts: Math.max(0, 5 - (user.failed_login_attempts || 0)),
          maxAttempts: 5,
          isLocked,
          lockedUntil: user.locked_until,
          remainingSeconds: Math.ceil(remainingMs / 1000),
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        success: true,
        data: { username, failedAttempts: 0, remainingAttempts: 5, maxAttempts: 5, isLocked: false },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('reset-attempts')
  async resetAttempts(@Body() body: { username?: string }) {
    const username = body?.username;
    try {
      if (username) {
        const user = await (this.authService as any).prisma.auth_users.findFirst({
          where: { OR: [{ username }, { email: username }] },
        });
        if (user) {
          await (this.authService as any).prisma.auth_users.update({
            where: { id: user.id },
            data: { failed_login_attempts: 0, locked_until: null },
          });
        }
      } else {
        // Reset all mock users
        const users = await (this.authService as any).prisma.auth_users.findMany();
        for (const u of users) {
          await (this.authService as any).prisma.auth_users.update({
            where: { id: u.id },
            data: { failed_login_attempts: 0, locked_until: null },
          });
        }
      }
    } catch {}
    return {
      success: true,
      message: username ? `Attempts reset for ${username}` : 'All attempts reset',
      timestamp: new Date().toISOString(),
    };
  }
}

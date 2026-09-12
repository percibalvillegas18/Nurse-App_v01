import {
  Controller,
  Post,
  Body,
  Param,
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
import { RbacGuard } from '../../common/guards/rbac.guard';
import { CanEdit, CanView } from '../../common/decorators/require-permission.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.headers['x-forwarded-for'] as string;
    const userAgent = req.headers['user-agent'];
    // validateUser receives the IP so unknown-username attempts can be
    // throttled per client instead of on a shared counter.
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
    // Prefer the session bound to the presented token: a client-supplied
    // x-session-id could otherwise revoke some *other* session (or none).
    const sessionId =
      req.user?.sessionId || req.headers['x-session-id'] || req.body?.sessionId;
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

  /**
   * Lockout status for one account.
   *
   * Was anonymous, which let anyone probe which accounts were mid-lockout and
   * how many attempts they had left. Now requires USER_MANAGEMENT/VIEW.
   */
  @Get('attempts/:username')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @CanView('USER_MANAGEMENT')
  async getAttempts(@Param('username') username: string) {
    const data = await this.authService.getAttemptStatus(username);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  /** Throttle policy + counters overview (admin only). */
  @Get('attempts')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @CanView('USER_MANAGEMENT')
  async getThrottleStatus() {
    return {
      success: true,
      data: this.authService.getThrottleOverview(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clear login throttle counters and any persisted account lockout.
   *
   * Was anonymous, so anyone could unlock any account - including one they had
   * just locked by brute-forcing it. Now requires USER_MANAGEMENT/EDIT, the
   * same permission as the per-user unlock in Administration -> User
   * Management. Pass a username to clear one account, or omit it to clear all.
   */
  @Post('reset-attempts')
  @UseGuards(AuthGuard('jwt'), RbacGuard)
  @CanEdit('USER_MANAGEMENT')
  async resetAttempts(@Body() body: { username?: string }, @Req() req: any) {
    const username = body?.username?.trim();
    const throttle = await this.authService.resetAttempts(username, req.ip);

    let persistedCleared = 0;
    if (username) {
      const user = await this.authService.findUserByIdentifier(username);
      if (user) {
        await this.authService.clearAccountLockout(user.id);
        persistedCleared = 1;
      }
    }

    return {
      success: true,
      data: {
        username: username || null,
        throttleCountersCleared: throttle.cleared,
        persistedLockoutsCleared: persistedCleared,
        backend: throttle.backend,
      },
      message: username
        ? `Attempts reset for ${username}`
        : 'All login throttle counters reset',
      timestamp: new Date().toISOString(),
    };
  }
}

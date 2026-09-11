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
}

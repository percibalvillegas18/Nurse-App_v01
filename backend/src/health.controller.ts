import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '0.1.0',
    };
  }

  @Get('ready')
  ready() {
    return {
      success: true,
      status: 'ready',
      checks: {
        database: 'ok', // TODO: actual DB check
        redis: 'ok', // TODO: actual Redis check
      },
      timestamp: new Date().toISOString(),
    };
  }
}

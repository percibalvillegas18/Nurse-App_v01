import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { NursingModule } from './modules/nursing/nursing.module';
import { UsersModule } from './modules/users/users.module';
import { RedisModule } from './modules/redis/redis.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthController } from './health.controller';
import { CacheController } from './cache.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    // Scheduler for cron jobs (audit partition maintenance, etc.).
    ScheduleModule.forRoot(),
    // Global: one PrismaService instance shared by every module.
    PrismaModule,
    RedisModule,
    AuthModule,
    RbacModule,
    AuditModule,
    NursingModule,
    UsersModule,
  ],
  controllers: [HealthController, CacheController],
  providers: [
    // Both were implemented but never registered, so mutating requests were not
    // audited and exceptions fell through to Nest's default error shape.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

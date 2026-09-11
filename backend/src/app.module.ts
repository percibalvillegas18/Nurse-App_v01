import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { AuditModule } from './modules/audit/audit.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthController } from './health.controller';
import { CacheController } from './cache.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env.development', '.env'],
    }),
    RedisModule,
    AuthModule,
    RbacModule,
    AuditModule,
  ],
  controllers: [HealthController, CacheController],
  providers: [],
})
export class AppModule {}

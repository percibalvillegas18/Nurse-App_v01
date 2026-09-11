import { Module } from '@nestjs/common';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';
import { EffectiveAccessService } from './effective-access.service';
import { PrismaService } from '../auth/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [AuditModule, RedisModule],
  controllers: [RbacController],
  providers: [RbacService, EffectiveAccessService, PrismaService],
  exports: [RbacService, EffectiveAccessService],
})
export class RbacModule {}

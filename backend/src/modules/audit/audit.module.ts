import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../auth/prisma.service';

@Module({
  providers: [AuditService, PrismaService],
  exports: [AuditService, PrismaService],
})
export class AuditModule {}

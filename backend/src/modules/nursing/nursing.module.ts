import { Module } from '@nestjs/common';
import { NursingController } from './nursing.controller';
import { NursingService } from './nursing.service';
import { PrismaService } from '../auth/prisma.service';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [NursingController],
  providers: [NursingService, PrismaService],
  exports: [NursingService],
})
export class NursingModule {}

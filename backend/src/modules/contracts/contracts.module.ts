import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { AuditModule } from '../audit/audit.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ContractsService } from './contracts.service';
import {
  CreateContractDto,
  UpdateContractDto,
  ApproveContractDto,
  TerminateContractDto,
  RenewContractDto,
} from './dto/contracts.dto';
import {
  CanView,
  CanCreate,
  CanEdit,
  CanDelete,
  RequirePermission,
} from '../../common/decorators/require-permission.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';

/**
 * Contract Master API - the employment-contract lifecycle for nursing staff.
 * Every endpoint is enforced server-side by RbacGuard -> rbac.evaluate_access()
 * (menu: CONTRACT_MASTER), including resource-level data scope.
 */
@Controller('contracts')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class ContractsController {
  constructor(private contractsService: ContractsService) {}

  // ==========================================================================
  // Queries / reporting
  // ==========================================================================

  @Get()
  @CanView('CONTRACT_MASTER')
  async listContracts(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('agencyId') agencyId?: string,
    @Query('nurseId') nurseId?: string,
    @Query('unitId') unitId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Req() req?: any,
  ) {
    const data = await this.contractsService.listContracts({
      search,
      status,
      type,
      agencyId: agencyId ? parseInt(agencyId, 10) : undefined,
      nurseId: nurseId ? parseInt(nurseId, 10) : undefined,
      unitId: unitId ? parseInt(unitId, 10) : undefined,
      page,
      limit,
      userId: req?.user?.id,
    });
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('expiring')
  @CanView('CONTRACT_MASTER')
  async listExpiring(@Query('days') days?: string, @Req() req?: any) {
    const data = await this.contractsService.listExpiringContracts(
      days ? parseInt(days, 10) : undefined,
      req?.user?.id,
    );
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('expired')
  @CanView('CONTRACT_MASTER')
  async listExpired(@Req() req?: any) {
    const data = await this.contractsService.listExpiredContracts(req?.user?.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('summary')
  @CanView('CONTRACT_MASTER')
  async summary(@Req() req?: any) {
    const data = await this.contractsService.getContractSummary(req?.user?.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  // Reference data for forms (JWT only; consistent with /nursing/lookups and
  // /users/lookups - agency + position codes are not RBAC-sensitive beyond login).
  @Get('lookups')
  async lookups() {
    const data = await this.contractsService.getLookups();
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get(':id')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'VIEW', resourceIdParam: 'id' })
  async getContract(@Param('id', ParseIntPipe) id: number) {
    const data = await this.contractsService.getContract(id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  // ==========================================================================
  // Workflow
  // ==========================================================================

  @Post()
  @CanCreate('CONTRACT_MASTER')
  async createContract(@Body() dto: CreateContractDto, @Req() req: any) {
    const data = await this.contractsService.createContract(dto, req.user.id);
    return { success: true, statusCode: 201, data, timestamp: new Date().toISOString() };
  }

  @Patch(':id')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async updateContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractDto,
    @Req() req: any,
  ) {
    const data = await this.contractsService.updateContract(id, dto, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post(':id/submit')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async submitContract(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const data = await this.contractsService.submitContract(id, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post(':id/approve')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'APPROVE', resourceIdParam: 'id' })
  async approveContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveContractDto,
    @Req() req: any,
  ) {
    const data = await this.contractsService.approveContract(id, req.user.id, dto);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post(':id/renew')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async renewContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewContractDto,
    @Req() req: any,
  ) {
    const data = await this.contractsService.renewContract(id, req.user.id, dto);
    return { success: true, statusCode: 201, data, timestamp: new Date().toISOString() };
  }

  @Post(':id/terminate')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async terminateContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TerminateContractDto,
    @Req() req: any,
  ) {
    const data = await this.contractsService.terminateContract(id, req.user.id, dto);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Delete(':id')
  @RequirePermission({ menuCode: 'CONTRACT_MASTER', permissionCode: 'DELETE', resourceIdParam: 'id' })
  async deleteContract(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const data = await this.contractsService.softDeleteContract(id, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }
}

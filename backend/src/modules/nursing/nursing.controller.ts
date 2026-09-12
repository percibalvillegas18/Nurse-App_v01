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
import { NursingService } from './nursing.service';
import {
  CreateNurseDto,
  UpdateNurseDto,
  CreateCredentialDto,
  UpdateCredentialDto,
  VerifyCredentialDto,
  CreateRosterAssignmentDto,
  UpdateRosterAssignmentDto,
} from './dto/nursing.dto';
import {
  CanView,
  CanCreate,
  CanEdit,
  CanDelete,
  RequirePermission,
} from '../../common/decorators/require-permission.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';

/**
 * Nursing domain API - nurses, credentials, roster assignments.
 * Every endpoint is enforced server-side by RbacGuard -> rbac.evaluate_access().
 */
@Controller('nursing')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class NursingController {
  constructor(private nursingService: NursingService) {}

  // ==========================================================================
  // Nurses (menu: NURSE_MASTER)
  // ==========================================================================

  @Get('nurses')
  @CanView('NURSE_MASTER')
  async listNurses(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('unitId') unitId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Req() req?: any,
  ) {
    const data = await this.nursingService.listNurses({
      search,
      status,
      unitId: unitId ? parseInt(unitId, 10) : undefined,
      page,
      limit,
      userId: req?.user?.id,
    });
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('nurses/:id')
  @RequirePermission({ menuCode: 'NURSE_MASTER', permissionCode: 'VIEW', resourceIdParam: 'id' })
  async getNurse(@Param('id', ParseIntPipe) id: number) {
    const data = await this.nursingService.getNurse(id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post('nurses')
  @CanCreate('NURSE_MASTER')
  async createNurse(@Body() dto: CreateNurseDto, @Req() req: any) {
    const data = await this.nursingService.createNurse(dto, req.user.id);
    return { success: true, statusCode: 201, data, timestamp: new Date().toISOString() };
  }

  @Patch('nurses/:id')
  @RequirePermission({ menuCode: 'NURSE_MASTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async updateNurse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNurseDto,
    @Req() req: any,
  ) {
    const data = await this.nursingService.updateNurse(id, dto, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Delete('nurses/:id')
  @RequirePermission({ menuCode: 'NURSE_MASTER', permissionCode: 'DELETE', resourceIdParam: 'id' })
  async deleteNurse(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const data = await this.nursingService.softDeleteNurse(id, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  // ==========================================================================
  // Credentials (menu: CREDENTIALS)
  // ==========================================================================

  @Get('nurses/:id/credentials')
  @CanView('CREDENTIALS')
  async listNurseCredentials(@Param('id', ParseIntPipe) id: number, @Req() req?: any) {
    const data = await this.nursingService.listNurseCredentials(id, req?.user?.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('credentials/expiring')
  @CanView('CREDENTIALS')
  async listExpiringCredentials(@Query('days') days?: string, @Req() req?: any) {
    const data = await this.nursingService.listExpiringCredentials(
      days ? parseInt(days, 10) : undefined,
      req?.user?.id,
    );
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post('credentials')
  @CanCreate('CREDENTIALS')
  async createCredential(@Body() dto: CreateCredentialDto, @Req() req: any) {
    const data = await this.nursingService.createCredential(dto, req.user.id);
    return { success: true, statusCode: 201, data, timestamp: new Date().toISOString() };
  }

  @Patch('credentials/:id')
  @CanEdit('CREDENTIALS')
  async updateCredential(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCredentialDto,
    @Req() req: any,
  ) {
    const data = await this.nursingService.updateCredential(id, dto, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post('credentials/:id/verify')
  @RequirePermission({ menuCode: 'CREDENTIALS', permissionCode: 'VERIFY', resourceIdParam: 'id' })
  async verifyCredential(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyCredentialDto,
    @Req() req: any,
  ) {
    const data = await this.nursingService.verifyCredential(id, dto, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  // ==========================================================================
  // Roster assignments (menu: NURSE_ROSTER)
  // ==========================================================================

  @Get('roster')
  @CanView('NURSE_ROSTER')
  async listRoster(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('unitId') unitId?: string,
    @Query('nurseId') nurseId?: string,
    @Query('status') status?: string,
    @Req() req?: any,
  ) {
    const data = await this.nursingService.listRoster({
      from,
      to,
      unitId: unitId ? parseInt(unitId, 10) : undefined,
      nurseId: nurseId ? parseInt(nurseId, 10) : undefined,
      status,
      userId: req?.user?.id,
    });
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post('roster')
  @CanCreate('NURSE_ROSTER')
  async createRosterAssignment(@Body() dto: CreateRosterAssignmentDto, @Req() req: any) {
    const data = await this.nursingService.createRosterAssignment(dto, req.user.id);
    return { success: true, statusCode: 201, data, timestamp: new Date().toISOString() };
  }

  @Patch('roster/:id')
  @RequirePermission({ menuCode: 'NURSE_ROSTER', permissionCode: 'EDIT', resourceIdParam: 'id' })
  async updateRosterAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRosterAssignmentDto,
    @Req() req: any,
  ) {
    const data = await this.nursingService.updateRosterAssignment(id, dto, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Delete('roster/:id')
  @CanDelete('NURSE_ROSTER')
  async deleteRosterAssignment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const data = await this.nursingService.softDeleteRosterAssignment(id, req.user.id);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  // ==========================================================================
  // Lookups - reference data for forms (JWT only; reference data is not
  // RBAC-sensitive beyond login)
  // ==========================================================================

  @Get('lookups')
  async getLookups() {
    const data = await this.nursingService.getLookups();
    return { success: true, data, timestamp: new Date().toISOString() };
  }
}

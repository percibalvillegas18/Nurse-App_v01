import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private prisma: PrismaService) {}

  // Access Levels
  async getAccessLevels(filters: { status?: string; page?: number; limit?: number; search?: string }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.OR = [
        { code: { contains: filters.search, mode: 'insensitive' } },
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.rbac_access_levels.findMany({ where, skip, take: limit, orderBy: { priority: 'asc' } }),
      this.prisma.rbac_access_levels.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async createAccessLevel(data: any, createdBy: number) {
    const existing = await this.prisma.rbac_access_levels.findFirst({
      where: { OR: [{ code: data.code }, { name: data.name }] },
    });
    if (existing) throw new ConflictException('Access level code or name already exists');

    return this.prisma.rbac_access_levels.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        priority: data.priority || 50,
        auto_assign: data.autoAssign || false,
        override_allowed: data.overrideAllowed ?? true,
        default_menu_behavior: data.defaultMenuBehavior || 'Configurable',
        status: 'Active',
        created_by: createdBy,
        updated_by: createdBy,
      },
    });
  }

  // Menus
  async getMenus(filters: { status?: string; parentId?: number; page?: number; limit?: number }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.parentId !== undefined) where.parent_menu_id = filters.parentId;

    const menus = await this.prisma.rbac_menus.findMany({
      where,
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
    });

    // Build hierarchy
    const buildTree = (parentId: number | null): any[] => {
      return menus
        .filter((m) => m.parent_menu_id === parentId)
        .map((m) => ({
          ...m,
          children: buildTree(m.id),
        }));
    };

    return buildTree(null);
  }

  async getMenuHierarchy(accessibleOnly = false, userId?: number) {
    let menus = await this.prisma.rbac_menus.findMany({
      where: { status: 'Active' },
      orderBy: { display_order: 'asc' },
    });

    if (accessibleOnly && userId) {
      // Filter by user's accessible menus via evaluate_access or role_menu_access
      const accessibleMenuIds = await this.prisma.$queryRawUnsafe<{ menu_id: number }[]>(
        `
        SELECT DISTINCT m.id as menu_id
        FROM rbac.menus m
        JOIN rbac.role_menu_access rma ON rma.menu_id = m.id
        JOIN auth.user_role_assignments ura ON ura.role_id = (SELECT id FROM system.hospital_roles WHERE code = rma.role_code)
        WHERE ura.user_id = $1
          AND ura.status = 'Active'
          AND rma.status = 'Active'
          AND rma.visible = true AND rma.enabled = true
          AND m.status = 'Active'
          AND (rma.effective_from IS NULL OR rma.effective_from <= NOW())
          AND (rma.effective_to IS NULL OR rma.effective_to >= NOW())
        `,
        userId,
      );
      const allowedIds = new Set(accessibleMenuIds.map((r) => r.menu_id));
      menus = menus.filter((m) => allowedIds.has(m.id));
    }

    const buildTree = (parentId: number | null): any[] => {
      return menus
        .filter((m) => m.parent_menu_id === parentId)
        .map((m) => ({
          ...m,
          children: buildTree(m.id),
        }));
    };

    return buildTree(null);
  }

  // Permissions
  async getPermissions(filters: { category?: string; status?: string; page?: number; limit?: number }) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;

    return this.prisma.rbac_permissions.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  // Role Menu Access
  async getRoleMenuAccess(roleCode: string) {
    const role = await this.prisma.system_hospital_roles.findUnique({ where: { code: roleCode } });
    if (!role) throw new NotFoundException(`Role ${roleCode} not found`);

    return this.prisma.rbac_role_menu_access.findMany({
      where: { role_code: roleCode },
      include: { menu: true },
      orderBy: { menu_id: 'asc' },
    });
  }

  async updateRoleMenuAccess(
    roleCode: string,
    menuId: number,
    data: { visible?: boolean; enabled?: boolean; overrideReason?: string },
    updatedBy: number,
  ) {
    const existing = await this.prisma.rbac_role_menu_access.findUnique({
      where: { role_code_menu_id: { role_code: roleCode, menu_id: menuId } },
    });

    if (!existing) throw new NotFoundException('Role menu access not found');

    return this.prisma.rbac_role_menu_access.update({
      where: { id: existing.id },
      data: {
        visible: data.visible ?? existing.visible,
        enabled: data.enabled ?? existing.enabled,
        assignment_source: 'ManualOverride',
        override_flag: true,
        updated_by: updatedBy,
      },
    });
  }

  // Role Permissions
  async getRolePermissions(roleCode: string, filters: { menuId?: number; allowedOnly?: boolean }) {
    const where: any = { role_code: roleCode };
    if (filters.menuId) where.menu_id = filters.menuId;
    if (filters.allowedOnly) where.allowed = true;

    return this.prisma.rbac_role_permissions.findMany({
      where,
      include: { permission: true, menu: true },
    });
  }

  async updateRolePermission(
    roleCode: string,
    menuId: number,
    permissionId: number,
    data: { allowed: boolean; overrideReason?: string },
    updatedBy: number,
  ) {
    const existing = await this.prisma.rbac_role_permissions.findUnique({
      where: {
        role_code_menu_id_permission_id: { role_code: roleCode, menu_id: menuId, permission_id: permissionId },
      },
    });

    if (!existing) {
      // Create if not exists (grant new permission)
      return this.prisma.rbac_role_permissions.create({
        data: {
          role_code: roleCode,
          menu_id: menuId,
          permission_id: permissionId,
          allowed: data.allowed,
          source: 'ManualOverride',
          override_flag: true,
          status: 'Active',
          created_by: updatedBy,
          updated_by: updatedBy,
        },
      });
    }

    return this.prisma.rbac_role_permissions.update({
      where: { id: existing.id },
      data: {
        allowed: data.allowed,
        source: 'ManualOverride',
        override_flag: true,
        updated_by: updatedBy,
      },
    });
  }

  // User Data Scopes
  async getUserDataScopes(userId: number) {
    return this.prisma.rbac_user_data_scopes.findMany({
      where: { user_id: userId },
      include: {
        organization: true,
        department: true,
        nursing_unit: true,
        post: true,
        shift: true,
      },
    });
  }

  async assignDataScope(
    userId: number,
    data: {
      scopeType: string;
      organizationId?: number;
      departmentId?: number;
      nursingUnitId?: number;
      postId?: number;
      shiftId?: number;
      effectiveFrom?: Date;
      effectiveTo?: Date;
      reason?: string;
    },
    createdBy: number,
  ) {
    return this.prisma.rbac_user_data_scopes.create({
      data: {
        user_id: userId,
        scope_type: data.scopeType as any,
        organization_id: data.organizationId,
        department_id: data.departmentId,
        nursing_unit_id: data.nursingUnitId,
        post_id: data.postId,
        shift_id: data.shiftId,
        effective_from: data.effectiveFrom,
        effective_to: data.effectiveTo,
        status: 'Active',
        created_by: createdBy,
        updated_by: createdBy,
      },
    });
  }
}

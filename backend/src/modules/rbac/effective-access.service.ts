import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';

export interface AccessDecision {
  decision: 'ALLOW' | 'DENY';
  reason: string;
  menuAccessible: boolean;
  permissionGranted: boolean;
  dataScopeValid: boolean;
  cacheTtl: number;
  evaluatedAt: Date;
  userRole: string | null;
  userRoles: string[]; // FIX: now returns all roles
}

export interface FullAccessRow {
  user_id: number;
  username: string;
  primary_role_code: string;
  primary_role_name: string;
  menu_id: number;
  menu_code: string;
  menu_name: string;
  menu_route: string;
  permission_id: number;
  permission_code: string;
  permission_name: string;
  is_accessible: boolean;
  is_allowed: boolean;
}

@Injectable()
export class EffectiveAccessService {
  private readonly logger = new Logger(EffectiveAccessService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * PRIMARY AUTHORIZATION METHOD
   * Calls the fixed rbac.evaluate_access SQL function that now supports multi-role
   */
  async evaluateAccess(
    userId: number,
    menuCode: string,
    permissionCode: string,
    resourceId?: number | null,
  ): Promise<AccessDecision> {
    try {
      const raw = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM rbac.evaluate_access($1, $2, $3, $4)`,
        userId,
        menuCode,
        permissionCode,
        resourceId || null,
      );

      const row = raw[0];

      if (!row) {
        return {
          decision: 'DENY',
          reason: 'No decision returned from evaluate_access',
          menuAccessible: false,
          permissionGranted: false,
          dataScopeValid: false,
          cacheTtl: 300,
          evaluatedAt: new Date(),
          userRole: null,
          userRoles: [],
        };
      }

      // The fixed SQL function now returns user_roles array via additional query
      // For backward compat, we fetch all roles separately
      const roles = await this.getUserActiveRoleCodes(userId);

      return {
        decision: row.decision as 'ALLOW' | 'DENY',
        reason: row.reason,
        menuAccessible: row.menu_accessible,
        permissionGranted: row.permission_granted,
        dataScopeValid: row.data_scope_valid,
        cacheTtl: row.cache_ttl,
        evaluatedAt: row.evaluated_at,
        userRole: row.user_role,
        userRoles: roles,
      };
    } catch (error) {
      this.logger.error(
        `evaluateAccess failed for user=${userId}, menu=${menuCode}, perm=${permissionCode}: ${error.message}`,
        error.stack,
      );
      // Fail closed: DENY on error
      return {
        decision: 'DENY',
        reason: `Authorization evaluation error: ${error.message}`,
        menuAccessible: false,
        permissionGranted: false,
        dataScopeValid: false,
        cacheTtl: 300,
        evaluatedAt: new Date(),
        userRole: null,
        userRoles: [],
      };
    }
  }

  /**
   * Get all active role codes for user (temporal filtering)
   * This is the FIX for multi-role support
   */
  async getUserActiveRoleCodes(userId: number): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ code: string }[]>(
      `
      SELECT hr.code
      FROM auth.user_role_assignments ura
      JOIN system.hospital_roles hr ON hr.id = ura.role_id
      WHERE ura.user_id = $1
        AND ura.status = 'Active'
        AND hr.status = 'Active'
        AND (ura.effective_from IS NULL OR ura.effective_from <= CURRENT_TIMESTAMP)
        AND (ura.effective_to IS NULL OR ura.effective_to >= CURRENT_TIMESTAMP)
      UNION
      SELECT hr.code
      FROM auth.users u
      JOIN system.hospital_roles hr ON hr.id = u.primary_role_id
      WHERE u.id = $1 AND u.status = 'Active' AND hr.status = 'Active'
      `,
      userId,
    );
    return rows.map((r) => r.code);
  }

  /**
   * Get full access matrix for user
   * Used for building dashboard and audit
   */
  async getUserFullAccess(userId: number): Promise<FullAccessRow[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<FullAccessRow[]>(
        `SELECT * FROM rbac.get_user_full_access($1)`,
        userId,
      );
      return rows;
    } catch (error) {
      this.logger.error(`getUserFullAccess failed for user=${userId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get accessible menus only (for frontend navigation)
   */
  async getAccessibleMenus(userId: number) {
    const fullAccess = await this.getUserFullAccess(userId);

    // Group by menu, check if any permission is allowed and menu accessible
    const menuMap = new Map<number, any>();

    for (const row of fullAccess) {
      if (!menuMap.has(row.menu_id)) {
        menuMap.set(row.menu_id, {
          id: row.menu_id,
          code: row.menu_code,
          name: row.menu_name,
          route: row.menu_route,
          isAccessible: row.is_accessible,
          permissions: {},
        });
      }
      const menu = menuMap.get(row.menu_id);
      menu.permissions[row.permission_code] = row.is_allowed;
      // If any row says accessible, mark true (handles multi-role OR logic)
      if (row.is_accessible) menu.isAccessible = true;
    }

    const menus = Array.from(menuMap.values()).filter((m) => m.isAccessible);

    // Build hierarchy if parent info available
    // For now return flat list, frontend can build tree
    return menus;
  }

  /**
   * Preview access after hypothetical change (impact analysis)
   * Calls rbac.preview_access_change
   */
  async previewAccessChange(
    userId: number,
    changeType: string,
    menuId: number,
    permissionId?: number,
    newValue?: boolean,
  ) {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM rbac.preview_access_change($1, $2, $3, $4, $5)`,
        userId,
        changeType,
        menuId,
        permissionId || null,
        newValue ?? null,
      );
      return rows[0];
    } catch (error) {
      this.logger.error(`previewAccessChange failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Evaluate specific request (used by API endpoint)
   */
  async evaluateSpecificRequest(
    userId: number,
    menuCode: string,
    permissionCode: string,
    resourceId?: number,
  ) {
    const decision = await this.evaluateAccess(userId, menuCode, permissionCode, resourceId);

    return {
      userId,
      menuCode,
      permissionCode,
      resourceId,
      decision: {
        allowed: decision.decision === 'ALLOW',
        menuAccessible: decision.menuAccessible,
        permissionGranted: decision.permissionGranted,
        dataScopeValid: decision.dataScopeValid,
        reason: decision.reason,
        evaluatedAt: decision.evaluatedAt,
        cacheTtl: decision.cacheTtl,
        roles: decision.userRoles,
      },
    };
  }
}

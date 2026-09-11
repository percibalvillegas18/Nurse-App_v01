import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRE_PERMISSION_KEY,
  RequirePermissionOptions,
} from '../decorators/require-permission.decorator';
import { EffectiveAccessService } from '../../modules/rbac/effective-access.service';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * RBAC Guard - Core Authorization Enforcement
 * 
 * This guard is the backend enforcement of rbac.evaluate_access().
 * It MUST be applied to all protected routes. Menu hiding in UI is cosmetic only.
 * 
 * Logic:
 * 1. Extract user from request (set by JwtStrategy)
 * 2. Read @RequirePermission metadata
 * 3. Call EffectiveAccessService.evaluateAccess()
 * 4. ALLOW if decision = ALLOW, else DENY and log to audit
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new Logger(RbacGuard.name);

  constructor(
    private reflector: Reflector,
    private effectiveAccessService: EffectiveAccessService,
    private auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<RequirePermissionOptions>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permission required, allow (public route or only auth required)
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const { menuCode, permissionCode, resourceIdParam, resourceType } = requiredPermission;

    // Extract resourceId if specified
    let resourceId: number | null = null;
    if (resourceIdParam) {
      const raw = request.params?.[resourceIdParam] || request.body?.[resourceIdParam] || request.query?.[resourceIdParam];
      if (raw) {
        resourceId = parseInt(raw, 10);
        if (isNaN(resourceId)) resourceId = null;
      }
    }

    this.logger.debug(
      `Evaluating access: user=${user.id} (${user.username}), menu=${menuCode}, perm=${permissionCode}, resource=${resourceId}`,
    );

    const decision = await this.effectiveAccessService.evaluateAccess(
      user.id,
      menuCode,
      permissionCode,
      resourceId,
    );

    // Log to audit if DENY (security event)
    if (decision.decision === 'DENY') {
      this.logger.warn(
        `ACCESS DENIED: user=${user.id}, menu=${menuCode}, perm=${permissionCode}, reason=${decision.reason}`,
      );

      await this.auditService.logSecurityEvent({
        userId: user.id,
        username: user.username,
        action: 'ACCESS_DENIED',
        entityType: 'AccessDecision',
        description: `Denied ${permissionCode} on ${menuCode}: ${decision.reason}`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        sessionId: request.headers['x-session-id'],
        status: 'Denied',
        metadata: {
          menuCode,
          permissionCode,
          resourceId,
          resourceType,
          reason: decision.reason,
          menuAccessible: decision.menuAccessible,
          permissionGranted: decision.permissionGranted,
          dataScopeValid: decision.dataScopeValid,
        },
      });

      throw new ForbiddenException({
        success: false,
        error: 'FORBIDDEN',
        message: decision.reason,
        details: {
          menuCode,
          permissionCode,
          decision: decision.decision,
          menuAccessible: decision.menuAccessible,
          permissionGranted: decision.permissionGranted,
          dataScopeValid: decision.dataScopeValid,
        },
      });
    }

    // Attach effective access info to request for downstream use
    request.effectiveAccess = decision;

    this.logger.debug(
      `ACCESS ALLOWED: user=${user.id}, menu=${menuCode}, perm=${permissionCode}`,
    );

    return true;
  }
}

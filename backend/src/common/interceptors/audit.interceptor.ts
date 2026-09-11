import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * Audit Interceptor - Logs all mutating requests
 * Intercepts POST, PUT, PATCH, DELETE for audit trail
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, params, query, user, ip, headers } = request;

    // Only audit mutating methods and RBAC config changes
    const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (!shouldAudit || !user) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: async (responseData) => {
          const duration = Date.now() - startTime;
          
          // Determine entity type from URL
          const entityType = this.extractEntityType(url);
          const action = `${method}_${entityType}`.toUpperCase();

          try {
            await this.auditService.log({
              userId: user.id,
              username: user.username,
              action,
              entityType,
              entityId: params?.id ? parseInt(params.id, 10) : undefined,
              description: `${method} ${url} - ${duration}ms`,
              changes: {
                body: this.sanitizeBody(body),
                params,
                query,
              },
              ipAddress: ip,
              userAgent: headers['user-agent'],
              status: 'Success',
            });
          } catch (error) {
            this.logger.error(`Failed to write audit log: ${error.message}`, error.stack);
          }
        },
        error: async (error) => {
          const duration = Date.now() - startTime;
          const entityType = this.extractEntityType(url);
          
          try {
            await this.auditService.log({
              userId: user?.id,
              username: user?.username,
              action: `FAILED_${method}_${entityType}`.toUpperCase(),
              entityType,
              description: `${method} ${url} failed - ${duration}ms - ${error.message}`,
              ipAddress: ip,
              userAgent: headers['user-agent'],
              status: 'Failure',
              errorMessage: error.message,
            });
          } catch (auditError) {
            this.logger.error(`Failed to write audit failure log: ${auditError.message}`);
          }
        },
      }),
    );
  }

  private extractEntityType(url: string): string {
    // /api/v1/rbac/access-levels -> AccessLevel
    // /api/v1/rbac/menus -> Menu
    if (url.includes('access-levels')) return 'AccessLevel';
    if (url.includes('menus')) return 'Menu';
    if (url.includes('permissions')) return 'Permission';
    if (url.includes('roles')) return 'Role';
    if (url.includes('data-scopes')) return 'UserDataScope';
    if (url.includes('users')) return 'User';
    if (url.includes('auth')) return 'Auth';
    return 'Unknown';
  }

  private sanitizeBody(body: any): any {
    if (!body) return null;
    const sanitized = { ...body };
    // Never log passwords or tokens
    delete sanitized.password;
    delete sanitized.password_hash;
    delete sanitized.refreshToken;
    delete sanitized.accessToken;
    delete sanitized.token;
    return sanitized;
  }
}

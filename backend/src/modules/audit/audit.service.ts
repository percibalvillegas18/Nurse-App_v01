import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../auth/prisma.service';

export interface AuditLogInput {
  userId?: number;
  username?: string;
  action: string;
  entityType: string;
  entityId?: number;
  entityCode?: string;
  description?: string;
  changes?: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  status?: 'Success' | 'Failure' | 'Denied';
  errorMessage?: string;
  metadata?: any;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput) {
    try {
      // Combine changes and metadata
      const changes = input.changes || input.metadata || null;

      const log = await this.prisma.audit_audit_logs.create({
        data: {
          user_id: input.userId,
          username: input.username,
          action: input.action,
          entity_type: input.entityType,
          entity_id: input.entityId,
          entity_code: input.entityCode,
          description: input.description,
          changes: changes,
          reason: input.reason,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          session_id: input.sessionId,
          request_id: input.requestId,
          status: input.status || 'Success',
          error_message: input.errorMessage,
        },
      });

      return log;
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${error.message}`, error.stack);
      // Don't throw - audit failure shouldn't break main flow
      return null;
    }
  }

  async logSecurityEvent(input: AuditLogInput & { status: 'Denied' | 'Failure' }) {
    this.logger.warn(
      `SECURITY EVENT: ${input.action} by user ${input.username || input.userId} - ${input.description}`,
    );
    return this.log({
      ...input,
      status: input.status || 'Denied',
    });
  }

  async getLogs(filters: {
    userId?: number;
    action?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.userId) where.user_id = filters.userId;
    if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
    if (filters.entityType) where.entity_type = filters.entityType;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) where.created_at.gte = filters.startDate;
      if (filters.endDate) where.created_at.lte = filters.endDate;
    }

    const [items, total] = await Promise.all([
      this.prisma.audit_audit_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.audit_audit_logs.count({ where }),
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

  async getStatistics(period: string = '7days') {
    let days = 7;
    if (period === '30days') days = 30;
    if (period === '90days') days = 90;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalLogs, deniedLogs, failedLogins, configChanges] = await Promise.all([
      this.prisma.audit_audit_logs.count({
        where: { created_at: { gte: since } },
      }),
      this.prisma.audit_audit_logs.count({
        where: { created_at: { gte: since }, status: 'Denied' },
      }),
      this.prisma.audit_audit_logs.count({
        where: { created_at: { gte: since }, action: 'LOGIN_FAILURE' },
      }),
      this.prisma.audit_audit_logs.count({
        where: { created_at: { gte: since }, action: { contains: 'CONFIGURATION_CHANGE' } },
      }),
    ]);

    // Group by action
    const byAction = (await this.prisma.$queryRawUnsafe(
      `SELECT action, COUNT(*) as count FROM audit.audit_logs WHERE created_at >= $1 GROUP BY action ORDER BY count DESC LIMIT 10`,
      since,
    )) as any[];

    return {
      period,
      since,
      totals: {
        totalLogs,
        deniedLogs,
        failedLogins,
        configChanges,
      },
      byAction,
    };
  }
}

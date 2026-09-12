import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../auth/prisma.service';

export interface MaintenanceResult {
  status: 'ok' | 'disabled' | 'skipped' | 'error';
  dropped?: number;
  message?: string;
}

/**
 * Scheduled audit-log partition maintenance (HIPAA § 164.316 retention +
 * partition-ahead so inserts never land on a missing month).
 *
 * V3_6 already ships the SQL primitives; this service is the scheduler that
 * was still missing:
 *   - audit.ensure_audit_partitions_ahead(N)  -> creates monthly partitions
 *   - audit.drop_audit_partitions_older_than(interval) -> drops partitions past
 *     the retention window (default 6 years). Retention is via DROP PARTITION,
 *     never row-level DELETE (which the immutability triggers forbid).
 *
 * Configuration (all optional, safe defaults):
 *   AUDIT_PARTITION_MAINTENANCE_ENABLED  'true'|'false' (default true)
 *   AUDIT_PARTITION_AHEAD_MONTHS         int (default 2)
 *   AUDIT_RETENTION_INTERVAL             PostgreSQL interval (default '6 years')
 *
 * Skipped in demo/preview (mock-data) instances: there is no real database to
 * maintain and the mock raw-query layer cannot run these functions.
 */
@Injectable()
export class AuditMaintenanceService {
  private readonly logger = new Logger(AuditMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get enabled(): boolean {
    return (
      this.configService.get<string>('AUDIT_PARTITION_MAINTENANCE_ENABLED', 'true') !==
      'false'
    );
  }

  private get monthsAhead(): number {
    const raw = parseInt(
      this.configService.get<string>('AUDIT_PARTITION_AHEAD_MONTHS', '2'),
      10,
    );
    return Number.isFinite(raw) && raw >= 0 ? raw : 2;
  }

  private get retentionInterval(): string {
    const raw = this.configService.get<string>('AUDIT_RETENTION_INTERVAL', '6 years');
    return raw && raw.trim() ? raw.trim() : '6 years';
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'audit-partition-maintenance' })
  async scheduledMaintenance(): Promise<void> {
    const result = await this.runMaintenance();
    if (result.status === 'error') {
      // Logged inside runMaintenance; surfaced here for monitoring hooks.
      this.logger.error(`Scheduled audit maintenance failed: ${result.message}`);
    }
  }

  async runMaintenance(): Promise<MaintenanceResult> {
    if (!this.enabled) {
      this.logger.log('Audit partition maintenance is disabled by configuration');
      return { status: 'disabled' };
    }

    if (this.prisma.isMockData) {
      this.logger.warn(
        'Skipping audit partition maintenance in demo/preview (mock) mode - no database',
      );
      return { status: 'skipped' };
    }

    try {
      // 1. Partition ahead: make sure the next N months exist.
      await this.prisma.$queryRawUnsafe(
        'SELECT audit.ensure_audit_partitions_ahead($1::int)',
        this.monthsAhead,
      );

      // 2. Retention: drop whole partitions older than the window.
      const dropped = (await this.prisma.$queryRawUnsafe(
        'SELECT dropped_partition, range_to FROM audit.drop_audit_partitions_older_than($1::interval)',
        this.retentionInterval,
      )) as Array<{ dropped_partition: string; range_to: string | Date }>;

      this.logger.log(
        `Audit partition maintenance complete: ensured ${this.monthsAhead} month(s) ahead, ` +
          `dropped ${dropped.length} expired partition(s)`,
      );
      return { status: 'ok', dropped: dropped.length };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Audit partition maintenance failed: ${message}`);
      return { status: 'error', message };
    }
  }
}

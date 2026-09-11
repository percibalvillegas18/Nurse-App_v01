import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected to database');

    // Optional: Log slow queries in dev
    if (process.env.NODE_ENV === 'development') {
      // @ts-ignore - prisma event typing
      this.$on('query' as any, (e: any) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper to call rbac.evaluate_access function
   */
  async evaluateAccess(
    userId: number,
    menuCode: string,
    permissionCode: string,
    resourceId?: number | null,
  ) {
    const result = await this.$queryRawUnsafe<any[]>(
      `SELECT * FROM rbac.evaluate_access($1, $2, $3, $4)`,
      userId,
      menuCode,
      permissionCode,
      resourceId || null,
    );
    return result[0];
  }

  /**
   * Helper to get user full access matrix
   */
  async getUserFullAccess(userId: number) {
    return this.$queryRawUnsafe<any[]>(
      `SELECT * FROM rbac.get_user_full_access($1)`,
      userId,
    );
  }
}

import { Controller, Get, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RbacService } from './modules/rbac/rbac.service';
import { RedisService } from './modules/redis/redis.service';
import { RequirePermission } from './common/decorators/require-permission.decorator';
import { RbacGuard } from './common/guards/rbac.guard';

@Controller('cache')
@UseGuards(AuthGuard('jwt'), RbacGuard)
export class CacheController {
  constructor(
    private rbacService: RbacService,
    private redisService: RedisService,
  ) {}

  @Get('stats')
  @RequirePermission({ menuCode: 'SYSTEM_SETTINGS', permissionCode: 'VIEW' })
  async getStats() {
    const stats = await this.rbacService.getCacheStats();
    const isReady = this.redisService.isReady();

    return {
      success: true,
      data: {
        redisReady: isReady,
        ...stats,
        cacheStrategy: {
          accessDecision: {
            keyPattern: 'rbac:access:{userId}:{menuCode}:{permissionCode}:{resourceId|_}',
            ttl: {
              ALLOW: '300s (5min) - temporal expiry risk',
              DENY: '1800s (30min) - longer for security',
              EXPIRING_SOON: '60s (1min) - when effective_to within 1h',
            },
            invalidation: 'On role_menu_access, role_permissions changes via invalidateRoleCache()',
          },
          fullAccess: {
            keyPattern: 'rbac:full:{userId}',
            ttl: '300s',
            invalidation: 'On any role change for user',
          },
          menus: {
            keyPattern: 'rbac:menus:{userId}',
            ttl: '300s',
            invalidation: 'On role_menu_access change',
          },
          menuTree: {
            keyPattern: 'rbac:menu-tree:{userId}',
            ttl: '300s',
            purpose: 'Nested menu hierarchy for navigation (separate key from the flat menu list)',
            invalidation: 'On role_menu_access change',
          },
          roleTracking: {
            keyPattern: 'rbac:role:{roleCode}:users',
            ttl: '3600s',
            purpose: 'Precise invalidation - tracks which users have which roles',
          },
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('user/:userId')
  @RequirePermission({ menuCode: 'SYSTEM_SETTINGS', permissionCode: 'MANAGE' })
  async invalidateUser(@Param('userId') userId: string) {
    const deleted = await this.redisService.invalidateUserCache(parseInt(userId, 10));
    return {
      success: true,
      data: { userId: parseInt(userId, 10), deletedKeys: deleted },
      message: `Invalidated ${deleted} cache keys for user ${userId}`,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('role/:roleCode')
  @RequirePermission({ menuCode: 'SYSTEM_SETTINGS', permissionCode: 'MANAGE' })
  async invalidateRole(@Param('roleCode') roleCode: string) {
    const deleted = await this.redisService.invalidateRoleCache(roleCode);
    return {
      success: true,
      data: { roleCode, deletedKeys: deleted },
      message: `Invalidated ${deleted} cache keys for role ${roleCode}`,
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('all')
  @RequirePermission({ menuCode: 'SYSTEM_SETTINGS', permissionCode: 'MANAGE' })
  async invalidateAll() {
    const deleted = await this.redisService.invalidateAllRbacCache();
    return {
      success: true,
      data: { deletedKeys: deleted },
      message: `Nuclear invalidation: ${deleted} keys deleted`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('keys/:pattern')
  @RequirePermission({ menuCode: 'SYSTEM_SETTINGS', permissionCode: 'VIEW' })
  async getKeys(@Param('pattern') pattern: string) {
    // For debug - list keys matching pattern (limited to 100)
    const client = this.redisService.getClient();
    const isReady = this.redisService.isReady();

    if (!isReady) {
      return {
        success: false,
        message: 'Redis not connected',
        data: { keys: [] },
        timestamp: new Date().toISOString(),
      };
    }

    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, foundKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...foundKeys);
      if (keys.length >= 100) break;
    } while (cursor !== '0');

    const keysWithTtl = await Promise.all(
      keys.slice(0, 20).map(async (key) => {
        const ttl = await client.ttl(key);
        return { key, ttl };
      }),
    );

    return {
      success: true,
      data: {
        pattern,
        totalFound: keys.length,
        sample: keysWithTtl,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

import { AuditMaintenanceService } from './audit-maintenance.service';

describe('AuditMaintenanceService', () => {
  const makePrisma = (overrides: Partial<any> = {}): any => ({
    isMockData: false,
    $queryRawUnsafe: jest.fn(async () => []),
    ...overrides,
  });

  const makeConfig = (values: Record<string, string | undefined> = {}) => ({
    get: (key: string, fallback?: string) =>
      values[key] !== undefined ? values[key] : fallback,
  });

  it('runs both partition queries and reports the dropped count', async () => {
    const prisma = makePrisma({
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ ensure_audit_partitions_ahead: 'ok' }])
        .mockResolvedValueOnce([
          { dropped_partition: 'audit.audit_logs_2018_01', range_to: new Date() },
        ]),
    });
    const svc = new AuditMaintenanceService(prisma, makeConfig() as any);

    const result = await svc.runMaintenance();

    expect(result).toEqual({ status: 'ok', dropped: 1 });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT audit.ensure_audit_partitions_ahead($1::int)',
      2,
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'SELECT dropped_partition, range_to FROM audit.drop_audit_partitions_older_than($1::interval)',
      '6 years',
    );
  });

  it('honours configured months-ahead and retention interval', async () => {
    const prisma = makePrisma();
    const svc = new AuditMaintenanceService(
      prisma,
      makeConfig({
        AUDIT_PARTITION_AHEAD_MONTHS: '6',
        AUDIT_RETENTION_INTERVAL: '7 years',
      }) as any,
    );

    await svc.runMaintenance();

    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT audit.ensure_audit_partitions_ahead($1::int)',
      6,
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      2,
      'SELECT dropped_partition, range_to FROM audit.drop_audit_partitions_older_than($1::interval)',
      '7 years',
    );
  });

  it('returns disabled without querying when disabled', async () => {
    const prisma = makePrisma();
    const svc = new AuditMaintenanceService(
      prisma,
      makeConfig({ AUDIT_PARTITION_MAINTENANCE_ENABLED: 'false' }) as any,
    );

    const result = await svc.runMaintenance();

    expect(result).toEqual({ status: 'disabled' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('skips in mock/preview mode without querying', async () => {
    const prisma = makePrisma({ isMockData: true });
    const svc = new AuditMaintenanceService(prisma, makeConfig() as any);

    const result = await svc.runMaintenance();

    expect(result).toEqual({ status: 'skipped' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('returns error (does not throw) when the query fails', async () => {
    const prisma = makePrisma({
      $queryRawUnsafe: jest.fn(async () => {
        throw new Error('relation "audit.audit_logs" does not exist');
      }),
    });
    const svc = new AuditMaintenanceService(prisma, makeConfig() as any);

    const result = await svc.runMaintenance();

    expect(result.status).toBe('error');
    expect(result.message).toContain('does not exist');
  });

  it('falls back to defaults for malformed months-ahead config', async () => {
    const prisma = makePrisma();
    const svc = new AuditMaintenanceService(
      prisma,
      makeConfig({ AUDIT_PARTITION_AHEAD_MONTHS: 'abc' }) as any,
    );

    await svc.runMaintenance();

    expect(prisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT audit.ensure_audit_partitions_ahead($1::int)',
      2,
    );
  });
});

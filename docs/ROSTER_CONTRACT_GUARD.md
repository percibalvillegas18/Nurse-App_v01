# Roster ↔ contract guard

## Nest (`nursing.service.ts` → `createRosterAssignment`)

Before creating a roster row:

```ts
const onDate = this.toDateOnly(new Date(dto.assignment_date));
try {
  const contractCheck = await this.prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT nursing.nurse_has_valid_contract($1::bigint, $2::date) AS ok`,
    dto.nurse_id,
    onDate,
  );
  if (!contractCheck?.[0]?.ok) {
    throw new ConflictException(
      `Nurse #${dto.nurse_id} has no valid Active employment contract covering ${onDate}. Update Contract Master before rostering.`,
    );
  }
} catch (e: any) {
  if (e instanceof ConflictException) throw e;
  this.logger.warn(`Contract validity check skipped: ${e?.message || e}`);
}
```

## Mock (`mock-server.js` roster POST)

After nurse exists check (requires `mock-contract-routes` to set `app.locals.hasValidContract`):

```js
if (typeof app.locals.hasValidContract === 'function' && !app.locals.hasValidContract(b.nurse_id, date)) {
  return res.status(409).json({
    success: false,
    message: 'Nurse #' + b.nurse_id + ' has no valid Active employment contract covering ' + date + '. Update Contract Master before rostering.',
    timestamp: new Date().toISOString(),
  });
}
```

## Related

- `nursing.nurse_has_valid_contract`
- V4_2 Active exclusivity + deferred supersede on renew

# Mock Server Improvements Guide

All 8 recommendations with exact code patches for `backend/mock-server.js`.

**Already applied (in `package.json`):**
- ✅ `express` + `cors` added to devDependencies
- ✅ `npm run mock` and `npm run mock:watch` scripts added

---

## Patch 1 — Request logging (add right after `app.use(express.json())`)

```js
// ── DEV: Request logger ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[MOCK] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});
```

---

## Patch 2 — Auth middleware for protected routes (add after Patch 1)

Track issued access tokens alongside refresh tokens. In the login handler, also push to `issuedAccessTokens`.

```js
// ── DEV: Valid access tokens (populated on login) ────────────────────────────
const issuedAccessTokens = new Map(); // token -> userId

// Middleware: require a valid Bearer token on all protected routes
function requireMockAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token || !issuedAccessTokens.has(token)) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid token. Please login first.',
      timestamp: new Date().toISOString(),
    });
  }
  req.mockUserId = issuedAccessTokens.get(token);
  next();
}

// Apply to all non-auth protected namespaces
app.use('/api/v1/users', requireMockAuth);
app.use('/api/v1/nursing', requireMockAuth);
app.use('/api/v1/rbac', requireMockAuth);
app.use('/api/v1/audit', requireMockAuth);
app.use('/api/v1/cache', requireMockAuth);
```

Then in the login success handler, add:
```js
issuedAccessTokens.set(accessToken, user.id);
```

And in the logout handler, delete it:
```js
issuedAccessTokens.delete(token);
```

---

## Patch 3 — Replace global lockout with per-user only

Replace the `isLocked` function and `globalAttempts` usage with per-user only:

```js
// ── PER-USER lockout (no global — dev-friendly) ──────────────────────────────
// Removed: globalAttempts. Each username has its own counter.
// This prevents one typo from locking out your entire dev session.

function isLocked(username) {
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return false;
  if (Date.now() < record.lockedUntil) return true;
  // Lock expired — reset
  record.count = 0;
  record.lockedUntil = null;
  return false;
}

function getRemainingLockTime(username) {
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - Date.now());
}
```

---

## Patch 4 — Strip `validUsernames` and `Demo: Password123!` from error responses

Find the login handler and replace these two error messages:

**USER_NOT_FOUND response — remove `validUsernames` from details:**
```js
// BEFORE
details: {
  validUsernames: Object.keys(mockUsers),
  // ...
}

// AFTER
details: {
  failedAttempts: record.count,
  remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.count),
  // validUsernames removed
}
```

**INVALID_PASSWORD response — remove the `Demo:` hint:**
```js
// BEFORE
message: `Invalid password for "${user.username}". Demo: Password123!`

// AFTER
message: `Invalid credentials.`
```

---

## Patch 5 — Dev utility endpoints (add before the catch-all)

```js
// ── DEV: Mock introspection endpoints ────────────────────────────────────────

// List all registered routes
app.get('/api/v1/mock/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach((layer) => {
    if (layer.route) {
      const method = Object.keys(layer.route.methods)[0].toUpperCase();
      routes.push({ method, path: layer.route.path });
    }
  });
  res.json({ success: true, data: { count: routes.length, routes }, timestamp: new Date().toISOString() });
});

// Current in-memory state snapshot
app.get('/api/v1/mock/state', (req, res) => {
  res.json({
    success: true,
    data: {
      users: Object.keys(mockUsers).length,
      activeSessions: issuedRefreshTokens.size,
      nurses: mockNurses.filter((n) => !n._deleted).length,
      credentials: mockCredentials.length,
      rosterAssignments: mockRoster.filter((r) => r.status !== 'Cancelled').length,
      loginAttempts: Object.entries(loginAttempts).reduce((acc, [user, rec]) => {
        if (rec.count > 0) acc[user] = { count: rec.count, locked: !!rec.lockedUntil };
        return acc;
      }, {}),
    },
    timestamp: new Date().toISOString(),
  });
});

// Reset all login counters (dev convenience)
app.post('/api/v1/mock/reset', (req, res) => {
  Object.keys(loginAttempts).forEach((k) => { loginAttempts[k] = { count: 0, lockedUntil: null }; });
  globalAttempts = { count: 0, lockedUntil: null, lastAttemptAt: null };
  res.json({ success: true, message: 'All counters reset', timestamp: new Date().toISOString() });
});
```

---

## Summary — Apply order

| # | File | Status |
|---|---|---|
| `express`/`cors` in devDependencies | `package.json` | ✅ Done |
| `npm run mock` + `mock:watch` | `package.json` | ✅ Done |
| Patch 1 — request logging | `mock-server.js` | Apply manually |
| Patch 2 — auth middleware | `mock-server.js` | Apply manually |
| Patch 3 — per-user lockout | `mock-server.js` | Apply manually |
| Patch 4 — strip credential hints | `mock-server.js` | Apply manually |
| Patch 5 — `/mock/routes`, `/mock/state`, `/mock/reset` | `mock-server.js` | Apply manually |

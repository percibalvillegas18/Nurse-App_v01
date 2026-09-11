/**
 * Mock Backend Server for Live Preview - FIXED VERSION
 * - Validates password (must be Password123!)
 * - Returns correct user per username with proper role
 * - Supports all 10 demo users
 */

const express = require('express');
const cors = require('cors');

const app = express();
// Fix for Arena preview: allow all origins, allow iframe embedding, allow preview host
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id,X-Session-Id');
  next();
});
app.use(express.json());

// Mock users - matches V2_3 seed
const mockUsers = {
  'admin.system': {
    id: 1,
    username: 'admin.system',
    email: 'admin@hospital.local',
    fullName: 'System Administrator',
    full_name: 'System Administrator',
    role: 'SYSTEM_ADMIN',
    roleName: 'System Administrator',
    status: 'Active',
    primary_role_id: 9,
    primary_role: { code: 'SYSTEM_ADMIN', name: 'System Administrator', category: 'System' },
    roles: [{ code: 'SYSTEM_ADMIN', name: 'System Administrator', category: 'System' }],
  },
  'susan.lee': {
    id: 2,
    username: 'susan.lee',
    email: 'susan.lee@hospital.local',
    fullName: 'Susan Lee - Nurse Manager, ICU',
    full_name: 'Susan Lee - Nurse Manager, ICU',
    role: 'NURSE_MANAGER',
    roleName: 'Nurse Manager',
    status: 'Active',
    primary_role_id: 5,
    primary_role: { code: 'NURSE_MANAGER', name: 'Nurse Manager', category: 'Administrative' },
    roles: [{ code: 'NURSE_MANAGER', name: 'Nurse Manager', category: 'Administrative' }],
  },
  'james.wilson': {
    id: 3,
    username: 'james.wilson',
    email: 'james.wilson@hospital.local',
    fullName: 'James Wilson - Charge Nurse, ICU',
    full_name: 'James Wilson - Charge Nurse, ICU',
    role: 'CHARGE_NURSE',
    roleName: 'Charge Nurse',
    status: 'Active',
    primary_role_id: 4,
    primary_role: { code: 'CHARGE_NURSE', name: 'Charge Nurse', category: 'Clinical' },
    roles: [{ code: 'CHARGE_NURSE', name: 'Charge Nurse', category: 'Clinical' }],
  },
  'maria.garcia': {
    id: 4,
    username: 'maria.garcia',
    email: 'maria.garcia@hospital.local',
    fullName: 'Maria Garcia - Registered Nurse, ICU',
    full_name: 'Maria Garcia - Registered Nurse, ICU',
    role: 'RN',
    roleName: 'Registered Nurse',
    status: 'Active',
    primary_role_id: 1,
    primary_role: { code: 'RN', name: 'Registered Nurse', category: 'Clinical' },
    roles: [{ code: 'RN', name: 'Registered Nurse', category: 'Clinical' }],
  },
  'ahmed.hassan': {
    id: 5,
    username: 'ahmed.hassan',
    email: 'ahmed.hassan@hospital.local',
    fullName: 'Ahmed Hassan - Registered Nurse, ICU',
    full_name: 'Ahmed Hassan - Registered Nurse, ICU',
    role: 'RN',
    roleName: 'Registered Nurse',
    status: 'Active',
    primary_role_id: 1,
    primary_role: { code: 'RN', name: 'Registered Nurse', category: 'Clinical' },
    roles: [{ code: 'RN', name: 'Registered Nurse', category: 'Clinical' }],
  },
  'jennifer.smith': {
    id: 6,
    username: 'jennifer.smith',
    email: 'jennifer.smith@hospital.local',
    fullName: 'Jennifer Smith - Licensed Practical Nurse, ICU',
    full_name: 'Jennifer Smith - Licensed Practical Nurse, ICU',
    role: 'LPN',
    roleName: 'Licensed Practical Nurse',
    status: 'Active',
    primary_role_id: 2,
    primary_role: { code: 'LPN', name: 'Licensed Practical Nurse', category: 'Clinical' },
    roles: [{ code: 'LPN', name: 'Licensed Practical Nurse', category: 'Clinical' }],
  },
  'david.kim': {
    id: 7,
    username: 'david.kim',
    email: 'david.kim@hospital.local',
    fullName: 'David Kim - Nursing Assistant, ICU',
    full_name: 'David Kim - Nursing Assistant, ICU',
    role: 'CNA',
    roleName: 'Certified Nursing Assistant',
    status: 'Active',
    primary_role_id: 3,
    primary_role: { code: 'CNA', name: 'Certified Nursing Assistant', category: 'Clinical' },
    roles: [{ code: 'CNA', name: 'Certified Nursing Assistant', category: 'Clinical' }],
  },
  'rachel.brown': {
    id: 8,
    username: 'rachel.brown',
    email: 'rachel.brown@hospital.local',
    fullName: 'Rachel Brown - Workforce Scheduler',
    full_name: 'Rachel Brown - Workforce Scheduler',
    role: 'SCHEDULER',
    roleName: 'Workforce Scheduler',
    status: 'Active',
    primary_role_id: 6,
    primary_role: { code: 'SCHEDULER', name: 'Workforce Scheduler', category: 'Administrative' },
    roles: [{ code: 'SCHEDULER', name: 'Workforce Scheduler', category: 'Administrative' }],
  },
  'patricia.johnson': {
    id: 9,
    username: 'patricia.johnson',
    email: 'patricia.johnson@hospital.local',
    fullName: 'Patricia Johnson - HR Administrator',
    full_name: 'Patricia Johnson - HR Administrator',
    role: 'HR_ADMIN',
    roleName: 'HR Administrator',
    status: 'Active',
    primary_role_id: 7,
    primary_role: { code: 'HR_ADMIN', name: 'HR Administrator', category: 'Administrative' },
    roles: [{ code: 'HR_ADMIN', name: 'HR Administrator', category: 'Administrative' }],
  },
  'michael.wong': {
    id: 10,
    username: 'michael.wong',
    email: 'michael.wong@hospital.local',
    fullName: 'Michael Wong - Compliance Officer',
    full_name: 'Michael Wong - Compliance Officer',
    role: 'COMPLIANCE_OFFICER',
    roleName: 'Compliance Officer',
    status: 'Active',
    primary_role_id: 8,
    primary_role: { code: 'COMPLIANCE_OFFICER', name: 'Compliance Officer', category: 'Administrative' },
    roles: [{ code: 'COMPLIANCE_OFFICER', name: 'Compliance Officer', category: 'Administrative' }],
  },
};

// Track last logged in user for /me endpoint
let lastLoggedInUser = mockUsers['admin.system'];
// Refresh tokens actually issued by /auth/login, keyed to a user.
// /auth/me is strict (valid bearer only); /auth/refresh-token only accepts
// tokens in this map; logout invalidates them -> clean sign-out behavior.
const issuedRefreshTokens = new Map(); // token -> userId

// --- LOGIN ATTEMPT COUNTER (5 attempts -> 10 min lock) - GLOBAL COUNTER (user requested) ---
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes as requested
const loginAttempts = {}; // username -> { count, lockedUntil, lastAttemptAt } - kept for per-user display but also global
let globalAttempts = { count: 0, lockedUntil: null, lastAttemptAt: null }; // GLOBAL counter - same for username+password errors

function getAttemptRecord(username) {
  if (!loginAttempts[username]) {
    loginAttempts[username] = { count: 0, lockedUntil: null, lastAttemptAt: null };
  }
  return loginAttempts[username];
}

function isLocked(username) {
  // Check global lock first - if global locked, all users locked
  if (globalAttempts.lockedUntil && Date.now() < globalAttempts.lockedUntil) {
    return true;
  }
  if (globalAttempts.lockedUntil && Date.now() >= globalAttempts.lockedUntil) {
    globalAttempts.count = 0;
    globalAttempts.lockedUntil = null;
  }
  // Also check per-user lock
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return false;
  if (Date.now() < record.lockedUntil) return true;
  // Lock expired, reset
  record.count = 0;
  record.lockedUntil = null;
  return false;
}

function getRemainingLockTime(username) {
  // Global lock takes precedence
  if (globalAttempts.lockedUntil) {
    const remaining = globalAttempts.lockedUntil - Date.now();
    if (remaining > 0) return remaining;
  }
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - Date.now());
}

function getGlobalAttemptInfo() {
  return {
    count: globalAttempts.count,
    lockedUntil: globalAttempts.lockedUntil,
    remainingMs: globalAttempts.lockedUntil ? Math.max(0, globalAttempts.lockedUntil - Date.now()) : 0,
  };
}

const mockMenus = [
  {
    id: 1,
    code: 'DASHBOARD',
    name: 'Dashboard',
    route: '/dashboard',
    icon: 'dashboard',
    children: [],
  },
  {
    id: 2,
    code: 'NURSING_WORKFORCE',
    name: 'Nursing Workforce',
    route: '/nursing',
    icon: 'people',
    children: [
      { id: 6, code: 'NURSE_MASTER', name: 'Nurse Master', route: '/nursing/master', icon: 'badge' },
      { id: 7, code: 'CREDENTIALS', name: 'Credentials', route: '/nursing/credentials', icon: 'verified' },
      { id: 19, code: 'CONTRACT', name: 'Contract', route: '/nursing/contract', icon: 'file' },
      { id: 20, code: 'DOCUMENTS', name: 'Documents', route: '/nursing/documents', icon: 'folder' },
      { id: 9, code: 'NURSE_ROSTER', name: 'Nurse Roster', route: '/scheduling/roster', icon: 'list' },
    ],
  },
  {
    id: 3,
    code: 'SCHEDULING',
    name: 'Scheduling',
    route: '/scheduling',
    icon: 'calendar',
    children: [
      { id: 10, code: 'LEAVE_MANAGEMENT', name: 'Leave Management', route: '/scheduling/leave', icon: 'time_off' },
    ],
  },
  {
    id: 4,
    code: 'WORKFORCE_ANALYTICS',
    name: 'Workforce Analytics',
    route: '/analytics',
    icon: 'analytics',
    children: [],
  },
  {
    id: 5,
    code: 'ADMINISTRATION',
    name: 'Administration',
    route: '/admin',
    icon: 'settings',
    children: [
      { id: 11, code: 'USER_MANAGEMENT', name: 'User Management', route: '/admin/users', icon: 'users' },
      { id: 12, code: 'ROLES_PERMISSIONS', name: 'Roles & Permissions', route: '/admin/rbac', icon: 'shield' },
      { id: 13, code: 'EFFECTIVE_ACCESS', name: 'Effective Access', route: '/admin/effective-access', icon: 'key' },
      { id: 14, code: 'CACHE_STATS', name: 'Cache Stats (Redis)', route: '/admin/cache', icon: 'thunderbolt' },
      { id: 15, code: 'ACCESS_LEVEL_MASTER', name: 'Access Level Master', route: '/admin/access-levels', icon: 'key' },
      { id: 16, code: 'MENU_MASTER', name: 'Menu Master', route: '/admin/menus', icon: 'menu' },
      { id: 17, code: 'AUDIT_LOGS', name: 'Audit Logs', route: '/admin/audit', icon: 'audit' },
      { id: 18, code: 'SYSTEM_SETTINGS', name: 'System Settings', route: '/admin/settings', icon: 'settings' },
    ],
  },
];

const mockTokens = {
  accessToken: 'mock_jwt_token_for_preview_only_' + Date.now(),
  refreshToken: 'mock_refresh_token',
  expiresIn: 3600,
  sessionId: 'sess_mock_123',
};

// ---------------------------------------------------------------------------
// USER MANAGEMENT (Administration -> User Management) - mirrors Nest UsersModule
// ---------------------------------------------------------------------------
const MOCK_USER_ROLES = [
  { id: 1, code: 'RN', name: 'Registered Nurse', category: 'Clinical' },
  { id: 2, code: 'LPN', name: 'Licensed Practical Nurse', category: 'Clinical' },
  { id: 3, code: 'CNA', name: 'Certified Nursing Assistant', category: 'Clinical' },
  { id: 4, code: 'CHARGE_NURSE', name: 'Charge Nurse', category: 'Clinical' },
  { id: 5, code: 'NURSE_MANAGER', name: 'Nurse Manager', category: 'Administrative' },
  { id: 6, code: 'SCHEDULER', name: 'Workforce Scheduler', category: 'Administrative' },
  { id: 7, code: 'HR_ADMIN', name: 'HR Administrator', category: 'Administrative' },
  { id: 8, code: 'COMPLIANCE_OFFICER', name: 'Compliance Officer', category: 'Administrative' },
  { id: 9, code: 'SYSTEM_ADMIN', name: 'System Administrator', category: 'System' },
  { id: 10, code: 'READONLY_USER', name: 'Read-Only User', category: 'System' },
];
// Per-user passwords (admin-set via create form / reset dialog); default below
const mockPasswords = {};
const DEFAULT_MOCK_PASSWORD = 'Password123!';
// Bounded log of login events for the "Login History" drawer
const mockLoginEvents = []; // {userId, username, action, at, ip}
function recordLoginEvent(user, action) {
  mockLoginEvents.push({ userId: user.id, username: user.username, action, at: new Date().toISOString(), ip: '127.0.0.1' });
  if (mockLoginEvents.length > 200) mockLoginEvents.shift();
}
function findManagedUser(id) {
  return Object.values(mockUsers).find((u) => u.id === id) || null;
}
function mapManagedUser(u) {
  const attempts = loginAttempts[u.username] || { count: 0, lockedUntil: null };
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    fullName: u.fullName || u.full_name,
    status: u.status || 'Active',
    emailVerified: true,
    lastLoginAt: u.lastLoginAt || null,
    failedLoginAttempts: attempts.count || 0,
    lockedUntil: attempts.lockedUntil ? new Date(attempts.lockedUntil).toISOString() : null,
    primaryRole: { id: u.primary_role_id, code: u.role, name: u.roleName, category: (u.primary_role || {}).category || null },
    roles: u.roles || [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  };
}


// Routes
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Nurse-App Mock Backend</title></head>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>🚀 Nurse-App Mock Backend Running (FIXED)</h1>
        <p>Mode: MOCK - No DB/Redis required, for frontend preview</p>
        <p><strong>FIXED:</strong> Now validates password and returns correct user per username</p>
        <ul>
          <li><a href="/api/v1/health">Health Check</a></li>
          <li><a href="/api/v1/cache/stats">Cache Stats</a></li>
          <li><a href="/api/v1/rbac/menus/hierarchy?accessibleOnly=true">Menus Hierarchy</a></li>
          <li><a href="/api/v1/audit/logs">Audit Logs</a></li>
        </ul>
        <p>Frontend should be on port 3000, proxying /api to this backend.</p>
        <p>Valid logins (password: <code>Password123!</code>):</p>
        <ul>
          ${Object.keys(mockUsers).map(u => `<li>${u} (${mockUsers[u].role})</li>`).join('')}
        </ul>
        <p>Wrong password will now return 401 error (fixed).</p>
      </body>
    </html>
  `);
});

app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0-mock-fixed',
    mode: 'MOCK FIXED - validates password and user',
  });
});

app.get('/api/v1/health/ready', (req, res) => {
  res.json({
    success: true,
    status: 'ready',
    checks: { database: 'mock', redis: 'mock' },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/login', (req, res) => {
  const { username, password } = req.body;

  console.log(`[MOCK] Login attempt: username=${username}, password=${password ? '***' : 'empty'}`);

  // Validate username presence
  if (!username || typeof username !== 'string' || username.trim() === '') {
    console.log(`[MOCK] Login FAILED: missing username`);
    return res.status(400).json({
      success: false,
      statusCode: 400,
      error: 'BAD_REQUEST',
      errorCode: 'USERNAME_REQUIRED',
      message: 'Username is required. Please enter your username or email.',
      timestamp: new Date().toISOString(),
    });
  }

  // Validate password presence
  if (!password || typeof password !== 'string' || password.trim() === '') {
    console.log(`[MOCK] Login FAILED for ${username}: missing password`);
    return res.status(400).json({
      success: false,
      statusCode: 400,
      error: 'BAD_REQUEST',
      errorCode: 'PASSWORD_REQUIRED',
      message: 'Password is required. Please enter your password.',
      timestamp: new Date().toISOString(),
    });
  }

  const trimmedUsername = username.trim();

  // Check if account is locked due to 5 failed attempts (10 min lock) - GLOBAL lock (same count for username+password errors)
  if (isLocked(trimmedUsername)) {
    const remainingMs = getRemainingLockTime(trimmedUsername);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const remainingMin = Math.ceil(remainingMs / 60000);
    const globalInfo = getGlobalAttemptInfo();
    const record = loginAttempts[trimmedUsername] || { count: globalInfo.count };
    console.log(`[MOCK] Login BLOCKED for ${trimmedUsername}: GLOBAL locked for ${remainingSec}s, global attempts ${globalInfo.count}/${MAX_ATTEMPTS}, per-user ${record.count || 0}/${MAX_ATTEMPTS}`);
    return res.status(423).json({
      success: false,
      statusCode: 423,
      error: 'LOCKED',
      errorCode: 'ACCOUNT_LOCKED',
      message: `Account locked due to ${MAX_ATTEMPTS} failed attempts (username+password errors share same counter). Try again in ${remainingMin} minute(s) (${remainingSec}s). Global count ${globalAttempts.count}/${MAX_ATTEMPTS}. Locked until ${new Date(globalAttempts.lockedUntil || Date.now() + remainingMs).toISOString()}`,
      details: {
        username: trimmedUsername,
        failedAttempts: globalAttempts.count, // GLOBAL count as requested
        perUserAttempts: record.count || 0,
        maxAttempts: MAX_ATTEMPTS,
        lockedUntil: new Date(globalAttempts.lockedUntil || Date.now() + remainingMs).toISOString(),
        remainingSeconds: remainingSec,
        remainingMinutes: remainingMin,
        retryAfter: remainingSec,
        isGlobal: true,
        hint: `GLOBAL counter: username+password errors share same count. Wait ${remainingMin} min. Counter resets after lock.`
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Find user first - to give specific username error
  const user = mockUsers[trimmedUsername] || Object.values(mockUsers).find(u => u.email.toLowerCase() === trimmedUsername.toLowerCase());
  
  if (!user) {
    // GLOBAL counter: username+password errors share same count
    globalAttempts.count += 1;
    globalAttempts.lastAttemptAt = new Date().toISOString();
    if (globalAttempts.count >= MAX_ATTEMPTS) {
      globalAttempts.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    // Also track per-user for display
    const record = getAttemptRecord(trimmedUsername);
    record.count += 1;
    record.lastAttemptAt = new Date().toISOString();
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    console.log(`[MOCK] Login FAILED: user ${username} not found, GLOBAL attempt ${globalAttempts.count}/${MAX_ATTEMPTS}, per-user ${record.count}/${MAX_ATTEMPTS}`);

    // If reached max, return LOCKED (same as password case)
    if (globalAttempts.count >= MAX_ATTEMPTS) {
      return res.status(423).json({
        success: false,
        statusCode: 423,
        error: 'LOCKED',
        errorCode: 'ACCOUNT_LOCKED',
        message: `Username "${trimmedUsername}" not found. GLOBAL Account locked after ${globalAttempts.count}/${MAX_ATTEMPTS} fails (username+password share same). Locked for 10 min until ${new Date(globalAttempts.lockedUntil).toISOString()}`,
        details: {
          enteredUsername: trimmedUsername,
          validUsernames: Object.keys(mockUsers),
          failedAttempts: globalAttempts.count,
          perUserAttempts: record.count,
          remainingAttempts: 0,
          maxAttempts: MAX_ATTEMPTS,
          lockedUntil: new Date(globalAttempts.lockedUntil).toISOString(),
          remainingSeconds: 600,
          remainingMinutes: 10,
          retryAfter: 600,
          isGlobal: true,
          hint: 'GLOBAL counter: any username+password error counts together. Same counter for all.'
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(401).json({
      success: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      errorCode: 'USER_NOT_FOUND',
      message: `Username "${trimmedUsername}" not found. GLOBAL Attempt ${globalAttempts.count}/${MAX_ATTEMPTS}. ${MAX_ATTEMPTS - globalAttempts.count} left before 10-min GLOBAL lock (username+password share same counter).`,
      details: {
        enteredUsername: trimmedUsername,
        validUsernames: Object.keys(mockUsers),
        failedAttempts: globalAttempts.count, // GLOBAL as requested
        perUserAttempts: record.count,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - globalAttempts.count),
        maxAttempts: MAX_ATTEMPTS,
        isGlobal: true,
        willLockAfter: MAX_ATTEMPTS - globalAttempts.count <= 0 ? 'Next fail locks ALL for 10 min' : `${MAX_ATTEMPTS - globalAttempts.count} more fails until GLOBAL lock`,
        hint: 'GLOBAL counter: any username+password error counts together. Same counter for all.'
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Validate password - must be Password123!
  if (user.status && user.status !== 'Active') {
    return res.status(403).json({
      success: false,
      statusCode: 403,
      errorCode: 'ACCOUNT_SUSPENDED',
      message: `Account "${user.username}" is suspended. Contact your administrator.`,
      timestamp: new Date().toISOString(),
    });
  }

  const expectedPassword = mockPasswords[user.username] || DEFAULT_MOCK_PASSWORD;
  if (password !== expectedPassword) {
    recordLoginEvent(user, 'LOGIN_FAILED');
    // GLOBAL counter
    globalAttempts.count += 1;
    globalAttempts.lastAttemptAt = new Date().toISOString();
    if (globalAttempts.count >= MAX_ATTEMPTS) {
      globalAttempts.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    // Per-user also
    const record = getAttemptRecord(user.username);
    record.count += 1;
    record.lastAttemptAt = new Date().toISOString();
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    
    if (globalAttempts.count >= MAX_ATTEMPTS) {
      console.log(`[MOCK] Login FAILED for ${username}: invalid password, GLOBAL LOCKED after ${globalAttempts.count}/${MAX_ATTEMPTS}`);
      return res.status(423).json({
        success: false,
        statusCode: 423,
        error: 'LOCKED',
        errorCode: 'ACCOUNT_LOCKED',
        message: `Incorrect password for "${user.username}". GLOBAL Account locked after ${globalAttempts.count} failed attempts (username+password share same counter). Try again in 10 minutes. Locked until ${new Date(globalAttempts.lockedUntil).toISOString()}`,
        details: {
          username: user.username,
          failedAttempts: globalAttempts.count, // GLOBAL
          perUserAttempts: record.count,
          maxAttempts: MAX_ATTEMPTS,
          remainingAttempts: 0,
          lockedUntil: new Date(globalAttempts.lockedUntil).toISOString(),
          remainingSeconds: 600,
          remainingMinutes: 10,
          retryAfter: 600,
          isGlobal: true,
          hint: 'GLOBAL counter: username+password errors share same count. Wait 10 min.',
        },
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[MOCK] Login FAILED for ${username}: invalid password, GLOBAL attempt ${globalAttempts.count}/${MAX_ATTEMPTS}, per-user ${record.count}/${MAX_ATTEMPTS}`);
    return res.status(401).json({
      success: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      errorCode: 'INVALID_PASSWORD',
      message: `Incorrect password for "${user.username}". GLOBAL Attempt ${globalAttempts.count}/${MAX_ATTEMPTS}. ${MAX_ATTEMPTS - globalAttempts.count} left before 10-min GLOBAL lock (username+password share same).`,
      details: {
        username: user.username,
        failedAttempts: globalAttempts.count, // GLOBAL as requested
        perUserAttempts: record.count,
        remainingAttempts: MAX_ATTEMPTS - globalAttempts.count,
        maxAttempts: MAX_ATTEMPTS,
        enteredPasswordLength: password.length,
        isGlobal: true,
        willLockAfter: `${MAX_ATTEMPTS - globalAttempts.count} more fails until GLOBAL 10-min lock`,
        hint: 'GLOBAL counter: any username or password error counts together',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // SUCCESS - reset GLOBAL and per-user counter
  globalAttempts.count = 0;
  globalAttempts.lockedUntil = null;
  globalAttempts.lastAttemptAt = new Date().toISOString();
  const record = getAttemptRecord(user.username);
  record.count = 0;
  record.lockedUntil = null;
  record.lastAttemptAt = new Date().toISOString();

  recordLoginEvent(user, 'LOGIN_SUCCESS');
  console.log(`[MOCK] Login SUCCESS for ${username} with role ${user.role}, GLOBAL counter reset`);
  lastLoggedInUser = user;

  const mockToken = `mock_jwt_${user.id}_${user.role}_${Date.now()}`;
  const mockRefreshToken = `mock_refresh_${user.id}_${Date.now()}`;
  issuedRefreshTokens.set(mockRefreshToken, user.id);

  res.json({
    success: true,
    statusCode: 200,
    data: {
      user: user,
      tokens: {
        ...mockTokens,
        accessToken: mockToken,
        refreshToken: mockRefreshToken,
      },
    },
    message: `Welcome ${user.fullName}! Login successful as ${user.role}`,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/logout', (req, res) => {
  // Invalidate every refresh token belonging to the caller (if identifiable)
  const authHeader = req.headers.authorization || '';
  const match = authHeader.replace('Bearer ', '').match(/mock_jwt_(\d+)_/);
  const userId = match ? parseInt(match[1], 10) : null;
  if (userId !== null) {
    for (const [token, uid] of issuedRefreshTokens) {
      if (uid === userId) issuedRefreshTokens.delete(token);
    }
  }
  console.log(`[MOCK] Logout for user ${lastLoggedInUser.username}${userId !== null ? ' (refresh tokens invalidated)' : ''}`);
  res.json({ success: true, message: 'Logout successful (MOCK)', timestamp: new Date().toISOString() });
});

app.post('/api/v1/auth/reset-attempts', (req, res) => {
  const { username } = req.body || {};
  if (username) {
    const trimmed = username.trim();
    if (loginAttempts[trimmed]) {
      delete loginAttempts[trimmed];
      console.log(`[MOCK] Reset attempts for ${trimmed}`);
    }
    Object.keys(loginAttempts).forEach(key => {
      if (key.toLowerCase() === trimmed.toLowerCase()) delete loginAttempts[key];
    });
    // If resetting a user, also decrement global? For global counter, reset all when any user reset for testing
    // For per-user reset, we keep global but for simplicity reset global if requested user was part of global
    // User wants global same counter, so reset global when resetting any
    if (globalAttempts.count > 0) {
      globalAttempts.count = Math.max(0, globalAttempts.count - 1);
      if (globalAttempts.count === 0) globalAttempts.lockedUntil = null;
    }
    res.json({ success: true, message: `Attempts reset for ${trimmed} (global now ${globalAttempts.count})`, timestamp: new Date().toISOString() });
  } else {
    // Reset all - both global and per-user
    Object.keys(loginAttempts).forEach(k => delete loginAttempts[k]);
    globalAttempts.count = 0;
    globalAttempts.lockedUntil = null;
    globalAttempts.lastAttemptAt = null;
    console.log(`[MOCK] Reset ALL attempts (global + per-user)`);
    res.json({ success: true, message: 'All attempts reset (global + per-user)', timestamp: new Date().toISOString() });
  }
});

app.get('/api/v1/auth/attempts/:username', (req, res) => {
  const username = req.params.username;
  const record = loginAttempts[username] || { count: 0, lockedUntil: null, lastAttemptAt: null };
  const globalRemainingMs = globalAttempts.lockedUntil ? Math.max(0, globalAttempts.lockedUntil - Date.now()) : 0;
  const perUserRemainingMs = record.lockedUntil ? Math.max(0, record.lockedUntil - Date.now()) : 0;
  const remainingMs = Math.max(globalRemainingMs, perUserRemainingMs);
  const isGlobalLocked = globalRemainingMs > 0;
  res.json({
    success: true,
    data: {
      username,
      failedAttempts: globalAttempts.count, // GLOBAL as requested - same for username+password
      perUserAttempts: record.count,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - globalAttempts.count),
      maxAttempts: MAX_ATTEMPTS,
      isLocked: remainingMs > 0,
      isGlobalLocked,
      lockedUntil: globalAttempts.lockedUntil ? new Date(globalAttempts.lockedUntil).toISOString() : (record.lockedUntil ? new Date(record.lockedUntil).toISOString() : null),
      remainingSeconds: Math.ceil(remainingMs / 1000),
      globalCount: globalAttempts.count,
      isGlobal: true,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/auth/attempts', (req, res) => {
  const globalRemainingMs = globalAttempts.lockedUntil ? Math.max(0, globalAttempts.lockedUntil - Date.now()) : 0;
  res.json({
    success: true,
    data: {
      failedAttempts: globalAttempts.count,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - globalAttempts.count),
      maxAttempts: MAX_ATTEMPTS,
      isLocked: globalRemainingMs > 0,
      lockedUntil: globalAttempts.lockedUntil ? new Date(globalAttempts.lockedUntil).toISOString() : null,
      remainingSeconds: Math.ceil(globalRemainingMs / 1000),
      perUser: loginAttempts,
      isGlobal: true,
      message: 'GLOBAL counter - username+password share same count',
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/refresh-token', (req, res) => {
  const { refreshToken } = req.body || {};
  const userId = refreshToken ? issuedRefreshTokens.get(refreshToken) : undefined;
  const user = userId ? Object.values(mockUsers).find((u) => u.id === userId) : null;
  if (!user) {
    console.log('[MOCK] Refresh-token REJECTED (unknown/invalidated token)');
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token',
      timestamp: new Date().toISOString(),
    });
  }
  console.log(`[MOCK] Refresh-token OK for ${user.username}`);
  res.json({
    success: true,
    data: { accessToken: `mock_jwt_${user.id}_${user.role}_${Date.now()}`, refreshToken, expiresIn: 3600 },
    message: 'Token refreshed (MOCK)',
    timestamp: new Date().toISOString(),
  });
});

// -----------------------------------------------------------------------
// USER MANAGEMENT endpoints (menu USER_MANAGEMENT; Administration -> User Management)
// -----------------------------------------------------------------------
app.get('/api/v1/users/lookups', (req, res) => {
  res.json({
    success: true,
    data: { roles: MOCK_USER_ROLES, statuses: ['Active', 'Suspended'] },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/users', (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;
  let rows = Object.values(mockUsers).map(mapManagedUser);
  if (status) rows = rows.filter((u) => u.status === status);
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((u) => u.username.includes(q) || u.email.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q));
  }
  rows.sort((a, b) => a.username.localeCompare(b.username));
  const pg = parseInt(page, 10) || 1, lim = Math.min(parseInt(limit, 10) || 20, 100);
  res.json({
    success: true,
    data: { items: rows.slice((pg - 1) * lim, pg * lim), total: rows.length, page: pg, limit: lim },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/users/:id', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, data: mapManagedUser(u), timestamp: new Date().toISOString() });
});

app.get('/api/v1/users/:id/login-history', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const items = mockLoginEvents
    .filter((e) => e.userId === u.id)
    .slice(-25)
    .reverse()
    .map((e, i) => ({ id: i + 1, action: e.action, status: e.action === 'LOGIN_SUCCESS' ? 'Success' : 'Failed', description: `${e.action.replace('_', ' ')} (MOCK)`, ipAddress: e.ip, createdAt: e.at }));
  res.json({ success: true, data: { userId: u.id, username: u.username, items }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/users/:id/sessions', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const now = Date.now();
  res.json({
    success: true,
    data: {
      userId: u.id,
      items: [
        { id: `sess_${u.id}_demo`, ipAddress: '192.168.10.25', userAgent: 'Chrome/140 (Windows 11)', loginAt: new Date(now - 42 * 60000).toISOString(), lastActivityAt: new Date(now - 2 * 60000).toISOString(), expiresAt: new Date(now + 18 * 60000).toISOString(), status: 'Active', revokedAt: null },
        { id: `sess_${u.id}_old`, ipAddress: '10.20.30.40', userAgent: 'Safari/17 (iPad)', loginAt: new Date(now - 26 * 3600000).toISOString(), lastActivityAt: new Date(now - 25 * 3600000).toISOString(), expiresAt: new Date(now - 25 * 3600000).toISOString(), status: 'Expired', revokedAt: null },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/users', (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.email || !b.full_name || !b.password || !b.primary_role_id) {
    return res.status(400).json({ success: false, message: 'username, email, full_name, password, primary_role_id are required' });
  }
  if (Object.values(mockUsers).some((u) => u.username === b.username)) {
    return res.status(409).json({ success: false, message: `Username "${b.username}" already exists` });
  }
  if (Object.values(mockUsers).some((u) => u.email === b.email)) {
    return res.status(409).json({ success: false, message: `Email "${b.email}" already exists` });
  }
  const primary = MOCK_USER_ROLES.find((r) => r.id === b.primary_role_id);
  if (!primary) return res.status(400).json({ success: false, message: 'unknown primary_role_id' });
  const id = Math.max(...Object.values(mockUsers).map((u) => u.id)) + 1;
  const extraRoles = (b.role_ids || [])
    .filter((rid) => rid !== b.primary_role_id)
    .map((rid) => MOCK_USER_ROLES.find((r) => r.id === rid))
    .filter(Boolean)
    .map(({ id: rid, code, name }) => ({ id: rid, code, name }));
  mockUsers[b.username] = {
    id,
    username: b.username,
    email: b.email,
    fullName: b.full_name,
    full_name: b.full_name,
    role: primary.code,
    roleName: primary.name,
    status: b.status || 'Active',
    primary_role_id: primary.id,
    primary_role: primary,
    roles: [{ id: primary.id, code: primary.code, name: primary.name }, ...extraRoles],
  };
  mockPasswords[b.username] = b.password;
  console.log(`[MOCK] User created: ${b.username} (${primary.code}), id=${id}`);
  res.status(201).json({ success: true, statusCode: 201, data: mapManagedUser(mockUsers[b.username]), timestamp: new Date().toISOString() });
});

app.patch('/api/v1/users/:id', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const b = req.body || {};
  if (b.email !== undefined && u.email !== b.email && Object.values(mockUsers).some((x) => x.id !== u.id && x.email === b.email)) {
    return res.status(409).json({ success: false, message: `Email "${b.email}" already exists` });
  }
  if (b.email !== undefined) u.email = b.email;
  if (b.full_name !== undefined) { u.fullName = b.full_name; u.full_name = b.full_name; }
  if (b.primary_role_id !== undefined) {
    const primary = MOCK_USER_ROLES.find((r) => r.id === b.primary_role_id);
    if (!primary) return res.status(400).json({ success: false, message: 'unknown primary_role_id' });
    u.primary_role_id = primary.id; u.primary_role = primary; u.role = primary.code; u.roleName = primary.name;
  }
  if (b.role_ids !== undefined) {
    u.roles = [
      u.primary_role,
      ...(b.role_ids || [])
        .filter((rid) => rid !== u.primary_role_id)
        .map((rid) => MOCK_USER_ROLES.find((r) => r.id === rid))
        .filter(Boolean),
    ];
  }
  if (b.status !== undefined) u.status = b.status;
  console.log(`[MOCK] User updated: ${u.username}`);
  res.json({ success: true, data: mapManagedUser(u), timestamp: new Date().toISOString() });
});

app.post('/api/v1/users/:id/status', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const status = (req.body || {}).status;
  if (!['Active', 'Suspended'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status must be Active or Suspended' });
  }
  u.status = status;
  console.log(`[MOCK] User ${u.username} -> ${status}`);
  res.json({ success: true, data: mapManagedUser(u), timestamp: new Date().toISOString() });
});

app.post('/api/v1/users/:id/reset-password', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  const password = (req.body || {}).password;
  if (!password || String(password).length < 8) {
    return res.status(400).json({ success: false, message: 'password is required (min 8 chars)' });
  }
  mockPasswords[u.username] = password;
  console.log(`[MOCK] Password reset for ${u.username}`);
  res.json({ success: true, data: { message: `Password reset for ${u.username}` }, timestamp: new Date().toISOString() });
});

app.post('/api/v1/users/:id/unlock', (req, res) => {
  const u = findManagedUser(parseInt(req.params.id, 10));
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  if (loginAttempts[u.username]) {
    loginAttempts[u.username].count = 0;
    loginAttempts[u.username].lockedUntil = null;
  }
  console.log(`[MOCK] User unlocked: ${u.username} (per-user counters cleared; GLOBAL lockout is separate)`);
  res.json({ success: true, data: { message: `User ${u.username} unlocked (per-user counters cleared)` }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/auth/me', (req, res) => {
  // STRICT: identity comes from the bearer token only - no catch-all fallback,
  // otherwise the frontend thinks everyone is already signed in (login page
  // never shows).
  const unauth = (message) =>
    res.status(401).json({ success: false, error: 'Unauthorized', message, timestamp: new Date().toISOString() });

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log('[MOCK] /auth/me 401 - no Authorization header');
    return unauth('Not authenticated - missing access token');
  }

  const token = authHeader.replace('Bearer ', '');
  const match = token.match(/mock_jwt_(\d+)_([A-Z_]+)_/);
  const user = match ? Object.values(mockUsers).find((u) => u.id === parseInt(match[1], 10)) : null;
  if (!user) {
    console.log('[MOCK] /auth/me 401 - invalid/expired token');
    return unauth('Invalid or expired token');
  }

  console.log(`[MOCK] /auth/me returning user ${user.username} with role ${user.role}`);
  res.json({
    success: true,
    data: { user: user },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/menus', (req, res) => {
  res.json({ success: true, data: { menus: mockMenus }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/rbac/menus/hierarchy', (req, res) => {
  const accessibleOnly = req.query.accessibleOnly === 'true';
  // Simulate role-based menu filtering
  let filteredMenus = mockMenus;
  
  if (accessibleOnly) {
    // Parse user from token
    const authHeader = req.headers.authorization;
    let userRole = lastLoggedInUser.role;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const match = token.match(/mock_jwt_\d+_([A-Z_]+)_/);
      if (match) {
        userRole = match[1];
      }
    }

    // Filter menus based on role (simplified)
    if (userRole === 'RN' || userRole === 'LPN' || userRole === 'CNA') {
      filteredMenus = mockMenus.filter(m => ['DASHBOARD', 'NURSING_WORKFORCE', 'SCHEDULING'].includes(m.code));
    } else if (userRole === 'READONLY_USER') {
      filteredMenus = mockMenus.filter(m => m.code === 'DASHBOARD');
    }
    // SYSTEM_ADMIN, NURSE_MANAGER get all
  }

  console.log(`[MOCK] Menus hierarchy for role ${lastLoggedInUser.role}, accessibleOnly=${accessibleOnly}, returning ${filteredMenus.length} root menus`);
  res.json({
    success: true,
    data: { menus: filteredMenus },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/effective-access/:userId', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const user = Object.values(mockUsers).find(u => u.id === userId) || lastLoggedInUser;
  
  res.json({
    success: true,
    data: {
      userId,
      username: user.username,
      role: user.role,
      calculatedAt: new Date().toISOString(),
      menus: mockMenus.flatMap(m => m.children || []).concat(mockMenus.filter(m => !m.children || m.children.length === 0)).map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        route: m.route,
        isAccessible: true,
        permissions: { VIEW: true, CREATE: user.role !== 'READONLY_USER' && user.role !== 'CNA', EDIT: ['SYSTEM_ADMIN', 'NURSE_MANAGER', 'CHARGE_NURSE'].includes(user.role), DELETE: user.role === 'SYSTEM_ADMIN', MANAGE: user.role === 'SYSTEM_ADMIN' },
      })),
      fullMatrix: Array(20).fill(null).map((_, i) => ({
        menu_code: mockMenus[i % mockMenus.length]?.code || 'DASHBOARD',
        permission_code: ['VIEW', 'CREATE', 'EDIT', 'DELETE'][i % 4],
        is_accessible: true,
        is_allowed: true,
      })),
      summary: {
        accessibleMenus: user.role === 'SYSTEM_ADMIN' ? 18 : user.role === 'READONLY_USER' ? 1 : 6,
        totalRows: 240,
        grantedPermissions: user.role === 'SYSTEM_ADMIN' ? 48 : 12,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/rbac/effective-access/:userId/evaluate', (req, res) => {
  const { menuCode, permissionCode, resourceId } = req.body;
  const userId = parseInt(req.params.userId, 10);
  const user = Object.values(mockUsers).find(u => u.id === userId) || lastLoggedInUser;

  // Simulate AND logic with real role
  const role = user.role;
  const isAdmin = role === 'SYSTEM_ADMIN';
  const isManager = role === 'NURSE_MANAGER';
  const isCharge = role === 'CHARGE_NURSE';
  const isRN = role === 'RN';
  const isReadOnly = role === 'READONLY_USER';

  const isRestrictedMenu = ['USER_MANAGEMENT', 'SYSTEM_SETTINGS', 'ROLES_PERMISSIONS', 'ACCESS_LEVEL_MASTER', 'MENU_MASTER'].includes(menuCode);
  const isSensitivePerm = ['DELETE', 'MANAGE'].includes(permissionCode);

  let decision = 'ALLOW';
  let reason = `Authorization granted: all checks passed (MOCK FIXED) - Role [${role}] - Multi-role OR logic active - User ${user.username}`;
  let menuAccessible = true;
  let permissionGranted = true;
  let dataScopeValid = true;
  let cacheTtl = 300;
  let cached = Math.random() > 0.3;

  // Role-based DENY logic
  if (isReadOnly && permissionCode !== 'VIEW') {
    decision = 'DENY';
    reason = `Permission "${permissionCode}" not granted for role [${role}] - ReadOnly can only VIEW`;
    permissionGranted = false;
    cacheTtl = 1800;
  } else if ((role === 'CNA' || role === 'LPN') && isSensitivePerm) {
    decision = 'DENY';
    reason = `Permission "${permissionCode}" not granted for role [${role}] - CNA/LPN cannot DELETE/MANAGE`;
    permissionGranted = false;
    cacheTtl = 1800;
  } else if (!isAdmin && !isManager && isRestrictedMenu) {
    if (isSensitivePerm || menuCode === 'SYSTEM_SETTINGS') {
      decision = 'DENY';
      reason = `Menu not accessible for role [${role}] (visible=false, enabled=false) - Only Admin/Manager can access ${menuCode}`;
      menuAccessible = false;
      permissionGranted = false;
      cacheTtl = 1800;
    }
  }

  console.log(`[MOCK] Evaluate: user=${user.username}(${role}) menu=${menuCode} perm=${permissionCode} -> ${decision}`);

  res.json({
    success: true,
    data: {
      userId,
      menuCode,
      permissionCode,
      resourceId,
      decision: {
        allowed: decision === 'ALLOW',
        menuAccessible,
        permissionGranted,
        dataScopeValid,
        reason,
        evaluatedAt: new Date().toISOString(),
        cacheTtl,
        roles: [role],
        cached,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/rbac/effective-access/:userId/preview', (req, res) => {
  res.json({
    success: true,
    data: {
      current_decision: 'DENY',
      proposed_decision: 'ALLOW',
      menu_code: 'NURSE_MASTER',
      menu_name: 'Nurse Master',
      permission_code: 'EDIT',
      permission_name: 'Edit',
      impact_description: 'Access will change from DENY to ALLOW affecting 5 users - MOCK',
      affected_users: 5,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/permissions', (req, res) => {
  res.json({
    success: true,
    data: {
      items: [
        { id: 1, code: 'VIEW', name: 'View', category: 'Standard', risk_level: 'Low', status: 'Active' },
        { id: 2, code: 'CREATE', name: 'Create', category: 'Standard', risk_level: 'Medium', status: 'Active' },
        { id: 3, code: 'EDIT', name: 'Edit', category: 'Standard', risk_level: 'Medium', status: 'Active' },
        { id: 4, code: 'DELETE', name: 'Delete', category: 'Sensitive', risk_level: 'High', status: 'Active' },
        { id: 7, code: 'MANAGE', name: 'Manage', category: 'Administrative', risk_level: 'Critical', status: 'Active' },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/roles/:roleId/menu-access', (req, res) => {
  const roleId = req.params.roleId;
  const mockAccess = mockMenus.flatMap(m => [m, ...(m.children || [])]).map(menu => ({
    id: Math.floor(Math.random() * 1000),
    role_code: roleId,
    menu_id: menu.id,
    menu: { code: menu.code, name: menu.name },
    visible: true,
    enabled: true,
    assignment_source: 'AccessLevelDefault',
    override_flag: false,
    status: 'Active',
  }));

  res.json({
    success: true,
    data: { roleId, menuAccess: mockAccess },
    timestamp: new Date().toISOString(),
  });
});

app.patch('/api/v1/rbac/roles/:roleId/menu-access/:menuId', (req, res) => {
  console.log(`[MOCK] Update menu access: role=${req.params.roleId} menu=${req.params.menuId} visible=${req.body.visible} enabled=${req.body.enabled}`);
  res.json({
    success: true,
    data: {
      id: 1,
      role_code: req.params.roleId,
      menu_id: parseInt(req.params.menuId, 10),
      visible: req.body.visible,
      enabled: req.body.enabled,
      assignment_source: 'ManualOverride',
      override_flag: true,
    },
    message: 'Menu access updated (MOCK) - Cache invalidated for role',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/cache/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      redisReady: true,
      keys: 127,
      memory: 'Mock - 12MB used, 180MB estimated for 1000 users',
      cacheStrategy: {
        accessDecision: {
          keyPattern: 'rbac:access:{userId}:{menuCode}:{permissionCode}:{resourceId|_}',
          ttl: { ALLOW: '300s', DENY: '1800s', EXPIRING_SOON: '60s' },
          invalidation: 'On role_menu_access, role_permissions changes',
        },
        fullAccess: { keyPattern: 'rbac:full:{userId}', ttl: '300s' },
        menus: { keyPattern: 'rbac:menus:{userId}', ttl: '300s' },
      },
      performance: {
        withoutCache: { evaluateAccess: '30-50ms', p95: '120ms', pgCpu: '80%' },
        withCache: { evaluateAccess: '2-5ms', hitRate: '95%', p95: '8ms', pgCpu: '10%', improvement: '20x faster' },
      },
      mock: true,
    },
    timestamp: new Date().toISOString(),
  });
});

app.delete('/api/v1/cache/all', (req, res) => {
  res.json({
    success: true,
    data: { deletedKeys: 127 },
    message: 'Nuclear invalidation: 127 keys deleted (MOCK)',
    timestamp: new Date().toISOString(),
  });
});

app.delete('/api/v1/cache/user/:userId', (req, res) => {
  res.json({
    success: true,
    data: { userId: parseInt(req.params.userId, 10), deletedKeys: 12 },
    message: `Invalidated 12 keys for user ${req.params.userId} (MOCK)`,
    timestamp: new Date().toISOString(),
  });
});

app.delete('/api/v1/cache/role/:roleCode', (req, res) => {
  res.json({
    success: true,
    data: { roleCode: req.params.roleCode, deletedKeys: 42 },
    message: `Invalidated 42 keys for role ${req.params.roleCode} (MOCK)`,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/audit/logs', (req, res) => {
  const mockLogs = Array(20).fill(null).map((_, i) => ({
    id: i + 1,
    user_id: (i % 5) + 1,
    username: ['admin.system', 'susan.lee', 'maria.garcia', 'james.wilson', 'rachel.brown'][i % 5],
    action: ['LOGIN_SUCCESS', 'ACCESS_DENIED', 'CONFIGURATION_CHANGE_UPDATE', 'PERMISSION_GRANTED', 'LOGIN_FAILURE'][i % 5],
    entity_type: ['Auth', 'AccessDecision', 'RoleMenuAccess', 'RolePermission', 'Auth'][i % 5],
    description: `Mock audit log ${i + 1} - ${['User login', 'Denied VIEW on USER_MANAGEMENT', 'Updated menu access', 'Granted EDIT', 'Failed login'][i % 5]}`,
    status: i % 5 === 1 ? 'Denied' : i % 5 === 4 ? 'Failure' : 'Success',
    ip_address: '192.168.1.' + (i + 10),
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
  }));

  res.json({
    success: true,
    data: {
      items: mockLogs,
      pagination: { page: 1, limit: 20, total: 150, totalPages: 8, hasNextPage: true, hasPreviousPage: false },
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/audit/statistics', (req, res) => {
  res.json({
    success: true,
    data: {
      period: req.query.period || '7days',
      totals: { totalLogs: 150, deniedLogs: 12, failedLogins: 5, configChanges: 23 },
      byAction: [
        { action: 'LOGIN_SUCCESS', count: 45 },
        { action: 'VIEW', count: 32 },
        { action: 'ACCESS_DENIED', count: 12 },
        { action: 'CONFIGURATION_CHANGE_UPDATE', count: 10 },
      ],
    },
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// NURSING DOMAIN (V3_0 demo) - in-memory CRUD mirroring Nest /nursing endpoints
// ============================================================================
const dayMs = 86400000;
const isoDay = (offset) => new Date(Date.now() + offset * dayMs).toISOString().slice(0, 10);

let nextNurseId = 5;
let nextCredentialId = 7;
let nextRosterId = 9;

const mockUnits = [
  { id: 1, code: 'ICU_A', name: 'ICU Unit A' },
  { id: 2, code: 'ICU_B', name: 'ICU Unit B' },
  { id: 3, code: 'ER_TRIAGE', name: 'ER Triage' },
];
const mockShifts = [
  { id: 1, code: 'MORNING', name: 'Morning Shift', start_time: '07:00', end_time: '15:00' },
  { id: 2, code: 'EVENING', name: 'Evening Shift', start_time: '15:00', end_time: '23:00' },
  { id: 3, code: 'NIGHT', name: 'Night Shift', start_time: '23:00', end_time: '07:00' },
];
const mockPosts = [{ id: 1, code: 'ICU_A_BED_01_10', name: 'Bed 01-10', nursing_unit_id: 1 }];
const mockNurseRoles = [
  { id: 1, code: 'RN', name: 'Registered Nurse', category: 'Clinical' },
  { id: 2, code: 'LPN', name: 'Licensed Practical Nurse', category: 'Clinical' },
  { id: 3, code: 'CNA', name: 'Certified Nursing Assistant', category: 'Clinical' },
  { id: 4, code: 'CHARGE_NURSE', name: 'Charge Nurse', category: 'Clinical' },
];

// ISO countries for the Nationality selector (same list as Nest NursingService)
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda', 'Argentina',
  'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia',
  'Cameroon', 'Canada', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia',
  'Comoros', 'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus',
  'Czechia', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt',
  'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji',
  'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland',
  'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica',
  'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands',
  'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia',
  'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands',
  'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa',
  'San Marino', 'Sao Tome and Principe', 'Saudi', 'Senegal', 'Serbia', 'Seychelles',
  'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
  'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname',
  'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan',
  'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam', 'Yemen',
  'Zambia', 'Zimbabwe',
];

const mockNurses = [
  { id: 1, employeeNumber: 'EMP-1001', firstName: 'Maria', middleName: 'Josefa', lastName: 'Garcia', gender: 'Female', dateOfBirth: '1990-04-12', nationality: 'Filipino', phone: '+966-50-111-2233', hireDate: '2019-03-01', employmentType: 'FullTime', status: 'Active', userId: 4, username: 'maria.garcia', primaryRole: { id: 1, code: 'RN', name: 'Registered Nurse' }, homeUnit: mockUnits[0], _deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, employeeNumber: 'EMP-1002', firstName: 'Ahmed', middleName: null, lastName: 'Hassan', gender: 'Male', dateOfBirth: '1988-11-03', nationality: 'Saudi', phone: '+966-50-222-3344', hireDate: '2020-06-15', employmentType: 'FullTime', status: 'Active', userId: 5, username: 'ahmed.hassan', primaryRole: { id: 1, code: 'RN', name: 'Registered Nurse' }, homeUnit: mockUnits[0], _deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, employeeNumber: 'EMP-1003', firstName: 'Jennifer', middleName: 'Anne', lastName: 'Smith', gender: 'Female', dateOfBirth: '1993-07-22', nationality: 'American', phone: '+966-50-333-4455', hireDate: '2021-09-01', employmentType: 'PartTime', status: 'Active', userId: 6, username: 'jennifer.smith', primaryRole: { id: 2, code: 'LPN', name: 'Licensed Practical Nurse' }, homeUnit: mockUnits[0], _deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, employeeNumber: 'EMP-1004', firstName: 'David', middleName: null, lastName: 'Kim', gender: 'Male', dateOfBirth: '1991-02-14', nationality: 'South Korean', phone: '+966-50-444-5566', hireDate: '2022-01-10', employmentType: 'FullTime', status: 'Active', userId: 7, username: 'david.kim', primaryRole: { id: 3, code: 'CNA', name: 'Certified Nursing Assistant' }, homeUnit: mockUnits[1], _deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockCredentials = [
  { id: 1, nurseId: 1, credentialType: 'License', name: 'RN_LICENSE', issuingAuthority: 'SCFHS', credentialNumber: 'RN-88231', issuedDate: '2023-01-15', expiryDate: isoDay(400), status: 'Valid', verifiedBy: 9, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, nurseId: 2, credentialType: 'License', name: 'RN_LICENSE', issuingAuthority: 'SCFHS', credentialNumber: 'RN-90417', issuedDate: '2022-06-01', expiryDate: isoDay(300), status: 'Valid', verifiedBy: 9, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, nurseId: 3, credentialType: 'Certification', name: 'BLS', issuingAuthority: 'American Heart Association', credentialNumber: 'BLS-44520', issuedDate: isoDay(-340), expiryDate: isoDay(20), status: 'Valid', verifiedBy: 9, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, nurseId: 3, credentialType: 'License', name: 'LPN_LICENSE', issuingAuthority: 'SCFHS', credentialNumber: 'LPN-55201', issuedDate: '2021-09-15', expiryDate: isoDay(500), status: 'Valid', verifiedBy: 9, verifiedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, nurseId: 4, credentialType: 'Certification', name: 'CNA_CERT', issuingAuthority: 'TVTC', credentialNumber: 'CNA-77812', issuedDate: '2022-01-05', expiryDate: isoDay(200), status: 'Valid', verifiedBy: null, verifiedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, nurseId: 1, credentialType: 'Certification', name: 'ACLS', issuingAuthority: 'American Heart Association', credentialNumber: 'ACLS-99871', issuedDate: isoDay(-180), expiryDate: isoDay(185), status: 'PendingVerification', verifiedBy: null, verifiedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const mockRoster = [
  { id: 1, nurseId: 1, unitId: 1, shiftId: 1, postId: 1, assignmentDate: isoDay(1), status: 'Confirmed', notes: 'Charge relief coverage', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 2, nurseId: 1, unitId: 1, shiftId: 3, postId: 1, assignmentDate: isoDay(3), status: 'Scheduled', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 3, nurseId: 2, unitId: 1, shiftId: 2, postId: null, assignmentDate: isoDay(1), status: 'Confirmed', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 4, nurseId: 2, unitId: 1, shiftId: 1, postId: null, assignmentDate: isoDay(4), status: 'Scheduled', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 5, nurseId: 3, unitId: 1, shiftId: 3, postId: null, assignmentDate: isoDay(2), status: 'Scheduled', notes: 'Part-time: nights only', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 6, nurseId: 3, unitId: 1, shiftId: 3, postId: null, assignmentDate: isoDay(5), status: 'Scheduled', notes: 'Part-time: nights only', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 7, nurseId: 4, unitId: 2, shiftId: 1, postId: null, assignmentDate: isoDay(1), status: 'Confirmed', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 8, nurseId: 4, unitId: 2, shiftId: 2, postId: null, assignmentDate: isoDay(2), status: 'Scheduled', notes: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// ---- shape mappers (identical to Nest NursingService output) ----
function mockDaysUntil(expiryDate) {
  if (!expiryDate) return null;
  const today = isoDay(0);
  return Math.round((Date.parse(expiryDate) - Date.parse(today)) / dayMs);
}
function mapMockCredential(c) {
  return {
    id: c.id, nurseId: c.nurseId, credentialType: c.credentialType, name: c.name,
    issuingAuthority: c.issuingAuthority, credentialNumber: c.credentialNumber,
    issuedDate: c.issuedDate, expiryDate: c.expiryDate,
    daysUntilExpiry: mockDaysUntil(c.expiryDate),
    status: c.status, verifiedBy: c.verifiedBy, verifiedAt: c.verifiedAt,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}
function summarizeMockCredentials(nurseId) {
  const active = mockCredentials.filter(
    (c) => c.nurseId === nurseId && !['Revoked', 'Suspended'].includes(c.status),
  );
  let expired = 0; let expiringSoon = 0;
  for (const c of active) {
    const d = mockDaysUntil(c.expiryDate);
    if (c.status === 'Expired' || (d !== null && d < 0)) expired++;
    else if (d !== null && d <= 30) expiringSoon++;
  }
  return {
    credentialSummary: active.length === 0 ? 'None' : expired > 0 ? 'Expired' : expiringSoon > 0 ? 'ExpiringSoon' : 'Valid',
    credentialCounts: { total: active.length, expired, expiringSoon },
  };
}
function mockUserEmail(userId) {
  const u = userId ? Object.keys(mockUsers).map((k) => mockUsers[k]).find((x) => x.id === userId) : null;
  return u ? u.email : null;
}
function mapMockNurse(n) {
  return {
    id: n.id, employeeNumber: n.employeeNumber, firstName: n.firstName,
    middleName: n.middleName || null, lastName: n.lastName,
    // Full Name = First + Middle + Last (middle omitted when not set)
    fullName: [n.firstName, n.middleName, n.lastName].filter(Boolean).join(' '),
    gender: n.gender || null, dateOfBirth: n.dateOfBirth || null, nationality: n.nationality || null,
    // Email is sourced from the linked login account (auth.users)
    email: mockUserEmail(n.userId), phone: n.phone, hireDate: n.hireDate,
    employmentType: n.employmentType, status: n.status, userId: n.userId, username: n.username,
    primaryRole: n.primaryRole, homeUnit: n.homeUnit,
    ...summarizeMockCredentials(n.id),
    createdAt: n.createdAt, updatedAt: n.updatedAt,
  };
}
function mapMockRoster(a) {
  const nurse = mockNurses.find((n) => n.id === a.nurseId);
  const unit = mockUnits.find((u) => u.id === a.unitId);
  const shift = mockShifts.find((s) => s.id === a.shiftId);
  const post = mockPosts.find((p) => p.id === a.postId);
  return {
    id: a.id, nurseId: a.nurseId,
    nurseName: nurse ? [nurse.firstName, nurse.middleName, nurse.lastName].filter(Boolean).join(' ') : undefined,
    employeeNumber: nurse ? nurse.employeeNumber : undefined,
    unitId: a.unitId, unitCode: unit ? unit.code : undefined, unitName: unit ? unit.name : undefined,
    shiftId: a.shiftId, shiftCode: shift ? shift.code : undefined, shiftName: shift ? shift.name : undefined,
    postId: a.postId != null ? a.postId : null, postCode: post ? post.code : undefined, postName: post ? post.name : undefined,
    assignmentDate: a.assignmentDate, status: a.status, notes: a.notes,
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}

app.get('/api/v1/nursing/lookups', (req, res) => {
  res.json({
    success: true,
    data: { roles: mockNurseRoles, units: mockUnits, shifts: mockShifts, posts: mockPosts, countries: COUNTRIES },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/nursing/nurses', (req, res) => {
  const { search, status, unitId } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  let rows = mockNurses.filter((n) => !n._deleted);
  if (status) rows = rows.filter((n) => n.status === status);
  if (unitId) rows = rows.filter((n) => n.homeUnit && n.homeUnit.id === parseInt(unitId, 10));
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(
      (n) =>
        n.firstName.toLowerCase().includes(q) ||
        n.lastName.toLowerCase().includes(q) ||
        n.employeeNumber.toLowerCase().includes(q),
    );
  }
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  res.json({
    success: true,
    data: {
      items: rows.slice((page - 1) * limit, page * limit).map(mapMockNurse),
      pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/nursing/nurses/:id/credentials', (req, res) => {
  const nurseId = parseInt(req.params.id, 10);
  const nurse = mockNurses.find((n) => n.id === nurseId && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + nurseId + ' not found', timestamp: new Date().toISOString() });
  }
  res.json({
    success: true,
    data: { items: mockCredentials.filter((c) => c.nurseId === nurseId).map(mapMockCredential) },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/nursing/nurses/:id', (req, res) => {
  const nurse = mockNurses.find((n) => n.id === parseInt(req.params.id, 10) && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  res.json({
    success: true,
    data: {
      nurse: {
        ...mapMockNurse(nurse),
        credentials: mockCredentials.filter((c) => c.nurseId === nurse.id).map(mapMockCredential),
        upcomingAssignments: mockRoster
          .filter((a) => a.nurseId === nurse.id && a.assignmentDate >= isoDay(0) && a.status !== 'Cancelled')
          .map(mapMockRoster),
      },
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/nursing/nurses', (req, res) => {
  const b = req.body || {};
  if (!b.first_name || !b.last_name) {
    return res.status(400).json({ success: false, message: 'first_name, last_name are required', timestamp: new Date().toISOString() });
  }
  // Employee number auto-generated when omitted (personal-info form does not enter it)
  if (!b.employee_number) {
    const year = new Date().getFullYear();
    let candidate;
    do {
      candidate = `EMP-${year}-${10000 + Math.floor(Math.random() * 90000)}`;
    } while (mockNurses.some((n) => n.employeeNumber === candidate));
    b.employee_number = candidate;
  }
  if (mockNurses.some((n) => n.employeeNumber === b.employee_number)) {
    return res.status(409).json({ success: false, message: 'Employee number "' + b.employee_number + '" already exists', timestamp: new Date().toISOString() });
  }
  if (b.user_id && mockNurses.some((n) => n.userId === b.user_id)) {
    return res.status(409).json({ success: false, message: 'That login account is already linked to another nurse record', timestamp: new Date().toISOString() });
  }
  const role = mockNurseRoles.find((r) => r.id === b.primary_role_id) || null;
  const unit = mockUnits.find((u) => u.id === b.home_unit_id) || null;
  const linkedUser = b.user_id ? Object.keys(mockUsers).map((k) => mockUsers[k]).find((u) => u.id === b.user_id) : null;
  const created = {
    id: nextNurseId++,
    employeeNumber: b.employee_number,
    firstName: b.first_name,
    middleName: b.middle_name || null,
    lastName: b.last_name,
    gender: b.gender || null,
    dateOfBirth: b.date_of_birth ? String(b.date_of_birth).slice(0, 10) : null,
    nationality: b.nationality || null,
    phone: b.phone || null,
    hireDate: b.hire_date ? String(b.hire_date).slice(0, 10) : null,
    employmentType: b.employment_type || 'FullTime',
    status: 'Active',
    userId: b.user_id || null,
    username: linkedUser ? linkedUser.username : null,
    primaryRole: role ? { id: role.id, code: role.code, name: role.name } : null,
    homeUnit: unit,
    _deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockNurses.push(created);
  res.status(201).json({ success: true, statusCode: 201, data: { nurse: mapMockNurse(created) }, timestamp: new Date().toISOString() });
});

app.patch('/api/v1/nursing/nurses/:id', (req, res) => {
  const nurse = mockNurses.find((n) => n.id === parseInt(req.params.id, 10) && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  const b = req.body || {};
  if (b.employee_number && mockNurses.some((n) => n.id !== nurse.id && n.employeeNumber === b.employee_number)) {
    return res.status(409).json({ success: false, message: 'Employee number "' + b.employee_number + '" already exists', timestamp: new Date().toISOString() });
  }
  if (b.employee_number !== undefined) nurse.employeeNumber = b.employee_number;
  if (b.first_name !== undefined) nurse.firstName = b.first_name;
  if (b.middle_name !== undefined) nurse.middleName = b.middle_name;
  if (b.last_name !== undefined) nurse.lastName = b.last_name;
  if (b.gender !== undefined) nurse.gender = b.gender;
  if (b.date_of_birth !== undefined) nurse.dateOfBirth = b.date_of_birth ? String(b.date_of_birth).slice(0, 10) : null;
  if (b.nationality !== undefined) nurse.nationality = b.nationality;
  if (b.phone !== undefined) nurse.phone = b.phone;
  if (b.hire_date !== undefined) nurse.hireDate = String(b.hire_date).slice(0, 10);
  if (b.employment_type !== undefined) nurse.employmentType = b.employment_type;
  if (b.status !== undefined) nurse.status = b.status;
  if (b.primary_role_id !== undefined) {
    const role = mockNurseRoles.find((r) => r.id === b.primary_role_id);
    nurse.primaryRole = role ? { id: role.id, code: role.code, name: role.name } : null;
  }
  if (b.home_unit_id !== undefined) nurse.homeUnit = mockUnits.find((u) => u.id === b.home_unit_id) || null;
  nurse.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { nurse: mapMockNurse(nurse) }, timestamp: new Date().toISOString() });
});

app.delete('/api/v1/nursing/nurses/:id', (req, res) => {
  const nurse = mockNurses.find((n) => n.id === parseInt(req.params.id, 10) && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  nurse._deleted = true;
  nurse.status = 'Terminated';
  nurse.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { message: 'Nurse #' + nurse.id + ' deleted' }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/nursing/credentials/expiring', (req, res) => {
  const days = Math.max(1, parseInt(req.query.days, 10) || 30);
  const items = mockCredentials
    .filter((c) => {
      if (!['Valid', 'ExpiringSoon'].includes(c.status)) return false;
      const nurse = mockNurses.find((n) => n.id === c.nurseId);
      if (!nurse || nurse._deleted || nurse.status !== 'Active') return false;
      const d = mockDaysUntil(c.expiryDate);
      return d !== null && d <= days;
    })
    .sort((a, b) => String(a.expiryDate || '').localeCompare(String(b.expiryDate || '')))
    .map((c) => {
      const nurse = mockNurses.find((n) => n.id === c.nurseId);
      return {
        ...mapMockCredential(c),
        nurse: nurse ? { id: nurse.id, employeeNumber: nurse.employeeNumber, fullName: nurse.firstName + ' ' + nurse.lastName } : null,
      };
    });
  res.json({ success: true, data: { days, items }, timestamp: new Date().toISOString() });
});

app.post('/api/v1/nursing/credentials', (req, res) => {
  const b = req.body || {};
  if (!b.nurse_id || !b.credential_type || !b.name) {
    return res.status(400).json({ success: false, message: 'nurse_id, credential_type, name are required', timestamp: new Date().toISOString() });
  }
  const nurse = mockNurses.find((n) => n.id === b.nurse_id && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + b.nurse_id + ' not found', timestamp: new Date().toISOString() });
  }
  if (mockCredentials.some((c) => c.nurseId === b.nurse_id && c.credentialType === b.credential_type && c.name === b.name)) {
    return res.status(409).json({ success: false, message: 'Nurse already has a ' + b.credential_type + ' named "' + b.name + '"', timestamp: new Date().toISOString() });
  }
  const created = {
    id: nextCredentialId++,
    nurseId: b.nurse_id,
    credentialType: b.credential_type,
    name: b.name,
    issuingAuthority: b.issuing_authority || null,
    credentialNumber: b.credential_number || null,
    issuedDate: b.issued_date ? String(b.issued_date).slice(0, 10) : null,
    expiryDate: b.expiry_date ? String(b.expiry_date).slice(0, 10) : null,
    status: 'PendingVerification',
    verifiedBy: null,
    verifiedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockCredentials.push(created);
  res.status(201).json({ success: true, statusCode: 201, data: { credential: mapMockCredential(created) }, timestamp: new Date().toISOString() });
});

app.patch('/api/v1/nursing/credentials/:id', (req, res) => {
  const cred = mockCredentials.find((c) => c.id === parseInt(req.params.id, 10));
  if (!cred) {
    return res.status(404).json({ success: false, message: 'Credential #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  const b = req.body || {};
  if (b.credential_type !== undefined) cred.credentialType = b.credential_type;
  if (b.name !== undefined) cred.name = b.name;
  if (b.issuing_authority !== undefined) cred.issuingAuthority = b.issuing_authority;
  if (b.credential_number !== undefined) cred.credentialNumber = b.credential_number;
  if (b.issued_date !== undefined) cred.issuedDate = String(b.issued_date).slice(0, 10);
  if (b.expiry_date !== undefined) cred.expiryDate = String(b.expiry_date).slice(0, 10);
  if (b.status !== undefined) cred.status = b.status;
  cred.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { credential: mapMockCredential(cred) }, timestamp: new Date().toISOString() });
});

app.post('/api/v1/nursing/credentials/:id/verify', (req, res) => {
  const cred = mockCredentials.find((c) => c.id === parseInt(req.params.id, 10));
  if (!cred) {
    return res.status(404).json({ success: false, message: 'Credential #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  cred.status = (req.body && req.body.status) || 'Valid';
  cred.verifiedBy = 1;
  cred.verifiedAt = new Date().toISOString();
  cred.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { credential: mapMockCredential(cred) }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/nursing/roster', (req, res) => {
  const { unitId, nurseId, status } = req.query;
  const from = req.query.from ? String(req.query.from).slice(0, 10) : isoDay(0);
  const to = req.query.to ? String(req.query.to).slice(0, 10) : isoDay(31);
  let rows = mockRoster.filter((a) => a.status !== 'Cancelled' && a.assignmentDate >= from && a.assignmentDate <= to);
  if (unitId) rows = rows.filter((a) => a.unitId === parseInt(unitId, 10));
  if (nurseId) rows = rows.filter((a) => a.nurseId === parseInt(nurseId, 10));
  if (status) rows = rows.filter((a) => a.status === status);
  res.json({
    success: true,
    data: { from, to, items: rows.map(mapMockRoster) },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/nursing/roster', (req, res) => {
  const b = req.body || {};
  if (!b.nurse_id || !b.nursing_unit_id || !b.shift_id || !b.assignment_date) {
    return res.status(400).json({ success: false, message: 'nurse_id, nursing_unit_id, shift_id, assignment_date are required', timestamp: new Date().toISOString() });
  }
  const date = String(b.assignment_date).slice(0, 10);
  if (mockRoster.some((a) => a.nurseId === b.nurse_id && a.assignmentDate === date && a.shiftId === b.shift_id && a.status !== 'Cancelled')) {
    return res.status(409).json({ success: false, message: 'Nurse #' + b.nurse_id + ' is already assigned to that shift on ' + date, timestamp: new Date().toISOString() });
  }
  const nurse = mockNurses.find((n) => n.id === b.nurse_id && !n._deleted);
  if (!nurse) {
    return res.status(404).json({ success: false, message: 'Nurse #' + b.nurse_id + ' not found', timestamp: new Date().toISOString() });
  }
  const created = {
    id: nextRosterId++,
    nurseId: b.nurse_id,
    unitId: b.nursing_unit_id,
    shiftId: b.shift_id,
    postId: b.post_id != null ? b.post_id : null,
    assignmentDate: date,
    status: 'Scheduled',
    notes: b.notes || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockRoster.push(created);
  res.status(201).json({ success: true, statusCode: 201, data: { assignment: mapMockRoster(created) }, timestamp: new Date().toISOString() });
});

app.patch('/api/v1/nursing/roster/:id', (req, res) => {
  const asg = mockRoster.find((a) => a.id === parseInt(req.params.id, 10) && a.status !== 'Cancelled');
  if (!asg) {
    return res.status(404).json({ success: false, message: 'Roster assignment #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  const b = req.body || {};
  const newDate = b.assignment_date ? String(b.assignment_date).slice(0, 10) : asg.assignmentDate;
  const newShiftId = b.shift_id !== undefined ? b.shift_id : asg.shiftId;
  const newNurseId = b.nurse_id !== undefined ? b.nurse_id : asg.nurseId;
  if (mockRoster.some((a) => a.id !== asg.id && a.nurseId === newNurseId && a.assignmentDate === newDate && a.shiftId === newShiftId && a.status !== 'Cancelled')) {
    return res.status(409).json({ success: false, message: 'That change would double-book the nurse on this shift/date', timestamp: new Date().toISOString() });
  }
  asg.nurseId = newNurseId;
  asg.shiftId = newShiftId;
  asg.assignmentDate = newDate;
  if (b.nursing_unit_id !== undefined) asg.unitId = b.nursing_unit_id;
  if (b.post_id !== undefined) asg.postId = b.post_id;
  if (b.status !== undefined) asg.status = b.status;
  if (b.notes !== undefined) asg.notes = b.notes;
  asg.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { assignment: mapMockRoster(asg) }, timestamp: new Date().toISOString() });
});

app.delete('/api/v1/nursing/roster/:id', (req, res) => {
  const asg = mockRoster.find((a) => a.id === parseInt(req.params.id, 10) && a.status !== 'Cancelled');
  if (!asg) {
    return res.status(404).json({ success: false, message: 'Roster assignment #' + req.params.id + ' not found', timestamp: new Date().toISOString() });
  }
  asg.status = 'Cancelled';
  asg.updatedAt = new Date().toISOString();
  res.json({ success: true, data: { message: 'Roster assignment #' + asg.id + ' deleted' }, timestamp: new Date().toISOString() });
});

// Catch all
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found in mock server`,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.API_PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mock Backend FIXED running on http://0.0.0.0:${PORT}/api/v1`);
  console.log(`📊 Health: http://0.0.0.0:${PORT}/api/v1/health`);
  console.log(`🔧 Cache stats: http://0.0.0.0:${PORT}/api/v1/cache/stats`);
  console.log(`✅ FIXED: Validates password (must be Password123!) and returns correct user per username`);
  console.log(`👥 Valid users: ${Object.keys(mockUsers).join(', ')}`);
});

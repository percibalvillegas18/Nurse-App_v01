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

// --- LOGIN ATTEMPT COUNTER (5 attempts -> 10 min lock) ---
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10 minutes as requested
const loginAttempts = {}; // username -> { count, lockedUntil, lastAttemptAt }

function getAttemptRecord(username) {
  if (!loginAttempts[username]) {
    loginAttempts[username] = { count: 0, lockedUntil: null, lastAttemptAt: null };
  }
  return loginAttempts[username];
}

function isLocked(username) {
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return false;
  if (Date.now() < record.lockedUntil) return true;
  // Lock expired, reset
  record.count = 0;
  record.lockedUntil = null;
  return false;
}

function getRemainingLockTime(username) {
  const record = loginAttempts[username];
  if (!record || !record.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - Date.now());
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
      { id: 8, code: 'CERTIFICATIONS', name: 'Certifications', route: '/nursing/certifications', icon: 'certificate' },
    ],
  },
  {
    id: 3,
    code: 'SCHEDULING',
    name: 'Scheduling',
    route: '/scheduling',
    icon: 'calendar',
    children: [
      { id: 9, code: 'NURSE_ROSTER', name: 'Nurse Roster', route: '/scheduling/roster', icon: 'list' },
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

  // Check if account is locked due to 5 failed attempts (10 min lock)
  if (isLocked(trimmedUsername)) {
    const remainingMs = getRemainingLockTime(trimmedUsername);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const remainingMin = Math.ceil(remainingMs / 60000);
    const record = getAttemptRecord(trimmedUsername);
    console.log(`[MOCK] Login BLOCKED for ${trimmedUsername}: locked for ${remainingSec}s, attempts ${record.count}/${MAX_ATTEMPTS}`);
    return res.status(423).json({
      success: false,
      statusCode: 423,
      error: 'LOCKED',
      errorCode: 'ACCOUNT_LOCKED',
      message: `Account "${trimmedUsername}" is locked due to ${MAX_ATTEMPTS} failed attempts. Try again in ${remainingMin} minute(s) (${remainingSec}s). Locked until ${new Date(record.lockedUntil).toISOString()}`,
      details: {
        username: trimmedUsername,
        failedAttempts: record.count,
        maxAttempts: MAX_ATTEMPTS,
        lockedUntil: new Date(record.lockedUntil).toISOString(),
        remainingSeconds: remainingSec,
        remainingMinutes: remainingMin,
        retryAfter: remainingSec,
        hint: `Wait ${remainingMin} minute(s) or contact admin. Counter resets after lock expires.`
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Find user first - to give specific username error
  const user = mockUsers[trimmedUsername] || Object.values(mockUsers).find(u => u.email.toLowerCase() === trimmedUsername.toLowerCase());
  
  if (!user) {
    // For security, we still count attempts for non-existent users to prevent enumeration, but show USER_NOT_FOUND
    const record = getAttemptRecord(trimmedUsername);
    record.count += 1;
    record.lastAttemptAt = new Date().toISOString();
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
    }
    console.log(`[MOCK] Login FAILED: user ${username} not found, attempt ${record.count}/${MAX_ATTEMPTS}`);
    return res.status(401).json({
      success: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      errorCode: 'USER_NOT_FOUND',
      message: `Username "${trimmedUsername}" not found. Attempt ${record.count}/${MAX_ATTEMPTS}. ${MAX_ATTEMPTS - record.count} attempts left before 10-min lock.`,
      details: {
        enteredUsername: trimmedUsername,
        validUsernames: Object.keys(mockUsers),
        failedAttempts: record.count,
        remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.count),
        maxAttempts: MAX_ATTEMPTS,
        willLockAfter: MAX_ATTEMPTS - record.count <= 0 ? 'Next failed attempt locks for 10 minutes' : `${MAX_ATTEMPTS - record.count} more fails until lock`,
        hint: 'Username is case-sensitive. Use exact demo username like admin.system or susan.lee'
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Validate password - must be Password123!
  if (password !== 'Password123!') {
    const record = getAttemptRecord(user.username);
    record.count += 1;
    record.lastAttemptAt = new Date().toISOString();
    
    if (record.count >= MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + LOCK_DURATION_MS;
      console.log(`[MOCK] Login FAILED for ${username}: invalid password, LOCKED after ${record.count}/${MAX_ATTEMPTS}`);
      return res.status(423).json({
        success: false,
        statusCode: 423,
        error: 'LOCKED',
        errorCode: 'ACCOUNT_LOCKED',
        message: `Incorrect password for "${user.username}". Account locked after ${record.count} failed attempts. Try again in 10 minutes. Locked until ${new Date(record.lockedUntil).toISOString()}`,
        details: {
          username: user.username,
          failedAttempts: record.count,
          maxAttempts: MAX_ATTEMPTS,
          remainingAttempts: 0,
          lockedUntil: new Date(record.lockedUntil).toISOString(),
          remainingSeconds: 600,
          remainingMinutes: 10,
          retryAfter: 600,
          hint: 'Demo password is Password123! - Wait 10 minutes or contact admin',
          commonMistakes: ['Check Caps Lock', 'Password is case-sensitive', 'Must include ! at end']
        },
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[MOCK] Login FAILED for ${username}: invalid password, attempt ${record.count}/${MAX_ATTEMPTS}`);
    return res.status(401).json({
      success: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      errorCode: 'INVALID_PASSWORD',
      message: `Incorrect password for "${user.username}". Attempt ${record.count}/${MAX_ATTEMPTS}. ${MAX_ATTEMPTS - record.count} attempts left before 10-min lock.`,
      details: {
        username: user.username,
        failedAttempts: record.count,
        remainingAttempts: MAX_ATTEMPTS - record.count,
        maxAttempts: MAX_ATTEMPTS,
        enteredPasswordLength: password.length,
        willLockAfter: `${MAX_ATTEMPTS - record.count} more fails until 10-min lock`,
        hint: 'Demo password is Password123! (capital P, numbers 123, exclamation mark)',
        commonMistakes: ['Check Caps Lock', 'Password is case-sensitive', 'Must include ! at end']
      },
      timestamp: new Date().toISOString(),
    });
  }

  // SUCCESS - reset counter
  const record = getAttemptRecord(user.username);
  record.count = 0;
  record.lockedUntil = null;
  record.lastAttemptAt = new Date().toISOString();

  console.log(`[MOCK] Login SUCCESS for ${username} with role ${user.role}, counter reset`);
  lastLoggedInUser = user;

  const mockToken = `mock_jwt_${user.id}_${user.role}_${Date.now()}`;

  res.json({
    success: true,
    statusCode: 200,
    data: {
      user: user,
      tokens: {
        ...mockTokens,
        accessToken: mockToken,
      },
    },
    message: `Welcome ${user.fullName}! Login successful as ${user.role}`,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/logout', (req, res) => {
  console.log(`[MOCK] Logout for user ${lastLoggedInUser.username}`);
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
    // Also try email lookup
    Object.keys(loginAttempts).forEach(key => {
      if (key.toLowerCase() === trimmed.toLowerCase()) delete loginAttempts[key];
    });
    res.json({ success: true, message: `Attempts reset for ${trimmed}`, timestamp: new Date().toISOString() });
  } else {
    // Reset all
    Object.keys(loginAttempts).forEach(k => delete loginAttempts[k]);
    console.log(`[MOCK] Reset ALL attempts`);
    res.json({ success: true, message: 'All attempts reset', timestamp: new Date().toISOString() });
  }
});

app.get('/api/v1/auth/attempts/:username', (req, res) => {
  const username = req.params.username;
  const record = loginAttempts[username] || { count: 0, lockedUntil: null, lastAttemptAt: null };
  const remainingMs = record.lockedUntil ? Math.max(0, record.lockedUntil - Date.now()) : 0;
  res.json({
    success: true,
    data: {
      username,
      failedAttempts: record.count,
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - record.count),
      maxAttempts: MAX_ATTEMPTS,
      isLocked: remainingMs > 0,
      lockedUntil: record.lockedUntil ? new Date(record.lockedUntil).toISOString() : null,
      remainingSeconds: Math.ceil(remainingMs / 1000),
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/refresh-token', (req, res) => {
  res.json({
    success: true,
    data: { accessToken: `mock_jwt_${lastLoggedInUser.id}_${lastLoggedInUser.role}_${Date.now()}`, expiresIn: 3600 },
    message: 'Token refreshed (MOCK)',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/auth/me', (req, res) => {
  // Try to parse user from Authorization header mock token
  const authHeader = req.headers.authorization;
  let user = lastLoggedInUser;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    // Parse mock_jwt_{id}_{role}_{timestamp}
    const match = token.match(/mock_jwt_(\d+)_([A-Z_]+)_/);
    if (match) {
      const userId = parseInt(match[1], 10);
      const foundUser = Object.values(mockUsers).find(u => u.id === userId);
      if (foundUser) {
        user = foundUser;
      }
    }
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

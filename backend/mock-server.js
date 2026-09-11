/**
 * Mock Backend Server for Live Preview
 * Serves same endpoints as NestJS backend but with static data
 * No DB or Redis required - for frontend preview only
 */

const express = require('express');
const cors = require('cors');

const app = express();
// Fix for Arena preview: allow all origins, allow iframe embedding, allow preview host
app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  // Allow iframe embedding for preview
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  // Allow preview host
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id,X-Session-Id');
  next();
});
app.use(express.json());

// Mock data
const mockUser = {
  id: 1,
  username: 'admin.system',
  email: 'admin@hospital.local',
  fullName: 'System Administrator',
  role: 'SYSTEM_ADMIN',
  roleName: 'System Administrator',
  status: 'Active',
  primaryRole: { code: 'SYSTEM_ADMIN', name: 'System Administrator', category: 'System' },
  roles: [
    { code: 'SYSTEM_ADMIN', name: 'System Administrator', category: 'System' },
  ],
};

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
        <h1>🚀 Nurse-App Mock Backend Running</h1>
        <p>Mode: MOCK - No DB/Redis required, for frontend preview</p>
        <ul>
          <li><a href="/api/v1/health">Health Check</a></li>
          <li><a href="/api/v1/cache/stats">Cache Stats</a></li>
          <li><a href="/api/v1/rbac/menus/hierarchy?accessibleOnly=true">Menus Hierarchy</a></li>
          <li><a href="/api/v1/audit/logs">Audit Logs</a></li>
        </ul>
        <p>Frontend should be on port 3000, proxying /api to this backend.</p>
        <p>Try login: admin.system / Password123! (any password works in mock)</p>
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
    version: '0.1.0-mock',
    mode: 'MOCK - No DB/Redis, for frontend preview',
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
  const { username } = req.body;
  // Accept any username with Password123!
  res.json({
    success: true,
    statusCode: 200,
    data: {
      user: { ...mockUser, username: username || mockUser.username },
      tokens: mockTokens,
    },
    message: 'Login successful (MOCK)',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/logout', (req, res) => {
  res.json({ success: true, message: 'Logout successful (MOCK)', timestamp: new Date().toISOString() });
});

app.post('/api/v1/auth/refresh-token', (req, res) => {
  res.json({
    success: true,
    data: { accessToken: mockTokens.accessToken, expiresIn: 3600 },
    message: 'Token refreshed (MOCK)',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/auth/me', (req, res) => {
  res.json({
    success: true,
    data: { user: mockUser },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/menus', (req, res) => {
  res.json({ success: true, data: { menus: mockMenus }, timestamp: new Date().toISOString() });
});

app.get('/api/v1/rbac/menus/hierarchy', (req, res) => {
  const accessibleOnly = req.query.accessibleOnly === 'true';
  res.json({
    success: true,
    data: { menus: accessibleOnly ? mockMenus : mockMenus },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/rbac/effective-access/:userId', (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  res.json({
    success: true,
    data: {
      userId,
      calculatedAt: new Date().toISOString(),
      menus: mockMenus.flatMap(m => m.children || []).concat(mockMenus.filter(m => !m.children || m.children.length === 0)).map(m => ({
        id: m.id,
        code: m.code,
        name: m.name,
        route: m.route,
        isAccessible: true,
        permissions: { VIEW: true, CREATE: true, EDIT: true, DELETE: userId === 1, MANAGE: userId === 1 },
      })),
      fullMatrix: Array(20).fill(null).map((_, i) => ({
        menu_code: mockMenus[i % mockMenus.length]?.code || 'DASHBOARD',
        permission_code: ['VIEW', 'CREATE', 'EDIT', 'DELETE'][i % 4],
        is_accessible: true,
        is_allowed: true,
      })),
      summary: {
        accessibleMenus: 12,
        totalRows: 240,
        grantedPermissions: 48,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/rbac/effective-access/:userId/evaluate', (req, res) => {
  const { menuCode, permissionCode, resourceId } = req.body;
  const userId = parseInt(req.params.userId, 10);

  // Simulate AND logic
  const isAdmin = userId === 1;
  const isRestrictedMenu = ['USER_MANAGEMENT', 'SYSTEM_SETTINGS', 'ROLES_PERMISSIONS'].includes(menuCode);
  const isSensitivePerm = ['DELETE', 'MANAGE'].includes(permissionCode);

  let decision = 'ALLOW';
  let reason = 'Authorization granted: all checks passed (MOCK) - Roles [SYSTEM_ADMIN] - Multi-role OR logic active';
  let menuAccessible = true;
  let permissionGranted = true;
  let dataScopeValid = true;
  let cacheTtl = 300;
  let cached = Math.random() > 0.3; // 70% cache hit for demo

  // Simulate some DENY cases for demo
  if (!isAdmin && isRestrictedMenu && isSensitivePerm) {
    decision = 'DENY';
    reason = `Permission "${permissionCode}" not granted for roles [RN] - MOCK DENY for demo`;
    permissionGranted = false;
    cacheTtl = 1800;
    cached = Math.random() > 0.5;
  }

  if (!isAdmin && menuCode === 'SYSTEM_SETTINGS') {
    decision = 'DENY';
    reason = 'Menu not accessible for roles [RN] (visible=false, enabled=false) - MOCK';
    menuAccessible = false;
    permissionGranted = false;
    cacheTtl = 1800;
  }

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
        roles: isAdmin ? ['SYSTEM_ADMIN'] : ['RN'],
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
  console.log(`🚀 Mock Backend running on http://0.0.0.0:${PORT}/api/v1`);
  console.log(`📊 Health: http://0.0.0.0:${PORT}/api/v1/health`);
  console.log(`🔧 Cache stats: http://0.0.0.0:${PORT}/api/v1/cache/stats`);
  console.log(`⚠️  MOCK MODE - No DB/Redis required, for frontend preview only`);
});

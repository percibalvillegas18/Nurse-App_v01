export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  status: string;
  primaryRole?: {
    code: string;
    name: string;
    category: string;
  };
  roles?: Array<{
    code: string;
    name: string;
    category: string;
  }>;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

export interface LoginResponse {
  user: User;
  tokens: Tokens;
}

export interface AccessDecision {
  decision: 'ALLOW' | 'DENY';
  reason: string;
  menuAccessible: boolean;
  permissionGranted: boolean;
  dataScopeValid: boolean;
  cacheTtl: number;
  evaluatedAt: string;
  userRole: string | null;
  userRoles: string[];
}

export interface EvaluateAccessRequest {
  menuCode: string;
  permissionCode: string;
  resourceId?: number;
}

export interface EvaluateAccessResponse {
  userId: number;
  menuCode: string;
  permissionCode: string;
  resourceId?: number;
  decision: {
    allowed: boolean;
    menuAccessible: boolean;
    permissionGranted: boolean;
    dataScopeValid: boolean;
    reason: string;
    evaluatedAt: string;
    cacheTtl: number;
    roles: string[];
  };
}

export interface Menu {
  id: number;
  code: string;
  name: string;
  description?: string;
  parent_menu_id: number | null;
  display_order: number;
  route: string;
  icon?: string;
  is_functional: boolean;
  status: string;
  children?: Menu[];
  visible?: boolean;
  enabled?: boolean;
  permissions?: Record<string, boolean>;
}

export interface Permission {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'Standard' | 'Administrative' | 'Workflow' | 'Sensitive';
  risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  status: string;
}

export interface RoleMenuAccess {
  id: number;
  role_code: string;
  menu_id: number;
  menu?: Menu;
  visible: boolean;
  enabled: boolean;
  assignment_source: string;
  override_flag: boolean;
  status: string;
}

export interface RolePermission {
  id: number;
  role_code: string;
  menu_id: number;
  permission_id: number;
  menu?: Menu;
  permission?: Permission;
  allowed: boolean;
  source: string;
  override_flag: boolean;
  status: string;
}

export interface HospitalRole {
  id: number;
  code: string;
  name: string;
  description: string;
  category: 'Clinical' | 'Administrative' | 'System' | 'Support';
  department?: string;
  status: string;
}

export interface DataScope {
  id: number;
  user_id: number;
  scope_type: 'Hospital' | 'Department' | 'NursingUnit' | 'Post' | 'Shift' | 'Assigned' | 'All';
  organization_id?: number;
  department_id?: number;
  nursing_unit_id?: number;
  organization?: { name: string };
  department?: { name: string };
  nursing_unit?: { name: string };
  status: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  username?: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  description?: string;
  changes?: any;
  status: string;
  created_at: string;
}

export interface ApiResponse<T> {
  success: boolean;
  statusCode?: number;
  data: T;
  message?: string;
  timestamp: string;
  requestId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

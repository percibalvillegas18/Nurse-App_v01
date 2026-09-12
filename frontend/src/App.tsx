import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ConfigProvider, App as AntApp, Spin } from 'antd';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, PublicRoute } from './components/ProtectedRoute';
import { SessionIdleGuard } from './components/SessionIdleGuard';
import { AppLayout } from './components/Layout/AppLayout';

// Route-level code-splitting: each page is fetched on demand so the heavy
// Ant Design / React Query vendor code is no longer inlined into one bundle.
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const NurseMaster = lazy(() => import('./pages/NurseMaster').then((m) => ({ default: m.NurseMaster })));
const Roster = lazy(() => import('./pages/Roster').then((m) => ({ default: m.Roster })));
const Credentials = lazy(() => import('./pages/Credentials').then((m) => ({ default: m.Credentials })));
const Contract = lazy(() => import('./pages/Contract').then((m) => ({ default: m.Contract })));
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const Users = lazy(() => import('./pages/Users').then((m) => ({ default: m.Users })));
const Roles = lazy(() => import('./pages/RBAC/Roles').then((m) => ({ default: m.Roles })));
const EffectiveAccessPage = lazy(() =>
  import('./pages/RBAC/EffectiveAccess').then((m) => ({ default: m.EffectiveAccessPage })),
);
const AuditLogs = lazy(() => import('./pages/RBAC/AuditLogs').then((m) => ({ default: m.AuditLogs })));
const CacheStats = lazy(() => import('./pages/RBAC/CacheStats').then((m) => ({ default: m.CacheStats })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const Forbidden = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.Forbidden })));

const PageFallback: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
    }}
  >
    <Spin size="large" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 8,
          },
        }}
      >
        <AntApp>
          <AuthProvider>
            <SessionIdleGuard>
              <BrowserRouter>
                <Suspense fallback={<PageFallback />}>
                <Routes>
                  {/* Public */}
                  <Route
                    path="/login"
                    element={
                      <PublicRoute>
                        <Login />
                      </PublicRoute>
                    }
                  />

                  {/* Protected */}
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Dashboard />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/nursing/master"
                    element={
                      <ProtectedRoute menuCode="NURSE_MASTER" permissionCode="VIEW">
                        <AppLayout>
                          <NurseMaster />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/scheduling/roster"
                    element={
                      <ProtectedRoute menuCode="NURSE_ROSTER" permissionCode="VIEW">
                        <AppLayout>
                          <Roster />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* RBAC Admin - requires ROLES_PERMISSIONS VIEW */}
                  <Route
                    path="/admin/rbac"
                    element={
                      <ProtectedRoute menuCode="ROLES_PERMISSIONS" permissionCode="VIEW">
                        <AppLayout>
                          <Roles />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/effective-access"
                    element={
                      <ProtectedRoute menuCode="USER_MANAGEMENT" permissionCode="VIEW">
                        <AppLayout>
                          <EffectiveAccessPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/audit"
                    element={
                      <ProtectedRoute menuCode="AUDIT_LOGS" permissionCode="VIEW">
                        <AppLayout>
                          <AuditLogs />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/cache"
                    element={
                      <ProtectedRoute menuCode="SYSTEM_SETTINGS" permissionCode="VIEW">
                        <AppLayout>
                          <CacheStats />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Placeholder routes for other menus */}
                  <Route
                    path="/nursing/credentials"
                    element={
                      <ProtectedRoute menuCode="CREDENTIALS" permissionCode="VIEW">
                        <AppLayout>
                          <Credentials />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/nursing/contract"
                    element={
                      <ProtectedRoute menuCode="CONTRACT" permissionCode="VIEW">
                        <AppLayout>
                          <Contract />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/nursing/documents"
                    element={
                      <ProtectedRoute menuCode="DOCUMENTS" permissionCode="VIEW">
                        <AppLayout>
                          <Documents />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/admin/users"
                    element={
                      <ProtectedRoute menuCode="USER_MANAGEMENT" permissionCode="VIEW">
                        <AppLayout>
                          <Users />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Errors */}
                  <Route path="/403" element={<Forbidden />} />
                  <Route path="/404" element={<NotFound />} />

                  {/* Default */}
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </Suspense>
              </BrowserRouter>
            </SessionIdleGuard>
          </AuthProvider>
        </AntApp>
      </ConfigProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
};

export default App;

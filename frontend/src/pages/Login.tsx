import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message, Progress, Statistic } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, InfoCircleOutlined, WarningOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';

const { Title, Text } = Typography;

const LAST_ATTEMPT_KEY = 'lastLoginAttempt';
const ATTEMPT_INFO_KEY = 'loginAttemptInfoMap'; // Now stores map username -> info
const DEFAULT_CREDENTIALS = { username: 'admin.system', password: 'Password123!' };
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MIN = 10;

function getInitialValues() {
  try {
    const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.username) return parsed;
    }
  } catch {}
  return DEFAULT_CREDENTIALS;
}

interface AttemptInfo {
  failedAttempts: number;
  remainingAttempts: number;
  maxAttempts: number;
  lockedUntil?: string;
  remainingSeconds?: number;
  isLocked?: boolean;
  username?: string;
}

type AttemptMap = Record<string, AttemptInfo>;

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [attemptMap, setAttemptMap] = useState<AttemptMap>(() => {
    try {
      const saved = localStorage.getItem(ATTEMPT_INFO_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [currentUsername, setCurrentUsername] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
      if (saved) return JSON.parse(saved).username || DEFAULT_CREDENTIALS.username;
    } catch {}
    return DEFAULT_CREDENTIALS.username;
  });
  const [lockCountdown, setLockCountdown] = useState<number>(0);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ username: string; password: string } | null>(() => {
    try {
      const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const { login } = useAuth();
  const navigate = useNavigate();

  // Get attempt info for current username
  const attemptInfo = attemptMap[currentUsername] || null;
  const isLocked = lockCountdown > 0 || attemptInfo?.isLocked;

  // Restore on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.username) {
          form.setFieldsValue(parsed);
          setLastAttempt(parsed);
          setCurrentUsername(parsed.username);
        }
      }
      const attemptSaved = localStorage.getItem(ATTEMPT_INFO_KEY);
      if (attemptSaved) {
        const map: AttemptMap = JSON.parse(attemptSaved);
        // Check if current user's lock expired
        const currentInfo = map[currentUsername];
        if (currentInfo?.lockedUntil) {
          const remaining = Math.max(0, Math.ceil((new Date(currentInfo.lockedUntil).getTime() - Date.now()) / 1000));
          if (remaining > 0) {
            setLockCountdown(remaining);
            startCountdown(remaining);
          } else {
            // Expired, clear for this user
            delete map[currentUsername];
            localStorage.setItem(ATTEMPT_INFO_KEY, JSON.stringify(map));
            setAttemptMap(map);
          }
        }
      }
    } catch {}
  }, [form]);

  // When currentUsername changes, update countdown for that user
  useEffect(() => {
    const info = attemptMap[currentUsername];
    if (info?.lockedUntil) {
      const remaining = Math.max(0, Math.ceil((new Date(info.lockedUntil).getTime() - Date.now()) / 1000));
      if (remaining > 0) {
        setLockCountdown(remaining);
        startCountdown(remaining);
      } else {
        setLockCountdown(0);
        // Clear expired lock for this user
        const newMap = { ...attemptMap };
        delete newMap[currentUsername];
        setAttemptMap(newMap);
        persistAttemptMap(newMap);
      }
    } else {
      setLockCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [currentUsername]);

  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLockCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setLockCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          // Unlock for current user
          setAttemptMap(prevMap => {
            const newMap = { ...prevMap };
            delete newMap[currentUsername];
            persistAttemptMap(newMap);
            return newMap;
          });
          setGenericError(null);
          message.success(`Lock expired for ${currentUsername} - you can try again`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const persistAttempt = (values: { username: string; password: string }) => {
    try {
      localStorage.setItem(LAST_ATTEMPT_KEY, JSON.stringify(values));
    } catch {}
  };

  const persistAttemptMap = (map: AttemptMap) => {
    try {
      localStorage.setItem(ATTEMPT_INFO_KEY, JSON.stringify(map));
    } catch {}
  };

  const onValuesChange = (_changed: any, allValues: { username: string; password: string }) => {
    persistAttempt(allValues);
    if (allValues.username) {
      setCurrentUsername(allValues.username);
    }
    if (_changed.username !== undefined) {
      form.setFields([{ name: 'username', errors: [] }]);
    }
    if (_changed.password !== undefined) {
      form.setFields([{ name: 'password', errors: [] }]);
    }
    if (genericError && !isLocked) setGenericError(null);
  };

  const onFinish = async (values: { username: string; password: string }) => {
    if (lockCountdown > 0) {
      message.error(`Account ${values.username} locked - wait ${Math.ceil(lockCountdown / 60)} min (${lockCountdown}s)`);
      return;
    }

    setLoading(true);
    setGenericError(null);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    persistAttempt(values);
    setLastAttempt({ ...values });
    setCurrentUsername(values.username);
    
    try {
      await login(values.username, values.password);
      message.success(`Welcome ${values.username}!`);
      // Reset counter for this user on success
      setAttemptMap(prev => {
        const newMap = { ...prev };
        delete newMap[values.username];
        persistAttemptMap(newMap);
        return newMap;
      });
      setLockCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      // Reset backend counter too
      try {
        await apiClient.post('/auth/reset-attempts', { username: values.username });
      } catch {}
      persistAttempt(values);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err, err.response?.data);
      
      const errorCode = err.response?.data?.errorCode || '';
      const details = err.response?.data?.details || {};
      let rawMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Login failed';
      if (Array.isArray(rawMessage)) rawMessage = rawMessage.join(', ');
      
      const lowerMsg = String(rawMessage).toLowerCase();
      const isUserNotFound = errorCode === 'USER_NOT_FOUND' || lowerMsg.includes('not found');
      const isInvalidPassword = errorCode === 'INVALID_PASSWORD' || lowerMsg.includes('incorrect password');
      const isLockedErr = errorCode === 'ACCOUNT_LOCKED' || err.response?.status === 423 || lowerMsg.includes('locked');
      const isInactive = lowerMsg.includes('inactive') || lowerMsg.includes('suspended');

      // Use backend's failedAttempts if provided, otherwise increment local per-user counter
      let failedAttempts = details.failedAttempts;
      if (failedAttempts === undefined || failedAttempts === 0) {
        // Backend didn't provide count (real backend for USER_NOT_FOUND doesn't count), use local per-user
        const existing = attemptMap[values.username];
        failedAttempts = (existing?.failedAttempts || 0) + 1;
      }
      const remainingAttempts = details.remainingAttempts ?? Math.max(0, MAX_ATTEMPTS - failedAttempts);
      const maxAttempts = details.maxAttempts || MAX_ATTEMPTS;
      const lockedUntil = details.lockedUntil;
      const remainingSeconds = details.remainingSeconds || details.retryAfter || 0;

      const newAttemptInfo: AttemptInfo = {
        failedAttempts,
        remainingAttempts,
        maxAttempts,
        lockedUntil,
        remainingSeconds,
        isLocked: isLockedErr || failedAttempts >= MAX_ATTEMPTS,
        username: values.username,
      };

      // Save per-user
      setAttemptMap(prev => {
        const newMap = { ...prev, [values.username]: newAttemptInfo };
        persistAttemptMap(newMap);
        return newMap;
      });

      if (isLockedErr || failedAttempts >= MAX_ATTEMPTS) {
        const secs = remainingSeconds || LOCK_DURATION_MIN * 60;
        setLockCountdown(secs);
        startCountdown(secs);
        const mins = Math.ceil(secs / 60);
        const friendly = `Account "${values.username}" locked after ${failedAttempts}/${MAX_ATTEMPTS} fails. Wait ${mins} min (${secs}s) until ${lockedUntil ? new Date(lockedUntil).toLocaleTimeString() : `${LOCK_DURATION_MIN} min`}.`;
        setGenericError(friendly);
        message.error(friendly, 6);
      } else if (isUserNotFound) {
        const msg = `Username "${values.username}" not found. Attempt ${failedAttempts}/${MAX_ATTEMPTS}, ${remainingAttempts} left before ${LOCK_DURATION_MIN}-min lock.`;
        form.setFields([{ name: 'username', errors: [msg] }]);
        message.warning(msg, 4);
      } else if (isInvalidPassword) {
        const msg = `Incorrect password for "${values.username}". Attempt ${failedAttempts}/${MAX_ATTEMPTS}, ${remainingAttempts} left.`;
        form.setFields([{ name: 'password', errors: [msg] }]);
        message.warning(msg, 4);
      } else if (isInactive) {
        setGenericError(`${rawMessage}. Contact HR.`);
        message.error(String(rawMessage), 5);
      } else {
        if (lowerMsg.includes('password')) {
          form.setFields([{ name: 'password', errors: [String(rawMessage)] }]);
        } else if (lowerMsg.includes('username') || lowerMsg.includes('user')) {
          form.setFields([{ name: 'username', errors: [String(rawMessage)] }]);
        } else {
          setGenericError(`${rawMessage} (attempt ${failedAttempts}/${MAX_ATTEMPTS})`);
          message.error(String(rawMessage), 5);
        }
      }

      form.setFieldsValue(values);
      persistAttempt(values);
      setLastAttempt({ ...values });
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (username: string) => {
    if (attemptMap[username]?.isLocked || (username === currentUsername && lockCountdown > 0)) {
      message.warning(`${username} locked - wait ${Math.ceil(lockCountdown/60)} min or reset`);
      return;
    }
    const newValues = { username, password: 'Password123!' };
    form.setFieldsValue(newValues);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    persistAttempt(newValues);
    setLastAttempt(newValues);
    setCurrentUsername(username);
    setGenericError(null);
  };

  const clearAndResetDefault = async () => {
    // Reset backend counters for current user and all
    try {
      await apiClient.post('/auth/reset-attempts', { username: currentUsername });
      await apiClient.post('/auth/reset-attempts', {}); // reset all for testing
    } catch {}
    localStorage.removeItem(LAST_ATTEMPT_KEY);
    localStorage.removeItem(ATTEMPT_INFO_KEY);
    form.setFieldsValue(DEFAULT_CREDENTIALS);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    setLastAttempt(DEFAULT_CREDENTIALS);
    setCurrentUsername(DEFAULT_CREDENTIALS.username);
    setAttemptMap({});
    setLockCountdown(0);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setGenericError(null);
    message.success('Reset: counters cleared for all users, form reset to admin.system');
  };

  const resetCurrentUserAttempts = async () => {
    try {
      await apiClient.post('/auth/reset-attempts', { username: currentUsername });
    } catch {}
    setAttemptMap(prev => {
      const newMap = { ...prev };
      delete newMap[currentUsername];
      persistAttemptMap(newMap);
      return newMap;
    });
    setLockCountdown(0);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setGenericError(null);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    message.success(`Attempts reset for ${currentUsername}`);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const attemptPercent = attemptInfo ? Math.min(100, (attemptInfo.failedAttempts / MAX_ATTEMPTS) * 100) : 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 480,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <SafetyOutlined style={{ fontSize: 38, color: '#1677ff', marginBottom: 6 }} />
          <Title level={4} style={{ marginBottom: 2 }}>
            Nurse-App
          </Title>
          <Text type="secondary" style={{ fontSize: 11 }}>Hospital Workforce - RBAC Secured - 5 attempts / 10 min lock</Text>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {lastAttempt && (
              <span style={{ fontSize: 10, color: '#1677ff', background: '#f0f5ff', padding: '2px 8px', borderRadius: 10 }}>
                <InfoCircleOutlined style={{ marginRight: 3 }} />
                Last: {lastAttempt.username}
              </span>
            )}
            {attemptInfo && (
              <span style={{ fontSize: 10, color: isLocked ? '#ff4d4f' : '#faad14', background: isLocked ? '#fff2f0' : '#fffbe6', padding: '2px 8px', borderRadius: 10, border: `1px solid ${isLocked ? '#ffccc7' : '#ffe58f'}` }}>
                {attemptInfo.username}: {attemptInfo.failedAttempts}/{MAX_ATTEMPTS} {isLocked ? 'LOCKED' : `(${attemptInfo.remainingAttempts} left)`}
              </span>
            )}
          </div>
        </div>

        {attemptInfo && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: isLocked ? '#fff2f0' : attemptInfo.failedAttempts >= 3 ? '#fffbe6' : '#f6ffed', border: `1px solid ${isLocked ? '#ffccc7' : attemptInfo.failedAttempts >= 3 ? '#ffe58f' : '#b7eb8f'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ fontSize: 11 }}>
                <WarningOutlined style={{ marginRight: 4, color: isLocked ? '#ff4d4f' : '#faad14' }} />
                {attemptInfo.username} - Attempts: {attemptInfo.failedAttempts}/{MAX_ATTEMPTS}
              </Text>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {isLocked ? 'LOCKED' : `${attemptInfo.remainingAttempts} left`}
              </Text>
            </div>
            <Progress percent={attemptPercent} showInfo={false} size="small" strokeColor={isLocked ? '#ff4d4f' : attemptInfo.failedAttempts >= 3 ? '#faad14' : '#52c41a'} style={{ margin: 0 }} />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>Failed: {attemptInfo.failedAttempts} | Remaining: {attemptInfo.remainingAttempts}</span>
              {isLocked ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}><ClockCircleOutlined /> Locked {LOCK_DURATION_MIN} min</span> : <span>Lock after {MAX_ATTEMPTS} fails</span>}
            </div>
            {isLocked && lockCountdown > 0 && (
              <div style={{ marginTop: 8, textAlign: 'center', background: '#fff', padding: 8, borderRadius: 6, border: '1px dashed #ff4d4f' }}>
                <Statistic title={`Unlock in - ${attemptInfo.username}`} value={formatCountdown(lockCountdown)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 22, color: '#ff4d4f', fontWeight: 'bold' }} />
                <Text type="secondary" style={{ fontSize: 10 }}>Wait {Math.ceil(lockCountdown/60)} min ({lockCountdown}s) - Counter resets after lock expires</Text>
                <br />
                <Button size="small" icon={<ReloadOutlined />} onClick={resetCurrentUserAttempts} style={{ marginTop: 6, fontSize: 10 }}>
                  Reset {currentUsername} attempts (for testing)
                </Button>
              </div>
            )}
          </div>
        )}

        {genericError && (
          <Alert
            message={isLocked ? `Account ${currentUsername} Locked - Wait ${LOCK_DURATION_MIN} min` : "Authentication Issue"}
            description={<div style={{ whiteSpace: 'pre-line', fontSize: 11 }}>{genericError}</div>}
            type={isLocked ? "error" : "warning"}
            showIcon
            closable
            onClose={() => setGenericError(null)}
            style={{ marginBottom: 12, fontSize: 11 }}
          />
        )}

        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          onValuesChange={onValuesChange}
          layout="vertical"
          size="large"
          preserve={true}
          initialValues={getInitialValues()}
          style={{ marginBottom: 0 }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please input your username!' }]}
            style={{ marginBottom: 14 }}
            hasFeedback
          >
            <Input prefix={<UserOutlined />} placeholder="Username or Email" allowClear disabled={isLocked} />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
            style={{ marginBottom: 14 }}
            hasFeedback
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" allowClear disabled={isLocked} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={isLocked}>
              {isLocked ? `Locked ${currentUsername} - Wait ${formatCountdown(lockCountdown)}` : 'Log in'}
            </Button>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
            <Button type="link" size="small" onClick={clearAndResetDefault} style={{ fontSize: 10, padding: 0 }}>
              Reset all (clear counters)
            </Button>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {attemptInfo ? `${currentUsername}: ${attemptInfo.failedAttempts}/${MAX_ATTEMPTS}` : `Max ${MAX_ATTEMPTS} → ${LOCK_DURATION_MIN} min lock`}
            </Text>
          </div>
        </Form>

        <Divider style={{ margin: '10px 0' }}>Demo Accounts</Divider>

        <Space direction="vertical" size={2} style={{ width: '100%', fontSize: 11 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Password: <Text code style={{ fontSize: 10 }}>Password123!</Text> - Per-user counter, 5 fails → 10 min lock
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 10 }}>
            {Object.keys({
              'admin.system': 1,
              'susan.lee': 1,
              'james.wilson': 1,
              'maria.garcia': 1,
              'rachel.brown': 1,
              'patricia.johnson': 1,
              'ahmed.hassan': 1,
              'michael.wong': 1,
            }).map(u => {
              const info = attemptMap[u];
              const locked = info?.isLocked;
              return (
                <Button key={u} type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10, color: locked ? '#ff4d4f' : undefined }} onClick={() => fillDemoAccount(u)} disabled={!!(attemptMap[u]?.isLocked && u === currentUsername && lockCountdown > 0)}>
                  • {u} {info ? `(${info.failedAttempts}/${MAX_ATTEMPTS}${locked ? ' LOCKED' : ''})` : ''} {u.includes('admin') ? '(ADMIN)' : ''}
                </Button>
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: '#595959', background: '#fafafa', padding: '6px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <strong>Fixed:</strong> Counter is per-username now, not global. 1st fail = 1/5, 2nd = 2/5 (not 5/5). Reset button clears backend + frontend counters. If locked, shows live countdown MM:SS and auto-unlocks.
          </div>
        </Space>

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 9 }}>
            Secured - Per-user {MAX_ATTEMPTS} attempts / {LOCK_DURATION_MIN} min lock with countdown
          </Text>
        </div>
      </Card>
    </div>
  );
};

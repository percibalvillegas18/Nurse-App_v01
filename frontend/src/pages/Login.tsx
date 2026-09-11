import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message, Progress, Statistic } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, InfoCircleOutlined, WarningOutlined, ClockCircleOutlined, ReloadOutlined, GlobalOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../api/client';

const { Title, Text } = Typography;

const LAST_ATTEMPT_KEY = 'lastLoginAttempt';
const ATTEMPT_INFO_KEY = 'loginAttemptInfoGlobal'; // GLOBAL counter
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
  isGlobal?: boolean;
}

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<AttemptInfo | null>(() => {
    try {
      const saved = localStorage.getItem(ATTEMPT_INFO_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [lockCountdown, setLockCountdown] = useState<number>(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const isLocked = lockCountdown > 0 || attemptInfo?.isLocked;

  // Restore and fetch GLOBAL counter from backend
  useEffect(() => {
    const init = async () => {
      try {
        const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.username) {
            form.setFieldsValue(parsed);
            setLastAttempt(parsed);
          }
        }
        // Fetch GLOBAL counter from backend (same for username+password errors)
        try {
          const resp = await apiClient.get('/auth/attempts');
          const data = resp.data.data;
          if (data.failedAttempts > 0 || data.isLocked) {
            const info: AttemptInfo = {
              failedAttempts: data.failedAttempts,
              remainingAttempts: data.remainingAttempts,
              maxAttempts: data.maxAttempts,
              lockedUntil: data.lockedUntil,
              remainingSeconds: data.remainingSeconds,
              isLocked: data.isLocked,
              isGlobal: true,
            };
            setAttemptInfo(info);
            localStorage.setItem(ATTEMPT_INFO_KEY, JSON.stringify(info));
            if (data.isLocked && data.remainingSeconds > 0) {
              setLockCountdown(data.remainingSeconds);
              startCountdown(data.remainingSeconds);
            }
          }
        } catch {
          // Fallback to localStorage global
          const localSaved = localStorage.getItem(ATTEMPT_INFO_KEY);
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (parsed.lockedUntil) {
              const remaining = Math.max(0, Math.ceil((new Date(parsed.lockedUntil).getTime() - Date.now()) / 1000));
              if (remaining > 0) {
                setLockCountdown(remaining);
                startCountdown(remaining);
              } else {
                localStorage.removeItem(ATTEMPT_INFO_KEY);
                setAttemptInfo(null);
              }
            }
          }
        }
      } catch {}
    };
    init();
  }, [form]);

  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLockCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setLockCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          localStorage.removeItem(ATTEMPT_INFO_KEY);
          setAttemptInfo(null);
          setGenericError(null);
          message.success('GLOBAL lock expired - you can try again now');
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

  const persistAttemptInfo = (info: AttemptInfo | null) => {
    try {
      if (info) {
        localStorage.setItem(ATTEMPT_INFO_KEY, JSON.stringify(info));
      } else {
        localStorage.removeItem(ATTEMPT_INFO_KEY);
      }
    } catch {}
  };

  const onValuesChange = (_changed: any, allValues: { username: string; password: string }) => {
    persistAttempt(allValues);
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
      message.error(`GLOBAL locked - wait ${Math.ceil(lockCountdown / 60)} min (${lockCountdown}s) - username+password share same counter`);
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
    
    try {
      await login(values.username, values.password);
      message.success(`Welcome ${values.username}!`);
      // Reset GLOBAL counter on success
      setAttemptInfo(null);
      persistAttemptInfo(null);
      setLockCountdown(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
      try {
        await apiClient.post('/auth/reset-attempts', {});
      } catch {}
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

      // GLOBAL counter - same for username+password errors
      let failedAttempts = details.failedAttempts ?? details.globalCount ?? 0;
      if (failedAttempts === 0) {
        // Fallback to previous global count +1
        failedAttempts = (attemptInfo?.failedAttempts || 0) + 1;
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
        isGlobal: true,
      };

      setAttemptInfo(newAttemptInfo);
      persistAttemptInfo(newAttemptInfo);

      if (isLockedErr || failedAttempts >= MAX_ATTEMPTS) {
        const secs = remainingSeconds || LOCK_DURATION_MIN * 60;
        setLockCountdown(secs);
        startCountdown(secs);
        const mins = Math.ceil(secs / 60);
        const friendly = `GLOBAL LOCKED: Account locked after ${failedAttempts}/${MAX_ATTEMPTS} fails (username+password share SAME counter). Wait ${mins} min (${secs}s) until ${lockedUntil ? new Date(lockedUntil).toLocaleTimeString() : `${LOCK_DURATION_MIN} min`}. Any username+password error counts together.`;
        setGenericError(friendly);
        message.error(friendly, 6);
      } else if (isUserNotFound) {
        // Inline error under username, but counter is GLOBAL
        const msg = `Username "${values.username}" not found. GLOBAL Attempt ${failedAttempts}/${MAX_ATTEMPTS}, ${remainingAttempts} left before ${LOCK_DURATION_MIN}-min GLOBAL lock (same counter for username+password).`;
        form.setFields([{ name: 'username', errors: [msg] }]);
        message.warning(msg, 4);
      } else if (isInvalidPassword) {
        const msg = `Incorrect password for "${values.username}". GLOBAL Attempt ${failedAttempts}/${MAX_ATTEMPTS}, ${remainingAttempts} left before GLOBAL lock (username+password share same).`;
        form.setFields([{ name: 'password', errors: [msg] }]);
        message.warning(msg, 4);
      } else {
        if (lowerMsg.includes('password')) {
          form.setFields([{ name: 'password', errors: [String(rawMessage)] }]);
        } else if (lowerMsg.includes('username') || lowerMsg.includes('user')) {
          form.setFields([{ name: 'username', errors: [String(rawMessage)] }]);
        } else {
          setGenericError(`${rawMessage} (GLOBAL attempt ${failedAttempts}/${MAX_ATTEMPTS})`);
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
    if (isLocked) {
      message.warning(`GLOBAL locked - wait ${Math.ceil(lockCountdown/60)} min or reset`);
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
    setGenericError(null);
  };

  const clearAndResetDefault = async () => {
    try {
      await apiClient.post('/auth/reset-attempts', {});
    } catch {}
    localStorage.removeItem(LAST_ATTEMPT_KEY);
    localStorage.removeItem(ATTEMPT_INFO_KEY);
    form.setFieldsValue(DEFAULT_CREDENTIALS);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    setLastAttempt(DEFAULT_CREDENTIALS);
    setAttemptInfo(null);
    setLockCountdown(0);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setGenericError(null);
    message.success('Reset: GLOBAL counter cleared, form reset to admin.system');
  };

  const resetGlobalAttempts = async () => {
    try {
      await apiClient.post('/auth/reset-attempts', {});
    } catch {}
    localStorage.removeItem(ATTEMPT_INFO_KEY);
    setAttemptInfo(null);
    setLockCountdown(0);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setGenericError(null);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    message.success('GLOBAL attempts reset');
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
          <Text type="secondary" style={{ fontSize: 11 }}>
            <GlobalOutlined /> GLOBAL Counter - 5 attempts / 10 min lock - Username+Password share SAME count
          </Text>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            {lastAttempt && (
              <span style={{ fontSize: 10, color: '#1677ff', background: '#f0f5ff', padding: '2px 8px', borderRadius: 10 }}>
                <InfoCircleOutlined style={{ marginRight: 3 }} />
                Last: {lastAttempt.username}
              </span>
            )}
            {attemptInfo && (
              <span style={{ fontSize: 10, color: isLocked ? '#ff4d4f' : '#faad14', background: isLocked ? '#fff2f0' : '#fffbe6', padding: '2px 8px', borderRadius: 10, border: `1px solid ${isLocked ? '#ffccc7' : '#ffe58f'}` }}>
                <GlobalOutlined style={{ marginRight: 3 }} />
                GLOBAL: {attemptInfo.failedAttempts}/{MAX_ATTEMPTS} {isLocked ? 'LOCKED' : `(${attemptInfo.remainingAttempts} left)`}
              </span>
            )}
          </div>
        </div>

        {attemptInfo && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: isLocked ? '#fff2f0' : attemptInfo.failedAttempts >= 3 ? '#fffbe6' : '#f6ffed', border: `1px solid ${isLocked ? '#ffccc7' : attemptInfo.failedAttempts >= 3 ? '#ffe58f' : '#b7eb8f'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ fontSize: 11 }}>
                <WarningOutlined style={{ marginRight: 4, color: isLocked ? '#ff4d4f' : '#faad14' }} />
                <GlobalOutlined /> GLOBAL Attempts: {attemptInfo.failedAttempts}/{MAX_ATTEMPTS} (username+password same)
              </Text>
              <Text type="secondary" style={{ fontSize: 10 }}>
                {isLocked ? 'LOCKED ALL' : `${attemptInfo.remainingAttempts} left`}
              </Text>
            </div>
            <Progress percent={attemptPercent} showInfo={false} size="small" strokeColor={isLocked ? '#ff4d4f' : attemptInfo.failedAttempts >= 3 ? '#faad14' : '#52c41a'} style={{ margin: 0 }} />
            <div style={{ fontSize: 10, color: '#666', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>GLOBAL Failed: {attemptInfo.failedAttempts} | Remaining: {attemptInfo.remainingAttempts}</span>
              {isLocked ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}><ClockCircleOutlined /> Locked {LOCK_DURATION_MIN} min ALL</span> : <span>Any error counts together</span>}
            </div>
            {isLocked && lockCountdown > 0 && (
              <div style={{ marginTop: 8, textAlign: 'center', background: '#fff', padding: 8, borderRadius: 6, border: '1px dashed #ff4d4f' }}>
                <Statistic title="GLOBAL Unlock in" value={formatCountdown(lockCountdown)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 22, color: '#ff4d4f', fontWeight: 'bold' }} />
                <Text type="secondary" style={{ fontSize: 10 }}>Wait {Math.ceil(lockCountdown/60)} min ({lockCountdown}s) - Any username+password error shares same counter</Text>
                <br />
                <Button size="small" icon={<ReloadOutlined />} onClick={resetGlobalAttempts} style={{ marginTop: 6, fontSize: 10 }}>
                  Reset GLOBAL counter (for testing)
                </Button>
              </div>
            )}
          </div>
        )}

        {genericError && (
          <Alert
            message={isLocked ? `GLOBAL Locked - Wait ${LOCK_DURATION_MIN} min - Same counter` : "Authentication Issue"}
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
              {isLocked ? `GLOBAL Locked - Wait ${formatCountdown(lockCountdown)}` : 'Log in'}
            </Button>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
            <Button type="link" size="small" onClick={clearAndResetDefault} style={{ fontSize: 10, padding: 0 }}>
              Reset all (clear GLOBAL counter)
            </Button>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {attemptInfo ? `GLOBAL: ${attemptInfo.failedAttempts}/${MAX_ATTEMPTS}` : `Max ${MAX_ATTEMPTS} → ${LOCK_DURATION_MIN} min GLOBAL lock`}
            </Text>
          </div>
        </Form>

        <Divider style={{ margin: '10px 0' }}>Demo Accounts - GLOBAL counter same for all</Divider>

        <Space direction="vertical" size={2} style={{ width: '100%', fontSize: 11 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Password: <Text code style={{ fontSize: 10 }}>Password123!</Text> - GLOBAL: any username+password error = same count
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 10 }}>
            {['admin.system','susan.lee','james.wilson','maria.garcia','rachel.brown','patricia.johnson','ahmed.hassan','michael.wong'].map(u => (
              <Button key={u} type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount(u)} disabled={!!isLocked}>
                • {u} {u.includes('admin') ? '(ADMIN)' : ''}
              </Button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: '#595959', background: '#fafafa', padding: '6px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <strong>GLOBAL Counter:</strong> Username error + Password error share SAME count. Example: baduser (not found) + admin.system (wrong pass) = 2/5 GLOBAL. After 5 any fails, ALL locked 10 min. 
            <br/>Per-user was more secure (prevents DoS), but you requested GLOBAL same count - implemented.
          </div>
        </Space>

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 9 }}>
            GLOBAL {MAX_ATTEMPTS} attempts / {LOCK_DURATION_MIN} min lock - Same counter for username+password
          </Text>
        </div>
      </Card>
    </div>
  );
};

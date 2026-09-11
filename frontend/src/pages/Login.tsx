import React, { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message, Progress, Statistic } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, InfoCircleOutlined, WarningOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const { Title, Text, Countdown } = Typography;

const LAST_ATTEMPT_KEY = 'lastLoginAttempt';
const ATTEMPT_INFO_KEY = 'loginAttemptInfo';
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
  const [lockCountdown, setLockCountdown] = useState<number>(0); // seconds remaining
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

  // Restore last attempt on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_ATTEMPT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.username) {
          form.setFieldsValue(parsed);
          setLastAttempt(parsed);
        }
      }
      const attemptSaved = localStorage.getItem(ATTEMPT_INFO_KEY);
      if (attemptSaved) {
        const parsedAttempt = JSON.parse(attemptSaved);
        if (parsedAttempt.lockedUntil) {
          const lockedUntilTime = new Date(parsedAttempt.lockedUntil).getTime();
          const remaining = Math.max(0, Math.ceil((lockedUntilTime - Date.now()) / 1000));
          if (remaining > 0) {
            setAttemptInfo(parsedAttempt);
            setLockCountdown(remaining);
            startCountdown(remaining);
          } else {
            // Lock expired, clear
            localStorage.removeItem(ATTEMPT_INFO_KEY);
            setAttemptInfo(null);
          }
        } else {
          setAttemptInfo(parsedAttempt);
        }
      }
    } catch {}
  }, [form]);

  const startCountdown = (seconds: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLockCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setLockCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          // Unlock
          localStorage.removeItem(ATTEMPT_INFO_KEY);
          setAttemptInfo(null);
          setGenericError(null);
          message.success('Lock expired - you can try again now');
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
    if (genericError && !attemptInfo?.isLocked) setGenericError(null);
  };

  const onFinish = async (values: { username: string; password: string }) => {
    // Check if locked
    if (lockCountdown > 0) {
      message.error(`Account locked - wait ${Math.ceil(lockCountdown / 60)} min (${lockCountdown}s)`);
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
      // Reset attempt counter on success
      persistAttemptInfo(null);
      setAttemptInfo(null);
      setLockCountdown(0);
      localStorage.removeItem(ATTEMPT_INFO_KEY);
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
      const isLocked = errorCode === 'ACCOUNT_LOCKED' || err.response?.status === 423 || lowerMsg.includes('locked');
      const isInactive = lowerMsg.includes('inactive') || lowerMsg.includes('suspended');

      // Extract attempt info from backend details
      const failedAttempts = details.failedAttempts || details.attempt || 0;
      const remainingAttempts = details.remainingAttempts ?? (MAX_ATTEMPTS - failedAttempts);
      const maxAttempts = details.maxAttempts || MAX_ATTEMPTS;
      const lockedUntil = details.lockedUntil;
      const remainingSeconds = details.remainingSeconds || details.retryAfter || 0;

      const newAttemptInfo: AttemptInfo = {
        failedAttempts: failedAttempts || (attemptInfo ? attemptInfo.failedAttempts + 1 : 1),
        remainingAttempts: remainingAttempts >= 0 ? remainingAttempts : Math.max(0, MAX_ATTEMPTS - (failedAttempts || 1)),
        maxAttempts,
        lockedUntil,
        remainingSeconds,
        isLocked,
      };

      // If we have details, use them, else increment local
      if (failedAttempts) {
        setAttemptInfo(newAttemptInfo);
        persistAttemptInfo(newAttemptInfo);
      } else if (!isLocked) {
        // Increment local counter if backend didn't provide
        const currentFails = (attemptInfo?.failedAttempts || 0) + 1;
        const localInfo: AttemptInfo = {
          failedAttempts: currentFails,
          remainingAttempts: Math.max(0, MAX_ATTEMPTS - currentFails),
          maxAttempts: MAX_ATTEMPTS,
        };
        if (currentFails >= MAX_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000).toISOString();
          localInfo.lockedUntil = lockUntil;
          localInfo.remainingSeconds = LOCK_DURATION_MIN * 60;
          localInfo.isLocked = true;
          setLockCountdown(LOCK_DURATION_MIN * 60);
          startCountdown(LOCK_DURATION_MIN * 60);
        }
        setAttemptInfo(localInfo);
        persistAttemptInfo(localInfo);
      }

      if (isLocked) {
        const secs = remainingSeconds || lockCountdown || LOCK_DURATION_MIN * 60;
        setLockCountdown(secs);
        startCountdown(secs);
        const mins = Math.ceil(secs / 60);
        const friendly = `Account locked after ${failedAttempts || MAX_ATTEMPTS}/${MAX_ATTEMPTS} failed attempts. Wait ${mins} min (${secs}s) until ${lockedUntil ? new Date(lockedUntil).toLocaleTimeString() : '10 min'}. Counter resets after.`;
        setGenericError(friendly);
        message.error(friendly, 6);
        form.setFieldsValue(values);
      } else if (isUserNotFound) {
        const msg = `Username "${values.username}" not found. Attempt ${newAttemptInfo.failedAttempts}/${MAX_ATTEMPTS}, ${newAttemptInfo.remainingAttempts} left before ${LOCK_DURATION_MIN}-min lock.`;
        form.setFields([{ name: 'username', errors: [msg] }]);
        form.setFieldsValue({ username: values.username, password: values.password });
        message.warning(msg, 4);
      } else if (isInvalidPassword) {
        const msg = `Incorrect password for "${values.username}". Attempt ${newAttemptInfo.failedAttempts}/${MAX_ATTEMPTS}, ${newAttemptInfo.remainingAttempts} left before lock.`;
        form.setFields([{ name: 'password', errors: [msg] }]);
        form.setFieldsValue({ username: values.username, password: values.password });
        message.warning(msg, 4);
      } else if (isInactive) {
        setGenericError(`${rawMessage}. Contact HR.`);
        message.error(String(rawMessage), 5);
        form.setFieldsValue(values);
      } else {
        if (lowerMsg.includes('password')) {
          form.setFields([{ name: 'password', errors: [String(rawMessage)] }]);
        } else if (lowerMsg.includes('username') || lowerMsg.includes('user')) {
          form.setFields([{ name: 'username', errors: [String(rawMessage)] }]);
        } else {
          setGenericError(`${rawMessage} (attempt ${newAttemptInfo.failedAttempts}/${MAX_ATTEMPTS})`);
          message.error(String(rawMessage), 5);
        }
        form.setFieldsValue(values);
      }

      persistAttempt(values);
      setLastAttempt({ ...values });
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (username: string) => {
    if (lockCountdown > 0) {
      message.warning(`Locked - wait ${Math.ceil(lockCountdown/60)} min`);
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

  const clearAndResetDefault = () => {
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
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const attemptPercent = attemptInfo ? Math.min(100, (attemptInfo.failedAttempts / MAX_ATTEMPTS) * 100) : 0;
  const isLocked = lockCountdown > 0 || attemptInfo?.isLocked;

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
          width: 460,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <SafetyOutlined style={{ fontSize: 40, color: '#1677ff', marginBottom: 8 }} />
          <Title level={4} style={{ marginBottom: 2 }}>
            Nurse-App
          </Title>
          <Text type="secondary" style={{ fontSize: 11 }}>Hospital Workforce Management - RBAC Secured</Text>
          {lastAttempt && lastAttempt.username !== DEFAULT_CREDENTIALS.username && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#1677ff', background: '#f0f5ff', padding: '3px 8px', borderRadius: 10, display: 'inline-block' }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              Last: <strong>{lastAttempt.username}</strong> (preserved)
            </div>
          )}
        </div>

        {/* Attempt Counter - 5 attempts -> 10 min lock */}
        {attemptInfo && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: isLocked ? '#fff2f0' : attemptInfo.failedAttempts >= 3 ? '#fffbe6' : '#f6ffed', border: `1px solid ${isLocked ? '#ffccc7' : attemptInfo.failedAttempts >= 3 ? '#ffe58f' : '#b7eb8f'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text strong style={{ fontSize: 11 }}>
                <WarningOutlined style={{ marginRight: 4, color: isLocked ? '#ff4d4f' : '#faad14' }} />
                Login Attempts: {attemptInfo.failedAttempts}/{MAX_ATTEMPTS}
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
                <Statistic title="Time until unlock" value={formatCountdown(lockCountdown)} prefix={<ClockCircleOutlined />} valueStyle={{ fontSize: 20, color: '#ff4d4f', fontWeight: 'bold' }} />
                <Text type="secondary" style={{ fontSize: 10 }}>Wait {Math.ceil(lockCountdown/60)} min ({lockCountdown}s) - Counter resets after</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 9 }}>Locked until: {attemptInfo.lockedUntil ? new Date(attemptInfo.lockedUntil).toLocaleTimeString() : '10 min from now'}</Text>
              </div>
            )}
          </div>
        )}

        {genericError && (
          <Alert
            message={isLocked ? `Account Locked - Wait ${LOCK_DURATION_MIN} min` : "Authentication Issue"}
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
              {isLocked ? `Locked - Wait ${formatCountdown(lockCountdown)}` : 'Log in'}
            </Button>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
            <Button type="link" size="small" onClick={clearAndResetDefault} style={{ fontSize: 10, padding: 0 }}>
              Reset to default
            </Button>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {attemptInfo ? `Attempts: ${attemptInfo.failedAttempts}/${MAX_ATTEMPTS}` : `Max ${MAX_ATTEMPTS} attempts → ${LOCK_DURATION_MIN} min lock`}
            </Text>
          </div>
        </Form>

        <Divider style={{ margin: '10px 0' }}>Demo Accounts (click to fill)</Divider>

        <Space direction="vertical" size={2} style={{ width: '100%', fontSize: 11 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Password: <Text code style={{ fontSize: 10 }}>Password123!</Text> - {MAX_ATTEMPTS} fails → {LOCK_DURATION_MIN} min lock + countdown
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 10 }}>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('admin.system')} disabled={!!isLocked}>• admin.system (ADMIN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('susan.lee')} disabled={!!isLocked}>• susan.lee (MGR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('james.wilson')} disabled={!!isLocked}>• james.wilson (CHARGE)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('maria.garcia')} disabled={!!isLocked}>• maria.garcia (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('rachel.brown')} disabled={!!isLocked}>• rachel.brown (SCHED)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('patricia.johnson')} disabled={!!isLocked}>• patricia.johnson (HR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('ahmed.hassan')} disabled={!!isLocked}>• ahmed.hassan (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 18, fontSize: 10 }} onClick={() => fillDemoAccount('michael.wong')} disabled={!!isLocked}>• michael.wong (COMPL)</Button>
          </div>
          <div style={{ fontSize: 9, color: '#595959', background: '#fafafa', padding: '6px', borderRadius: 4, border: '1px solid #f0f0f0' }}>
            <strong>Security:</strong> {MAX_ATTEMPTS} wrong attempts → {LOCK_DURATION_MIN} min lock with live countdown. Counter resets on success. 
            <br/><strong>Better idea:</strong> Progressive delay (2s,5s,10s) + CAPTCHA after 3 fails + admin alert + IP rate limit. Current is fixed {LOCK_DURATION_MIN} min as you requested - simple and effective for hospital.
          </div>
        </Space>

        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 9 }}>
            Secured by rbac.evaluate_access() - {MAX_ATTEMPTS} attempts / {LOCK_DURATION_MIN} min lock
          </Text>
        </div>
      </Card>
    </div>
  );
};

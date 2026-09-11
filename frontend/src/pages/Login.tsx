import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

const LAST_ATTEMPT_KEY = 'lastLoginAttempt';
const DEFAULT_CREDENTIALS = { username: 'admin.system', password: 'Password123!' };

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

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);
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
    } catch {}
  }, [form]);

  const persistAttempt = (values: { username: string; password: string }) => {
    try {
      localStorage.setItem(LAST_ATTEMPT_KEY, JSON.stringify(values));
    } catch {}
  };

  const onValuesChange = (_changed: any, allValues: { username: string; password: string }) => {
    persistAttempt(allValues);
    // Clear field errors as user types to fix it
    if (_changed.username !== undefined) {
      form.setFields([{ name: 'username', errors: [] }]);
    }
    if (_changed.password !== undefined) {
      form.setFields([{ name: 'password', errors: [] }]);
    }
    if (genericError) setGenericError(null);
  };

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setGenericError(null);
    // Clear previous field errors
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    persistAttempt(values);
    setLastAttempt({ ...values });
    
    try {
      await login(values.username, values.password);
      message.success(`Welcome ${values.username}!`);
      persistAttempt(values);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err, err.response?.data);
      
      const errorCode = err.response?.data?.errorCode || '';
      let rawMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Login failed';
      if (Array.isArray(rawMessage)) rawMessage = rawMessage.join(', ');
      
      const lowerMsg = String(rawMessage).toLowerCase();
      const isUserNotFound = errorCode === 'USER_NOT_FOUND' || lowerMsg.includes('not found') || lowerMsg.includes('username') && lowerMsg.includes('not found');
      const isInvalidPassword = errorCode === 'INVALID_PASSWORD' || lowerMsg.includes('incorrect password') || (lowerMsg.includes('invalid credentials') && !isUserNotFound);
      const isLocked = lowerMsg.includes('locked');
      const isInactive = lowerMsg.includes('inactive') || lowerMsg.includes('suspended') || lowerMsg.includes('status is');

      // OPTION A: Inline field errors - position error directly under the field that failed
      if (isUserNotFound) {
        const msg = `Username "${values.username}" not found. Check spelling. Valid: admin.system, susan.lee, etc.`;
        form.setFields([{ name: 'username', errors: [msg] }]);
        // Keep password as typed, don't reset
        form.setFieldsValue({ username: values.username, password: values.password });
        message.warning(msg, 4);
      } else if (isInvalidPassword) {
        const msg = `Incorrect password for "${values.username}". Demo is Password123! (you typed ${values.password.length} chars)`;
        form.setFields([{ name: 'password', errors: [msg] }]);
        form.setFieldsValue({ username: values.username, password: values.password });
        message.warning(msg, 4);
      } else if (isLocked || isInactive) {
        // Generic errors that are not field-specific -> show top Alert
        let friendly = rawMessage;
        if (isLocked) friendly = `Account locked: ${rawMessage}. Try after 15 min.`;
        if (isInactive) friendly = `Account issue: ${rawMessage}. Contact HR.`;
        setGenericError(friendly);
        message.error(friendly, 5);
        form.setFieldsValue(values);
      } else {
        // Fallback: if we can't determine field, show generic top error but also try to guess
        if (lowerMsg.includes('password')) {
          form.setFields([{ name: 'password', errors: [String(rawMessage)] }]);
        } else if (lowerMsg.includes('username') || lowerMsg.includes('user')) {
          form.setFields([{ name: 'username', errors: [String(rawMessage)] }]);
        } else {
          setGenericError(`${rawMessage} (you tried "${values.username}")`);
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
    form.setFieldsValue(DEFAULT_CREDENTIALS);
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);
    setLastAttempt(DEFAULT_CREDENTIALS);
    setGenericError(null);
  };

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
          width: 440,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <SafetyOutlined style={{ fontSize: 42, color: '#1677ff', marginBottom: 10 }} />
          <Title level={4} style={{ marginBottom: 2 }}>
            Nurse-App
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Hospital Workforce Management</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            RBAC Secured System
          </Text>
          {lastAttempt && lastAttempt.username !== DEFAULT_CREDENTIALS.username && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#1677ff', background: '#f0f5ff', padding: '3px 8px', borderRadius: 10, display: 'inline-block' }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              Last: <strong>{lastAttempt.username}</strong> (preserved after refresh)
            </div>
          )}
        </div>

        {/* Generic errors only (locked, inactive) - field-specific errors shown inline under inputs */}
        {genericError && (
          <Alert
            message="Authentication Issue"
            description={<div style={{ whiteSpace: 'pre-line', fontSize: 12 }}>{genericError}</div>}
            type="error"
            showIcon
            closable
            onClose={() => setGenericError(null)}
            style={{ marginBottom: 16, fontSize: 12 }}
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
            style={{ marginBottom: 16 }}
            hasFeedback
          >
            <Input prefix={<UserOutlined />} placeholder="Username or Email" allowClear />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
            style={{ marginBottom: 16 }}
            hasFeedback
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" allowClear />
          </Form.Item>

          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
            <Button type="link" size="small" onClick={clearAndResetDefault} style={{ fontSize: 10, padding: 0 }}>
              Reset to default admin.system
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '12px 0' }}>Demo Accounts (click to fill)</Divider>

        <Space direction="vertical" size={2} style={{ width: '100%', fontSize: 11 }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Password: <Text code style={{ fontSize: 10 }}>Password123!</Text> - Inline errors under fields, input preserved
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, fontSize: 10 }}>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('admin.system')}>• admin.system (ADMIN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('susan.lee')}>• susan.lee (MGR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('james.wilson')}>• james.wilson (CHARGE)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('maria.garcia')}>• maria.garcia (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('rachel.brown')}>• rachel.brown (SCHED)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('patricia.johnson')}>• patricia.johnson (HR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('ahmed.hassan')}>• ahmed.hassan (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: '0 4px', height: 20, fontSize: 10 }} onClick={() => fillDemoAccount('michael.wong')}>• michael.wong (COMPL)</Button>
          </div>
          <div style={{ fontSize: 9, color: '#999', fontStyle: 'italic', background: '#fafafa', padding: '4px 6px', borderRadius: 4, border: '1px dashed #e8e8e8' }}>
            <strong>Option A implemented:</strong> Wrong username → red border + error under username field, password preserved. Wrong password → red border under password, username preserved. No big top Alert, no layout shift, no refresh reset.
          </div>
        </Space>

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 9 }}>
            Secured by rbac.evaluate_access() - Inline validation
          </Text>
        </div>
      </Card>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
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
      // Only use saved if it has username, keep password if present
      if (parsed.username) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_CREDENTIALS;
}

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // On mount, restore last attempt into form so refresh keeps what user typed
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
    // Persist as user types, so even if page refreshes, we keep last action
    persistAttempt(allValues);
  };

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);
    // Save what user typed - so we can restore after error AND after refresh
    persistAttempt(values);
    setLastAttempt({ ...values });
    
    try {
      await login(values.username, values.password);
      // On success, clear last attempt error but keep username for next time? Keep it.
      message.success(`Welcome ${values.username}! Login successful!`);
      // Optionally clear error and keep last successful login in storage
      localStorage.removeItem(LAST_ATTEMPT_KEY); // or keep? Let's keep username but clear password for security? For demo keep both.
      // For demo, keep last successful to show persistence works
      persistAttempt(values);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err, err.response?.data);
      
      // Parse error message - handle array, string, and different backend formats
      let rawMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Login failed';
      
      if (Array.isArray(rawMessage)) {
        rawMessage = rawMessage.join(', ');
      }
      
      let userFriendlyMessage = rawMessage;
      const lowerMsg = String(rawMessage).toLowerCase();
      
      if (lowerMsg.includes('user not found') || lowerMsg.includes('invalid credentials') || lowerMsg.includes('incorrect password')) {
        if (lowerMsg.includes('password must be') || lowerMsg.includes('incorrect password')) {
          userFriendlyMessage = `Incorrect password for "${values.username}". Demo password is Password123! You typed ${values.password.length} chars.`;
        } else if (lowerMsg.includes('not found')) {
          userFriendlyMessage = `Username "${values.username}" not found. Check spelling. Valid: admin.system, susan.lee, etc.`;
        } else {
          userFriendlyMessage = `Invalid username or password. You entered username="${values.username}". Demo password: Password123!`;
        }
      } else if (lowerMsg.includes('locked')) {
        userFriendlyMessage = `Account locked: ${rawMessage}`;
      } else if (lowerMsg.includes('inactive') || lowerMsg.includes('suspended') || lowerMsg.includes('status')) {
        userFriendlyMessage = `Account issue: ${rawMessage}`;
      } else if (lowerMsg.includes('longer than') || lowerMsg.includes('shorter than')) {
        userFriendlyMessage = `Validation: ${rawMessage}`;
      } else if (err.response?.status === 401) {
        userFriendlyMessage = `Auth failed: ${rawMessage}. You tried "${values.username}".`;
      } else if (err.response?.status === 400) {
        userFriendlyMessage = `${rawMessage}. You entered "${values.username}".`;
      } else if (!err.response) {
        userFriendlyMessage = `Cannot connect to server (${err.message})`;
      }
      
      setError(userFriendlyMessage);
      message.error(userFriendlyMessage, 6);
      
      // CRITICAL: Keep what user typed, don't reset to default admin.system
      // Even after error, restore exact values
      form.setFieldsValue({
        username: values.username,
        password: values.password,
      });
      // Persist again so refresh keeps it
      persistAttempt(values);
      setLastAttempt({ ...values });
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (username: string) => {
    const newValues = { username, password: 'Password123!' };
    form.setFieldsValue(newValues);
    persistAttempt(newValues);
    setLastAttempt(newValues);
    setError(null);
  };

  const clearAndResetDefault = () => {
    localStorage.removeItem(LAST_ATTEMPT_KEY);
    form.setFieldsValue(DEFAULT_CREDENTIALS);
    setLastAttempt(DEFAULT_CREDENTIALS);
    setError(null);
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
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 12 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            Nurse-App
          </Title>
          <Text type="secondary">Hospital Workforce Management</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            RBAC Secured System
          </Text>
          {lastAttempt && (
            <div style={{ marginTop: 8, fontSize: 11, color: lastAttempt.username === DEFAULT_CREDENTIALS.username ? '#999' : '#1677ff', background: '#f0f5ff', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
              Last typed: <strong>{lastAttempt.username}</strong> {lastAttempt.username !== DEFAULT_CREDENTIALS.username ? '(preserved)' : '(default)'}
            </div>
          )}
        </div>

        {error && (
          <Alert
            message="Login Failed - Your input preserved"
            description={
              <div style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                <div style={{ marginBottom: 8 }}>{error}</div>
                {lastAttempt && (
                  <div style={{ padding: 8, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4, fontSize: 12 }}>
                    <strong>✓ Your last action preserved (not reset to admin):</strong><br/>
                    Username: <code style={{ background: '#fff', padding: '2px 4px' }}>{lastAttempt.username}</code><br/>
                    Password: <code style={{ background: '#fff', padding: '2px 4px' }}>{'*'.repeat(lastAttempt.password.length)} ({lastAttempt.password.length} chars)</code><br/>
                    <span style={{ fontSize: 11, color: '#666' }}>Even if you refresh page, same values will stay. Fix error and try again.</span>
                  </div>
                )}
              </div>
            }
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 20, textAlign: 'left' }}
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
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please input your username!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username or Email" allowClear />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" allowClear />
          </Form.Item>

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'center' }}>
            <Button type="link" size="small" onClick={clearAndResetDefault} style={{ fontSize: 11 }}>
              Reset to default admin.system
            </Button>
          </Form.Item>
        </Form>

        <Divider style={{ margin: '16px 0' }}>Demo Accounts (click to fill)</Divider>

        <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Password for all: <Text code>Password123!</Text> - Last typed preserved after error & refresh
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('admin.system')}>• admin.system (ADMIN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('susan.lee')}>• susan.lee (MGR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('james.wilson')}>• james.wilson (CHARGE)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('maria.garcia')}>• maria.garcia (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('rachel.brown')}>• rachel.brown (SCHED)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('patricia.johnson')}>• patricia.johnson (HR)</Button>
          </div>
        </Space>

        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Secured by rbac.evaluate_access() - Input preserved in localStorage
          </Text>
        </div>
      </Card>
    </div>
  );
};

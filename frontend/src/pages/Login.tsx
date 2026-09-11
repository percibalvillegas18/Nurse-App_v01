import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

export const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<{ username: string; password: string } | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);
    // Save what user typed - so we can restore after error
    setLastAttempt({ ...values });
    
    try {
      await login(values.username, values.password);
      message.success(`Welcome ${values.username}! Login successful!`);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err, err.response?.data);
      
      // Parse error message - handle array, string, and different backend formats
      let rawMessage = err.response?.data?.message || err.response?.data?.error || err.message || 'Login failed';
      
      // Handle class-validator array messages
      if (Array.isArray(rawMessage)) {
        rawMessage = rawMessage.join(', ');
      }
      
      // Map backend messages to user-friendly messages
      let userFriendlyMessage = rawMessage;
      const lowerMsg = String(rawMessage).toLowerCase();
      
      if (lowerMsg.includes('user not found') || lowerMsg.includes('invalid credentials') || lowerMsg.includes('incorrect password')) {
        // Check if it's username issue vs password issue based on backend details
        if (lowerMsg.includes('password must be') || lowerMsg.includes('incorrect password')) {
          userFriendlyMessage = `Incorrect password for "${values.username}". Hint: demo password is Password123! (capital P, 123, !). You typed ${values.password.length} chars. Check Caps Lock.`;
        } else if (lowerMsg.includes('not found')) {
          userFriendlyMessage = `Username "${values.username}" not found. Please check spelling. Valid: admin.system, susan.lee, james.wilson, maria.garcia, etc.`;
        } else {
          userFriendlyMessage = `Invalid username or password.\n• You entered: username="${values.username}"\n• Password is correct? Demo: Password123!\n• Check Caps Lock and spelling`;
        }
      } else if (lowerMsg.includes('locked')) {
        userFriendlyMessage = `Account locked: ${rawMessage}. Try after 15 min or contact admin.`;
      } else if (lowerMsg.includes('inactive') || lowerMsg.includes('suspended') || lowerMsg.includes('status')) {
        userFriendlyMessage = `Account issue: ${rawMessage}. Contact HR admin.`;
      } else if (lowerMsg.includes('longer than') || lowerMsg.includes('shorter than') || lowerMsg.includes('must be')) {
        userFriendlyMessage = `Validation: ${rawMessage}. Password min 8 chars.`;
      } else if (err.response?.status === 401) {
        userFriendlyMessage = `Auth failed (401): ${rawMessage}. You tried username="${values.username}".`;
      } else if (err.response?.status === 400) {
        userFriendlyMessage = `Bad request (400): ${rawMessage}. You entered username="${values.username}".`;
      } else if (!err.response) {
        userFriendlyMessage = `Cannot connect to server (${err.message}). Backend down?`;
      }
      
      setError(userFriendlyMessage);
      message.error(userFriendlyMessage, 6);
      
      // CRITICAL FIX: Keep what user typed, don't reset to default admin.system
      // Restore the exact values user entered so they can correct only the wrong part
      form.setFieldsValue({
        username: values.username,
        password: values.password,
      });
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (username: string) => {
    form.setFieldsValue({ username, password: 'Password123!' });
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
          width: 420,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            Nurse-App
          </Title>
          <Text type="secondary">Hospital Workforce Management</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            RBAC Secured System
          </Text>
          {lastAttempt && error && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#ff4d4f' }}>
              Last attempt: {lastAttempt.username} / {lastAttempt.password ? '*'.repeat(Math.min(lastAttempt.password.length, 12)) : '(empty)'}
            </div>
          )}
        </div>

        {error && (
          <Alert
            message="Login Failed"
            description={
              <div style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                {error}
                {lastAttempt && (
                  <div style={{ marginTop: 8, padding: 8, background: '#fff2f0', borderRadius: 4, fontSize: 12 }}>
                    <strong>Your input preserved:</strong><br/>
                    Username: <code>{lastAttempt.username}</code><br/>
                    Password: <code>{'*'.repeat(lastAttempt.password.length)} ({lastAttempt.password.length} chars)</code><br/>
                    <span style={{ fontSize: 11, color: '#666' }}>Fix the error and try again - fields not reset to admin default.</span>
                  </div>
                )}
              </div>
            }
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 24, textAlign: 'left' }}
          />
        )}

        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
          preserve={true}
          initialValues={{ username: 'admin.system', password: 'Password123!' }}
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

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
        </Form>

        <Divider>Demo Accounts (click to fill)</Divider>

        <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Password for all: <Text code>Password123!</Text>
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('admin.system')}>• admin.system (ADMIN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('susan.lee')}>• susan.lee (MGR)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('james.wilson')}>• james.wilson (CHARGE)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('maria.garcia')}>• maria.garcia (RN)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('rachel.brown')}>• rachel.brown (SCHED)</Button>
            <Button type="link" size="small" style={{ textAlign: 'left', padding: 0, height: 'auto', fontSize: 11 }} onClick={() => fillDemoAccount('patricia.johnson')}>• patricia.johnson (HR)</Button>
          </div>
          <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>
            After error, your typed username/password stays - not reset to admin default. Fix only wrong part.
          </Text>
        </Space>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Secured by rbac.evaluate_access() - AND logic, deny by default
          </Text>
        </div>
      </Card>
    </div>
  );
};

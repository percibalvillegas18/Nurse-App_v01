import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider, Space, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const { Title, Text } = Typography;

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      await login(values.username, values.password);
      message.success('Login successful!');
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
      
      if (lowerMsg.includes('user not found') || lowerMsg.includes('invalid credentials')) {
        // Check if it's username issue vs password issue based on backend details
        if (lowerMsg.includes('password must be')) {
          userFriendlyMessage = `Incorrect password. Hint: password must be Password123! for demo accounts. You entered wrong password for "${values.username}".`;
        } else if (lowerMsg.includes('not found')) {
          userFriendlyMessage = `Username "${values.username}" not found. Please check spelling or use one of the demo accounts listed below.`;
        } else {
          userFriendlyMessage = `Invalid username or password. Please check:\n• Username "${values.username}" exists\n• Password is correct (demo password: Password123!)\n• Caps Lock is off`;
        }
      } else if (lowerMsg.includes('locked')) {
        userFriendlyMessage = `Account locked: ${rawMessage}. Please try again after 15 minutes or contact administrator.`;
      } else if (lowerMsg.includes('inactive') || lowerMsg.includes('suspended') || lowerMsg.includes('status')) {
        userFriendlyMessage = `Account issue: ${rawMessage}. Please contact HR administrator.`;
      } else if (lowerMsg.includes('longer than') || lowerMsg.includes('shorter than') || lowerMsg.includes('must be')) {
        userFriendlyMessage = `Validation error: ${rawMessage}. Password must be at least 8 characters.`;
      } else if (err.response?.status === 401) {
        userFriendlyMessage = `Authentication failed (401): ${rawMessage}. Please verify your username "${values.username}" and password.`;
      } else if (err.response?.status === 400) {
        userFriendlyMessage = `Bad request (400): ${rawMessage}. Please check your input.`;
      } else if (!err.response) {
        userFriendlyMessage = `Cannot connect to server. Please check if backend is running. (${err.message})`;
      }
      
      setError(userFriendlyMessage);
      message.error(userFriendlyMessage, 5);
    } finally {
      setLoading(false);
    }
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
          width: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <SafetyOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
          <Title level={3} style={{ marginBottom: 4 }}>
            Nurse-App
          </Title>
          <Text type="secondary">Hospital Workforce Management</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            RBAC Secured System
          </Text>
        </div>

        {error && (
          <Alert
            message="Login Failed"
            description={
              <div style={{ whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                {error}
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
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
          initialValues={{ username: 'admin.system', password: 'Password123!' }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please input your username!' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username or Email" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Log in
            </Button>
          </Form.Item>
        </Form>

        <Divider>Demo Accounts</Divider>

        <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Password for all: <Text code>Password123!</Text>
          </Text>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
            <Text>• admin.system (SYSTEM_ADMIN)</Text>
            <Text>• susan.lee (NURSE_MANAGER)</Text>
            <Text>• james.wilson (CHARGE_NURSE)</Text>
            <Text>• maria.garcia (RN)</Text>
            <Text>• rachel.brown (SCHEDULER)</Text>
            <Text>• patricia.johnson (HR_ADMIN)</Text>
          </div>
        </Space>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Secured by rbac.evaluate_access() - AND logic, deny by default, temporal filtering
          </Text>
        </div>
      </Card>
    </div>
  );
};

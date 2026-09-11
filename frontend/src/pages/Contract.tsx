import React from 'react';
import { Card, Typography, Alert, Tag, List } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { usePermission } from '../hooks/useEffectiveAccess';

const { Title, Text } = Typography;

const PLANNED = [
  'Contract records per nurse (start / end date, contract type, employer)',
  'Contract status lifecycle: Draft, Active, Expiring, Expired, Renewed, Terminated',
  'Expiry watchlist with days-remaining alerts (dashboard widget)',
  'Renewal workflow: pending approval, approved, rejected',
  'Link to nurse documents (signed contract file) and employment group fields',
  'RBAC-guarded CRUD under menu CONTRACT (VIEW / CREATE / EDIT / DELETE)',
];

export const Contract: React.FC = () => {
  const { allowed: canView, isLoading } = usePermission('CONTRACT', 'VIEW');

  if (isLoading) return <Card loading />;

  if (!canView) {
    return (
      <Alert
        message="Access Denied"
        description="You don't have VIEW permission on CONTRACT"
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>
          <FileTextOutlined style={{ marginRight: 8 }} />
          Contract
        </Title>
        <Tag color="orange">TO DO</Tag>
      </div>

      <Alert
        message="Menu placeholder - feature not built yet"
        description="Employment contract management for nurses. Menu entry retained per the Nursing area definition; pages, API and tables will be implemented on request."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card title="Planned scope" size="small">
        <List
          size="small"
          dataSource={PLANNED}
          renderItem={(item) => (
            <List.Item>
              <Text>{item}</Text>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

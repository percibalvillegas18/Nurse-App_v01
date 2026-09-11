import React from 'react';
import { Card, Calendar, Badge, Typography, Alert, Space, Tag, Button } from 'antd';
import { usePermission } from '../hooks/useEffectiveAccess';

const { Title } = Typography;

export const Roster: React.FC = () => {
  const { allowed: canView } = usePermission('NURSE_ROSTER', 'VIEW');
  const { allowed: canCreate } = usePermission('NURSE_ROSTER', 'CREATE');
  const { allowed: canEdit } = usePermission('NURSE_ROSTER', 'EDIT');
  const { allowed: canAssign } = usePermission('NURSE_ROSTER', 'ASSIGN');

  const getListData = (value: any) => {
    const day = value.date();
    if (day === 8) {
      return [
        { type: 'success', content: 'Maria Garcia - Morning' },
        { type: 'success', content: 'Ahmed Hassan - Evening' },
      ];
    }
    if (day === 10) {
      return [
        { type: 'warning', content: 'Jennifer Smith - Night (Pending)' },
        { type: 'success', content: 'David Kim - Morning' },
      ];
    }
    return [];
  };

  const dateCellRender = (value: any) => {
    const listData = getListData(value);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.map((item: any, idx: number) => (
          <li key={idx}>
            <Badge status={item.type as any} text={<span style={{ fontSize: 10 }}>{item.content}</span>} />
          </li>
        ))}
      </ul>
    );
  };

  if (!canView) {
    return (
      <Alert
        message="Access Denied"
        description="You don't have VIEW permission on NURSE_ROSTER"
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>Nurse Roster</Title>
        <Space>
          <Tag>VIEW: {canView ? '✅' : '❌'}</Tag>
          <Tag>CREATE: {canCreate ? '✅' : '❌'}</Tag>
          <Tag>EDIT: {canEdit ? '✅' : '❌'}</Tag>
          <Tag>ASSIGN: {canAssign ? '✅' : '❌'}</Tag>
          {canCreate && <Button type="primary">Create Roster</Button>}
        </Space>
      </div>

      <Alert
        message="Roster RBAC"
        description="This page checks NURSE_ROSTER permissions via usePermission hook which calls rbac.evaluate_access() backend. Data scope restricts to your assigned units."
        type="info"
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Calendar cellRender={dateCellRender} />
      </Card>
    </div>
  );
};

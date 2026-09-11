import React from 'react';
import { Table, Card, Button, Space, Tag, Input, Typography, Alert } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import { usePermission } from '../hooks/useEffectiveAccess';

const { Title } = Typography;

export const NurseMaster: React.FC = () => {
  const { allowed: canView, isLoading: viewLoading } = usePermission('NURSE_MASTER', 'VIEW');
  const { allowed: canCreate } = usePermission('NURSE_MASTER', 'CREATE');
  const { allowed: canEdit } = usePermission('NURSE_MASTER', 'EDIT');
  const { allowed: canDelete } = usePermission('NURSE_MASTER', 'DELETE');

  const data = [
    {
      key: '1',
      id: 1,
      name: 'Maria Garcia',
      role: 'RN',
      unit: 'ICU_A',
      status: 'Active',
      credentials: 'Valid',
      shift: 'Morning',
    },
    {
      key: '2',
      id: 2,
      name: 'Ahmed Hassan',
      role: 'RN',
      unit: 'ICU_A',
      status: 'Active',
      credentials: 'Valid',
      shift: 'Evening',
    },
    {
      key: '3',
      id: 3,
      name: 'Jennifer Smith',
      role: 'LPN',
      unit: 'ICU_A',
      status: 'Active',
      credentials: 'Expiring',
      shift: 'Night',
    },
    {
      key: '4',
      id: 4,
      name: 'David Kim',
      role: 'CNA',
      unit: 'ICU_A',
      status: 'Active',
      credentials: 'Valid',
      shift: 'Morning',
    },
  ];

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <Tag color="blue">{role}</Tag>,
    },
    { title: 'Unit', dataIndex: 'unit', key: 'unit' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={status === 'Active' ? 'green' : 'red'}>{status}</Tag>,
    },
    {
      title: 'Credentials',
      dataIndex: 'credentials',
      key: 'credentials',
      render: (cred: string) => <Tag color={cred === 'Valid' ? 'green' : 'orange'}>{cred}</Tag>,
    },
    { title: 'Shift', dataIndex: 'shift', key: 'shift' },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          {canView && (
            <Button size="small" icon={<EyeOutlined />}>
              View
            </Button>
          )}
          {canEdit && (
            <Button size="small" icon={<EditOutlined />}>
              Edit
            </Button>
          )}
        </Space>
      ),
    },
  ];

  if (viewLoading) {
    return <Card loading />;
  }

  if (!canView) {
    return (
      <Alert
        message="Access Denied"
        description="You don't have VIEW permission on NURSE_MASTER. This is enforced by rbac.evaluate_access() backend guard."
        type="error"
        showIcon
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4}>Nurse Master</Title>
        <Space>
          <Input placeholder="Search nurses" prefix={<SearchOutlined />} style={{ width: 200 }} />
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />}>
              Add Nurse
            </Button>
          )}
        </Space>
      </div>

      <Alert
        message="RBAC Permissions Active"
        description={
          <span>
            VIEW: {canView ? '✅' : '❌'} | CREATE: {canCreate ? '✅' : '❌'} | EDIT: {canEdit ? '✅' : '❌'} | DELETE:{' '}
            {canDelete ? '✅' : '❌'} | Data scope: ICU_A (enforced via user_data_scopes)
          </span>
        }
        type="info"
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
      </Card>
    </div>
  );
};

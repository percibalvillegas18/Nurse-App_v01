import React, { useState } from 'react';
import {
  Table,
  Card,
  Button,
  Space,
  Tag,
  Input,
  Typography,
  Alert,
  Modal,
  Form,
  Select,
  DatePicker,
  Popconfirm,
  Drawer,
  Descriptions,
  message,
  Tooltip,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  EyeOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePermission } from '../hooks/useEffectiveAccess';
import {
  useNurses,
  useNurse,
  useCreateNurse,
  useUpdateNurse,
  useDeleteNurse,
  useNursingLookups,
  useExpiringCredentials,
  credentialSummaryMeta,
  rosterStatusColor,
} from '../hooks/useNursing';
import { Nurse, NurseCredential } from '../types';

const { Title, Text } = Typography;

const apiError = (e: any, fallback: string) =>
  e?.response?.data?.message || fallback;

export const NurseMaster: React.FC = () => {
  const { allowed: canView, isLoading: viewLoading } = usePermission('NURSE_MASTER', 'VIEW');
  const { allowed: canCreate } = usePermission('NURSE_MASTER', 'CREATE');
  const { allowed: canEdit } = usePermission('NURSE_MASTER', 'EDIT');
  const { allowed: canDelete } = usePermission('NURSE_MASTER', 'DELETE');
  const { allowed: canViewCredentials } = usePermission('CREDENTIALS', 'VIEW');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading, isFetching } = useNurses({ search: search || undefined, page, limit: pageSize });
  const { data: lookups } = useNursingLookups();
  const { data: expiring } = useExpiringCredentials(30);

  const [editing, setEditing] = useState<Nurse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const { data: viewedNurse, isLoading: detailLoading } = useNurse(viewId ?? undefined);

  const createNurse = useCreateNurse();
  const updateNurse = useUpdateNurse();
  const deleteNurse = useDeleteNurse();
  const [form] = Form.useForm();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ employmentType: 'FullTime' });
    setModalOpen(true);
  };

  const openEdit = (nurse: Nurse) => {
    setEditing(nurse);
    form.setFieldsValue({
      employeeNumber: nurse.employeeNumber,
      firstName: nurse.firstName,
      lastName: nurse.lastName,
      email: nurse.email,
      phone: nurse.phone,
      hireDate: nurse.hireDate ? dayjs(nurse.hireDate) : null,
      employmentType: nurse.employmentType,
      primaryRoleId: nurse.primaryRole?.id,
      homeUnitId: nurse.homeUnit?.id,
      status: nurse.status,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const payload: any = {
      first_name: values.firstName,
      last_name: values.lastName,
      email: values.email || undefined,
      phone: values.phone || undefined,
      employment_type: values.employmentType,
      primary_role_id: values.primaryRoleId,
      home_unit_id: values.homeUnitId,
    };
    if (values.hireDate) payload.hire_date = values.hireDate.format('YYYY-MM-DD');

    try {
      if (editing) {
        if (values.employeeNumber !== editing.employeeNumber)
          payload.employee_number = values.employeeNumber;
        if (values.status !== editing.status) payload.status = values.status;
        await updateNurse.mutateAsync({ id: editing.id, data: payload });
        message.success(`Nurse ${payload.first_name} ${payload.last_name} updated`);
      } else {
        payload.employee_number = values.employeeNumber;
        await createNurse.mutateAsync(payload);
        message.success(`Nurse ${payload.first_name} ${payload.last_name} created`);
      }
      setModalOpen(false);
    } catch (e: any) {
      message.error(apiError(e, 'Save failed'));
    }
  };

  const handleDelete = async (nurse: Nurse) => {
    try {
      await deleteNurse.mutateAsync(nurse.id);
      message.success(`${nurse.fullName} deleted`);
    } catch (e: any) {
      message.error(apiError(e, 'Delete failed'));
    }
  };

  const credColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Type', dataIndex: 'credentialType', key: 'type' },
    {
      title: 'Expiry',
      dataIndex: 'expiryDate',
      key: 'expiry',
      render: (d: string | null, cred: NurseCredential) =>
        d ? (
          <span>
            {d}{' '}
            <Tag color={cred.daysUntilExpiry! < 0 ? 'red' : cred.daysUntilExpiry! <= 30 ? 'orange' : 'green'}>
              {cred.daysUntilExpiry! < 0 ? `${Math.abs(cred.daysUntilExpiry!)}d ago` : `${cred.daysUntilExpiry}d`}
            </Tag>
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={s === 'Valid' ? 'green' : s === 'PendingVerification' ? 'orange' : 'red'}>{s}</Tag>
      ),
    },
  ];

  const columns = [
    { title: 'Emp #', dataIndex: 'employeeNumber', key: 'emp', width: 100 },
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'name',
      render: (name: string, nurse: Nurse) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {nurse.username && <Text type="secondary" style={{ fontSize: 11 }}>@{nurse.username}</Text>}
        </Space>
      ),
    },
    {
      title: 'Role',
      dataIndex: ['primaryRole', 'code'],
      key: 'role',
      render: (_: any, nurse: Nurse) =>
        nurse.primaryRole ? <Tag color="blue">{nurse.primaryRole.code}</Tag> : '—',
    },
    {
      title: 'Unit',
      key: 'unit',
      render: (_: any, nurse: Nurse) => nurse.homeUnit?.code ?? '—',
    },
    {
      title: 'Type',
      dataIndex: 'employmentType',
      key: 'emptype',
      width: 100,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'Active' ? 'green' : status === 'OnLeave' ? 'orange' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Credentials',
      dataIndex: 'credentialSummary',
      key: 'creds',
      render: (summary: string, nurse: Nurse) => {
        const meta = credentialSummaryMeta[summary] || credentialSummaryMeta.None;
        return (
          <Tooltip
            title={`${nurse.credentialCounts.total} total, ${nurse.credentialCounts.expiringSoon} expiring, ${nurse.credentialCounts.expired} expired`}
          >
            <Tag color={meta.color} icon={<SafetyCertificateOutlined />}>
              {meta.label} ({nurse.credentialCounts.total})
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 200,
      render: (_: any, nurse: Nurse) => (
        <Space>
          {canView && (
            <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(nurse.id)}>
              View
            </Button>
          )}
          {canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(nurse)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Popconfirm title={`Delete ${nurse.fullName}?`} onConfirm={() => handleDelete(nurse)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (viewLoading) return <Card loading />;

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
          <Input.Search
            placeholder="Search name or employee #"
            prefix={<SearchOutlined />}
            style={{ width: 240 }}
            allowClear
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Nurse
            </Button>
          )}
        </Space>
      </div>

      <Alert
        message="RBAC Permissions Active"
        description={
          <span>
            VIEW: {canView ? '✅' : '❌'} | CREATE: {canCreate ? '✅' : '❌'} | EDIT: {canEdit ? '✅' : '❌'} | DELETE: {canDelete ? '✅' : '❌'} |
            Data served from <code>/api/v1/nursing/nurses</code> (nursing.nurses, V3_0)
          </span>
        }
        type="info"
        style={{ marginBottom: 16 }}
      />

      {canViewCredentials && expiring && expiring.items.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${expiring.items.length} credential(s) expiring within ${expiring.days} days`}
          description={expiring.items
            .slice(0, 3)
            .map((c) => `${c.nurse?.fullName}: ${c.name} (${c.daysUntilExpiry}d)`)
            .join(' • ')}
          action={<Button size="small" href="/nursing/credentials">Review</Button>}
        />
      )}

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isLoading || isFetching}
          locale={{ emptyText: <Empty description="No nurses found" /> }}
          pagination={{
            current: page,
            pageSize,
            total: data?.pagination?.total ?? 0,
            showSizeChanger: true,
            showTotal: (t) => `${t} nurses`,
            onChange: (p, ps) => {
              setPage(ps !== pageSize ? 1 : p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* Create / Edit modal */}
      <Modal
        title={editing ? `Edit ${editing.fullName}` : 'Add Nurse'}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={createNurse.isPending || updateNurse.isPending}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="employeeNumber"
            label="Employee Number"
            rules={[{ required: true, message: 'Required' }]}
          >
            <Input placeholder="EMP-XXXX" />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="firstName" label="First Name" rules={[{ required: true }]} style={{ width: '50%', marginRight: 8 }}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last Name" rules={[{ required: true }]} style={{ width: '50%' }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="email" label="Email" style={{ width: '50%', marginRight: 8 }}>
              <Input type="email" />
            </Form.Item>
            <Form.Item name="phone" label="Phone" style={{ width: '50%' }}>
              <Input />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="hireDate" label="Hire Date" rules={[{ required: true }]} style={{ width: '50%', marginRight: 8 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="employmentType" label="Employment Type" rules={[{ required: true }]} style={{ width: '50%' }}>
              <Select
                options={['FullTime', 'PartTime', 'PRN', 'Contract'].map((t) => ({ value: t, label: t }))}
              />
            </Form.Item>
          </Space.Compact>
          <Space.Compact block>
            <Form.Item name="primaryRoleId" label="Primary Role" style={{ width: '50%', marginRight: 8 }}>
              <Select
                allowClear
                placeholder="Select role"
                options={(lookups?.roles ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }))}
              />
            </Form.Item>
            <Form.Item name="homeUnitId" label="Home Unit" style={{ width: '50%' }}>
              <Select
                allowClear
                placeholder="Select unit"
                options={(lookups?.units ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
              />
            </Form.Item>
          </Space.Compact>
          {editing && (
            <Form.Item name="status" label="Status">
              <Select
                options={['Active', 'OnLeave', 'Suspended', 'Terminated'].map((s) => ({ value: s, label: s }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        title={viewedNurse ? viewedNurse.fullName : 'Nurse'}
        open={viewId !== null}
        onClose={() => setViewId(null)}
        width={620}
        loading={detailLoading as any}
      >
        {viewedNurse && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 24 }}>
              <Descriptions.Item label="Employee #">{viewedNurse.employeeNumber}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={viewedNurse.status === 'Active' ? 'green' : 'orange'}>{viewedNurse.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Role">{viewedNurse.primaryRole?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Home Unit">{viewedNurse.homeUnit?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Hire Date">{viewedNurse.hireDate}</Descriptions.Item>
              <Descriptions.Item label="Employment">{viewedNurse.employmentType}</Descriptions.Item>
              <Descriptions.Item label="Email">{viewedNurse.email ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{viewedNurse.phone ?? '—'}</Descriptions.Item>
            </Descriptions>

            <Title level={5}>Credentials ({viewedNurse.credentials.length})</Title>
            <Table
              rowKey="id"
              size="small"
              columns={credColumns}
              dataSource={viewedNurse.credentials}
              pagination={false}
              style={{ marginBottom: 24 }}
            />

            <Title level={5}>Upcoming Assignments</Title>
            <Table
              rowKey="id"
              size="small"
              dataSource={viewedNurse.upcomingAssignments}
              pagination={false}
              locale={{ emptyText: <Empty description="Nothing scheduled" /> }}
              columns={[
                { title: 'Date', dataIndex: 'assignmentDate', key: 'date' },
                { title: 'Shift', dataIndex: 'shiftName', key: 'shift' },
                { title: 'Unit', dataIndex: 'unitCode', key: 'unit' },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (s: string) => <Tag color={rosterStatusColor[s]}>{s}</Tag>,
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};

import { dateFormat, t } from '../i18n/runtime';
import { useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { CheckOutlined, CloseOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AccountStatus, type OwnerRequest } from '../api';
import ResponsiveTable from '../components/ResponsiveTable';
import { EmptyPanel, LoadError, PageTitle, SectionCard } from '../components/Ui';

const statusClass: Record<AccountStatus, string> = { Pending: 'status-pending', Approved: 'status-paid', Rejected: 'status-unpaid', Suspended: 'status-suspended' };

export default function AdminOwnersPage() {
  const statusLabel: Record<AccountStatus, string> = { Pending: t("Chờ duyệt"), Approved: t("Đã duyệt"), Rejected: t("Từ chối"), Suspended: t("Tạm khóa") };
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [filter, setFilter] = useState<'All' | AccountStatus>('All');
  const [reasonTarget, setReasonTarget] = useState<{ owner: OwnerRequest; status: AccountStatus } | null>(null);
  const [form] = Form.useForm<{ reason: string }>();
  const ownersQuery = useQuery({ queryKey: ['admin-owners'], queryFn: api.owners.list });
  const updateMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: AccountStatus; reason?: string }) => api.owners.updateStatus(id, { status, reason }),
    onSuccess: async (_, variables) => { await client.invalidateQueries({ queryKey: ['admin-owners'] }); message.success(variables.status === 'Approved' ? t("Đã duyệt tài khoản chủ trọ.") : variables.status === 'Rejected' ? t("Đã từ chối yêu cầu đăng ký.") : t("Đã cập nhật trạng thái tài khoản.")); setReasonTarget(null); form.resetFields(); },
    onError: (e: Error) => message.error(e.message),
  });
  const owners = useMemo(() => filter === 'All' ? ownersQuery.data ?? [] : (ownersQuery.data ?? []).filter((owner) => owner.status === filter), [ownersQuery.data, filter]);
  const pendingCount = (ownersQuery.data ?? []).filter((owner) => owner.status === 'Pending').length;
  const approve = (owner: OwnerRequest) => modal.confirm({ title: t("Duyệt tài khoản {0}?", [owner.name]), content: t("Chủ trọ sẽ có quyền truy cập khu vực quản lý sau khi được duyệt."), okText: t("Duyệt tài khoản"), cancelText: t("Hủy"), onOk: () => updateMutation.mutateAsync({ id: owner.id, status: 'Approved' }) });
  const requestReason = (owner: OwnerRequest, status: AccountStatus) => { setReasonTarget({ owner, status }); form.resetFields(); };
  const submitReason = (values: { reason: string }) => { if (reasonTarget) updateMutation.mutate({ id: reasonTarget.owner.id, status: reasonTarget.status, reason: values.reason.trim() }); };

  const columns: TableProps<OwnerRequest>['columns'] = [
    { title: t("CHỦ TRỌ"), key: 'owner', render: (_, owner) => <div className="owner-name-cell"><div className="owner-avatar"><UserOutlined /></div><div><strong>{owner.name}</strong><span>{owner.email}</span></div></div> },
    { title: t("ĐIỆN THOẠI"), dataIndex: 'phone', render: (phone?: string) => phone || <span className="muted-dash">{t("Chưa cung cấp")}</span> },
    { title: t("NGÀY ĐĂNG KÝ"), dataIndex: 'createdAt', render: (value?: string) => value ? dayjs(value).format(dateFormat()) : <span className="muted-dash">—</span> },
    { title: t("TRẠNG THÁI"), dataIndex: 'status', render: (status: AccountStatus, owner) => <Tooltip title={owner.reason || undefined}><Tag className={`status-pill ${statusClass[status]}`}>{statusLabel[status]}</Tag></Tooltip> },
    { title: '', key: 'actions', fixed: 'right', width: 210, align: 'right', render: (_, owner) => owner.status === 'Pending' ? <Space><Button type="primary" size="small" icon={<CheckOutlined />} loading={updateMutation.isPending} onClick={() => approve(owner)}>{t("Duyệt")}</Button><Button danger size="small" icon={<CloseOutlined />} onClick={() => requestReason(owner, 'Rejected')}>{t("Từ chối")}</Button></Space> : owner.status === 'Approved' ? <Button size="small" onClick={() => requestReason(owner, 'Suspended')}>{t("Tạm khóa")}</Button> : <Button size="small" type={owner.status === 'Suspended' ? 'primary' : 'default'} onClick={() => approve(owner)}>{owner.status === 'Suspended' ? t("Mở khóa") : t("Duyệt lại")}</Button> },
  ];

  return <>
    <PageTitle eyebrow={t("QUẢN TRỊ HỆ THỐNG")} title={t("Tài khoản chủ trọ")} subtitle={t("Xem xét yêu cầu đăng ký và quản lý trạng thái truy cập.")} />
    {ownersQuery.isError ? <LoadError error={ownersQuery.error} onRetry={() => void ownersQuery.refetch()} /> : ownersQuery.isPending ? <div className="content-card"><div className="loading-placeholder" /></div> : <>
      <div className="admin-summary-card"><div className="admin-summary-symbol"><UserOutlined /></div><div><span>{t("Yêu cầu cần xem xét")}</span><strong>{pendingCount}</strong></div><div className="admin-summary-note">{pendingCount ? t("Đang chờ bạn xử lý") : t("Bạn đã xem hết yêu cầu mới")}</div></div>
      <SectionCard className="owner-list-card" title={t("Danh sách tài khoản")} extra={<Select aria-label={t("Lọc trạng thái chủ trọ")} value={filter} onChange={setFilter} options={[{ value: 'All', label: t("Tất cả trạng thái") }, { value: 'Pending', label: t("Chờ duyệt") }, { value: 'Approved', label: t("Đã duyệt") }, { value: 'Rejected', label: t("Từ chối") }, { value: 'Suspended', label: t("Tạm khóa") }]} style={{ width: 170 }} />}>
        {owners.length ? <ResponsiveTable className="owner-table" rowKey="id" columns={columns} dataSource={owners} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 800 }} /> : <EmptyPanel title={filter === 'All' ? t("Chưa có tài khoản chủ trọ") : t("Không có tài khoản {0}", [statusLabel[filter].toLowerCase()])} description={filter === 'Pending' ? t("Khi có yêu cầu đăng ký mới, bạn sẽ thấy ở đây.") : undefined} />}
      </SectionCard>
    </>}
    <Modal title={reasonTarget?.status === 'Rejected' ? t("Từ chối yêu cầu đăng ký") : t("Tạm khóa tài khoản")} open={!!reasonTarget} onCancel={() => setReasonTarget(null)} onOk={() => form.submit()} okText={t("Xác nhận")} cancelText={t("Hủy")} confirmLoading={updateMutation.isPending} destroyOnClose>
      <Typography.Paragraph className="modal-intro">{reasonTarget?.owner.name}  {t("sẽ nhận được thông báo về trạng thái tài khoản.")}</Typography.Paragraph><Form form={form} layout="vertical" onFinish={submitReason}><Form.Item label={t("Lý do")} name="reason" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập lý do.") }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} placeholder={t("Nhập lý do để chủ trọ hiểu quyết định này")} /></Form.Item></Form>
    </Modal>
  </>;
}

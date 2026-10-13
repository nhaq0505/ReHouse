import { t } from '../i18n/runtime';
import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, Modal, Row, Spin, Typography } from 'antd';
import { ArrowRightOutlined, BankOutlined, EnvironmentOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { EmptyPanel, LoadError, PageTitle, SectionCard } from '../components/Ui';

export default function BuildingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<{ name: string; address: string }>();
  const buildingsQuery = useQuery({ queryKey: ['buildings'], queryFn: api.buildings.list });
  const roomsQuery = useQuery({ queryKey: ['rooms'], queryFn: () => api.rooms.list() });
  const createMutation = useMutation({
    mutationFn: api.buildings.create,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['buildings'] }); message.success(t("Đã thêm dãy trọ.")); setOpen(false); form.resetFields(); },
    onError: (error: Error) => message.error(error.message),
  });
  const roomCounts = useMemo(() => (roomsQuery.data ?? []).reduce<Record<string, number>>((acc, room) => { acc[room.buildingId] = (acc[room.buildingId] ?? 0) + 1; return acc; }, {}), [roomsQuery.data]);
  const buildings = buildingsQuery.data ?? [];
  useEffect(() => { if (params.get('create') === '1') { setOpen(true); setParams({}, { replace: true }); } }, [params, setParams]);

  return <>
    <PageTitle eyebrow={t("KHÔNG GIAN CỦA BẠN")} title={t("Dãy trọ")} subtitle={t("Sắp xếp các địa điểm cho thuê và thêm phòng vào từng dãy.")} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>{t("Tạo dãy trọ")}</Button>} />
    {buildingsQuery.isError ? <LoadError error={buildingsQuery.error} onRetry={() => void buildingsQuery.refetch()} /> : buildingsQuery.isPending ? <div className="content-card"><Spin /></div> : buildings.length === 0 ? <SectionCard><EmptyPanel title={t("Bạn chưa thêm dãy trọ nào")} description={t("Bắt đầu bằng cách tạo dãy trọ đầu tiên. Sau đó bạn có thể thêm phòng và người thuê.")} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>{t("Tạo dãy trọ đầu tiên")}</Button>} /></SectionCard> : <>
      <div className="building-summary-strip"><div className="summary-icon"><BankOutlined /></div><div><strong>{buildings.length}  {t("dãy trọ")}</strong><span>{roomsQuery.isError ? t("Không thể tải số phòng lúc này") : t("{0} phòng đang được quản lý", [roomsQuery.data?.length ?? 0])}</span></div><Link to="/rooms">{t("Quản lý phòng")} <ArrowRightOutlined /></Link></div>
      {roomsQuery.isError && <div className="subtle-error"><LoadError error={roomsQuery.error} onRetry={() => void roomsQuery.refetch()} /></div>}
      <Row gutter={[18, 18]}>{buildings.map((building, index) => <Col key={building.id} xs={24} md={12} xl={8}><Card className="building-card" bordered={false}><div className={`building-art building-art-${index % 4}`}><div className="building-art-grid"><span /><span /><span /><span /><span /><span /></div><div className="building-art-tag">{String(index + 1).padStart(2, '0')}</div><div className="building-art-icon"><BankOutlined /></div></div><div className="building-card-body"><div className="building-card-title"><div><Typography.Title level={4}>{building.name}</Typography.Title><span><EnvironmentOutlined /> {building.address || t("Chưa có địa chỉ")}</span></div><div className="building-room-count"><strong>{roomCounts[building.id] ?? building.roomCount ?? 0}</strong><small>{t("phòng")}</small></div></div><div className="building-card-footer"><span>{t("Dãy trọ của bạn")}</span><Link to={`/rooms?building=${encodeURIComponent(building.id)}`}>{t("Xem phòng")} <ArrowRightOutlined /></Link></div></div></Card></Col>)}</Row>
      <SectionCard className="building-tip-card"><div className="building-tip"><div className="tip-illustration"><HomeOutlined /></div><div><strong>{t("Quản lý phòng trong từng dãy")}</strong><span>{t("Tạo phòng mới, cập nhật giá thuê và ghi nhận người chuyển vào trong mục Phòng & người thuê.")}</span></div><Button type="primary" ghost href="/rooms">{t("Đi đến phòng")}</Button></div></SectionCard>
    </>}
    <Modal title={t("Thêm dãy trọ mới")} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText={t("Tạo dãy trọ")} cancelText={t("Hủy")} confirmLoading={createMutation.isPending} destroyOnClose>
      <Typography.Paragraph className="modal-intro">{t("Đặt tên và nhập địa chỉ để dễ nhận biết dãy trọ của bạn.")}</Typography.Paragraph><Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)} requiredMark={false}><Form.Item label={t("Tên dãy trọ")} name="name" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập tên dãy trọ.") }]}><Input placeholder={t("Ví dụ: Dãy trọ đường Hoa Sứ")} maxLength={100} /></Form.Item><Form.Item label={t("Địa chỉ")} name="address" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập địa chỉ.") }]}><Input.TextArea placeholder={t("Số nhà, đường, phường/xã, quận/huyện")} autoSize={{ minRows: 2, maxRows: 4 }} maxLength={250} /></Form.Item></Form></Modal>
  </>;
}

import { dateFormat, getLanguage, languages, t, type Language } from '../i18n/runtime';
import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, ConfigProvider, DatePicker, Dropdown, Form, Grid, Input, InputNumber, Modal, Row, Select, Tag, Typography } from 'antd';
import type { MenuProps, TableProps } from 'antd';
import { FileAddOutlined, CopyOutlined, EditOutlined, EllipsisOutlined, HomeOutlined, LinkOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, formatVnd, type Room } from '../api';
import { roomTheme } from '../design/roomTheme';
import './RoomsPage.css';
import MoveoutDrawer from '../components/MoveoutDrawer';
import ResponsiveTable from '../components/ResponsiveTable';
import { EmptyPanel, LoadError, PageTitle, SectionCard } from '../components/Ui';

type RoomMode = 'create' | 'duplicate' | 'settings' | 'occupancy' | null;


export default function RoomsPage() {
  const screens = Grid.useBreakpoint();
  return <ConfigProvider theme={roomTheme(!screens.md)}><App component={false}><RoomsContent /></App></ConfigProvider>;
}

function RoomsContent() {
  const numberRule = [{ required: true, message: t("Vui lòng nhập giá trị.") }, { type: 'number' as const, min: 0, message: t("Giá trị không được nhỏ hơn 0.") }];
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [moveoutRoom, setMoveoutRoom] = useState<Room | null>(null);
  const [mode, setMode] = useState<RoomMode>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [linkInfo, setLinkInfo] = useState<{ token: string; url: string; room?: Room; newlyIssued?: boolean } | null>(null);
  const [linkLanguage, setLinkLanguage] = useState<Language>(getLanguage);
  const tenantLinkUrl = () => {
    if (!linkInfo) return '';
    const url = new URL(linkInfo.url, window.location.origin);
    url.searchParams.set('lang', linkLanguage);
    return url.toString();
  };
  const [supplemental, setSupplemental] = useState<{ room: Room; requestId: string } | null>(null);
  const [supplementalForm] = Form.useForm();
  const [roomForm] = Form.useForm();
  const [occupancyForm] = Form.useForm();
  const buildingFilter = searchParams.get('building') || undefined;
  const [statusFilter, setStatusFilter] = useState<'all' | 'occupied' | 'vacant'>('all');
  const buildingsQuery = useQuery({ queryKey: ['buildings'], queryFn: api.buildings.list });
  const roomsQuery = useQuery({ queryKey: ['rooms'], queryFn: () => api.rooms.list() });

  const refreshData = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['rooms'] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['buildings'] }), client.invalidateQueries({ queryKey: ['invoices'] })]); };
  const createMutation = useMutation({ mutationFn: api.rooms.create, onSuccess: async () => { await refreshData(); message.success(t("Đã thêm phòng.")); setMode(null); roomForm.resetFields(); }, onError: (e: Error) => message.error(e.message) });
  const supplementalMutation = useMutation({ mutationFn: ({ roomId, body }: { roomId: string; body: Parameters<typeof api.invoices.createSupplemental>[1] }) => api.invoices.createSupplemental(roomId, body), onSuccess: async () => { await refreshData(); message.success(t("Đã tạo hóa đơn bổ sung trên link khách.")); setSupplemental(null); supplementalForm.resetFields(); }, onError: (e: Error) => message.error(e.message) });
  const updateMutation = useMutation({ mutationFn: ({ id, values }: { id: string; values: Parameters<typeof api.rooms.update>[1] }) => api.rooms.update(id, values), onSuccess: async () => { await refreshData(); message.success(t("Đã cập nhật thông tin phòng.")); setMode(null); }, onError: (e: Error) => message.error(e.message) });
  const occupancyMutation = useMutation({ mutationFn: ({ id, values }: { id: string; values: { tenantName: string; phone: string; people: number; startDate: string; depositAmount: number } }) => api.rooms.startOccupancy(id, values), onSuccess: async () => { await refreshData(); message.success(t("Đã ghi nhận người thuê và khoản cọc nếu có.")); setMode(null); }, onError: (e: Error) => message.error(e.message) });

  const rotateMutation = useMutation({ mutationFn: api.rooms.rotateLink, onSuccess: (result, id) => { setLinkInfo({ ...result, room: roomsQuery.data?.find((room) => room.id === id), newlyIssued: true }); void refreshData(); }, onError: (e: Error) => message.error(e.message) });

  const buildingRooms = useMemo(() => (roomsQuery.data ?? []).filter((room) => !buildingFilter || room.buildingId === buildingFilter), [roomsQuery.data, buildingFilter]);
  const rooms = useMemo(() => buildingRooms.filter((room) => statusFilter === 'all' || (statusFilter === 'occupied' ? !!room.occupancy : !room.occupancy)), [buildingRooms, statusFilter]);
  const occupiedCount = buildingRooms.filter((room) => room.occupancy).length;
  const vacancyCount = buildingRooms.length - occupiedCount;
  const openCreate = () => { setSelectedRoom(null); roomForm.resetFields(); roomForm.setFieldsValue({ rent: 0, electricityRate: 3500, waterFee: 0, waterPerPerson: false, serviceFee: 0, initialReading: 0, buildingId: buildingsQuery.data?.some((building) => building.id === buildingFilter) ? buildingFilter : (buildingsQuery.data?.length === 1 ? buildingsQuery.data[0].id : undefined) }); setMode('create'); };
  const openDuplicate = (room: Room) => {
    const baseName = room.name.slice(0, 60);
    const existingNames = new Set((roomsQuery.data ?? []).filter((candidate) => candidate.buildingId === room.buildingId).map((candidate) => candidate.name.toLocaleLowerCase()));
    let name = t("{0} (bản sao)", [baseName]);
    let suffix = 2;
    while (existingNames.has(name.toLocaleLowerCase())) name = t("{0} (bản sao {1})", [baseName, suffix++]);
    setSelectedRoom(room);
    roomForm.resetFields();
    roomForm.setFieldsValue({ buildingId: room.buildingId, name, rent: room.rent, electricityRate: room.electricityRate, waterFee: room.waterFee, waterPerPerson: room.waterPerPerson ?? false, serviceFee: room.serviceFee, initialReading: 0 });
    setMode('duplicate');
  };
  const openSettings = (room: Room) => { setSelectedRoom(room); roomForm.setFieldsValue({ name: room.name, rent: room.rent, electricityRate: room.electricityRate, waterFee: room.waterFee, waterPerPerson: room.waterPerPerson ?? false, serviceFee: room.serviceFee }); setMode('settings'); };
  const openOccupancy = (room: Room) => { setSelectedRoom(room); occupancyForm.resetFields(); occupancyForm.setFieldsValue({ people: 1, startDate: dayjs(), depositAmount: 0 }); setMode('occupancy'); };

  const getActions = (room: Room): MenuProps['items'] => [
    { key: 'edit', icon: <EditOutlined />, label: t("Sửa thông tin phòng") },
    { key: 'duplicate', icon: <CopyOutlined />, label: t("Nhân bản phòng") },
    { key: 'supplemental', icon: <FileAddOutlined />, label: t("Tạo hóa đơn bổ sung"), disabled: !room.occupancy },
    ...(room.occupancy?.depositInvoiceId ? [{ key: 'deposit', label: <a href={`/invoices?invoice=${room.occupancy.depositInvoiceId}`}>{t("Thu / quyết toán cọc")}</a> }] : []),
    room.occupancy ? { key: 'moveout', danger: true, label: t("Trả phòng & quyết toán") } : { key: 'occupancy', icon: <UserAddOutlined />, label: t("Thêm người thuê") },

  ];
  const onAction = (key: string, room: Room) => {
    if (key === 'edit') openSettings(room);
    if (key === 'duplicate') openDuplicate(room);
    if (key === 'supplemental' && room.occupancy) { supplementalForm.resetFields(); supplementalForm.setFieldsValue({ dueDate: dayjs() }); setSupplemental({ room, requestId: crypto.randomUUID() }); }
    if (key === 'occupancy') openOccupancy(room);
    if (key === 'moveout') setMoveoutRoom(room);

  };

  const renewLink = (room: Room) => modal.confirm({ title: t("Thu hồi link của {0}?", [room.name]), content: t("Tạo liên kết riêng để người thuê xem hóa đơn và thanh toán. Nếu đã cấp link trước đó, link cũ sẽ hết hiệu lực."), className: 'room-editor', centered: true, autoFocusButton: 'cancel', okText: t("Thu hồi & tạo link mới"), cancelText: t("Hủy"), okButtonProps: { danger: true }, onOk: () => rotateMutation.mutateAsync(room.id) });
  const issueLink = (room: Room) => { setLinkLanguage(getLanguage()); if (room.occupancy?.token && room.occupancy.url) setLinkInfo({ token: room.occupancy.token, url: room.occupancy.url, room }); else renewLink(room); };
  useEffect(() => { if (searchParams.get('create') === '1' && buildingsQuery.isSuccess && buildingsQuery.data.length > 0) { openCreate(); const next = new URLSearchParams(searchParams); next.delete('create'); setSearchParams(next, { replace: true }); } }, [searchParams, buildingsQuery.isSuccess]);

  const roomStatus = (room: Room) => <Tag className={`room-state ${room.occupancy ? 'room-state-occupied' : 'room-state-vacant'}`}>{room.occupancy ? t("Đang thuê") : t("Còn trống")}</Tag>;
  const roomActions = (room: Room) => <div className="room-actions">
    {room.occupancy ? <Button icon={<LinkOutlined />} loading={rotateMutation.isPending && rotateMutation.variables === room.id} onClick={() => issueLink(room)}>{t("Cấp link cho khách")}</Button> : <Button icon={<UserAddOutlined />} onClick={() => openOccupancy(room)}>{t("Thêm người thuê")}</Button>}
    <Dropdown menu={{ items: getActions(room), onClick: ({ key }) => onAction(key, room) }} trigger={['click']}><Button type="text" className="room-more" icon={<EllipsisOutlined />} aria-label={t("Tác vụ {0}", [room.name])} /></Dropdown>
  </div>;
  const compactRoom = (room: Room) => <>
    <div className="room-card-head"><div><strong>{room.name}</strong><span>{room.buildingName || buildingsQuery.data?.find((building) => building.id === room.buildingId)?.name || t("Dãy trọ")}</span></div>{roomStatus(room)}</div>
    <div className="room-card-tenant"><span className="room-field-label">{t("Người thuê")}</span>{room.occupancy ? <div><strong>{room.occupancy.tenantName}</strong><span>{room.occupancy.people}  {t("người")}{room.occupancy.phone ? ` · ${room.occupancy.phone}` : ''}</span><span>{t("Cọc yêu cầu")} {formatVnd(room.occupancy.depositRequired)}  {t("· Đang giữ")} {formatVnd(room.occupancy.depositHeld)}</span></div> : <span>{t("Chưa có người thuê")}</span>}</div>
    <div className="room-card-rent"><span className="room-field-label">{t("Giá thuê / tháng")}</span><strong>{formatVnd(room.rent)}</strong></div>
    {roomActions(room)}
  </>;
  const columns: TableProps<Room>['columns'] = [
    { title: t("Phòng"), key: 'room', render: (_, room) => <div className="room-list-name"><strong>{room.name}</strong><span>{room.buildingName || buildingsQuery.data?.find((building) => building.id === room.buildingId)?.name || t("Dãy trọ")}</span></div> },
    { title: t("Người thuê"), key: 'tenant', render: (_, room) => room.occupancy ? <div className="room-list-tenant"><strong>{room.occupancy.tenantName}</strong><span>{room.occupancy.people}  {t("người")}{room.occupancy.phone ? ` · ${room.occupancy.phone}` : ''}</span><span>{t("Cọc yêu cầu")} {formatVnd(room.occupancy.depositRequired)}  {t("· Đang giữ")} {formatVnd(room.occupancy.depositHeld)}</span></div> : <span className="room-field-label">{t("Chưa có người thuê")}</span> },
    { title: t("Giá thuê / tháng"), dataIndex: 'rent', width: 160, align: 'right', render: (value: number) => <strong className="room-price">{formatVnd(value)}</strong> },
    { title: t("Trạng thái"), key: 'status', width: 118, render: (_, room) => roomStatus(room) },
    { title: '', key: 'actions', width: 240, align: 'right', render: (_, room) => roomActions(room) },
  ];
  const isCreating = mode === 'create' || mode === 'duplicate';
  const isBusy = createMutation.isPending || updateMutation.isPending || occupancyMutation.isPending;

  const clearFilters = () => { setStatusFilter('all'); setSearchParams({}); };

  return <div className="rooms-workspace">
    <PageTitle title={t("Phòng & người thuê")} subtitle={t("Quản lý phòng, người thuê và link hóa đơn.")} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!buildingsQuery.data?.length}>{t("Tạo phòng trọ")}</Button>} />
    {!buildingsQuery.isPending && !buildingsQuery.isError && buildingsQuery.data?.length === 0 && <AlertBanner onCreate={() => window.location.assign('/buildings?create=1')} />}
    {buildingsQuery.isError && <LoadError error={buildingsQuery.error} onRetry={() => void buildingsQuery.refetch()} />}
    {roomsQuery.isError ? <LoadError error={roomsQuery.error} onRetry={() => void roomsQuery.refetch()} /> : <SectionCard className="room-directory">
      <div className="room-directory-toolbar">
        <label className="room-filter"><span>{t("Trạng thái")}</span><Select aria-label={t("Lọc theo tình trạng")} value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: t("Tất cả ({0})", [buildingRooms.length]) }, { value: 'occupied', label: t("Đang thuê ({0})", [occupiedCount]) }, { value: 'vacant', label: t("Còn trống ({0})", [vacancyCount]) }]} /></label>
        <label className="room-filter"><span>{t("Dãy trọ")}</span><Select aria-label={t("Lọc theo dãy trọ")} allowClear placeholder={t("Tất cả dãy trọ")} value={buildingFilter} onChange={(value) => { setSearchParams(value ? { building: value } : {}); }} options={[...(buildingsQuery.data ?? []).map((building) => ({ value: building.id, label: building.name })), ...(buildingFilter && buildingsQuery.isSuccess && !buildingsQuery.data.some((building) => building.id === buildingFilter) ? [{ value: buildingFilter, label: t("Dãy không còn tồn tại") }] : [])]} /></label>
        <div className="room-filter-result" data-filtered={!!buildingFilter || statusFilter !== 'all'}><span aria-live="polite">{roomsQuery.isPending ? t("Đang tải phòng…") : t("{0} phòng", [rooms.length])}</span>{rooms.length > 0 && (buildingFilter || statusFilter !== 'all') && <Button type="text" onClick={clearFilters}>{t("Xóa lọc")}</Button>}</div>
      </div>
      {roomsQuery.isPending ? <div className="room-list-loading"><div className="loading-placeholder" /></div> : rooms.length ? <ResponsiveTable className="room-table" rowKey="id" columns={columns} dataSource={rooms} renderCompact={compactRoom} pagination={{ pageSize: 8, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 900 }} /> : <EmptyPanel title={(roomsQuery.data?.length ?? 0) === 0 ? t("Chưa có phòng nào") : t("Không tìm thấy phòng phù hợp")} description={(roomsQuery.data?.length ?? 0) === 0 ? t("Tạo phòng trong một dãy trọ để bắt đầu quản lý người thuê.") : t("Không có phòng khớp với bộ lọc hiện tại.")} action={(roomsQuery.data?.length ?? 0) === 0 ? <Button type="primary" icon={<PlusOutlined />} disabled={!buildingsQuery.data?.length} onClick={openCreate}>{t("Tạo phòng trọ")}</Button> : <Button onClick={clearFilters}>{t("Xóa lọc")}</Button>} />}
    </SectionCard>}
    {moveoutRoom && <MoveoutDrawer room={moveoutRoom} onClose={() => setMoveoutRoom(null)} />}
    <Modal className="room-editor" maskClosable={false} title={isCreating ? (mode === 'duplicate' ? t("Nhân bản {0}", [selectedRoom?.name ?? t("phòng")]) : t("Thêm phòng mới")) : mode === 'settings' ? t("Thông tin {0}", [selectedRoom?.name ?? t("phòng")]) : t("Thêm người thuê · {0}", [selectedRoom?.name ?? ''])} open={mode !== null} onCancel={() => setMode(null)} onOk={() => (mode === 'occupancy' ? occupancyForm.submit() : roomForm.submit())} okText={isCreating ? t("Tạo phòng") : mode === 'settings' ? t("Lưu thay đổi") : t("Lưu người thuê")} cancelText={t("Hủy")} confirmLoading={isBusy} width={610} destroyOnClose>
      {mode === 'occupancy' ? <><Typography.Paragraph className="modal-intro">{t("Nhập tiền cọc thỏa thuận riêng với khách. Khoản cọc được tạo riêng và thanh toán qua link khách sau khi lưu.")}</Typography.Paragraph><Form form={occupancyForm} layout="vertical" requiredMark={false} onFinish={(values) => selectedRoom && occupancyMutation.mutate({ id: selectedRoom.id, values: { ...values, startDate: values.startDate.format('YYYY-MM-DD') } })}><Form.Item label={t("Tên người thuê")} name="tenantName" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập tên người thuê.") }]}><Input placeholder={t("Họ và tên")} /></Form.Item><Row gutter={14}><Col xs={24} sm={12}><Form.Item label={t("Số điện thoại")} name="phone"><Input placeholder="09xx xxx xxx" /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Số người ở")} name="people" rules={[{ required: true, type: 'number', min: 1, max: 30, message: t("Nhập từ 1 đến 30 người.") }]}><InputNumber min={1} max={30} precision={0} style={{ width: '100%' }} /></Form.Item></Col></Row><Form.Item label={t("Tiền cọc yêu cầu")} name="depositAmount" extra={t("Nhập 0 nếu không thu cọc. Đây là khoản phải thu, chưa ghi nhận khách đã trả.")} rules={[{ required: true, type: 'number', min: 0, max: 2147483647, message: t("Nhập số tiền cọc hợp lệ.") }]}><InputNumber min={0} max={2147483647} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item><Form.Item label={t("Ngày chuyển vào")} name="startDate" rules={[{ required: true, message: t("Vui lòng chọn ngày.") }]}><DatePicker format={dateFormat()} disabledDate={(date) => date.isAfter(dayjs(), 'day')} style={{ width: '100%' }} /></Form.Item></Form></> : <>
        {isCreating && <Typography.Paragraph className="modal-intro">{mode === 'duplicate' ? t("Đã sao chép dãy trọ và các mức phí. Chỉnh tên phòng và nhập chỉ số công tơ mới trước khi tạo. Phòng mới chưa có người thuê, tiền cọc hoặc hóa đơn.") : t("Nhập giá thuê và các khoản phí để dùng khi lập hóa đơn hàng tháng.")}</Typography.Paragraph>}
        <Form form={roomForm} layout="vertical" requiredMark={false} onFinish={(values) => isCreating ? createMutation.mutate(values) : selectedRoom && updateMutation.mutate({ id: selectedRoom.id, values })}>
          {isCreating && <Form.Item label={t("Dãy trọ")} name="buildingId" rules={[{ required: true, message: t("Vui lòng chọn dãy trọ.") }]}><Select placeholder={t("Chọn dãy trọ")} options={(buildingsQuery.data ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Form.Item>}
          <Form.Item label={t("Tên phòng")} name="name" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập tên phòng.") }]}><Input placeholder={t("Ví dụ: Phòng 01")} maxLength={80} /></Form.Item>
          <Row gutter={14}><Col xs={24} sm={12}><Form.Item label={t("Giá thuê / tháng")} name="rent" rules={numberRule}><InputNumber min={0} step={100000} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Giá điện / kWh")} name="electricityRate" rules={numberRule}><InputNumber min={0} step={100} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col></Row>
          <Row gutter={14}><Col xs={24} sm={12}><Form.Item label={t("Tiền nước")} name="waterFee" rules={numberRule}><InputNumber min={0} step={10000} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Cách tính tiền nước")} name="waterPerPerson" rules={[{ required: true }]}><Select options={[{ value: false, label: t("Theo phòng / tháng") }, { value: true, label: t("Theo người / tháng") }]} /></Form.Item></Col></Row>
          <Form.Item label={t("Phí dịch vụ / tháng")} name="serviceFee" rules={numberRule}><InputNumber min={0} step={10000} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
          {isCreating && <Form.Item label={t("Chỉ số điện ban đầu")} name="initialReading" rules={numberRule}><InputNumber min={0} step={0.001} precision={3} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item>}
        </Form>
      </>}
    </Modal>
    <Modal className="room-editor" title={t("Tạo hóa đơn bổ sung · {0}", [supplemental?.room.name ?? ''])} open={!!supplemental} maskClosable={false} onCancel={() => { if (!supplementalMutation.isPending) setSupplemental(null); }} onOk={() => supplementalForm.submit()} okText={t("Tạo hóa đơn")} cancelText={t("Hủy")} confirmLoading={supplementalMutation.isPending} cancelButtonProps={{ disabled: supplementalMutation.isPending }} closable={!supplementalMutation.isPending} width={610} destroyOnClose>
      <Typography.Paragraph className="modal-intro">{t("Khoản thu riêng cho")} {supplemental?.room.occupancy?.tenantName}{t(". Sau khi tạo, khách xem và thanh toán qua link đang dùng.")}</Typography.Paragraph>
      <Form form={supplementalForm} layout="vertical" requiredMark={false} onFinish={(values) => { if (supplemental?.room.occupancy && !supplementalMutation.isPending) supplementalMutation.mutate({ roomId: supplemental.room.id, body: { requestId: supplemental.requestId, occupancyId: supplemental.room.occupancy.id, description: values.description, amount: values.amount, dueDate: values.dueDate.format('YYYY-MM-DD') } }); }}>
        <Form.Item label={t("Nội dung khoản thu")} name="description" rules={[{ required: true, whitespace: true, message: t("Nhập nội dung khoản thu.") }]}><Input.TextArea maxLength={500} rows={3} placeholder={t("Ví dụ: Phí sửa khóa, tiền thuê bổ sung…")} /></Form.Item>
        <Form.Item label={t("Số tiền")} name="amount" rules={[{ required: true, type: 'number', min: 1, max: 2147483647, message: t("Nhập số tiền từ 1 đến 2.147.483.647 đồng.") }]}><InputNumber min={1} max={2147483647} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
        <Form.Item label={t("Hạn thanh toán")} name="dueDate" rules={[{ required: true, message: t("Chọn hạn thanh toán.") }]}><DatePicker format={dateFormat()} style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
    <Modal className="room-editor room-link-modal" title={t("Link hóa đơn · {0}", [linkInfo?.room?.name ?? t("Người thuê")])} open={!!linkInfo} onCancel={() => setLinkInfo(null)} footer={<div className="room-link-footer">{linkInfo?.room && <Button danger type="text" onClick={() => renewLink(linkInfo.room!)}>{t("Thu hồi & tạo link mới")}</Button>}<Button onClick={() => setLinkInfo(null)}>{t("Đóng")}</Button><Button type="primary" onClick={async () => { if (!linkInfo) return; const url = tenantLinkUrl(); try { await navigator.clipboard.writeText(url); message.success(t("Đã sao chép liên kết.")); } catch { message.info(t("Hãy chọn và sao chép liên kết ở trên.")); } }}>{t("Sao chép liên kết")}</Button></div>}>
      <div className="link-info"><div className="link-info-icon"><LinkOutlined /></div><Typography.Paragraph>{linkInfo?.newlyIssued ? t("Đã tạo link mới và thu hồi link cũ. ") : ''}{t("Gửi link này cho")} {linkInfo?.room?.occupancy?.tenantName || t("người thuê")}  {t("để xem hóa đơn và thanh toán.")}</Typography.Paragraph><div className="tenant-link-language"><label>{t("Ngôn ngữ cho khách")}</label><Select aria-label={t("Ngôn ngữ cho khách")} value={linkLanguage} onChange={setLinkLanguage} options={[...languages]} /><span>{t("Chọn ngôn ngữ của link trước khi gửi cho khách.")}</span></div><Input readOnly aria-label={t("Link hóa đơn của người thuê")} value={linkInfo ? tenantLinkUrl() : ''} onFocus={(e) => e.currentTarget.select()} />{linkInfo && <Button href={tenantLinkUrl()} target="_blank" rel="noopener noreferrer" icon={<LinkOutlined />}>{t("Mở trang khách")}</Button>}</div>
    </Modal>
  </div>;
}

function AlertBanner({ onCreate }: { onCreate: () => void }) {
  return <Card className="empty-building-banner" bordered={false}><div className="empty-building-content"><div className="summary-icon"><HomeOutlined /></div><div><Typography.Text strong>{t("Hãy tạo dãy trọ trước")}</Typography.Text><Typography.Paragraph>{t("Phòng cần nằm trong một dãy trọ để bạn dễ phân loại và quản lý.")}</Typography.Paragraph></div><Button type="primary" onClick={onCreate}>{t("Tạo dãy trọ")}</Button></div></Card>;
}

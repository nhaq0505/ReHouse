import { t } from '../i18n/runtime';
import { useEffect, useMemo, useState } from 'react';
import { App, Button, DatePicker, InputNumber, Popconfirm, Tag } from 'antd';
import type { TableProps } from 'antd';
import { CheckCircleFilled, InfoCircleOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, currentPeriod, periodLabel, type Reading, type Room } from '../api';
import ResponsiveTable from '../components/ResponsiveTable';
import { EmptyPanel, LoadError, PageTitle, SectionCard } from '../components/Ui';

interface ReadingRow { room: Room; saved?: Reading; }

export default function ReadingsPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
  const roomsQuery = useQuery({ queryKey: ['rooms', period], queryFn: () => api.rooms.list(period) });
  const readingsQuery = useQuery({ queryKey: ['readings', period], queryFn: () => api.readings.list(period) });
  const rows = useMemo<ReadingRow[]>(() => (roomsQuery.data ?? []).filter((room) => room.occupancy).map((room) => ({ room, saved: (readingsQuery.data ?? []).find((reading) => reading.roomId === room.id) })), [roomsQuery.data, readingsQuery.data]);
  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map(({ room, saved }) => [room.id, saved?.currentReading ?? null])));
  }, [rows]);
  const saveMutation = useMutation({
    mutationFn: (body: { roomId: string; period: string; currentReading: number }) => api.readings.save(body),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['readings', period] }), client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['rooms'] }), client.invalidateQueries({ queryKey: ['dashboard'] })]);
      message.success(t("Đã chốt chỉ số và lập hóa đơn."));
    },
    onError: (error: Error) => message.error(error.message),
  });
  const columns: TableProps<ReadingRow>['columns'] = [
    { title: t("PHÒNG / NGƯỜI THUÊ"), key: 'room', render: (_, row) => <div className="room-name-cell"><div className="room-avatar"><span>⚡</span></div><div><strong>{row.room.name}</strong><span>{row.room.occupancy?.tenantName} · {row.room.buildingName || t("Dãy trọ")}</span></div></div> },
    { title: t("CHỈ SỐ TRƯỚC"), key: 'previous', render: (_, row) => <span className="meter-value">{row.saved?.previousReading ?? row.room.previousReading ?? row.room.initialReading ?? 0} <small>kWh</small></span> },
    { title: t("CHỈ SỐ MỚI"), key: 'current', render: (_, row) => row.saved?.currentReading !== undefined ? <div className="saved-reading"><strong>{row.saved.currentReading} <small>kWh</small></strong><Tag icon={<CheckCircleFilled />} className="submitted-tag">{t("Đã chốt")}</Tag></div> : <InputNumber aria-label={t("Chỉ số mới {0}", [row.room.name])} min={row.saved?.previousReading ?? row.room.previousReading ?? row.room.initialReading ?? 0} precision={3} step={0.001} value={drafts[row.room.id] ?? undefined} onChange={(value) => setDrafts((current) => ({ ...current, [row.room.id]: value }))} addonAfter="kWh" style={{ width: 170 }} placeholder={t("Nhập chỉ số")} /> },
    { title: t("SỬ DỤNG"), key: 'consumption', render: (_, row) => {
      const previous = row.saved?.previousReading ?? row.room.previousReading ?? row.room.initialReading ?? 0;
      const current = row.saved?.currentReading ?? drafts[row.room.id];
      const usage = current == null ? null : Math.round(Math.max(0, current - previous) * 1000) / 1000;
      return <span className="consumption-value">{usage === null ? '—' : `${usage} kWh`}</span>;
    } },
    { title: '', key: 'action', fixed: 'right', width: 190, align: 'right', render: (_, row) => row.saved?.currentReading !== undefined ? <span className="already-done">{t("Đã phát hành")}</span> : <Popconfirm title={t("Chốt chỉ số và lập hóa đơn?")} description={t("Chỉ số và mức phí hiện tại sẽ được lưu vào hóa đơn. Bạn không thể sửa lại sau khi chốt.")} okText={t("Chốt & lập hóa đơn")} cancelText={t("Kiểm tra lại")} onConfirm={() => { const currentReading = drafts[row.room.id]; if (currentReading != null) saveMutation.mutate({ roomId: row.room.id, period, currentReading }); }}><Button type="primary" size="small" loading={saveMutation.isPending && saveMutation.variables?.roomId === row.room.id} disabled={drafts[row.room.id] == null || drafts[row.room.id]! < (row.saved?.previousReading ?? row.room.previousReading ?? row.room.initialReading ?? 0) || saveMutation.isPending}>{t("Chốt & lập hóa đơn")}</Button></Popconfirm> },
  ];
  const setMonth = (value: Dayjs | null) => { if (value) setPeriod(value.format('YYYY-MM')); };
  const occupied = (roomsQuery.data ?? []).filter((room) => room.occupancy).length;
  const done = rows.filter((row) => row.saved?.currentReading !== undefined).length;

  return <>
    <PageTitle eyebrow={t("CHỐT SỐ ĐIỆN HÀNG THÁNG")} title={t("Chỉ số điện")} subtitle={t("Ghi nhận chỉ số cuối kỳ. Hóa đơn sẽ được lập ngay sau khi bạn chốt.")} extra={<DatePicker aria-label={t("Tháng ghi chỉ số")} picker="month" value={dayjs(`${period}-01`)} onChange={setMonth} format="MM/YYYY" maxDate={dayjs(`${currentPeriod()}-01`)} allowClear={false} />}/>
    {roomsQuery.isError ? <LoadError error={roomsQuery.error} onRetry={() => void roomsQuery.refetch()} /> : readingsQuery.isError ? <LoadError error={readingsQuery.error} onRetry={() => void readingsQuery.refetch()} /> : roomsQuery.isPending || readingsQuery.isPending ? <div className="content-card"><div className="loading-placeholder" /></div> : <>
      <div className="reading-progress-card"><div className="reading-progress-mark"><InfoCircleOutlined /></div><div className="reading-progress-copy"><strong>{periodLabel(period)} <span>·</span> {done}/{occupied}  {t("phòng đã chốt")}</strong><span>{t("Chỉ số trước được lấy từ lần ghi gần nhất hoặc lúc tạo phòng.")}</span></div><div className="reading-progress-meter"><div style={{ width: `${occupied ? (done / occupied) * 100 : 0}%` }} /></div></div>
      <SectionCard className="reading-section" title={t("Danh sách phòng đang thuê")} extra={<span className="section-caption">{periodLabel(period)}</span>}>
        <div className="reading-notice"><InfoCircleOutlined /><span><strong>{t("Chốt chỉ số sẽ lập hóa đơn ngay")}</strong>  {t("và lưu giá điện cùng phí hiện tại vào hóa đơn. Hệ thống chưa hỗ trợ chia kỳ khi người thuê chuyển vào hoặc chuyển đi giữa tháng.")}</span></div>
        {rows.length ? <ResponsiveTable className="reading-table" rowKey={(row) => row.room.id} columns={columns} dataSource={rows} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 830 }} /> : <EmptyPanel title={occupied === 0 ? t("Chưa có phòng đang thuê") : t("Chưa có phòng cần chốt cho {0}", [periodLabel(period)])} description={occupied === 0 ? t("Thêm người thuê vào phòng trước khi ghi chỉ số điện.") : t("Tất cả phòng hiện đã được chốt chỉ số trong kỳ này.")} />}
        {rows.length > 0 && done === rows.length && <div className="all-readings-done"><CheckCircleFilled />  {t("Tất cả phòng đang thuê đã có hóa đơn cho kỳ này.")}</div>}
      </SectionCard>
    </>}
  </>;
}

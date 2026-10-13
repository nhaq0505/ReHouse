import { dateFormat, t } from '../i18n/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Col, DatePicker, Drawer, Form, Input, InputNumber, Row, Select, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, CreditCardOutlined, FileTextOutlined, PlusOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, currentPeriod, formatVnd, periodLabel, type Invoice } from '../api';
import DepositLedger from '../components/DepositLedger';
import ResponsiveTable from '../components/ResponsiveTable';
import { EmptyPanel, LoadError, PageTitle, SectionCard } from '../components/Ui';

function statusLabel(status: string) {
  if (status === 'Paid') return t("Đã thanh toán");
  if (status === 'Partial') return t("Thanh toán một phần");
  return t("Chưa thanh toán");
}
function statusClass(status: string) {
  if (status === 'Paid') return 'status-paid';
  if (status === 'Partial') return 'status-partial';
  return 'status-unpaid';
}

type InvoiceKindFilter = 'All' | Invoice['kind'];
type InvoiceStatusFilter = 'All' | 'Unpaid' | 'Partial' | 'Paid';

function invoiceKindLabel(kind: Invoice['kind']) {
  if (kind === 'Deposit') return t("Tiền cọc nhận phòng");
  if (kind === 'Supplemental') return t("Hóa đơn bổ sung");
  return t("Hóa đơn tháng");
}

export default function InvoicesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kindFilter, setKindFilter] = useState<InvoiceKindFilter>('All');
  const [period, setPeriod] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('All');
  const [searchText, setSearchText] = useState('');
  const selectedId = searchParams.get('invoice');
  const [receiptForm] = Form.useForm<{ amount: number; note?: string }>();
  const receiptKeys = useRef(new Map<string, string>());
  const listQuery = useQuery({ queryKey: ['invoices', 'owner-all-periods'], queryFn: () => api.invoices.list() });
  const detailQuery = useQuery({ queryKey: ['invoice', selectedId], queryFn: () => api.invoices.get(selectedId!), enabled: !!selectedId });
  const invoices = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    return (listQuery.data ?? []).filter((item) =>
      (kindFilter === 'All' || item.kind === kindFilter) &&
      (!period || item.period === period) &&
      (statusFilter === 'All' || item.status.toLowerCase() === statusFilter.toLowerCase()) &&
      (!search || [item.roomName, item.buildingName, item.tenantName].some((value) => value?.toLocaleLowerCase().includes(search)))
    );
  }, [listQuery.data, kindFilter, period, statusFilter, searchText]);
  const hasActiveFilters = kindFilter !== 'All' || period !== null || statusFilter !== 'All' || !!searchText.trim();
  const totals = useMemo(() => invoices.reduce((acc, invoice) => ({ billed: acc.billed + invoice.total, paid: acc.paid + invoice.paid, outstanding: acc.outstanding + invoice.outstanding }), { billed: 0, paid: 0, outstanding: 0 }), [invoices]);
  const generateMutation = useMutation({
    mutationFn: (selectedPeriod: string) => api.invoices.generate(selectedPeriod),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['rooms'] })]); message.success(t("Đã kiểm tra và tạo các hóa đơn còn thiếu.")); },
    onError: (e: Error) => message.error(e.message),
  });
  const reconcileMutation = useMutation({
    mutationFn: (id: string) => api.invoices.reconcile(id),
    onSuccess: async (result, id) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['invoice', id] }),
        client.invalidateQueries({ queryKey: ['invoices'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['rooms'] }),
      ]);
      const status = result.status.toLowerCase();
      if (status === 'paid') message.success(t("payOS xác nhận đã thanh toán. Hóa đơn đã được cập nhật."));
      else if (status === 'nopayment') message.info(t("Chưa có giao dịch payOS cần đối soát cho hóa đơn này."));
      else if (status === 'cancelled' || status === 'expired') message.warning(t("payOS báo giao dịch đã kết thúc và chưa thanh toán."));
      else message.info(t("payOS chưa xác nhận khoản thanh toán. Hãy kiểm tra lại sau."));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const receiptMutation = useMutation({
    mutationFn: ({ id, values, idempotencyKey }: { id: string; values: { amount: number; note?: string }; idempotencyKey: string }) => api.invoices.addReceipt(id, { amount: values.amount, note: values.note?.trim() || '', idempotencyKey }),
    onSuccess: async (_, variables) => { await Promise.all([client.invalidateQueries({ queryKey: ['invoice', variables.id] }), client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['dashboard'] }), client.invalidateQueries({ queryKey: ['rooms'] })]); receiptKeys.current.delete(`${variables.id}:${JSON.stringify(variables.values)}`); receiptForm.resetFields(); message.success(t("Đã ghi nhận khoản thu.")); },
    onError: (e: Error) => message.error(e.message),
  });
  const invoice = detailQuery.data;
  useEffect(() => { if (invoice) receiptForm.setFieldsValue({ amount: invoice.outstanding }); }, [invoice, receiptForm]);
  const showInvoice = (id: string) => setSearchParams({ invoice: id });
  const confirmReceipt = (values: { amount: number; note?: string }) => {
    if (!invoice) return;
    const normalized = { amount: values.amount, note: values.note?.trim() || '' };
    const snapshot = `${invoice.id}:${JSON.stringify(normalized)}`;
    let idempotencyKey = receiptKeys.current.get(snapshot);
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); receiptKeys.current.set(snapshot, idempotencyKey); }
    modal.confirm({
      title: t("Ghi nhận khoản thu này?"),
      content: t("Bạn sắp ghi nhận {0}{1}. Khoản thu này sẽ được lưu vào sổ hóa đơn.", [formatVnd(normalized.amount), normalized.note ? ` (${normalized.note})` : '']),
      okText: t("Ghi nhận khoản thu"),
      cancelText: t("Kiểm tra lại"),
      onOk: () => receiptMutation.mutateAsync({ id: invoice.id, values: normalized, idempotencyKey }),
    });
  };
  const closeInvoice = () => setSearchParams({});
  const columns: TableProps<Invoice>['columns'] = [
    { title: t("PHÒNG / NGƯỜI THUÊ"), key: 'room', width: 220, render: (_, item) => <div className="room-name-cell"><div className="room-avatar room-avatar-invoice"><FileTextOutlined /></div><div><strong>{item.roomName}</strong><span>{item.tenantName || t("Người thuê")} · {item.buildingName || t("Dãy trọ")}</span></div></div> },
    { title: t("LOẠI HÓA ĐƠN"), key: 'kind', width: 140, render: (_, item) => <Tag className={`invoice-kind-tag invoice-kind-${item.kind.toLowerCase()}`}>{invoiceKindLabel(item.kind)}</Tag> },
    { title: t("KỲ HÓA ĐƠN"), dataIndex: 'period', width: 120, render: (value: string) => periodLabel(value) },
    { title: t("TỔNG TIỀN"), dataIndex: 'total', width: 90, align: 'right', render: (value: number) => <strong>{formatVnd(value)}</strong> },
    { title: t("ĐÃ THU"), dataIndex: 'paid', width: 90, align: 'right', render: (value: number) => <span>{formatVnd(value)}</span> },
    { title: t("CÒN LẠI"), dataIndex: 'outstanding', width: 90, align: 'right', render: (value: number) => <strong className={value > 0 ? 'balance-due' : 'balance-clear'}>{formatVnd(value)}</strong> },
    { title: t("TRẠNG THÁI"), dataIndex: 'status', width: 130, render: (value: string) => <Tag className={`status-pill ${statusClass(value)}`}>{statusLabel(value)}</Tag> },
    { title: '', key: 'action', fixed: 'right', width: 100, align: 'right', render: (_, item) => <Button type="link" style={{ whiteSpace: 'nowrap' }} onClick={() => showInvoice(item.id)}>{t("Chi tiết")} <ArrowRightOutlined /></Button> },
  ];
  const clearFilters = () => { setKindFilter('All'); setPeriod(null); setStatusFilter('All'); setSearchText(''); };
  const setMonth = (value: Dayjs | null) => setPeriod(value?.format('YYYY-MM') ?? null);

  return <>
    <PageTitle eyebrow={t("THU TIỀN RÕ RÀNG")} title={t("Hóa đơn")} subtitle={t("Theo dõi tiền thuê, điện, nước và các khoản đã thu theo từng phòng.")} extra={kindFilter === 'Monthly' && period ? <Button type="primary" icon={<PlusOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate(period)}>{t("Tạo hóa đơn còn thiếu")}</Button> : undefined} />
    {listQuery.isError ? <LoadError error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : listQuery.isPending ? <div className="content-card"><div className="loading-placeholder" /></div> : <>
      <Row gutter={[14, 14]} className="invoice-totals-row"><Col xs={24} md={8}><div className="invoice-total-tile"><span>{t("Tổng giá trị hóa đơn")}</span><strong>{formatVnd(totals.billed)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-paid"><span>{t("Đã ghi nhận trên hóa đơn")}</span><strong>{formatVnd(totals.paid)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-due"><span>{t("Còn phải thu")}</span><strong>{formatVnd(totals.outstanding)}</strong></div></Col></Row>
      <p className="invoice-summary-scope">{t("Ba số liệu này tính từ {0} hóa đơn phù hợp với bộ lọc. Tiền cọc đã nhận không phải doanh thu.", [invoices.length])}</p>
      <SectionCard className="invoice-list-card" title={t("Hóa đơn")} extra={<div className="invoice-list-actions"><span className="section-caption">{t("Kết quả bộ lọc: {0} hóa đơn", [invoices.length])}</span>{hasActiveFilters && invoices.length > 0 && <Button type="text" onClick={clearFilters}>{t("Xóa lọc")}</Button>}</div>}>
        <div className="invoice-filter-toolbar">
          <label className="invoice-filter"><span>{t("Loại hóa đơn")}</span><Select aria-label={t("Loại hóa đơn")} value={kindFilter} onChange={(value) => setKindFilter(value as InvoiceKindFilter)} options={[{ value: 'All', label: t("Tất cả loại hóa đơn") }, { value: 'Monthly', label: t("Hóa đơn tháng") }, { value: 'Deposit', label: t("Tiền cọc các lượt thuê") }, { value: 'Supplemental', label: t("Hóa đơn bổ sung") }]} /></label>
          <label className="invoice-filter"><span>{t("Kỳ hóa đơn")}</span><DatePicker aria-label={t("Kỳ hóa đơn")} picker="month" value={period ? dayjs(`${period}-01`) : null} onChange={setMonth} format="MM/YYYY" maxDate={dayjs(`${currentPeriod()}-01`)} placeholder={t("Tất cả kỳ")} allowClear /></label>
          <label className="invoice-filter"><span>{t("Trạng thái thanh toán")}</span><Select aria-label={t("Trạng thái thanh toán")} value={statusFilter} onChange={(value) => setStatusFilter(value as InvoiceStatusFilter)} options={[{ value: 'All', label: t("Tất cả trạng thái") }, { value: 'Unpaid', label: t("Chưa thanh toán") }, { value: 'Partial', label: t("Thanh toán một phần") }, { value: 'Paid', label: t("Đã thanh toán") }]} /></label>
          <label className="invoice-filter invoice-filter-search"><span>{t("Tìm hóa đơn")}</span><Input aria-label={t("Tìm hóa đơn")} prefix={<SearchOutlined />} value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t("Phòng, dãy trọ hoặc người thuê")} allowClear /></label>
        </div>
        {invoices.length ? <ResponsiveTable className="invoice-table" rowKey="id" columns={columns} dataSource={invoices} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 980 }} /> : hasActiveFilters ? <EmptyPanel title={t("Không có hóa đơn khớp bộ lọc")} description={t("Hãy đổi bộ lọc hoặc từ khóa để xem hóa đơn.")} action={<Button onClick={clearFilters}>{t("Xóa lọc")}</Button>} /> : <EmptyPanel title={t("Chưa có hóa đơn")} description={t("Hóa đơn sẽ xuất hiện sau khi bạn ghi nhận tiền cọc, tạo khoản bổ sung hoặc chốt chỉ số điện.")} />}
      </SectionCard>
    </>}
    <Drawer className="invoice-drawer" title={t("Chi tiết hóa đơn")} width={520} open={!!selectedId} onClose={closeInvoice} destroyOnClose>
      {detailQuery.isPending ? <div className="drawer-loading"><div className="loading-placeholder" /></div> : detailQuery.isError ? <LoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : invoice && <>
        <div className="invoice-detail-head"><div className="invoice-detail-mark"><FileTextOutlined /></div><div><Typography.Title level={4}>{invoice.roomName}</Typography.Title><Typography.Text type="secondary">{invoice.buildingName || t("Dãy trọ")} · {invoice.tenantName || t("Người thuê")}</Typography.Text></div><Tag className={`status-pill ${statusClass(invoice.status)}`}>{statusLabel(invoice.status)}</Tag></div>
        <div className="invoice-period-box"><span>{t("Kỳ hóa đơn")}</span><strong>{invoice.kind === 'Deposit' ? t("Tiền cọc nhận phòng") : invoice.kind === 'Supplemental' ? t("Hóa đơn bổ sung") : periodLabel(invoice.period)}</strong><span>{t("Phát hành")} {invoice.issuedAt ? dayjs(invoice.issuedAt).format(dateFormat()) : '—'}</span></div>
        {invoice.kind === 'Supplemental' ? <div className="invoice-breakdown"><div><span>{t("Nội dung")}</span><strong style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{invoice.description}</strong></div>{invoice.isFinalMeterReading && <><div><span>{t("Điện cuối kỳ ·")} {invoice.previousReading} → {invoice.currentReading} kWh</span><strong>{formatVnd(invoice.electricityAmount)}</strong></div><div><span>{t("Khoản còn lại")}</span><strong>{formatVnd(invoice.serviceAmount)}</strong></div></>}<div className="breakdown-total"><span>{t("Số tiền")}</span><strong>{formatVnd(invoice.total)}</strong></div></div> : invoice.kind === 'Deposit' ? <div className="invoice-breakdown"><div className="breakdown-total"><span>{t("Tiền cọc yêu cầu")}</span><strong>{formatVnd(invoice.total)}</strong></div></div> : <div className="invoice-breakdown"><div><span>{t("Tiền thuê phòng")}</span><strong>{formatVnd(invoice.rent)}</strong></div><div><span>{t("Tiền điện")} <small>{invoice.consumption} kWh · {invoice.previousReading} → {invoice.currentReading}</small></span><strong>{formatVnd(invoice.electricityAmount)}</strong></div><div><span>{t("Tiền nước")}</span><strong>{formatVnd(invoice.waterAmount)}</strong></div><div><span>{t("Phí dịch vụ")}</span><strong>{formatVnd(invoice.serviceAmount)}</strong></div><div className="breakdown-total"><span>{t("Tổng hóa đơn")}</span><strong>{formatVnd(invoice.total)}</strong></div></div>}
        <div className="invoice-balance-box"><div><span>{t("Đã ghi nhận")}</span><strong>{formatVnd(invoice.paid)}</strong></div><div><span>{t("Còn phải thu")}</span><strong className={invoice.outstanding > 0 ? 'balance-due' : 'balance-clear'}>{formatVnd(invoice.outstanding)}</strong></div>{invoice.dueDate && <span className="due-date-note">{t("Hạn thanh toán:")} {dayjs(invoice.dueDate).format(dateFormat())}</span>}</div>
        {invoice.outstanding > 0 && <div className="receipt-form-block"><div className="receipt-form-title"><CreditCardOutlined /><div><strong>{t("Đối soát thanh toán payOS")}</strong><span>{t("Kiểm tra trạng thái giao dịch với payOS trước khi ghi nhận khoản thu ngoài.")}</span></div></div><Button block loading={reconcileMutation.isPending && reconcileMutation.variables === invoice.id} onClick={() => reconcileMutation.mutate(invoice.id)}>{t("Kiểm tra giao dịch payOS")}</Button></div>}
        {invoice.outstanding > 0 ? <div className="receipt-form-block"><div className="receipt-form-title"><WalletOutlined /><div><strong>{t("Ghi nhận khoản thu")}</strong><span>{t("Tiền mặt hoặc chuyển khoản đã nhận bên ngoài.")}</span></div></div><Form form={receiptForm} layout="vertical" requiredMark={false} onFinish={confirmReceipt}><Form.Item label={t("Số tiền nhận")} name="amount" rules={[{ required: true, type: 'number', min: 1, max: invoice.outstanding, message: t("Nhập số tiền từ 1 đến {0}.", [formatVnd(invoice.outstanding)]) }]}><InputNumber min={1} max={invoice.outstanding} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item><Form.Item label={t("Ghi chú")} name="note"><Input placeholder={t("Ví dụ: Chuyển khoản ngày 12/10")} maxLength={200} /></Form.Item><Button type="primary" block htmlType="submit" loading={receiptMutation.isPending}>{t("Lưu khoản thu")}</Button></Form></div> : <div className="invoice-paid-note"><CheckCircleFilled />  {t("Hóa đơn đã được thanh toán đầy đủ.")}</div>}
        {invoice.kind === 'Deposit' && <DepositLedger invoice={invoice} />}
      </>}
    </Drawer>
  </>;
}

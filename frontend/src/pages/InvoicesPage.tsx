import { dateFormat, formatDate, getLocale, t } from '../i18n/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Col, Collapse, DatePicker, Drawer, Form, Input, InputNumber, Row, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, CreditCardOutlined, FileTextOutlined, LinkOutlined, MessageOutlined, PlusOutlined, SearchOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, currentPeriod, formatVnd, periodLabel, type Invoice, type InvoiceCorrection } from '../api';
import DepositLedger from '../components/DepositLedger';
import MoneyInput from '../components/MoneyInput';
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
type IssuanceFilter = 'All' | 'Issued' | 'Draft';

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
  const [issuanceFilter, setIssuanceFilter] = useState<IssuanceFilter>('All');
  const [period, setPeriod] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatusFilter>('All');
  const [searchText, setSearchText] = useState('');
  const [adjustmentExpanded, setAdjustmentExpanded] = useState(false);
  const selectedId = searchParams.get('invoice');
  const [receiptForm] = Form.useForm<{ amount: number; note?: string }>();
  const [correctionForm] = Form.useForm<{ amount?: number; rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; currentReading?: number; reason: string; dueDate?: Dayjs; description?: string }>();
  const receiptKeys = useRef(new Map<string, string>());
  const correctionKeys = useRef(new Map<string, string>());
  const listQuery = useQuery({ queryKey: ['invoices', 'owner-all-periods'], queryFn: () => api.invoices.list() });
  const detailQuery = useQuery({ queryKey: ['invoice', selectedId], queryFn: () => api.invoices.get(selectedId!), enabled: !!selectedId });
  const invoices = useMemo(() => {
    const search = searchText.trim().toLocaleLowerCase();
    return (listQuery.data ?? []).filter((item) =>
      (kindFilter === 'All' || item.kind === kindFilter) &&
      (issuanceFilter === 'All' || (item.lifecycleState ?? 'Issued') === issuanceFilter) &&
      (!period || item.period === period) &&
      (statusFilter === 'All' || ((item.lifecycleState ?? 'Issued') !== 'Draft' && item.status.toLowerCase() === statusFilter.toLowerCase())) &&
      (!search || [item.roomName, item.buildingName, item.tenantName].some((value) => value?.toLocaleLowerCase().includes(search)))
    );
  }, [listQuery.data, kindFilter, issuanceFilter, period, statusFilter, searchText]);
  const hasActiveFilters = kindFilter !== 'All' || issuanceFilter !== 'All' || period !== null || statusFilter !== 'All' || !!searchText.trim();
  const issuedInvoices = useMemo(() => invoices.filter((invoice) => invoice.lifecycleState !== 'Draft'), [invoices]);
  const draftCount = invoices.length - issuedInvoices.length;
  const totals = useMemo(() => issuedInvoices.reduce((acc, invoice) => ({ billed: acc.billed + invoice.total, paid: acc.paid + invoice.paid, outstanding: acc.outstanding + invoice.outstanding }), { billed: 0, paid: 0, outstanding: 0 }), [issuedInvoices]);
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
  useEffect(() => { setAdjustmentExpanded(false); }, [selectedId]);
  const correctionQuery = useQuery({ queryKey: ['invoiceCorrections', selectedId], queryFn: () => api.invoices.corrections(selectedId!), enabled: !!selectedId && invoice?.lifecycleState !== 'Draft' });
  const correctionMutation = useMutation({
    mutationFn: ({ id, values, requestId, version }: { id: string; values: { amount?: number; rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; currentReading?: number; reason: string; dueDate?: string; description?: string }; requestId: string; version: number }) => api.invoices.correct(id, { ...values, expectedVersion: version, requestId }),
    onSuccess: async (_, variables) => { await Promise.all([client.invalidateQueries({ queryKey: ['invoice', variables.id] }), client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['invoiceCorrections', variables.id] }), client.invalidateQueries({ queryKey: ['dashboard'] })]); correctionKeys.current.delete(variables.id); correctionForm.resetFields(); message.success(t("Đã lưu điều chỉnh hóa đơn.")); },
    onError: (error: Error) => message.error(error.message),
  });
  useEffect(() => { if (invoice) receiptForm.setFieldsValue({ amount: invoice.outstanding }); }, [invoice, receiptForm]);
  useEffect(() => { if (invoice) correctionForm.setFieldsValue({ amount: invoice.total, rent: invoice.rent, electricityAmount: invoice.electricityAmount, waterAmount: invoice.waterAmount, serviceAmount: invoice.serviceAmount, currentReading: invoice.currentReading, dueDate: invoice.dueDate ? dayjs(invoice.dueDate) : undefined, description: invoice.description, reason: '' }); }, [invoice, correctionForm]);
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
  const confirmCorrection = (values: { amount?: number; rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; currentReading?: number; reason: string; dueDate?: Dayjs; description?: string }) => {
    if (!invoice) return;
    let requestId = correctionKeys.current.get(invoice.id);
    if (!requestId) { requestId = crypto.randomUUID(); correctionKeys.current.set(invoice.id, requestId); }
    const common = { reason: values.reason.trim(), dueDate: values.dueDate?.format('YYYY-MM-DD'), description: values.description?.trim() };
    const monthlyOverlap = invoice.kind === 'Supplemental' && invoice.isFinalMeterReading && (listQuery.data ?? []).some((candidate) => candidate.kind === 'Monthly' && candidate.occupancyId === invoice.occupancyId && candidate.period === invoice.period);
    const body = invoice.kind === 'Monthly'
      ? { ...common, rent: values.rent, electricityAmount: values.electricityAmount, waterAmount: values.waterAmount, serviceAmount: values.serviceAmount, currentReading: invoice.canCorrectMeter ? values.currentReading : undefined }
      : invoice.kind === 'Deposit'
        ? { ...common, amount: values.amount }
        : invoice.isFinalMeterReading
          ? { ...common, ...(monthlyOverlap ? {} : { rent: values.rent, waterAmount: values.waterAmount }), electricityAmount: values.electricityAmount, serviceAmount: values.serviceAmount, currentReading: invoice.canCorrectMeter ? values.currentReading : undefined }
          : { ...common, amount: values.amount };
    modal.confirm({ title: t("Lưu điều chỉnh hóa đơn?"), content: t("Mức phí mới và lý do sẽ được ghi vào lịch sử hóa đơn."), okText: t("Lưu điều chỉnh"), cancelText: t("Kiểm tra lại"), onOk: () => correctionMutation.mutateAsync({ id: invoice.id, values: body, requestId: requestId!, version: invoice.version ?? 0 }) });
  };
  const adjustmentBlockedReason = invoice?.hasPendingPayment ? t("Hóa đơn có giao dịch payOS đang chờ. Hãy đối soát giao dịch trước khi điều chỉnh.") : invoice?.status === 'Paid' || invoice?.status === 'Partial' || (invoice?.paid ?? 0) > 0 ? t("Chỉ được điều chỉnh hóa đơn chưa thanh toán. Hóa đơn này đã ghi nhận tiền.") : null;
  const hasMonthlyOverlap = !!invoice && invoice.kind === 'Supplemental' && invoice.isFinalMeterReading && (listQuery.data ?? []).some((candidate) => candidate.kind === 'Monthly' && candidate.occupancyId === invoice.occupancyId && candidate.period === invoice.period);
  const getCheckoutUrl = (item: Invoice) => {
    if (!item.tenantToken) return '';
    return `${window.location.origin}/t/${encodeURIComponent(item.tenantToken)}/invoices/${encodeURIComponent(item.id)}/checkout`;
  };

  const formatReminderMessage = (item: Invoice) => {
    const url = getCheckoutUrl(item);
    let periodText = item.period;
    if (item.kind === 'Deposit') {
      periodText = t("Tiền cọc nhận phòng");
    } else if (item.kind === 'Supplemental') {
      periodText = t("Hóa đơn bổ sung");
    } else {
      const [year, month] = item.period.split('-');
      periodText = month && year ? `${month}/${year}` : item.period;
    }
    const amountText = `${new Intl.NumberFormat(getLocale()).format(item.total)} đ`;
    return [
      t("🔔 Thông báo tiền phòng {0} - Kỳ {1}", [item.roomName, periodText]),
      t("💰 Tổng cộng: {0}", [amountText]),
      t("👉 Xem chi tiết chỉ số điện nước và quét mã QR thanh toán tự động tại: {0}", [url]),
    ].join('\n');
  };

  const copyReminderMessage = async (item: Invoice) => {
    const text = formatReminderMessage(item);
    try {
      await navigator.clipboard.writeText(text);
      message.success(t("Đã sao chép tin nhắn thu tiền."));
    } catch {
      message.info(t("Không thể sao chép tự động."));
    }
  };

  const copyPaymentLink = async (item: Invoice) => {
    const url = getCheckoutUrl(item);
    if (!url) {
      message.warning(t("Chưa có liên kết thanh toán cho hóa đơn này."));
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      message.success(t("Đã sao chép link thanh toán."));
    } catch {
      message.info(t("Không thể sao chép tự động."));
    }
  };

  const columns: TableProps<Invoice>['columns'] = [
    { title: t("PHÒNG / NGƯỜI THUÊ"), key: 'room', width: 220, render: (_, item) => <div className="room-name-cell"><div className="room-avatar room-avatar-invoice"><FileTextOutlined /></div><div><strong>{item.roomName}</strong><span>{item.tenantName || t("Người thuê")} · {item.buildingName || t("Dãy trọ")}</span></div></div> },
    { title: t("LOẠI HÓA ĐƠN"), key: 'kind', width: 140, render: (_, item) => <Tag className={`invoice-kind-tag invoice-kind-${item.kind.toLowerCase()}`}>{invoiceKindLabel(item.kind)}</Tag> },
    { title: t("KỲ HÓA ĐƠN"), dataIndex: 'period', width: 120, render: (value: string) => periodLabel(value) },
    { title: t("TỔNG TIỀN"), dataIndex: 'total', width: 90, align: 'right', render: (value: number, item) => item.lifecycleState === 'Draft' ? <span title={t("Bản nháp chưa phát hành")}>{formatVnd(value)}</span> : <strong>{formatVnd(value)}</strong> },
    { title: t("ĐÃ THU"), dataIndex: 'paid', width: 90, align: 'right', render: (value: number, item) => item.lifecycleState === 'Draft' ? <span>—</span> : <span>{formatVnd(value)}</span> },
    { title: t("CÒN LẠI"), dataIndex: 'outstanding', width: 90, align: 'right', render: (value: number, item) => item.lifecycleState === 'Draft' ? <span>—</span> : <strong className={value > 0 ? 'balance-due' : 'balance-clear'}>{formatVnd(value)}</strong> },
    { title: t("TRẠNG THÁI"), key: 'status', width: 130, render: (_, item) => item.lifecycleState === 'Draft' ? <Tag className="draft-state-tag">{t("Bản nháp")}</Tag> : <Tag className={`status-pill ${statusClass(item.status)}`}>{statusLabel(item.status)}</Tag> },
    {
      title: t("THAO TÁC"),
      key: 'action',
      width: 170,
      align: 'right',
      render: (_, item) => (
        <Space size={4}>
          {item.lifecycleState !== 'Draft' && item.tenantToken && (
            <>
              <Tooltip title={t("Copy tin nhắn thu tiền")}>
                <Button
                  size="small"
                  icon={<MessageOutlined />}
                  onClick={(e) => { e.stopPropagation(); void copyReminderMessage(item); }}
                />
              </Tooltip>
              <Tooltip title={t("Sao chép link thanh toán")}>
                <Button
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={(e) => { e.stopPropagation(); void copyPaymentLink(item); }}
                />
              </Tooltip>
            </>
          )}
          <Button type="link" size="small" style={{ whiteSpace: 'nowrap' }} onClick={() => showInvoice(item.id)}>
            {t("Chi tiết")} <ArrowRightOutlined />
          </Button>
        </Space>
      ),
    },
  ];
  const clearFilters = () => { setKindFilter('All'); setIssuanceFilter('All'); setPeriod(null); setStatusFilter('All'); setSearchText(''); };
  const setMonth = (value: Dayjs | null) => setPeriod(value?.format('YYYY-MM') ?? null);

  return <>
    <PageTitle eyebrow={t("THU TIỀN RÕ RÀNG")} title={t("Hóa đơn")} subtitle={t("Theo dõi tiền thuê, điện, nước và các khoản đã thu theo từng phòng.")} extra={kindFilter === 'Monthly' && period ? <Button title={t("Chỉ tạo hóa đơn còn thiếu; không phát hành các bản nháp.")} type="primary" icon={<PlusOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate(period)}>{t("Tạo hóa đơn còn thiếu")}</Button> : undefined} />
    {listQuery.isError ? <LoadError error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : listQuery.isPending ? <div className="content-card"><div className="loading-placeholder" /></div> : <>
      <Row gutter={[14, 14]} className="invoice-totals-row"><Col xs={24} md={8}><div className="invoice-total-tile"><span>{t("Tổng giá trị hóa đơn")}</span><strong>{formatVnd(totals.billed)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-paid"><span>{t("Đã ghi nhận trên hóa đơn")}</span><strong>{formatVnd(totals.paid)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-due"><span>{t("Còn phải thu")}</span><strong>{formatVnd(totals.outstanding)}</strong></div></Col></Row>
      <p className="invoice-summary-scope">{t("Ba số liệu tính từ {0} hóa đơn đã phát hành phù hợp bộ lọc. Tiền cọc không phải doanh thu.", [issuedInvoices.length])}{draftCount > 0 && <> · {t("{0} bản nháp chưa phát hành", [draftCount])}</>}</p>
      <SectionCard className="invoice-list-card" title={t("Hóa đơn")} extra={<div className="invoice-list-actions"><span className="section-caption">{t("Kết quả bộ lọc: {0} hóa đơn", [invoices.length])}</span>{hasActiveFilters && invoices.length > 0 && <Button type="text" onClick={clearFilters}>{t("Xóa lọc")}</Button>}</div>}>
        <div className="invoice-filter-toolbar">
          <label className="invoice-filter"><span>{t("Loại hóa đơn")}</span><Select aria-label={t("Loại hóa đơn")} value={kindFilter} onChange={(value) => setKindFilter(value as InvoiceKindFilter)} options={[{ value: 'All', label: t("Tất cả loại hóa đơn") }, { value: 'Monthly', label: t("Hóa đơn tháng") }, { value: 'Deposit', label: t("Tiền cọc các lượt thuê") }, { value: 'Supplemental', label: t("Hóa đơn bổ sung") }]} /></label>
          <label className="invoice-filter"><span>{t("Trạng thái phát hành")}</span><Select aria-label={t("Trạng thái phát hành")} value={issuanceFilter} onChange={(value) => setIssuanceFilter(value as IssuanceFilter)} options={[{ value: 'All', label: t("Tất cả trạng thái phát hành") }, { value: 'Issued', label: t("Đã phát hành") }, { value: 'Draft', label: t("Bản nháp") }]} /></label>
          <label className="invoice-filter"><span>{t("Kỳ hóa đơn")}</span><DatePicker aria-label={t("Kỳ hóa đơn")} picker="month" value={period ? dayjs(`${period}-01`) : null} onChange={setMonth} format="MM/YYYY" maxDate={dayjs(`${currentPeriod()}-01`)} placeholder={t("Tất cả kỳ")} allowClear /></label>
          <label className="invoice-filter"><span>{t("Trạng thái thanh toán")}</span><Select aria-label={t("Trạng thái thanh toán")} value={statusFilter} onChange={(value) => setStatusFilter(value as InvoiceStatusFilter)} options={[{ value: 'All', label: t("Tất cả trạng thái") }, { value: 'Unpaid', label: t("Chưa thanh toán") }, { value: 'Partial', label: t("Thanh toán một phần") }, { value: 'Paid', label: t("Đã thanh toán") }]} /></label>
          <label className="invoice-filter invoice-filter-search"><span>{t("Tìm hóa đơn")}</span><Input aria-label={t("Tìm hóa đơn")} prefix={<SearchOutlined />} value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder={t("Phòng, dãy trọ hoặc người thuê")} allowClear /></label>
        </div>
        {invoices.length ? <ResponsiveTable className="invoice-table" rowKey="id" columns={columns} dataSource={invoices} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 980 }} /> : hasActiveFilters ? <EmptyPanel title={t("Không có hóa đơn khớp bộ lọc")} description={t("Hãy đổi bộ lọc hoặc từ khóa để xem hóa đơn.")} action={<Button onClick={clearFilters}>{t("Xóa lọc")}</Button>} /> : <EmptyPanel title={t("Chưa có hóa đơn")} description={t("Hóa đơn sẽ xuất hiện sau khi bạn ghi nhận tiền cọc, tạo khoản bổ sung hoặc chốt chỉ số điện.")} />}
      </SectionCard>
    </>}
    <Drawer className="invoice-drawer" title={t("Chi tiết hóa đơn")} width={520} open={!!selectedId} onClose={closeInvoice} destroyOnClose>
      {detailQuery.isPending ? <div className="drawer-loading"><div className="loading-placeholder" /></div> : detailQuery.isError ? <LoadError error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /> : invoice && <>
        <div className="invoice-detail-head"><div className="invoice-detail-mark"><FileTextOutlined /></div><div><Typography.Title level={4}>{invoice.roomName}</Typography.Title><Typography.Text type="secondary">{invoice.buildingName || t("Dãy trọ")} · {invoice.tenantName || t("Người thuê")}</Typography.Text></div>{invoice.lifecycleState === 'Draft' ? <Tag className="draft-state-tag">{t("Bản nháp")}</Tag> : <Tag className={`status-pill ${statusClass(invoice.status)}`}>{statusLabel(invoice.status)}</Tag>}</div>
        <div className="invoice-period-box"><span>{t("Kỳ hóa đơn")}</span><strong>{invoice.kind === 'Deposit' ? t("Tiền cọc nhận phòng") : invoice.kind === 'Supplemental' ? t("Hóa đơn bổ sung") : periodLabel(invoice.period)}</strong><span>{t("Phát hành")} {invoice.issuedAt ? dayjs(invoice.issuedAt).format(dateFormat()) : '—'}</span></div>
        {invoice.lifecycleState !== 'Draft' && invoice.tenantToken && (
          <div className="invoice-share-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
            <Button
              type="primary"
              icon={<MessageOutlined />}
              onClick={() => void copyReminderMessage(invoice)}
            >
              {t("Copy tin nhắn thu tiền")}
            </Button>
            <Button
              icon={<LinkOutlined />}
              onClick={() => void copyPaymentLink(invoice)}
            >
              {t("Sao chép link thanh toán")}
            </Button>
          </div>
        )}
        {invoice.kind === 'Supplemental' ? <div className="invoice-breakdown"><div><span>{t("Nội dung")}</span><strong style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{invoice.description}</strong></div>{invoice.isFinalMeterReading && <><div><span>{t("Điện cuối kỳ ·")} {invoice.previousReading} → {invoice.currentReading} kWh</span><strong>{formatVnd(invoice.electricityAmount)}</strong></div><div><span>{t("Khoản còn lại")}</span><strong>{formatVnd(invoice.serviceAmount)}</strong></div></>}<div className="breakdown-total"><span>{t("Số tiền")}</span><strong>{formatVnd(invoice.total)}</strong></div></div> : invoice.kind === 'Deposit' ? <div className="invoice-breakdown"><div className="breakdown-total"><span>{t("Tiền cọc yêu cầu")}</span><strong>{formatVnd(invoice.total)}</strong></div></div> : <div className="invoice-breakdown"><div><span>{t("Tiền thuê phòng")}</span><strong>{formatVnd(invoice.rent)}</strong></div><div><span>{t("Tiền điện")} <small>{invoice.consumption} kWh · {invoice.previousReading} → {invoice.currentReading}</small></span><strong>{formatVnd(invoice.electricityAmount)}</strong></div><div><span>{t("Tiền nước")}</span><strong>{formatVnd(invoice.waterAmount)}</strong></div><div><span>{t("Phí dịch vụ")}</span><strong>{formatVnd(invoice.serviceAmount)}</strong></div><div className="breakdown-total"><span>{t("Tổng hóa đơn")}</span><strong>{formatVnd(invoice.total)}</strong></div></div>}
        {invoice.lifecycleState === 'Draft' ? <Alert type="warning" showIcon message={t("Bản nháp chưa gửi cho khách")} description={t("Bản nháp chưa có trạng thái thanh toán. Mở trang Chỉ số điện để chỉnh và phát hành.")} /> : <>
          <div className="invoice-balance-box"><div><span>{t("Đã ghi nhận")}</span><strong>{formatVnd(invoice.paid)}</strong></div><div><span>{t("Còn phải thu")}</span><strong className={invoice.outstanding > 0 ? 'balance-due' : 'balance-clear'}>{formatVnd(invoice.outstanding)}</strong></div>{invoice.dueDate && <span className="due-date-note">{t("Hạn thanh toán:")} {dayjs(invoice.dueDate).format(dateFormat())}</span>}</div>
          {invoice.outstanding > 0 && <div className="receipt-form-block"><div className="receipt-form-title"><CreditCardOutlined /><div><strong>{t("Đối soát thanh toán payOS")}</strong><span>{t("Kiểm tra trạng thái giao dịch với payOS trước khi ghi nhận khoản thu ngoài.")}</span></div></div><Button block loading={reconcileMutation.isPending && reconcileMutation.variables === invoice.id} onClick={() => reconcileMutation.mutate(invoice.id)}>{t("Kiểm tra giao dịch payOS")}</Button></div>}
          {invoice.outstanding > 0 ? <div className="receipt-form-block"><div className="receipt-form-title"><WalletOutlined /><div><strong>{t("Ghi nhận khoản thu")}</strong><span>{t("Tiền mặt hoặc chuyển khoản đã nhận bên ngoài.")}</span></div></div><Form form={receiptForm} layout="vertical" requiredMark={false} onFinish={confirmReceipt}><Form.Item label={t("Số tiền nhận")} name="amount" rules={[{ required: true, type: 'number', min: 1, max: invoice.outstanding, message: t("Nhập số tiền từ 1 đến {0}.", [formatVnd(invoice.outstanding)]) }]}><MoneyInput min={1} max={invoice.outstanding} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item><Form.Item label={t("Ghi chú")} name="note"><Input placeholder={t("Ví dụ: Chuyển khoản ngày 12/10")} maxLength={200} /></Form.Item><Button type="primary" block htmlType="submit" loading={receiptMutation.isPending}>{t("Lưu khoản thu")}</Button></Form></div> : <div className="invoice-paid-note"><CheckCircleFilled /> {t("Hóa đơn đã được thanh toán đầy đủ.")}</div>}
        </>}
        {invoice.lifecycleState !== 'Draft' && <section className="invoice-corrections">
          <Collapse
            className="invoice-adjustment-collapse"
            ghost
            activeKey={adjustmentExpanded ? ['adjustment'] : []}
            onChange={(keys) => setAdjustmentExpanded(keys.includes('adjustment'))}
            items={[{
              key: 'adjustment',
              label: invoice.kind === 'Monthly' ? t("Điều chỉnh hóa đơn") : invoice.kind === 'Deposit' ? t("Điều chỉnh tiền cọc") : t("Điều chỉnh hóa đơn bổ sung"),
              forceRender: true,
              children: <>
                <Typography.Paragraph type="secondary">{t("Ghi lại lý do và toàn bộ thay đổi trong lịch sử.")}</Typography.Paragraph>
                {invoice.hasPendingPayment && <Alert type="warning" showIcon message={t("Cần đối soát trước khi điều chỉnh")} description={adjustmentBlockedReason} action={<Button size="small" loading={reconcileMutation.isPending} onClick={() => reconcileMutation.mutate(invoice.id)}>{t("Đối soát payOS")}</Button>} />}
                {!invoice.hasPendingPayment && adjustmentBlockedReason && <Alert type="info" showIcon message={t("Không thể điều chỉnh hóa đơn này")} description={adjustmentBlockedReason} />}
                {!adjustmentBlockedReason && <Form form={correctionForm} layout="vertical" requiredMark={false} onFinish={confirmCorrection}>
            {invoice.kind === 'Monthly' ? <>
              <Row gutter={12}><Col xs={24} sm={12}><Form.Item label={t("Tiền thuê phòng")} name="rent" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Tiền điện")} name="electricityAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Tiền nước")} name="waterAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Phí dịch vụ")} name="serviceAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col></Row>
              {invoice.canCorrectMeter ? <Form.Item label={t("Chỉ số điện mới")} name="currentReading" rules={[{ required: true, type: 'number', min: invoice.previousReading }]}><InputNumber min={invoice.previousReading} precision={3} step={0.001} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item> : <Alert className="meter-correction-policy" type="info" showIcon message={t("Chỉ số chỉ sửa được ở hóa đơn làm mốc mới nhất.")} description={invoice.meterCorrectionBlockedReason || t("Máy chủ chỉ cho điều chỉnh chỉ số ở hóa đơn mới nhất của phòng. Các khoản tiền vẫn có thể điều chỉnh độc lập.")} />}
              <Form.Item label={t("Nội dung hóa đơn")} name="description"><Input maxLength={500} /></Form.Item>
            </> : invoice.kind === 'Deposit' ? <>
              <Form.Item label={t("Số tiền hóa đơn")} name="amount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
              <Form.Item label={t("Nội dung hóa đơn")} name="description"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
            </> : invoice.isFinalMeterReading ? <>
              {hasMonthlyOverlap ? <Alert type="info" showIcon message={t("Kỳ này đã có hóa đơn tháng")} description={t("Tiền thuê và nước được giữ trong hóa đơn tháng. Chỉ sửa điện cuối kỳ và khoản phát sinh bên dưới.")} /> : <Row gutter={12}><Col xs={24} sm={12}><Form.Item label={t("Tiền thuê cuối kỳ")} name="rent" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Tiền nước cuối kỳ")} name="waterAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col></Row>}
              <Row gutter={12}><Col xs={24} sm={12}><Form.Item label={t("Tiền điện cuối kỳ")} name="electricityAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col><Col xs={24} sm={12}><Form.Item label={t("Phí phát sinh cuối kỳ")} name="serviceAmount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item></Col></Row>
              {invoice.canCorrectMeter ? <Form.Item label={t("Chỉ số điện mới")} name="currentReading" rules={[{ required: true, type: 'number', min: invoice.previousReading }]}><InputNumber min={invoice.previousReading} precision={3} step={0.001} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item> : <Alert className="meter-correction-policy" type="info" showIcon message={t("Chỉ số chỉ sửa được ở hóa đơn làm mốc mới nhất.")} description={invoice.meterCorrectionBlockedReason || t("Máy chủ chỉ cho điều chỉnh chỉ số ở hóa đơn mới nhất của phòng. Các khoản tiền vẫn có thể điều chỉnh độc lập.")} />}
              <Form.Item label={t("Nội dung hóa đơn")} name="description"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
            </> : <>
              <Form.Item label={t("Số tiền hóa đơn")} name="amount" rules={[{ required: true, type: 'number', min: 0 }]}><MoneyInput min={0} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
              <Form.Item label={t("Nội dung hóa đơn")} name="description"><Input.TextArea maxLength={500} rows={2} /></Form.Item>
            </>}
            <Form.Item label={t("Hạn thanh toán")} name="dueDate"><DatePicker format={dateFormat()} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label={t("Lý do điều chỉnh")} name="reason" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập lý do điều chỉnh.") }]}><Input.TextArea rows={2} maxLength={500} placeholder={t("Ghi rõ vì sao cần điều chỉnh hóa đơn")}/></Form.Item>
                  <Button type="primary" block htmlType="submit" loading={correctionMutation.isPending}>{t("Lưu điều chỉnh")}</Button>
                </Form>}
              </>,
            }]}
          />
          <div className="invoice-correction-history"><Typography.Title level={5}>{t("Lịch sử điều chỉnh")}</Typography.Title>{correctionQuery.isError ? <LoadError error={correctionQuery.error} onRetry={() => void correctionQuery.refetch()} /> : correctionQuery.isPending ? <div className="loading-placeholder" /> : (correctionQuery.data ?? []).length === 0 ? <Typography.Text type="secondary">{t("Chưa có lần điều chỉnh nào.")}</Typography.Text> : (correctionQuery.data as InvoiceCorrection[]).map((entry) => <CorrectionHistoryItem key={entry.id} entry={entry} kind={invoice.kind} />)}</div>
        </section>}
        {invoice.kind === 'Deposit' && <DepositLedger invoice={invoice} />}
      </>}
    </Drawer>
  </>;
}

function correctionSnapshot(entry: InvoiceCorrection, side: 'before' | 'after') {
  const parsed = side === 'before' ? entry.before : entry.after;
  const raw = side === 'before' ? entry.beforeJson : entry.afterJson;
  if (parsed && typeof parsed === 'object') return parsed;
  if (raw) { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
  return {};
}

function CorrectionHistoryItem({ entry, kind }: { entry: InvoiceCorrection; kind: Invoice['kind'] }) {
  const before = correctionSnapshot(entry, 'before');
  const after = correctionSnapshot(entry, 'after');
  const fields: Array<[string, string]> = kind === 'Monthly' ? [
    [t("Tiền thuê phòng"), 'rent'], [t("Tiền điện"), 'electricityAmount'], [t("Tiền nước"), 'waterAmount'], [t("Phí dịch vụ"), 'serviceAmount'], [t("Chỉ số điện"), 'currentReading'], [t("Hạn thanh toán"), 'dueDate'], [t("Nội dung hóa đơn"), 'description'], [t("Tổng tiền"), 'total'],
  ] : kind === 'Deposit' ? [[t("Số tiền hóa đơn"), 'total'], [t("Hạn thanh toán"), 'dueDate'], [t("Nội dung hóa đơn"), 'description']] : [
    [t("Tiền thuê phòng"), 'rent'], [t("Tiền điện"), 'electricityAmount'], [t("Tiền nước"), 'waterAmount'], [t("Phí dịch vụ"), 'serviceAmount'], [t("Chỉ số điện"), 'currentReading'], [t("Hạn thanh toán"), 'dueDate'], [t("Nội dung hóa đơn"), 'description'], [t("Tổng tiền"), 'total'],
  ];
  const createdAt = entry.createdAt || entry.recordedAt;
  const value = (key: string, raw: unknown) => {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (key === 'description') return String(raw);
    if (key === 'dueDate') return formatDate(String(raw));
    if (key === 'currentReading') return `${raw} kWh`;
    if (typeof raw === 'number') return formatVnd(raw);
    return String(raw);
  };
  return <article className="correction-history-item">
    <div className="correction-history-meta"><strong>{entry.actorName || entry.actorEmail || t("Chủ trọ")}</strong><time dateTime={createdAt}>{createdAt && dayjs(createdAt).format(`${dateFormat()} HH:mm`)}</time></div>
    <p>{entry.reason}</p>
    <div className="correction-history-values">{fields.map(([label, key]) => <div key={key}><span>{label}</span><span>{value(key, before[key])} → {value(key, after[key])}</span></div>)}</div>
  </article>;
}

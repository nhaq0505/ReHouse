import { dateFormat, t } from '../i18n/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Col, DatePicker, Drawer, Form, Input, InputNumber, Row, Select, Space, Tag, Typography } from 'antd';
import type { TableProps } from 'antd';
import { ArrowRightOutlined, CheckCircleFilled, CreditCardOutlined, FileTextOutlined, PlusOutlined, WalletOutlined } from '@ant-design/icons';
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

export default function InvoicesPage() {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kindFilter, setKindFilter] = useState<'Monthly' | 'Deposit' | 'Supplemental'>('Monthly');
  const [period, setPeriod] = useState(currentPeriod());
  const selectedId = searchParams.get('invoice');
  const [receiptForm] = Form.useForm<{ amount: number; note?: string }>();
  const receiptKeys = useRef(new Map<string, string>());
  const listQuery = useQuery({ queryKey: ['invoices', kindFilter, period], queryFn: () => api.invoices.list(kindFilter !== 'Monthly' ? undefined : period) });
  const detailQuery = useQuery({ queryKey: ['invoice', selectedId], queryFn: () => api.invoices.get(selectedId!), enabled: !!selectedId });
  const invoices = (listQuery.data ?? []).filter(x => x.kind === kindFilter);
  useEffect(() => { if (detailQuery.data?.kind) setKindFilter(detailQuery.data.kind); }, [detailQuery.data?.kind]);
  const totals = useMemo(() => invoices.reduce((acc, invoice) => ({ billed: acc.billed + invoice.total, paid: acc.paid + invoice.paid, outstanding: acc.outstanding + invoice.outstanding }), { billed: 0, paid: 0, outstanding: 0 }), [invoices]);
  const generateMutation = useMutation({
    mutationFn: () => api.invoices.generate(period),
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
    { title: t("PHÒNG / NGƯỜI THUÊ"), key: 'room', render: (_, item) => <div className="room-name-cell"><div className="room-avatar room-avatar-invoice"><FileTextOutlined /></div><div><strong>{item.roomName}{item.kind === 'Deposit' ? t(" · Tiền cọc") : item.kind === 'Supplemental' ? t(" · Bổ sung") : ''}</strong><span>{item.tenantName || t("Người thuê")} · {item.buildingName || t("Dãy trọ")}</span></div></div> },
    { title: t("KỲ HÓA ĐƠN"), dataIndex: 'period', render: (value: string) => periodLabel(value) },
    { title: t("TỔNG TIỀN"), dataIndex: 'total', render: (value: number) => <strong>{formatVnd(value)}</strong> },
    { title: t("ĐÃ THU"), dataIndex: 'paid', render: (value: number) => <span>{formatVnd(value)}</span> },
    { title: t("CÒN LẠI"), dataIndex: 'outstanding', render: (value: number) => <strong className={value > 0 ? 'balance-due' : 'balance-clear'}>{formatVnd(value)}</strong> },
    { title: t("TRẠNG THÁI"), dataIndex: 'status', render: (value: string) => <Tag className={`status-pill ${statusClass(value)}`}>{statusLabel(value)}</Tag> },
    { title: '', key: 'action', fixed: 'right', width: 140, align: 'right', render: (_, item) => <Button type="link" onClick={() => showInvoice(item.id)}>{t("Chi tiết")} <ArrowRightOutlined /></Button> },
  ];
  const setMonth = (value: Dayjs | null) => { if (value) setPeriod(value.format('YYYY-MM')); };

  return <>
    <PageTitle eyebrow={t("THU TIỀN RÕ RÀNG")} title={t("Hóa đơn")} subtitle={t("Theo dõi tiền thuê, điện, nước và các khoản đã thu theo từng phòng.")} extra={<Space wrap><Select aria-label={t("Loại khoản thu")} value={kindFilter} onChange={setKindFilter} options={[{ value: 'Monthly', label: t("Hóa đơn tháng") }, { value: 'Deposit', label: t("Tiền cọc các lượt thuê") }, { value: 'Supplemental', label: t("Hóa đơn bổ sung") }]} />{kindFilter === 'Monthly' && <DatePicker aria-label={t("Tháng hóa đơn")} picker="month" value={dayjs(`${period}-01`)} onChange={setMonth} format="MM/YYYY" maxDate={dayjs(`${currentPeriod()}-01`)} allowClear={false} />}{kindFilter === 'Monthly' && <Button type="primary" icon={<PlusOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>{t("Tạo hóa đơn còn thiếu")}</Button>}</Space>} />
    {listQuery.isError ? <LoadError error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : listQuery.isPending ? <div className="content-card"><div className="loading-placeholder" /></div> : <>
      <Row gutter={[14, 14]} className="invoice-totals-row"><Col xs={24} md={8}><div className="invoice-total-tile"><span>{kindFilter === 'Deposit' ? t("Tổng cọc yêu cầu") : kindFilter === 'Supplemental' ? t("Tổng hóa đơn bổ sung") : t("Tổng hóa đơn · {0}", [periodLabel(period)])}</span><strong>{formatVnd(totals.billed)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-paid"><span>{t("Đã thu")}</span><strong>{formatVnd(totals.paid)}</strong></div></Col><Col xs={24} md={8}><div className="invoice-total-tile invoice-total-due"><span>{t("Còn phải thu")}</span><strong>{formatVnd(totals.outstanding)}</strong></div></Col></Row>
      <SectionCard className="invoice-list-card" title={kindFilter === 'Deposit' ? t("Tiền cọc các lượt thuê") : kindFilter === 'Supplemental' ? t("Hóa đơn bổ sung") : t("Hóa đơn {0}", [periodLabel(period)])} extra={<span className="section-caption">{invoices.length}  {t("hóa đơn")}</span>}>
        {invoices.length ? <ResponsiveTable className="invoice-table" rowKey="id" columns={columns} dataSource={invoices} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }} scroll={{ x: 930 }} /> : <EmptyPanel title={kindFilter === 'Deposit' ? t("Chưa có khoản cọc") : kindFilter === 'Supplemental' ? t("Chưa có hóa đơn bổ sung") : t("Chưa có hóa đơn cho {0}", [periodLabel(period)])} description={kindFilter === 'Deposit' ? t("Nhập tiền cọc khi thêm người thuê để tạo khoản phải thu riêng.") : kindFilter === 'Supplemental' ? t("Tạo khoản thu phát sinh từ menu của phòng đang có người thuê.") : t("Chốt chỉ số điện để tạo hóa đơn, hoặc thử tạo lại các hóa đơn còn thiếu.")} action={kindFilter === 'Monthly' ? <Button type="primary" icon={<PlusOutlined />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>{t("Tạo hóa đơn")}</Button> : undefined} />}
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

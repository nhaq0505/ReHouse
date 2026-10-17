import { errorText } from '../i18n/errors';
import { getLocale, t } from '../i18n/runtime';
import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, QRCode, Result, Skeleton, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, CopyOutlined, ExclamationCircleFilled, LockOutlined } from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, formatVnd, periodLabel, type Invoice, type TenantCheckout } from '../api';
import { TenantBrand, TenantFooter } from './TenantPage';

type CheckoutStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
type CheckoutSession = TenantCheckout & { invoiceId: string; generation: number; status: CheckoutStatus; verificationPending: boolean };

function checkoutStatus(value: string): CheckoutStatus {
  const status = value.trim().toLowerCase();
  if (status === 'paid') return 'paid';
  if (status === 'expired') return 'expired';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'failed') return 'failed';
  return 'pending';
}
function invoiceIsPaid(invoice?: Invoice) {
  return !!invoice && (invoice.status.toLowerCase() === 'paid' || invoice.outstanding <= 0);
}
function httpStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error ? Number((error as { status?: number }).status) : 0;
}
function isAccessError(error: unknown) {
  return [401, 403, 404].includes(httpStatus(error));
}
function isHostedPayOsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'pay.payos.vn' && !url.username && !url.password && (!url.port || url.port === '443');
  } catch {
    return false;
  }
}
function checkoutExpiration(value: number) {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value * 1000));
}

export default function TenantCheckoutPage() {
  const { token = '', invoiceId = '' } = useParams();
  return <TenantCheckoutContent key={`${token}:${invoiceId}`} token={token} invoiceId={invoiceId} />;
}

function TenantCheckoutContent({ token, invoiceId }: { token: string; invoiceId: string }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [checkout, setCheckout] = useState<CheckoutSession | null>(null);
  const [createError, setCreateError] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [tenantAccessError, setTenantAccessError] = useState<{ status: number; message: string } | null>(null);
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [reconcileDelayMs, setReconcileDelayMs] = useState(20_000);
  const [overviewDelayMs, setOverviewDelayMs] = useState(5000);
  const [autoReconcilePaused, setAutoReconcilePaused] = useState(false);
  const [overviewPollingPaused, setOverviewPollingPaused] = useState(false);
  const checkoutRef = useRef<CheckoutSession | null>(null);
  const requestGeneration = useRef(0);
  const mounted = useRef(false);
  const autoCreateStarted = useRef(false);
  const reconcileFailures = useRef(0);
  const overviewFailures = useRef(0);

  function setActiveCheckout(next: CheckoutSession | null) {
    checkoutRef.current = next;
    setCheckout(next);
  }
  function closeForAccessError(error: Error) {
    const status = httpStatus(error);
    if (![401, 403, 404].includes(status)) return false;
    requestGeneration.current += 1;
    setActiveCheckout(null);
    setCheckoutError('');
    setCreateError('');
    setTenantAccessError({ status, message: error.message });
    return true;
  }

  const query = useQuery({
    queryKey: ['tenant', token, 'invoice', invoiceId],
    queryFn: () => api.tenant.overview(token, 1, invoiceId),
    enabled: !!token,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: checkout && tabVisible && checkout.status === 'pending' && !overviewPollingPaused ? overviewDelayMs : false,
    refetchIntervalInBackground: false,
  });
  const invoice = query.data?.invoices.find((item) => item.id === invoiceId);

  useEffect(() => {
    const onVisibilityChange = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      checkoutRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!checkout) return;
    if (invoiceIsPaid(invoice) && checkout.status !== 'paid') {
      setActiveCheckout({ ...checkout, status: 'paid', verificationPending: false });
    }
  }, [checkout, invoice]);
  useEffect(() => {
    if (!checkout || checkout.status !== 'pending' || checkout.expiresAt === null) return;
    const remaining = checkout.expiresAt * 1000 - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setClockNow(Date.now()), remaining);
    return () => window.clearTimeout(timer);
  }, [checkout?.generation, checkout?.expiresAt, checkout?.status]);
  useEffect(() => {
    if (!query.isError || !query.errorUpdatedAt) return;
    const status = httpStatus(query.error);
    if ([401, 403, 404].includes(status)) {
      requestGeneration.current += 1;
      setActiveCheckout(null);
      setCheckoutError('');
      setCreateError('');
      setTenantAccessError({ status, message: query.error.message });
      return;
    }
    if (!checkout) return;
    overviewFailures.current += 1;
    setOverviewDelayMs(status === 429 ? 60_000 : Math.min(60_000, 5000 * (2 ** Math.min(overviewFailures.current, 4))));
    if (overviewFailures.current >= 4) setOverviewPollingPaused(true);
  }, [query.error, query.errorUpdatedAt, query.isError, checkout?.generation]);
  useEffect(() => {
    if (!query.isSuccess) return;
    overviewFailures.current = 0;
    setOverviewDelayMs(5000);
    setOverviewPollingPaused(false);
  }, [query.dataUpdatedAt, query.isSuccess]);

  const paymentMutation = useMutation({
    mutationFn: (_variables: { generation: number }) => api.tenant.createPayment(token, invoiceId),
    onSuccess: async (result, variables) => {
      if (!mounted.current || requestGeneration.current !== variables.generation || !invoiceId) return;
      const generation = variables.generation;
      const status = checkoutStatus(result.status);
      const session: CheckoutSession = { ...result, invoiceId, generation, status: status === 'paid' ? 'pending' : status, verificationPending: status === 'paid' };
      reconcileFailures.current = 0;
      setReconcileDelayMs(20_000);
      setAutoReconcilePaused(false);
      setCreateError('');
      setCheckoutError('');
      setClockNow(Date.now());
      setActiveCheckout(session);
      await query.refetch();
    },
    onError: (error: Error, variables) => {
      if (!mounted.current || requestGeneration.current !== variables.generation) return;
      if (closeForAccessError(error)) return;
      setCreateError(error.message);
    },
  });
  const reconcileMutation = useMutation({
    mutationFn: (_variables: { generation: number }) => api.tenant.reconcile(token, invoiceId),
    onSuccess: async (result, variables) => {
      const current = checkoutRef.current;
      if (!mounted.current || !current || current.invoiceId !== invoiceId || current.generation !== variables.generation || requestGeneration.current !== variables.generation) return;
      const status = checkoutStatus(result.status);
      const paidByInvoice = result.invoice.id === invoiceId && invoiceIsPaid(result.invoice);
      const nextStatus: CheckoutStatus = paidByInvoice ? 'paid' : status === 'paid' ? 'pending' : status;
      setActiveCheckout({ ...current, status: nextStatus, verificationPending: !paidByInvoice && status === 'paid' });
      setCheckoutError('');
      reconcileFailures.current = 0;
      setReconcileDelayMs(20_000);
      setAutoReconcilePaused(false);
      await query.refetch();
    },
    onError: (error: Error, variables) => {
      const current = checkoutRef.current;
      if (!mounted.current || !current || current.invoiceId !== invoiceId || current.generation !== variables.generation || requestGeneration.current !== variables.generation) return;
      if (closeForAccessError(error)) return;
      reconcileFailures.current += 1;
      const status = httpStatus(error);
      setReconcileDelayMs(status === 429 ? 60_000 : Math.min(120_000, 20_000 * (2 ** Math.min(reconcileFailures.current, 3))));
      if (reconcileFailures.current >= 4) setAutoReconcilePaused(true);
      setCheckoutError(t("Không thể kiểm tra trạng thái lúc này. Bạn có thể thử lại sau ít phút."));
    },
  });

  function beginCreate() {
    if (paymentMutation.isPending) return;
    const generation = ++requestGeneration.current;
    setActiveCheckout(null);
    setCreateError('');
    setCheckoutError('');
    paymentMutation.mutate({ generation });
  }
  useEffect(() => {
    if (!query.isSuccess || !query.data || query.isFetching || tenantAccessError || isAccessError(query.error) || autoCreateStarted.current || !invoice) return;
    autoCreateStarted.current = true;
    if (!invoiceIsPaid(invoice) && invoice.outstanding > 0) beginCreate();
  }, [query.isSuccess, query.dataUpdatedAt, query.isFetching, invoice?.id, invoice?.outstanding, invoice?.status, tenantAccessError]);
  useEffect(() => {
    if (!checkout || checkout.status !== 'pending' || !tabVisible || autoReconcilePaused || reconcileMutation.isPending) return;
    const timer = window.setInterval(() => {
      const current = checkoutRef.current;
      if (!current || current.status !== 'pending' || current.generation !== requestGeneration.current || document.visibilityState !== 'visible' || reconcileMutation.isPending) return;
      reconcileMutation.mutate({ generation: current.generation });
    }, reconcileDelayMs);
    return () => window.clearInterval(timer);
  }, [checkout, tabVisible, reconcileDelayMs, autoReconcilePaused, reconcileMutation.isPending]);

  function checkNow() {
    if (!checkout || checkout.status !== 'pending' || reconcileMutation.isPending) return;
    setAutoReconcilePaused(false);
    setCheckoutError('');
    reconcileMutation.mutate({ generation: checkout.generation });
  }
  async function copyText(text: string, successMessage?: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      message.success(successMessage || t("Đã sao chép nội dung chuyển khoản."));
    } catch {
      message.info(t("Không sao chép được. Hãy chọn nội dung để sao chép."));
    }
  }

  const search = window.location.search || location.search;
  const tenantPath = location.pathname.startsWith('/tenant/') ? `/tenant/${encodeURIComponent(token)}` : `/t/${encodeURIComponent(token)}`;
  const pageAccessError = tenantAccessError ?? (query.isError && isAccessError(query.error) ? { status: httpStatus(query.error), message: query.error.message } : null);
  const checkoutExpiredByClock = !!checkout && checkout.status === 'pending' && checkout.expiresAt !== null && clockNow >= checkout.expiresAt * 1000;
  const hostedUrl = checkout && isHostedPayOsUrl(checkout.checkoutUrl) ? checkout.checkoutUrl : null;

  return <div className="tenant-page"><TenantBrand />
    <main className="tenant-main tenant-checkout-page">
      <Button className="tenant-checkout-back" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`${tenantPath}${search}`)}>{t("Hóa đơn của bạn")}</Button>
      <div className="tenant-checkout-heading"><div className="eyebrow">{t("THÔNG TIN PHÒNG")}</div><Typography.Title level={2}>{t("Thanh toán hóa đơn")}</Typography.Title><Typography.Text>{query.data?.room?.name ?? t("Phòng của bạn")}{query.data?.room?.buildingName ? ` · ${query.data.room.buildingName}` : ''}</Typography.Text></div>
      {query.isError && query.data && !isAccessError(query.error) && <Alert className="tenant-payment-error" type="warning" showIcon message={t("Đã có lỗi khi tải dữ liệu.")} description={errorText(query.error.message)} action={<Button size="small" onClick={() => void query.refetch()}>{t("Thử lại")}</Button>} />}
      {pageAccessError ? <div className="tenant-error"><Result status={pageAccessError.status === 404 ? '404' : 'error'} title={pageAccessError.status === 404 ? t("Không tìm thấy liên kết") : t("Không tải được hóa đơn")} subTitle={pageAccessError.status === 404 ? t("Liên kết này không hợp lệ hoặc đã bị thu hồi. Hãy liên hệ chủ trọ để được gửi liên kết mới.") : pageAccessError.message} /></div>
        : query.isPending || query.isFetching && !query.data ? <div className="tenant-loading"><Skeleton active paragraph={{ rows: 8 }} /></div>
          : query.isError && !query.data ? <div className="tenant-error"><Result status="error" title={t("Không tải được hóa đơn")} subTitle={errorText(query.error.message)} extra={<Button type="primary" onClick={() => void query.refetch()}>{t("Thử lại")}</Button>} /></div>
            : !invoice ? <div className="tenant-error"><Result status="404" title={t("Không tìm thấy hóa đơn")} subTitle={t("Hóa đơn này không thuộc liên kết riêng hiện tại hoặc đã không còn khả dụng.")} extra={<Button type="primary" onClick={() => navigate(`${tenantPath}${search}`)}>{t("Hóa đơn của bạn")}</Button>} /></div>
            : invoiceIsPaid(invoice) ? <Card className="tenant-checkout-panel" bordered={false}><Result status="success" title={t("Đã thanh toán")} subTitle={t("Khoản thanh toán đã được xác nhận và hóa đơn đã cập nhật.")} /><div className="tenant-checkout-amount"><span>{t("Số tiền đã thanh toán")}</span><strong>{formatVnd(invoice.paid || invoice.total)}</strong><small>{invoice.kind === 'Monthly' ? periodLabel(invoice.period) : invoice.kind === 'Deposit' ? t("Tiền cọc nhận phòng") : t("Hóa đơn bổ sung")} · {t("Hóa đơn")}</small></div></Card>
              : paymentMutation.isPending && !checkout ? <div className="tenant-loading"><Skeleton active paragraph={{ rows: 8 }} /></div>
                : checkout ? <TenantCheckoutCard checkout={checkout} invoice={invoice} error={checkoutError} checking={reconcileMutation.isPending} reconcileBusy={reconcileMutation.isPending} hostedUrl={hostedUrl} expiredByClock={checkoutExpiredByClock} onCheck={checkNow} onCopy={copyText} onRetry={beginCreate} retryBusy={paymentMutation.isPending} />
                  : createError ? <Card className="tenant-checkout-panel" bordered={false}><Alert type="error" showIcon message={t("Chưa thể bắt đầu thanh toán")} description={errorText(createError)} /><Button className="tenant-checkout-retry" type="primary" onClick={beginCreate} loading={paymentMutation.isPending}>{t("Thử lại")}</Button></Card>
                  : <div className="tenant-loading"><Skeleton active paragraph={{ rows: 8 }} /></div>}
      <div className="tenant-secure-note"><LockOutlined /><span>{t("Thông tin này chỉ dành cho người có liên kết riêng của phòng.")}</span></div>
    </main>
    <TenantFooter />
  </div>;
}

function TenantCheckoutCard({ checkout, invoice, error, checking, reconcileBusy, hostedUrl, expiredByClock, onCheck, onCopy, onRetry, retryBusy }: { checkout: CheckoutSession; invoice: Invoice; error: string; checking: boolean; reconcileBusy: boolean; hostedUrl: string | null; expiredByClock: boolean; onCheck: () => void; onCopy: (text: string, successMessage?: string) => void; onRetry: () => void; retryBusy: boolean }) {
  const status = checkout.status;
  const statusCopy = status === 'paid'
    ? { type: 'success' as const, icon: <CheckCircleFilled />, title: t("Thanh toán thành công"), description: t("Khoản thanh toán đã được xác nhận và hóa đơn đã cập nhật.") }
    : status === 'expired'
      ? { type: 'warning' as const, icon: <ClockCircleOutlined />, title: t("Giao dịch đã hết hạn"), description: t("payOS xác nhận giao dịch đã hết hạn. Hóa đơn vẫn hiển thị số dư hiện tại; bạn có thể thanh toán lại khi sẵn sàng.") }
      : status === 'cancelled'
        ? { type: 'info' as const, icon: <CloseCircleFilled />, title: t("Giao dịch đã bị hủy"), description: t("payOS xác nhận giao dịch đã bị hủy. Hóa đơn vẫn còn số dư.") }
        : status === 'failed'
          ? { type: 'error' as const, icon: <ExclamationCircleFilled />, title: t("Thanh toán chưa hoàn tất"), description: t("payOS chưa hoàn tất giao dịch. Vui lòng thử lại hoặc liên hệ chủ trọ.") }
          : { type: 'info' as const, icon: <ClockCircleOutlined />, title: t("Thanh toán đang chờ xác nhận"), description: t("Khoản thanh toán sẽ được cập nhật sau khi payOS xác nhận giao dịch. Làm mới hóa đơn để kiểm tra trạng thái mới nhất.") };
  const details = [
    checkout.accountName ? [t("Tên người nhận"), checkout.accountName] : null,
    checkout.accountNumber ? [t("Số tài khoản"), checkout.accountNumber] : null,
    checkout.bankBin ? [t("Mã ngân hàng (BIN)"), checkout.bankBin] : null,
  ].filter((entry): entry is [string, string] => !!entry);
  const hasQr = status === 'pending' && !expiredByClock && !checkout.verificationPending && !!checkout.qrCode;
  const invoicePaid = status === 'paid';
  return <Card className="tenant-checkout-panel" bordered={false}>
    <Alert className={`tenant-checkout-status tenant-checkout-status--${status}`} type={statusCopy.type} showIcon icon={statusCopy.icon} message={statusCopy.title} description={statusCopy.description} />
    <div className="tenant-checkout-amount"><span>{invoicePaid ? t("Số tiền đã thanh toán") : t("Số tiền cần chuyển")}</span><div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><strong>{formatVnd(checkout.amount)}</strong>{!invoicePaid && <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => onCopy(String(checkout.amount), t("Đã sao chép số tiền"))}>{t("Sao chép")}</Button>}</div><small>{invoice.kind === 'Monthly' ? periodLabel(invoice.period) : invoice.kind === 'Deposit' ? t("Tiền cọc nhận phòng") : t("Hóa đơn bổ sung")} · {t("Hóa đơn")}</small></div>
    {expiredByClock && <Alert className="tenant-checkout-no-qr" type="warning" showIcon message={t("Mã QR đã hết thời hạn hiển thị")} description={t("Mã QR đã hết thời hạn hiển thị. Hệ thống đang xác minh giao dịch với payOS; hãy đợi trạng thái mới trước khi chuyển khoản lại.")} action={<Button size="small" type="primary" onClick={onRetry} loading={retryBusy}>{t("Tạo lại mã QR")}</Button>} />}
    {status === 'pending' && checkout.verificationPending && !expiredByClock && <Alert className="tenant-checkout-no-qr" type="info" showIcon message={t("Đang xác minh thanh toán")} description={t("Khoản thanh toán sẽ được cập nhật sau khi payOS xác nhận giao dịch. Làm mới hóa đơn để kiểm tra trạng thái mới nhất.")} />}
    {hasQr && <div className="tenant-checkout-qr"><QRCode value={checkout.qrCode!} size={224} bordered={false} type="svg" /><Typography.Text>{t("Quét mã bằng ứng dụng ngân hàng để thanh toán đúng số tiền cho hóa đơn.")}</Typography.Text></div>}
    {status === 'pending' && !expiredByClock && !checkout.verificationPending && !checkout.qrCode && <Alert className="tenant-checkout-no-qr" type="warning" showIcon message={t("Mã QR chưa có sẵn cho giao dịch này.")} description={hostedUrl ? t("Bạn có thể mở trang thanh toán payOS an toàn bên dưới để tiếp tục.") : t("Chưa có trang thanh toán payOS an toàn cho giao dịch này. Hãy kiểm tra trạng thái hoặc liên hệ chủ trọ trước khi thanh toán.")} />}
    {details.length > 0 && <div className="tenant-checkout-details">{details.map(([label, value]) => <div key={label}><span>{label}</span><div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><strong>{value}</strong>{label === t("Số tài khoản") && <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => onCopy(value, t("Đã sao chép số tài khoản"))}>{t("Sao chép")}</Button>}</div></div>)}</div>}
    {checkout.description && <div className="tenant-checkout-transfer"><div className="tenant-checkout-transfer-label"><span>{t("Nội dung chuyển khoản")}</span><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => onCopy(checkout.description!, t("Đã sao chép nội dung chuyển khoản."))}>{t("Sao chép")}</Button></div><code>{checkout.description}</code></div>}
    {checkout.expiresAt && status === 'pending' && <div className="tenant-checkout-expiry"><ClockCircleOutlined /> <span>{t("Thời hạn thanh toán")}: {checkoutExpiration(checkout.expiresAt)}</span></div>}
    <div className="tenant-checkout-order"><span>{t("Mã đơn thanh toán")}</span><strong>{new Intl.NumberFormat(getLocale()).format(checkout.orderCode)}</strong></div>
    {error && <Alert className="tenant-checkout-error" type="warning" showIcon message={error} />}
    {hostedUrl && status === 'pending' && !expiredByClock && !checkout.verificationPending && <Button className="tenant-checkout-hosted" href={hostedUrl} target="_blank" rel="noopener noreferrer">{t("Mở trang payOS")}</Button>}
    {status === 'pending' && <div className="tenant-checkout-actions">{expiredByClock && <Button type="primary" onClick={onRetry} loading={retryBusy}>{t("Tạo lại mã QR")}</Button>}<Button type={expiredByClock ? 'default' : 'primary'} onClick={onCheck} loading={checking} disabled={reconcileBusy && !checking}>{checking ? t("Đang kiểm tra…") : t("Kiểm tra ngay")}</Button></div>}
    {['expired', 'cancelled', 'failed'].includes(status) && invoice.outstanding > 0 && <Button className="tenant-checkout-retry" type="primary" onClick={onRetry} loading={retryBusy}>{t("Thanh toán")}</Button>}
  </Card>;
}

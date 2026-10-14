import RoomieMark from '../components/RoomieMark';
import LanguageSelector from '../i18n/LanguageSelector';
import { t } from '../i18n/runtime';
import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Col, Modal, Progress, QRCode, Radio, Result, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  CheckCircleFilled, CopyOutlined, CrownOutlined, LogoutOutlined,
  ReloadOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatVnd, type SubscriptionPackage, type TenantCheckout } from '../api';
import { useAuth } from '../auth';
import AppShell from '../components/AppShell';
import { PageTitle, SectionCard } from '../components/Ui';

export default function AccountStatusPage() {
  const { user, ready, refresh, signOut } = useAuth();
  const navigate = useNavigate();

  if (!ready) return <div className="screen-center"><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  if (user.status === 'Approved') {
    if (user.role === 'Admin') return <Navigate to="/admin/owners" replace />;
    return <AppShell><ApprovedSubscriptionDashboard /></AppShell>;
  }

  const status = user.status ?? 'Pending';
  const config = status === 'Rejected'
    ? { icon: 'error' as const, title: t("Tài khoản chưa được duyệt"), subtitle: t("Thông tin đăng ký chưa thể được chấp nhận. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.") }
    : status === 'Suspended'
      ? { icon: 'warning' as const, title: t("Tài khoản đang tạm khóa"), subtitle: t("Quyền truy cập vào khu vực quản lý đã tạm dừng. Hãy liên hệ quản trị viên để được hỗ trợ.") }
      : { icon: 'info' as const, title: t("Đang chờ duyệt tài khoản"), subtitle: t("Tài khoản của bạn đã được tạo. Quản trị viên sẽ xem xét thông tin trước khi bạn bắt đầu quản lý nhà trọ.") };

  return <div className="status-page">
    <div className="public-language"><LanguageSelector /></div>
    <div className="status-brand"><div className="brand-mark"><RoomieMark /></div><strong>Roomie</strong></div>
    <div className="status-card">
      <Result
        status={config.icon}
        title={config.title}
        subTitle={<>{config.subtitle}<br /><span className="status-email">{user.email}</span></>}
        extra={<div className="status-actions">
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void refresh()}>{t("Kiểm tra trạng thái")}</Button>
          <Button onClick={() => navigate('/change-password')}>{t("Đổi mật khẩu")}</Button>
          <Button icon={<LogoutOutlined />} onClick={() => void signOut().then(() => navigate('/login'))}>{t("Đăng xuất")}</Button>
        </div>}
      />
    </div>
    <div className="status-foot">{t("Bạn cần trợ giúp? Hãy liên hệ quản trị viên hệ thống.")}</div>
  </div>;
}

function ApprovedSubscriptionDashboard() {
  const { message } = App.useApp();
  const { refresh: refreshUser } = useAuth();
  const client = useQueryClient();
  const [selectedPackageId, setSelectedPackageId] = useState<string>('pro_1m');
  const [checkout, setCheckout] = useState<TenantCheckout | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const subQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: api.subscription.getStatus,
  });

  const upgradeMutation = useMutation({
    mutationFn: (packageId: string) => api.subscription.upgrade(packageId),
    onSuccess: (data) => {
      setCheckout(data);
      setPaymentSuccess(false);
    },
    onError: (err: Error) => message.error(err.message),
  });

  const reconcileMutation = useMutation({
    mutationFn: (orderCode: number) => api.subscription.reconcile(orderCode),
    onSuccess: async (data) => {
      if (data.isPro) {
        setPaymentSuccess(true);
        message.success(t("Nâng cấp gói Pro thành công!"));
        await Promise.all([
          subQuery.refetch(),
          refreshUser(),
          client.invalidateQueries({ queryKey: ['rooms'] }),
        ]);
        if (pollingRef.current) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    },
  });

  // Setup auto-reconciliation polling when modal is open
  useEffect(() => {
    if (checkout && checkout.orderCode && !paymentSuccess) {
      pollingRef.current = window.setInterval(() => {
        reconcileMutation.mutate(checkout.orderCode);
      }, 5000);
    }
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [checkout?.orderCode, paymentSuccess]);

  const copyToClipboard = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(msg);
    } catch {
      message.info(text);
    }
  };

  const status = subQuery.data;
  const isPro = status?.isPro ?? false;
  const currentRooms = status?.currentRooms ?? 0;
  const maxRooms = status?.maxRooms ?? 5;
  const isLimitReached = !isPro && currentRooms >= maxRooms;

  return <>
    <PageTitle
      eyebrow={t("GÓI CƯỚC & TÀI KHOẢN")}
      title={t("Gói cước dịch vụ & Giới hạn phòng")}
      subtitle={t("Quản lý gói dịch vụ, hạn sử dụng và nâng cấp tài khoản của bạn.")}
    />

    {isLimitReached && (
      <Alert
        style={{ marginBottom: 20 }}
        type="warning"
        showIcon
        message={t("Đã đạt giới hạn phòng của gói Miễn phí")}
        description={t("Bạn đang quản lý {0}/{1} phòng trọ tối đa của gói Miễn phí. Hãy nâng cấp lên gói Pro để tạo phòng không giới hạn.", [currentRooms, maxRooms])}
      />
    )}

    <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
      <Col xs={24} md={12}>
        <SectionCard title={t("Thông tin gói hiện tại")}>
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text type="secondary">{t("Gói dịch vụ:")}</Typography.Text>
              {isPro ? (
                <Tag color="gold" icon={<CrownOutlined />} style={{ fontSize: 14, padding: '4px 10px' }}>
                  <strong>PRO</strong>
                </Tag>
              ) : (
                <Tag color="default" style={{ fontSize: 14, padding: '4px 10px' }}>
                  {t("Miễn phí")}
                </Tag>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography.Text type="secondary">{t("Thời hạn sử dụng:")}</Typography.Text>
              <Typography.Text strong>
                {isPro && status?.expiresAt
                  ? dayjs(status.expiresAt).format('HH:mm DD/MM/YYYY')
                  : t("Không giới hạn thời gian (Gói Miễn phí)")}
              </Typography.Text>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Typography.Text type="secondary">{t("Số phòng đang quản lý:")}</Typography.Text>
                <Typography.Text strong>
                  {isPro ? t("{0} phòng (Không giới hạn)", [currentRooms]) : t("{0} / {1} phòng", [currentRooms, maxRooms])}
                </Typography.Text>
              </div>
              {!isPro && (
                <Progress
                  percent={Math.min(100, Math.round((currentRooms / maxRooms) * 100))}
                  status={isLimitReached ? 'exception' : 'active'}
                  strokeColor={isLimitReached ? '#ff4d4f' : '#1890ff'}
                />
              )}
            </div>
          </Space>
        </SectionCard>
      </Col>

      <Col xs={24} md={12}>
        <SectionCard title={t("Quyền lợi gói Pro")}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleFilled style={{ color: '#52c41a' }} />
              <Typography.Text>{t("Quản lý không giới hạn số lượng dãy trọ và phòng trọ")}</Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleFilled style={{ color: '#52c41a' }} />
              <Typography.Text>{t("Tự động chốt số điện nước & phát hành hóa đơn tự động")}</Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircleFilled style={{ color: '#52c41a' }} />
              <Typography.Text>{t("Cổng thanh toán trực tuyến payOS & đối soát tự động")}</Typography.Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#1890ff' }} />
              <Typography.Text>{t("Hỗ trợ kỹ thuật ưu tiên 24/7 từ đội ngũ Roomie")}</Typography.Text>
            </div>
          </Space>
        </SectionCard>
      </Col>
    </Row>

    <SectionCard
      title={isPro ? t("Gia hạn gói Pro") : t("Nâng cấp lên tài khoản Pro")}
      extra={
        <Button
          type="primary"
          icon={<CrownOutlined />}
          size="large"
          loading={upgradeMutation.isPending}
          onClick={() => upgradeMutation.mutate(selectedPackageId)}
        >
          {isPro ? t("Gia hạn ngay") : t("Nâng cấp tài khoản")}
        </Button>
      }
    >
      <Radio.Group
        value={selectedPackageId}
        onChange={(e) => setSelectedPackageId(e.target.value)}
        style={{ width: '100%' }}
      >
        <Row gutter={[16, 16]}>
          {(status?.availablePackages ?? []).map((pkg: SubscriptionPackage) => {
            const isSelected = selectedPackageId === pkg.id;
            return (
              <Col xs={24} sm={8} key={pkg.id}>
                <Card
                  hoverable
                  onClick={() => setSelectedPackageId(pkg.id)}
                  style={{
                    borderColor: isSelected ? '#1890ff' : undefined,
                    boxShadow: isSelected ? '0 0 0 2px rgba(24, 144, 255, 0.2)' : undefined,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Radio value={pkg.id}>
                        <Typography.Text strong style={{ fontSize: 16 }}>{pkg.name}</Typography.Text>
                      </Radio>
                      {pkg.days >= 365 && <Tag color="red">{t("Tiết kiệm nhất")}</Tag>}
                      {pkg.days === 90 && <Tag color="blue">{t("Phổ biến")}</Tag>}
                    </div>
                    <div style={{ margin: '14px 0 10px' }}>
                      <Typography.Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                        {formatVnd(pkg.priceVnd)}
                      </Typography.Title>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {t("Sử dụng trong {0} ngày", [pkg.days])}
                      </Typography.Text>
                    </div>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 0 }}>
                      {pkg.description}
                    </Typography.Paragraph>
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Radio.Group>
    </SectionCard>

    {/* QR Payment Modal */}
    <Modal
      title={paymentSuccess ? t("Thanh toán thành công") : t("Quét mã QR thanh toán nâng cấp Pro")}
      open={!!checkout}
      onCancel={() => {
        setCheckout(null);
        setPaymentSuccess(false);
      }}
      footer={paymentSuccess ? (
        <Button type="primary" onClick={() => setCheckout(null)}>{t("Hoàn tất")}</Button>
      ) : (
        <Space>
          <Button onClick={() => setCheckout(null)}>{t("Đóng")}</Button>
          {checkout?.checkoutUrl && (
            <Button href={checkout.checkoutUrl} target="_blank" rel="noopener noreferrer">
              {t("Mở trang PayOS")}
            </Button>
          )}
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={reconcileMutation.isPending}
            onClick={() => checkout?.orderCode && reconcileMutation.mutate(checkout.orderCode)}
          >
            {t("Kiểm tra thanh toán")}
          </Button>
        </Space>
      )}
      destroyOnClose
      width={520}
    >
      {paymentSuccess ? (
        <Result
          status="success"
          title={t("Nâng cấp gói Pro thành công!")}
          subTitle={t("Tài khoản của bạn đã được nâng cấp lên gói Pro. Bạn có thể tạo không giới hạn phòng trọ.")}
        />
      ) : checkout ? (
        <div style={{ textAlign: 'center' }}>
          <Typography.Paragraph type="secondary">
            {t("Mở ứng dụng ngân hàng và quét mã VietQR bên dưới để thanh toán tự động.")}
          </Typography.Paragraph>

          <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', margin: '10px 0' }}>
            <QRCode value={checkout.qrCode || checkout.checkoutUrl} size={220} />
          </div>

          <Card size="small" style={{ textAlign: 'left', marginTop: 12, background: '#fafafa' }}>
            <Row gutter={[8, 8]}>
              <Col span={9}><Typography.Text type="secondary">{t("Số tiền:")}</Typography.Text></Col>
              <Col span={15}><Typography.Text strong style={{ color: '#1890ff', fontSize: 16 }}>{formatVnd(checkout.amount)}</Typography.Text></Col>

              {checkout.accountName && (
                <>
                  <Col span={9}><Typography.Text type="secondary">{t("Chủ tài khoản:")}</Typography.Text></Col>
                  <Col span={15}><Typography.Text strong>{checkout.accountName}</Typography.Text></Col>
                </>
              )}

              {checkout.accountNumber && (
                <>
                  <Col span={9}><Typography.Text type="secondary">{t("Số tài khoản:")}</Typography.Text></Col>
                  <Col span={15}>
                    <Space>
                      <Typography.Text code>{checkout.accountNumber}</Typography.Text>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(checkout.accountNumber!, t("Đã sao chép số tài khoản"))}
                      />
                    </Space>
                  </Col>
                </>
              )}

              {checkout.description && (
                <>
                  <Col span={9}><Typography.Text type="secondary">{t("Nội dung:")}</Typography.Text></Col>
                  <Col span={15}>
                    <Space>
                      <Typography.Text code>{checkout.description}</Typography.Text>
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => copyToClipboard(checkout.description!, t("Đã sao chép nội dung chuyển khoản"))}
                      />
                    </Space>
                  </Col>
                </>
              )}
            </Row>
          </Card>

          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 14 }}>
            {t("Hệ thống sẽ tự động kích hoạt gói Pro trong vòng 1-2 phút sau khi nhận được chuyển khoản.")}
          </Typography.Paragraph>
        </div>
      ) : null}
    </Modal>
  </>;
}

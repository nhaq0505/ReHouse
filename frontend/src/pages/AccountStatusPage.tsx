import LanguageSelector from '../i18n/LanguageSelector';
import { t } from '../i18n/runtime';
import { Button, Result, Spin } from 'antd';
import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function AccountStatusPage() {
  const { user, ready, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  if (!ready) return <div className="screen-center"><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'Approved') return <Navigate to={user.role === 'Admin' ? '/admin/owners' : '/dashboard'} replace />;
  const status = user.status ?? 'Pending';
  const config = status === 'Rejected'
    ? { icon: 'error' as const, title: t("Tài khoản chưa được duyệt"), subtitle: t("Thông tin đăng ký chưa thể được chấp nhận. Vui lòng liên hệ quản trị viên để biết thêm chi tiết.") }
    : status === 'Suspended'
      ? { icon: 'warning' as const, title: t("Tài khoản đang tạm khóa"), subtitle: t("Quyền truy cập vào khu vực quản lý đã tạm dừng. Hãy liên hệ quản trị viên để được hỗ trợ.") }
      : { icon: 'info' as const, title: t("Đang chờ duyệt tài khoản"), subtitle: t("Tài khoản của bạn đã được tạo. Quản trị viên sẽ xem xét thông tin trước khi bạn bắt đầu quản lý nhà trọ.") };
  return <div className="status-page"><div className="public-language"><LanguageSelector /></div><div className="status-brand"><div className="brand-mark"><span>⌂</span></div><strong>Rehouse</strong></div><div className="status-card"><Result status={config.icon} title={config.title} subTitle={<>{config.subtitle}<br /><span className="status-email">{user.email}</span></>} extra={<div className="status-actions"><Button type="primary" icon={<ReloadOutlined />} onClick={() => void refresh()}>{t("Kiểm tra trạng thái")}</Button><Button icon={<LogoutOutlined />} onClick={() => void signOut().then(() => navigate('/login'))}>{t("Đăng xuất")}</Button></div>} /></div><div className="status-foot">{t("Bạn cần trợ giúp? Hãy liên hệ quản trị viên hệ thống.")}</div></div>;
}

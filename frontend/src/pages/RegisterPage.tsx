import { errorText } from '../i18n/errors';
import LanguageSelector from '../i18n/LanguageSelector';
import { t } from '../i18n/runtime';
import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';

export default function RegisterPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const submit = async (values: { name: string; email: string; password: string; phone: string }) => {
    setBusy(true); setError('');
    let accountCreated = false;
    try {
      await api.auth.register(values);
      accountCreated = true;
      const user = await api.auth.login(values.email, values.password);
      setUser(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (accountCreated) {
        navigate('/login', { replace: true, state: { notice: t("Tài khoản đã được tạo. Hãy đăng nhập bằng email và mật khẩu vừa đăng ký.") } });
      } else {
        setError(err instanceof Error ? err.message : t("Không thể tạo tài khoản. Vui lòng thử lại."));
      }
    } finally { setBusy(false); }
  };

  return <main className="auth-page auth-page-register"><div className="public-language"><LanguageSelector /></div><div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" />
    <div className="auth-aside"><div className="auth-brand"><div className="brand-mark"><span>⌂</span></div><div><strong>Rehouse</strong><span>{t("QUẢN LÝ PHÒNG TRỌ")}</span></div></div><div className="auth-message"><div className="auth-kicker">{t("BẮT ĐẦU THẬT DỄ")}</div><Typography.Title>{t("Quản lý phòng trọ")}<br /><span>{t("theo cách của bạn.")}</span></Typography.Title><Typography.Paragraph>{t("Tạo tài khoản chủ trọ. Sau khi quản trị viên duyệt, bạn có thể thêm dãy trọ và bắt đầu theo dõi.")}</Typography.Paragraph><div className="onboarding-steps"><div><span>01</span><div><strong>{t("Tạo tài khoản")}</strong><small>{t("Điền thông tin liên hệ của bạn")}</small></div></div><div><span>02</span><div><strong>{t("Chờ duyệt tài khoản")}</strong><small>{t("Chúng tôi sẽ sớm xác nhận")}</small></div></div><div><span>03</span><div><strong>{t("Quản lý nhà trọ")}</strong><small>{t("Thêm phòng và bắt đầu sử dụng")}</small></div></div></div></div><div className="auth-aside-foot">{t("Đơn giản hóa việc quản lý mỗi ngày")} <span>•</span> 2026</div></div>
    <section className="auth-main"><div className="auth-form-wrap"><div className="auth-small-brand"><div className="brand-mark"><span>⌂</span></div><strong>Rehouse</strong></div><Link className="back-link" to="/login"><ArrowLeftOutlined />  {t("Quay lại đăng nhập")}</Link><div className="form-intro"><div className="eyebrow">{t("DÀNH CHO CHỦ TRỌ")}</div><Typography.Title level={2}>{t("Tạo tài khoản")}</Typography.Title><Typography.Paragraph>{t("Thông tin này giúp bạn quản lý tài khoản và nhận hỗ trợ khi cần.")}</Typography.Paragraph></div>
      {error && <Alert className="form-alert" type="error" showIcon message={errorText(error)} />}
      <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
        <Form.Item label={t("Tên của bạn")} name="name" rules={[{ required: true, whitespace: true, message: t("Vui lòng nhập tên.") }]}><Input prefix={<UserOutlined />} placeholder={t("Nguyễn Minh Anh")} autoComplete="name" /></Form.Item>
        <Form.Item label={t("Số điện thoại")} name="phone" rules={[{ required: true, message: t("Vui lòng nhập số điện thoại.") }]}><Input prefix={<PhoneOutlined />} placeholder="09xx xxx xxx" autoComplete="tel" /></Form.Item>
        <Form.Item label={t("Email")} name="email" rules={[{ required: true, message: t("Vui lòng nhập email.") }, { type: 'email', message: t("Email chưa đúng định dạng.") }]}><Input prefix={<MailOutlined />} placeholder="name@example.com" autoComplete="email" /></Form.Item>
        <Form.Item label={t("Mật khẩu")} name="password" rules={[{ required: true, min: 8, message: t("Mật khẩu cần có ít nhất 8 ký tự.") }]}><Input.Password prefix={<LockOutlined />} placeholder={t("Ít nhất 8 ký tự")} autoComplete="new-password" /></Form.Item>
        <Button className="auth-submit" type="primary" htmlType="submit" loading={busy} block>{t("Tạo tài khoản")} <ArrowRightOutlined /></Button>
      </Form>
      <div className="auth-switch">{t("Đã có tài khoản?")} <Link to="/login">{t("Đăng nhập")}</Link></div><div className="auth-legal">{t("Tài khoản chủ trọ cần được duyệt trước khi sử dụng.")}</div>
    </div></section>
  </main>;
}

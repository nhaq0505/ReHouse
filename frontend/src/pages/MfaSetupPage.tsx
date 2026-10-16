import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { t } from '../i18n/runtime';

export default function MfaSetupPage() {
  const {user, ready, setUser} = useAuth();
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ready) return null;
  if (!user && !codes.length) return <Navigate to="/login" replace />;
  if (user && user.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  const submit = async (values: {password?: string; code?: string}) => {
    setBusy(true); setError('');
    try {
      if (!secret) setSecret((await api.auth.mfaSetup(values.password!)).secret);
      else { const result = await api.auth.mfaConfirm(values.code!); setCodes(result.recoveryCodes); setSecret(''); setUser(null); }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <main className="center-page"><div className="content-card" style={{maxWidth: 540, margin: '32px auto', padding: 24}}>
    <Typography.Title level={2}>{t("Xác thực hai bước")}</Typography.Title>
    {error && <Alert type="error" message={error} />}
    {codes.length ? <><Typography.Paragraph>{t("Lưu mã khôi phục ở nơi an toàn. Mỗi mã chỉ dùng một lần.")}</Typography.Paragraph><pre>{codes.join('\n')}</pre><Button href="/login">{t("Đăng nhập")}</Button></> : <>
      <Typography.Paragraph>{t("Thêm khóa này vào ứng dụng xác thực, rồi nhập mã 6 số để xác nhận.")}</Typography.Paragraph>
      {secret && <Typography.Text copyable code>{secret}</Typography.Text>}
      <Form key={secret ? 'confirm' : 'setup'} layout="vertical" onFinish={submit}>
        {secret ? <Form.Item name="code" label={t("Mã xác nhận")} rules={[{required:true, pattern:/^\d{6}$/}]}><Input autoComplete="one-time-code" maxLength={6} /></Form.Item> : <Form.Item name="password" label={t("Mật khẩu hiện tại")} rules={[{required:true}]}><Input.Password autoComplete="current-password" /></Form.Item>}
        <Button loading={busy} type="primary" htmlType="submit">{t("Xác nhận")}</Button>
      </Form></>}
  </div></main>;
}

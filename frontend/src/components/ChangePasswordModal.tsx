import { App, Form, Input, Modal, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { t } from '../i18n/runtime';

type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };

export default function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<PasswordValues>();
  const { message } = App.useApp();
  const mutation = useMutation({
    mutationFn: api.auth.changePassword,
    onSuccess: () => {
      form.resetFields();
      message.success(t("Đã đổi mật khẩu. Các phiên đăng nhập khác đã được thu hồi."));
      onClose();
    },
    onError: (error: Error) => message.error(error.message),
  });
  const close = () => { if (!mutation.isPending) { form.resetFields(); onClose(); } };
  return <Modal title={t("Đổi mật khẩu")} open={open} onCancel={close} maskClosable={false}
    closable={!mutation.isPending} keyboard={!mutation.isPending} width={480}
    okText={t("Lưu mật khẩu")} cancelText={t("Hủy")} confirmLoading={mutation.isPending}
    cancelButtonProps={{ disabled: mutation.isPending }} onOk={() => form.submit()}>
    <Typography.Paragraph>{t("Phiên đăng nhập hiện tại được giữ lại. Các thiết bị khác sẽ phải đăng nhập lại.")}</Typography.Paragraph>
    <Form form={form} layout="vertical" onFinish={values => { if (!mutation.isPending) mutation.mutate(values); }} disabled={mutation.isPending}>
      <Form.Item name="currentPassword" label={t("Mật khẩu hiện tại")} rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" maxLength={256} />
      </Form.Item>
      <Form.Item name="newPassword" label={t("Mật khẩu mới")} extra={t("Từ 12 đến 256 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.")} rules={[{ required: true, min: 12, max: 256, message: t("Mật khẩu mới cần 12–256 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.") }]}>
        <Input.Password autoComplete="new-password" maxLength={256} />
      </Form.Item>
      <Form.Item name="confirmPassword" label={t("Xác nhận mật khẩu mới")} dependencies={['newPassword']}
        rules={[{ required: true }, ({ getFieldValue }) => ({ validator(_, value) {
          return value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error(t("Xác nhận mật khẩu không khớp.")));
        } })]}>
        <Input.Password autoComplete="new-password" maxLength={256} onPressEnter={() => form.submit()} />
      </Form.Item>
    </Form>
  </Modal>;
}

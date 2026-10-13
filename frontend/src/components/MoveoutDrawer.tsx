import { t } from '../i18n/runtime';
import { useRef, useState } from 'react';
import { Alert, App, Button, Divider, Drawer, Form, Input, InputNumber, Modal, Space, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatVnd, periodLabel, type Invoice, type Room } from '../api';
import { LoadError } from './Ui';

export default function MoveoutDrawer({ room, onClose }: { room: Room; onClose: () => void }) {
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['moveout', room.id], queryFn: async () => { const summary = await api.rooms.moveout(room.id); if (summary.occupancyId !== room.occupancy?.id) throw new Error(t("Lượt thuê đã thay đổi. Đóng màn quyết toán và mở lại từ danh sách phòng.")); return summary; } });
  const [finalForm] = Form.useForm();
  const [receiptForm] = Form.useForm();
  const [receiving, setReceiving] = useState<Invoice | null>(null);
  const keys = useRef(new Map<string, string>());
  const keyFor = (payload: unknown) => { const k = JSON.stringify(payload); if (!keys.current.has(k)) keys.current.set(k, crypto.randomUUID()); return keys.current.get(k)!; };
  const refresh = async (completed = false) => { await Promise.all((completed ? ['rooms', 'invoices', 'invoice', 'dashboard'] : ['moveout', 'rooms', 'invoices', 'invoice', 'dashboard']).map(key => client.invalidateQueries({ queryKey: [key] }))); };
  const action = useMutation({ mutationFn: async (run: () => Promise<unknown>) => run(), onSuccess: async () => { keys.current.clear(); await refresh(); message.success(t("Đã cập nhật quyết toán.")); }, onError: (e: Error) => message.error(e.message) });
  const finish = useMutation({ mutationFn: () => api.rooms.completeMoveout(room.id, { occupancyId: query.data!.occupancyId, finalInvoiceId: query.data!.invoices.find(x => x.isFinalMeterReading)!.id }), onSuccess: async () => { await refresh(true); message.success(t("Đã trả phòng và thu hồi link khách.")); onClose(); }, onError: (e: Error) => { message.error(e.message); void refresh(); } });
  const data = query.data;
  const deposit = data?.invoices.find(x => x.kind === 'Deposit');
  const held = deposit?.depositHeld ?? 0;
  const debts = data?.invoices.filter(x => x.kind !== 'Deposit' && x.outstanding > 0) ?? [];
  const totalDebt = debts.reduce((sum, x) => sum + x.outstanding, 0);
  const final = data?.invoices.find(x => x.isFinalMeterReading);
  const pending = data?.pendingInvoiceIds ?? [];
  const currentReading = Form.useWatch('currentReading', finalForm);
  const additional = Form.useWatch('additionalAmount', finalForm) ?? 0;
  const busy = action.isPending || finish.isPending;
  const confirm = (title: string, content: string, run: () => Promise<unknown>) => modal.confirm({ title, content, okText: t("Ghi nhận"), cancelText: t("Hủy"), onOk: () => action.mutateAsync(run) });
  return <Drawer title={t("Trả phòng & quyết toán · {0}", [room.name])} width={780} open onClose={() => { if (!busy) onClose(); }} closable={!busy} maskClosable={!busy}>
    {query.isError ? <LoadError error={query.error} onRetry={() => void query.refetch()} /> : !data ? <Typography.Paragraph>{t("Đang tải quyết toán…")}</Typography.Paragraph> : <>
      <Typography.Paragraph><strong>{data.tenantName}</strong> · {data.roomName}</Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Alert type="info" showIcon message={t("Công nợ: {0} · Cọc đang giữ: {1}", [formatVnd(totalDebt), formatVnd(held)])} description={final ? t("Sau khi dùng cọc: cần thu thêm {0}, hoặc hoàn lại {1}.", [formatVnd(Math.max(0, totalDebt - held)), formatVnd(Math.max(0, held - totalDebt))]) : t("Công nợ chưa gồm điện cuối kỳ và khoản phát sinh chưa chốt.")} />
        {pending.length > 0 && <Alert type="warning" showIcon message={t("Có giao dịch payOS đang chờ")} description={t("Đối soát các giao dịch trước khi khấu trừ, ghi nhận thu hoặc kết thúc lượt thuê.")} />}
      </Space>
      <Divider orientation="left">{t("1. Chốt điện & khoản cuối kỳ")}</Divider>
      {final ? <Alert type="success" message={t("Đã chốt: {0} → {1} kWh · {2}", [final.previousReading, final.currentReading, formatVnd(final.total)])} description={final.description} /> : <Form form={finalForm} name="moveoutFinal" layout="vertical" initialValues={{ additionalAmount: 0 }} onFinish={(values) => {
        const body = { occupancyId: data.occupancyId, currentReading: values.currentReading, additionalAmount: values.additionalAmount, description: values.description?.trim() };
        modal.confirm({ title: t("Chốt hóa đơn trả phòng?"), content: t("Phát hành khoản cuối kỳ trên link khách. Sau khi chốt, không nhập thêm hóa đơn điện tháng cho lượt thuê này."), okText: t("Chốt hóa đơn"), cancelText: t("Hủy"), onOk: () => action.mutateAsync(() => api.rooms.finalInvoice(room.id, { ...body, requestId: keyFor(body) })) });
      }}>
        <Typography.Paragraph type="secondary">{t("Chỉ số đã chốt:")} {data.meterBaseline}  {t("kWh · Giá điện hiện tại:")} {formatVnd(data.electricityRate)}{t("/kWh. Chỉ tính phần tăng thêm, không tự cộng tiền thuê tháng.")}</Typography.Paragraph>
        <Form.Item name="currentReading" label={t("Chỉ số công tơ khi trả phòng")} rules={[{ required: true, type: 'number', min: data.meterBaseline, max: 1000000000, message: t("Nhập chỉ số từ {0} trở lên.", [data.meterBaseline]) }]}><InputNumber precision={3} min={data.meterBaseline} max={1000000000} addonAfter="kWh" style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="additionalAmount" label={t("Tiền thuê / phí còn lại chưa lập hóa đơn")} extra={t("Chỉ nhập khoản chưa thu và chưa có trong hóa đơn khác; nhập 0 nếu không phát sinh.")} rules={[{ required: true, type: 'number', min: 0, max: 2147483647 }]}><InputNumber precision={0} min={0} max={2147483647} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="description" label={t("Nội dung khoản còn lại")} rules={[{ validator: (_, value) => additional > 0 && !value?.trim() ? Promise.reject(new Error(t("Nhập nội dung khoản còn lại."))) : Promise.resolve() }]}><Input.TextArea rows={2} maxLength={450} /></Form.Item>
        <Typography.Paragraph>{t("Dự tính cuối kỳ:")} <strong>{formatVnd(Math.round(Math.max(0, (currentReading ?? data.meterBaseline) - data.meterBaseline) * data.electricityRate) + additional)}</strong></Typography.Paragraph>
        <Button type="primary" htmlType="submit" loading={action.isPending} disabled={busy}>{t("Chốt điện & lập khoản cuối kỳ")}</Button>
      </Form>}
      <Divider orientation="left">{t("2. Thu nợ & khấu trừ cọc")}</Divider>
      {debts.length === 0 ? <Typography.Paragraph>{t("Không còn công nợ tiền phòng hoặc khoản bổ sung.")}</Typography.Paragraph> : debts.map(invoice => <div key={invoice.id} style={{ padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
        <Typography.Paragraph><strong>{invoice.kind === 'Monthly' ? periodLabel(invoice.period) : invoice.description || t("Hóa đơn bổ sung")}</strong><br />{t("Còn nợ")} {formatVnd(invoice.outstanding)}</Typography.Paragraph>
        <Space wrap>
          <Button disabled={busy || !final || !deposit || held <= 0 || pending.includes(invoice.id) || !!(deposit && pending.includes(deposit.id))} onClick={() => {
            const payload = { amount: Math.min(held, invoice.outstanding), kind: 'Deduction' as const, reason: t("Khấu trừ công nợ khi trả phòng"), targetInvoiceId: invoice.id };
            confirm(t("Khấu trừ cọc vào hóa đơn?"), t("Ghi nhận {0} từ cọc đang giữ vào công nợ này.", [formatVnd(payload.amount)]), () => api.invoices.settleDeposit(deposit!.id, { ...payload, idempotencyKey: keyFor(payload) }));
          }}>{t("Trừ cọc")} {formatVnd(Math.min(held, invoice.outstanding))}</Button>
          <Button disabled={busy || !final || pending.includes(invoice.id)} onClick={() => { receiptForm.resetFields(); receiptForm.setFieldsValue({ amount: invoice.outstanding, note: t("Thu công nợ khi trả phòng") }); setReceiving(invoice); }}>{t("Ghi nhận đã thu thêm")}</Button>
          <Button loading={action.isPending} disabled={busy} onClick={() => action.mutate(() => api.invoices.reconcile(invoice.id))}>{t("Đối soát payOS")}</Button>
        </Space>
      </div>)}
      <Divider orientation="left">{t("3. Hoàn cọc còn lại")}</Divider>
      <Typography.Paragraph>{t("Đang giữ")} {formatVnd(held)}{t(". Chỉ ghi nhận hoàn sau khi đã trả tiền cho khách bên ngoài hệ thống.")}</Typography.Paragraph>
      <Button disabled={busy || !final || totalDebt > 0 || held <= 0 || !deposit || pending.includes(deposit.id)} onClick={() => {
        const payload = { amount: held, kind: 'Refund' as const, reason: t("Đã hoàn cọc còn lại khi trả phòng") };
        confirm(t("Ghi nhận đã hoàn cọc?"), t("Xác nhận bạn đã trả {0} cho khách. Thao tác này không chuyển tiền ngân hàng.", [formatVnd(held)]), () => api.invoices.settleDeposit(deposit!.id, { ...payload, idempotencyKey: keyFor(payload) }));
      }}>{t("Ghi nhận đã hoàn")} {formatVnd(held)}</Button>
      {deposit && pending.includes(deposit.id) && <Button disabled={busy} onClick={() => action.mutate(() => api.invoices.reconcile(deposit.id))}>{t("Đối soát giao dịch cọc")}</Button>}
      <Divider orientation="left">{t("4. Kết thúc lượt thuê")}</Divider>
      <Typography.Paragraph type="secondary">{t("Sau khi công nợ và cọc đã quyết toán hết, link khách sẽ bị thu hồi và phòng trở về trạng thái trống. Lịch sử hóa đơn được giữ lại.")}</Typography.Paragraph>
      <Button danger disabled={busy || !final || totalDebt > 0 || held > 0 || pending.length > 0} loading={finish.isPending} onClick={() => modal.confirm({ title: t("Xác nhận trả phòng?"), content: t("Kết thúc lượt thuê và thu hồi link khách ngay sau khi xác nhận."), okText: t("Trả phòng"), cancelText: t("Hủy"), okButtonProps: { danger: true }, onOk: () => finish.mutateAsync() })}>{t("Hoàn tất trả phòng")}</Button>
      <Button style={{ marginLeft: 8 }} disabled={busy} onClick={() => void query.refetch()}>{t("Tải lại quyết toán")}</Button>
    </>}
    <Modal title={t("Ghi nhận tiền đã nhận")} open={!!receiving} onCancel={() => { if (!busy) setReceiving(null); }} onOk={() => receiptForm.submit()} confirmLoading={action.isPending} okText={t("Lưu khoản thu")} cancelText={t("Hủy")} maskClosable={false}>
      <Typography.Paragraph>{t("Tiền mặt hoặc chuyển khoản bạn đã nhận từ khách.")}</Typography.Paragraph>
      <Form form={receiptForm} name="moveoutReceipt" layout="vertical" onFinish={(values) => { if (!receiving) return; const invoiceId = receiving.id; const payload = { amount: values.amount, note: values.note?.trim() || t("Thu công nợ khi trả phòng") }; action.mutateAsync(() => api.invoices.addReceipt(invoiceId, { ...payload, idempotencyKey: keyFor({ invoiceId, ...payload }) })).then(() => setReceiving(null)).catch(() => {}); }}>
        <Form.Item name="amount" label={t("Số tiền đã nhận")} rules={[{ required: true, type: 'number', min: 1, max: receiving?.outstanding ?? 0 }]}><InputNumber min={1} max={receiving?.outstanding} precision={0} addonAfter={t("đ")} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="note" label={t("Ghi chú")}><Input maxLength={500} /></Form.Item>
      </Form>
    </Modal>
  </Drawer>;
}

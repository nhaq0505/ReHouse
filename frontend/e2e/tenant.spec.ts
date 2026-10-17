import { test, expect } from '@playwright/test';
import type { TenantOverview, TenantCheckout, Invoice, Room } from '../src/api';

test.describe('Tenant Workflows (Khách thuê)', () => {
  test.describe.configure({ mode: 'serial' });
  const token = 'fixture-token-abc';
  const invoiceId = 'inv-101';

  const roomFixture: Room = {
    id: 'room-101',
    buildingId: 'bld-01',
    buildingName: 'Nhà trọ Bình An',
    name: 'Phòng 101',
    rent: 3000000,
    electricityRate: 3500,
    waterFee: 100000,
    waterPerPerson: false,
    serviceFee: 50000,
    occupancy: {
      id: 'occ-01',
      tenantName: 'Nguyễn Văn A',
      phone: '0901234567',
      people: 2,
      startDate: '2026-10-01',
      depositRequired: 3000000,
      depositPaid: 3000000,
      depositHeld: 3000000,
      token,
      url: `/t/${token}`,
    },
    isArchived: false,
  };

  const invoiceFixture: Invoice = {
    id: invoiceId,
    roomId: 'room-101',
    roomName: 'Phòng 101',
    buildingName: 'Nhà trọ Bình An',
    period: '2026-10',
    kind: 'Monthly',
    lifecycleState: 'Issued',
    previousReading: 100,
    currentReading: 180,
    consumption: 80,
    rent: 3000000,
    electricityAmount: 280000,
    waterAmount: 100000,
    serviceAmount: 0,
    total: 3380000,
    paid: 0,
    outstanding: 3380000,
    status: 'Unpaid',
    depositHeld: 3000000,
    depositSettlements: [],
    isFinalMeterReading: false,
    occupancyId: 'occ-01',
  };

  // Scenario T1: Private Token Room & Invoice View
  test('Scenario T1: Private Token Room & Invoice View', async ({ page }) => {
    const overviewData: TenantOverview = {
      total: 1,
      totals: { outstanding: 3380000 },
      room: roomFixture,
      occupancy: roomFixture.occupancy!,
      invoices: [invoiceFixture],
    };

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes(`/api/tenant/${token}`)) {
        return route.fulfill({ json: overviewData });
      }
      return route.fulfill({ json: [] });
    });

    // 1. Direct navigation without auth cookies
    await page.goto(`/t/${token}`);

    // 2. Verify Room, Building, and Tenant info
    await expect(page.getByRole('heading', { level: 2, name: 'Phòng 101' })).toBeVisible();
    await expect(page.getByText('Nhà trọ Bình An · Nguyễn Văn A')).toBeVisible();

    // 3. Verify Outstanding balance banner
    await expect(page.getByText('Tổng còn phải thanh toán')).toBeVisible();
    const balanceDue = page.locator('.tenant-summary strong.balance-due');
    await expect(balanceDue).toContainText('3.380.000');

    // 4. Verify Invoice Card and status
    const invoiceCard = page.locator('.tenant-invoice-card').first();
    await expect(invoiceCard).toBeVisible();
    await expect(invoiceCard.locator('.status-unpaid')).toHaveText('Chưa thanh toán');
    await expect(invoiceCard.locator('.tenant-total')).toContainText('3.380.000');

    // 5. Expand invoice collapse and verify breakdown details
    await invoiceCard.locator('.tenant-detail-toggle').click();
    const breakdown = invoiceCard.locator('.tenant-breakdown');
    await expect(breakdown).toBeVisible();
    await expect(breakdown.getByText('Tiền thuê')).toBeVisible();
    await expect(breakdown.getByText('3.000.000')).toBeVisible();
    await expect(breakdown.getByText('Điện 80 kWh')).toBeVisible();
    await expect(breakdown.getByText('280.000')).toBeVisible();
    await expect(breakdown.getByText('Nước')).toBeVisible();
    await expect(breakdown.getByText('100.000')).toBeVisible();
  });

  // Scenario T2: Open payOS Payment Page & Safe Redirection
  test('Scenario T2: Open payOS Payment Page & Safe Redirection (Zero Internet Leakage)', async ({ page, context }) => {
    const overviewData: TenantOverview = {
      total: 1,
      totals: { outstanding: 3380000 },
      room: roomFixture,
      occupancy: roomFixture.occupancy!,
      invoices: [invoiceFixture],
    };

    const checkoutData: TenantCheckout = {
      checkoutUrl: 'https://pay.payos.vn/web/mock-session-123456',
      qrCode: 'vietqr://mock-payment-qr-code',
      amount: 3380000,
      orderCode: 998877,
      accountName: 'CHU TRO BINH AN',
      accountNumber: '9876543210',
      bankBin: '970422',
      description: 'PHONG101 10/2026',
      status: 'pending',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    };

    // Intercept external payOS requests to guarantee ZERO leakage
    await context.route('https://pay.payos.vn/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>payOS Mock Gateway</h1></body></html>',
      });
    });

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path.includes(`/api/tenant/${token}/invoices/${invoiceId}/payment`) && method === 'POST') {
        return route.fulfill({ json: checkoutData });
      }
      if (path.includes(`/api/tenant/${token}`)) {
        return route.fulfill({ json: overviewData });
      }
      return route.fulfill({ json: [] });
    });

    // 1. Start on tenant overview and click "Thanh toán"
    await page.goto(`/t/${token}`);
    const invoiceCard = page.locator('.tenant-invoice-card').first();
    await invoiceCard.getByRole('button', { name: 'Thanh toán' }).click();

    // 2. Navigated to checkout page
    await expect(page).toHaveURL(new RegExp(`/t/${token}/invoices/${invoiceId}/checkout`));
    await expect(page.getByRole('heading', { level: 2, name: 'Thanh toán hóa đơn' })).toBeVisible();

    // 3. Verify Checkout details
    const checkoutPanel = page.locator('.tenant-checkout-panel');
    await expect(checkoutPanel).toBeVisible();
    await expect(checkoutPanel.locator('.tenant-checkout-amount strong')).toContainText('3.380.000');
    await expect(checkoutPanel.getByText('CHU TRO BINH AN')).toBeVisible();
    await expect(checkoutPanel.getByText('9876543210')).toBeVisible();
    await expect(checkoutPanel.getByText('PHONG101 10/2026')).toBeVisible();

    // Verify 1-touch Quick Copy buttons
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // 3a. Quick copy amount
    await checkoutPanel.locator('.tenant-checkout-amount').getByRole('button', { name: 'Sao chép' }).click();
    await expect(page.getByText('Đã sao chép số tiền')).toBeVisible();

    // 3b. Quick copy account number
    await checkoutPanel.locator('.tenant-checkout-details').getByRole('button', { name: 'Sao chép' }).click();
    await expect(page.getByText('Đã sao chép số tài khoản')).toBeVisible();

    // 3c. Quick copy transfer description
    await checkoutPanel.locator('.tenant-checkout-transfer').getByRole('button', { name: 'Sao chép' }).click();
    await expect(page.getByText('Đã sao chép nội dung chuyển khoản.')).toBeVisible();

    // 4. Verify QR code rendered
    await expect(checkoutPanel.locator('.tenant-checkout-qr svg')).toBeVisible();

    // 5. Verify hosted payOS button and intercept popup safely
    const hostedBtn = checkoutPanel.locator('.tenant-checkout-hosted');
    await expect(hostedBtn).toBeVisible();
    await expect(hostedBtn).toHaveAttribute('href', checkoutData.checkoutUrl);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      hostedBtn.click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('pay.payos.vn');
    await expect(popup.getByRole('heading', { level: 1, name: 'payOS Mock Gateway' })).toBeVisible();
    await popup.close();
  });

  // Scenario T3: Payment Verification & Status View
  test('Scenario T3: Payment Verification & Status View', async ({ page }) => {
    let isReconciled = false;

    const checkoutData: TenantCheckout = {
      checkoutUrl: 'https://pay.payos.vn/web/mock-session-123456',
      qrCode: 'vietqr://mock-payment-qr-code',
      amount: 3380000,
      orderCode: 998877,
      accountName: 'CHU TRO BINH AN',
      accountNumber: '9876543210',
      bankBin: '970422',
      description: 'PHONG101 10/2026',
      status: 'pending',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    };

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path.includes(`/api/tenant/${token}/invoices/${invoiceId}/payment`) && method === 'POST') {
        return route.fulfill({ json: checkoutData });
      }
      if (path.includes(`/api/tenant/${token}/invoices/${invoiceId}/reconcile`) && method === 'POST') {
        isReconciled = true;
        return route.fulfill({
          json: {
            status: 'paid',
            invoice: {
              ...invoiceFixture,
              status: 'Paid',
              paid: 3380000,
              outstanding: 0,
            },
          },
        });
      }
      if (path.includes(`/api/tenant/${token}`)) {
        // While on checkout page (querying with invoiceId), keep invoice as Unpaid so checkout card displays verification state
        const isCheckoutOverview = url.searchParams.has('invoiceId');
        const showAsPaid = isReconciled && !isCheckoutOverview;
        return route.fulfill({
          json: {
            total: 1,
            totals: { outstanding: showAsPaid ? 0 : 3380000 },
            room: roomFixture,
            occupancy: roomFixture.occupancy!,
            invoices: [
              {
                ...invoiceFixture,
                status: showAsPaid ? 'Paid' : 'Unpaid',
                paid: showAsPaid ? 3380000 : 0,
                outstanding: showAsPaid ? 0 : 3380000,
              },
            ],
          },
        });
      }
      return route.fulfill({ json: [] });
    });

    // 1. Navigate to checkout page
    await page.goto(`/t/${token}/invoices/${invoiceId}/checkout`);
    const checkoutPanel = page.locator('.tenant-checkout-panel');
    await expect(checkoutPanel).toBeVisible();

    // 2. Click "Kiểm tra ngay"
    const checkBtn = page.getByRole('button', { name: 'Kiểm tra ngay' });
    await expect(checkBtn).toBeVisible();
    await checkBtn.click();

    // 3. Verify status alert changes to "Thanh toán thành công"
    const successAlert = page.locator('.tenant-checkout-status--paid');
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText('Thanh toán thành công');

    // 4. Verify amount displays "Số tiền đã thanh toán"
    await expect(checkoutPanel.getByText('Số tiền đã thanh toán')).toBeVisible();

    // 5. Verify QR code and hosted button are hidden
    await expect(checkoutPanel.locator('.tenant-checkout-qr')).toBeHidden();
    await expect(checkoutPanel.locator('.tenant-checkout-hosted')).toBeHidden();

    // 6. Navigate back to overview page
    await page.getByRole('button', { name: 'Hóa đơn của bạn' }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${token}`));

    // 7. Verify invoice card displays "Đã thanh toán"
    const invoiceCard = page.locator('.tenant-invoice-card').first();
    await expect(invoiceCard.locator('.status-paid')).toHaveText('Đã thanh toán');
    await expect(page.locator('.tenant-summary strong.balance-clear')).toContainText('0');
  });

  // Scenario T4: Invalid or Revoked Token Handling
  test('Scenario T4: Invalid or Revoked Token Handling (404 Result)', async ({ page }) => {
    const revokedToken = 'revoked-token-xyz';

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes(`/api/tenant/${revokedToken}`)) {
        return route.fulfill({
          status: 404,
          json: { message: 'Liên kết không tồn tại hoặc đã bị thu hồi.' },
        });
      }
      return route.fulfill({ json: [] });
    });

    // 1. Navigate to revoked token link
    await page.goto(`/t/${revokedToken}`);

    // 2. Verify 404 Result is displayed with exact copy
    const result = page.locator('.ant-result-404');
    await expect(result).toBeVisible();
    await expect(result.getByText('Không tìm thấy liên kết')).toBeVisible();
    await expect(result.getByText('Liên kết này không hợp lệ hoặc đã bị thu hồi. Hãy liên hệ chủ trọ để được gửi liên kết mới.')).toBeVisible();
  });

  // Scenario T5: Expired QR Code Refresh (Tạo lại mã QR)
  test('Scenario T5: Expired QR Code Refresh (Tạo lại mã QR)', async ({ page }) => {
    let callCount = 0;
    const initialCheckoutData: TenantCheckout = {
      checkoutUrl: 'https://pay.payos.vn/web/mock-session-123456',
      qrCode: 'vietqr://mock-payment-qr-code',
      amount: 3380000,
      orderCode: 998877,
      accountName: 'CHU TRO BINH AN',
      accountNumber: '9876543210',
      bankBin: '970422',
      description: 'PHONG101 10/2026',
      status: 'pending',
      expiresAt: Math.floor(Date.now() / 1000) - 30, // Expired by clock
    };

    const refreshedCheckoutData: TenantCheckout = {
      ...initialCheckoutData,
      qrCode: 'vietqr://refreshed-payment-qr-code',
      expiresAt: Math.floor(Date.now() / 1000) + 600, // Valid future expiry
    };

    const overviewData: TenantOverview = {
      total: 1,
      totals: { outstanding: 3380000 },
      room: roomFixture,
      occupancy: roomFixture.occupancy!,
      invoices: [invoiceFixture],
    };

    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (path.includes(`/api/tenant/${token}/invoices/${invoiceId}/payment`) && method === 'POST') {
        callCount++;
        return route.fulfill({ json: callCount > 1 ? refreshedCheckoutData : initialCheckoutData });
      }
      if (path.includes(`/api/tenant/${token}`)) {
        return route.fulfill({ json: overviewData });
      }
      return route.fulfill({ json: [] });
    });

    // 1. Navigate to checkout page with expired QR
    await page.goto(`/t/${token}/invoices/${invoiceId}/checkout`);

    // 2. Verify expired QR alert is displayed with retry button
    const expiredAlert = page.locator('.tenant-checkout-no-qr');
    await expect(expiredAlert).toBeVisible();
    await expect(page.getByText('Mã QR đã hết thời hạn hiển thị', { exact: true })).toBeVisible();

    const retryBtn = page.getByRole('button', { name: 'Tạo lại mã QR' }).first();
    await expect(retryBtn).toBeVisible();

    // 3. Click "Tạo lại mã QR"
    await retryBtn.click();

    // 4. Verify fresh QR code is rendered and warning alert is removed
    await expect(page.locator('.tenant-checkout-qr svg')).toBeVisible();
    await expect(page.getByText('Mã QR đã hết thời hạn hiển thị', { exact: true })).toHaveCount(0);
  });
});

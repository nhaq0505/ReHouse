import { errorText } from './i18n/errors';
import { getLocale, t } from './i18n/runtime';
export type Role = 'Admin' | 'Owner';
export type AccountStatus = 'Approved' | 'Pending' | 'Rejected' | 'Suspended';
export type SubscriptionTier = 'Free' | 'Pro';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status?: AccountStatus;
  phone?: string;
  rejectionReason?: string | null;
  subscriptionTier?: SubscriptionTier;
  subscriptionExpiresAt?: string | null;
  isPro?: boolean;
  roomCount?: number;
  maxRooms?: number | null;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  roomCount?: number;
  isArchived?: boolean;
  archivedAt?: string | null;
  archiveBatchId?: string | null;
}

export interface Occupancy {
  id: string;
  depositInvoiceId?: string;
  depositRequired: number;
  depositPaid: number;
  depositHeld: number;
  tenantName: string;
  phone?: string | null;
  people: number;
  startDate: string;
  token?: string | null;
  url?: string | null;
}

export interface Room {
  id: string;
  buildingId: string;
  buildingName?: string;
  name: string;
  rent: number;
  electricityRate: number;
  waterFee: number;
  waterPerPerson?: boolean;
  serviceFee: number;
  previousReading?: number;
  initialReading?: number;
  occupancy: Occupancy | null;
  isArchived?: boolean;
  archivedAt?: string | null;
  archiveBatchId?: string | null;
}

export interface DashboardSummary {
  totalRooms: number;
  occupiedRooms: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  pendingReadings: number;
  period: string;
  monthlyBilled: number;
  monthlyPaid: number;
  monthlyOutstanding: number;
  collectionRate: number;
}

export interface Reading {
  id?: string;
  roomId: string;
  occupancyId?: string;
  roomName: string;
  buildingName?: string;
  period: string;
  previousReading: number;
  currentReading?: number;
  consumption?: number;
  isSubmitted?: boolean;
  invoiceId?: string;
  issuanceStatus?: 'Draft' | 'Issued' | string;
}

export interface DepositSettlement {
  id: string; amount: number; kind: 'Refund' | 'Deduction'; reason: string; recordedAt: string; targetInvoiceId?: string;
}
export interface Invoice {
  kind: 'Monthly' | 'Deposit' | 'Supplemental';
  description?: string;
  isFinalMeterReading: boolean;
  occupancyId: string;
  depositHeld: number;
  depositSettlements: DepositSettlement[];
  id: string;
  roomId: string;
  roomName: string;
  buildingName?: string;
  period: string;
  tenantName?: string;
  previousReading: number;
  currentReading: number;
  consumption: number;
  rent: number;
  electricityAmount: number;
  waterAmount: number;
  serviceAmount: number;
  total: number;
  paid: number;
  outstanding: number;
  status: string;
  dueDate?: string;
  issuedAt?: string;
  lifecycleState?: 'Draft' | 'Issued' | string;
  version?: number;
  billableDays?: number;
  monthDays?: number;
  billingStartDate?: string;
  billingEndDate?: string;
  periodStart?: string;
  pendingPayOsCount?: number;
  hasPendingPayment?: boolean;
  canCorrectMeter?: boolean;
  meterCorrectionBlockedReason?: string | null;
  tenantToken?: string | null;
}

export interface ReadingSaveResult {
  reading?: Reading;
  invoice?: Invoice | null;
  draftInvoice?: Invoice | null;
  invoiceId?: string;
  lifecycleState?: 'Draft' | 'Issued' | string;
  [key: string]: unknown;
}

export interface InvoiceCorrection {
  id: string;
  reason: string;
  createdAt?: string;
  recordedAt?: string;
  actorName?: string;
  actorEmail?: string;
  before?: { rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; total?: number; amount?: number; [key: string]: unknown };
  after?: { rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; total?: number; amount?: number; [key: string]: unknown };
  beforeJson?: string;
  afterJson?: string;
  revision?: number;
}

export interface ReportPage<T, TTotals> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totals: TTotals;
}
export interface ReceiptReportRow {
  receiptId: string; receiptDate: string; amount: number; source: string; note: string; invoiceId: string;
  invoiceKind: string; period: string; occupancyId: string; roomId: string; roomName: string;
  buildingId: string; buildingName: string; tenantName: string;
}
export interface DebtReportRow {
  invoiceId: string; period: string; invoiceKind: string; issuedAt: string; dueDate: string; roomId: string;
  roomName: string; buildingId: string; buildingName: string; occupancyId: string; tenantName: string;
  total: number; paid: number; outstanding: number;
}
export interface DepositReportRow {
  invoiceId: string; period: string; roomId: string; roomName: string; buildingId: string;
  buildingName: string; occupancyId: string; tenantName: string; depositAmount: number;
  periodReceived: number; periodRefunded: number; periodDeducted: number; currentHeld: number;
}
export interface ReceiptsReportTotals { invoiceCash: number; depositCash: number; totalCash: number; }
export interface DebtReportTotals { currentOutstanding: number; overdueOutstanding: number; invoiceCount: number; overdueInvoiceCount: number; }
export interface DepositsReportTotals { periodReceived: number; periodRefunded: number; periodDeducted: number; currentHeld: number; }

export interface OwnerRequest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: AccountStatus;
  reason?: string | null;
  createdAt?: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionExpiresAt?: string | null;
  isPro?: boolean;
  roomCount?: number;
  maxRooms?: number | null;
}

export interface SubscriptionPackage {
  id: string;
  name: string;
  days: number;
  priceVnd: number;
  description: string;
  maxRooms: number;
}

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  expiresAt: string | null;
  isPro: boolean;
  currentRooms: number;
  maxRooms: number | null;
  availablePackages: SubscriptionPackage[];
}

export interface ReceiptResult {
  id: string;
  invoiceId: string;
  amount: number;
  paid: number;
  outstanding: number;
  status: 'Unpaid' | 'Partial' | 'Paid';
}

export interface PaymentSettings {
  webhookUrl: string | null;
  webhookStatus: 'NotConfigured' | 'Unverified' | 'Verified' | 'Failed';
  webhookVerifiedAt: string | null;
  webhookError: string | null;
  configured: boolean;
  clientId?: string;
}

export interface TenantOverview {
  room: Room;
  occupancy: Occupancy;
  invoices: Invoice[];
}

export interface PaymentReconcileResult {
  status: string;
  invoice: Invoice;
}

export interface TenantCheckout {
  checkoutUrl: string;
  qrCode: string | null;
  amount: number;
  orderCode: number;
  accountName: string | null;
  accountNumber: string | null;
  bankBin: string | null;
  description: string | null;
  status: string;
  expiresAt: number | null;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    Object.defineProperty(this, 'message', { configurable: true, get: () => errorText(message, status) });
  }
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value && (value as { data?: unknown }).data !== undefined) {
    return (value as { data: T }).data;
  }
  return value as T;
}

export function listFrom<T>(value: unknown): T[] {
  const result = unwrap<unknown>(value);
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object') {
    const object = result as { items?: unknown; results?: unknown; records?: unknown };
    if (Array.isArray(object.items)) return object.items as T[];
    if (Array.isArray(object.results)) return object.results as T[];
    if (Array.isArray(object.records)) return object.records as T[];
  }
  return [];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', getLocale());
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(t("Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại."), 0);
  }
  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : typeof payload === 'string' && payload
        ? payload
        : t("Yêu cầu chưa thành công ({0}).", [response.status]);
    throw new ApiError(message, response.status, payload);
  }
  return unwrap<T>(payload);
}

async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers({ Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  headers.set('Accept-Language', getLocale());
  let response: Response;
  try { response = await fetch(path, { headers, credentials: 'same-origin' }); }
  catch { throw new ApiError(t("Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại."), 0); }
  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = text;
    try { payload = text ? JSON.parse(text) : null; } catch { /* Keep plain-text API errors. */ }
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : typeof payload === 'string' && payload ? payload : t("Yêu cầu chưa thành công ({0}).", [response.status]);
    throw new ApiError(message, response.status, payload);
  }
  return response.blob();
}

const json = (body: unknown): string => JSON.stringify(body);
const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: json(body) }) });

export interface RegistrationVerification {
  verificationRequired: true;
  challengeToken: string;
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export const api = {
  auth: {
    login: (email: string, password: string) => request<User>('/api/auth/login', post({ email, password })),
    verifyRegistration: (challengeToken: string, code: string) => request<User>('/api/auth/verify-registration', post({ challengeToken, code })),
    resendRegistration: (challengeToken: string) => request<RegistrationVerification>('/api/auth/resend-registration', post({ challengeToken })),
    me: () => request<User>('/api/auth/me'),
    changePassword: (body: { currentPassword: string; newPassword: string; confirmPassword?: string }) => request<{ success: boolean }>('/api/auth/change-password', post(body)),
    resetPassword: (body: { email: string; token: string; newPassword: string; confirmPassword: string }) => request<{ success: boolean }>('/api/auth/reset-password', post(body)),
    logout: () => request<void>('/api/auth/logout', post()),
    register: (body: { name: string; email: string; password: string; phone: string }) => request<User | RegistrationVerification>('/api/auth/register', post(body)),
  },
  dashboard: () => request<DashboardSummary>('/api/dashboard'),
  buildings: {
    list: (includeArchived = false) => request<unknown>(`/api/buildings${includeArchived ? '?includeArchived=true' : ''}`).then(listFrom<Building>),
    create: (body: { name: string; address: string }) => request<Building>('/api/buildings', post(body)),
    archive: (id: string) => request<{ archived: boolean; archiveBatchId: string }>(`/api/buildings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    restore: (id: string) => request<{ restored: boolean; restoredRoomIds: string[] }>(`/api/buildings/${encodeURIComponent(id)}/restore`, post()),
  },
  rooms: {
    moveout: (id: string) => request<MoveoutSummary>(`/api/rooms/${encodeURIComponent(id)}/moveout`),
    completeMoveout: (id: string, body: { occupancyId: string; requestId: string; refundAmount: number; expectedHeld: number; expectedDepositVersion: number | null }) => request<{ success: boolean; refundAmount: number; refundedAmount: number; retainedAmount: number; endDate: string; completedAt: string }>(`/api/rooms/${encodeURIComponent(id)}/complete-moveout`, post(body)),
    list: (period?: string, includeArchived = false) => { const query = new URLSearchParams(); if (period) query.set('period', period); if (includeArchived) query.set('includeArchived', 'true'); return request<unknown>(`/api/rooms${query.size ? `?${query}` : ''}`).then(listFrom<Room>); },
    get: (id: string) => request<Room>(`/api/rooms/${encodeURIComponent(id)}`),
    create: (body: { buildingId: string; name: string; rent: number; electricityRate: number; waterFee: number; waterPerPerson: boolean; serviceFee: number; initialReading: number }) => request<Room>('/api/rooms', post(body)),
    update: (id: string, body: Partial<Room>) => request<Room>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(body) }),
    editOccupancy: (id: string, body: { occupancyId: string; tenantName: string; phone?: string; people: number }) => request<Room>(`/api/rooms/${encodeURIComponent(id)}/occupancy`, { method: 'PATCH', body: json(body) }),
    startOccupancy: (id: string, body: { tenantName: string; phone: string; people: number; startDate: string; depositAmount: number }) => request<Room>(`/api/rooms/${encodeURIComponent(id)}/occupancy`, post(body)),
    rotateLink: (id: string) => request<{ token: string; url: string }>(`/api/rooms/${encodeURIComponent(id)}/rotate-link`, post()),
    archive: (id: string) => request<{ archived: boolean; archiveBatchId: string }>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    restore: (id: string) => request<{ restored: boolean }>(`/api/rooms/${encodeURIComponent(id)}/restore`, post()),
  },
  readings: {
    list: (period: string) => request<unknown>(`/api/readings?period=${encodeURIComponent(period)}`).then(listFrom<Reading>),
    save: (body: { roomId: string; period: string; currentReading: number }) => request<ReadingSaveResult>('/api/readings', post(body)),
  },
  invoices: {
    createSupplemental: (roomId: string, body: { requestId: string; occupancyId: string; description: string; amount: number; dueDate: string }) => request<Invoice>(`/api/rooms/${encodeURIComponent(roomId)}/supplemental-invoices`, post(body)),
    settleDeposit: (id: string, body: { amount: number; kind: 'Refund' | 'Deduction'; reason: string; idempotencyKey: string; expectedVersion?: number; targetInvoiceId?: string; targetExpectedVersion?: number }) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/deposit-settlements`, post(body)),
    list: (period?: string) => request<unknown>(`/api/invoices${period ? `?period=${encodeURIComponent(period)}` : ''}`).then(listFrom<Invoice>),
    publishDraft: (id: string, body: { expectedVersion: number; requestId: string; rent: number; electricityAmount: number; waterAmount: number; serviceAmount: number }) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/publish`, post(body)),
    correct: (id: string, body: { expectedVersion: number; requestId: string; reason: string; amount?: number; rent?: number; electricityAmount?: number; waterAmount?: number; serviceAmount?: number; currentReading?: number; dueDate?: string; description?: string }) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/corrections`, post(body)),
    corrections: (id: string) => request<unknown>(`/api/invoices/${encodeURIComponent(id)}/corrections`).then(listFrom<InvoiceCorrection>),
    generate: (period: string) => request<unknown>('/api/invoices/generate', post({ period })),
    get: (id: string) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}`),
    reconcile: (id: string) => request<PaymentReconcileResult>(`/api/invoices/${encodeURIComponent(id)}/reconcile`, post()),
    addReceipt: (id: string, body: { amount: number; note: string; idempotencyKey: string; expectedVersion?: number }) => request<ReceiptResult>(`/api/invoices/${encodeURIComponent(id)}/receipts`, post(body)),
  },
  owners: {
    resetPassword: (id: string, currentPassword: string) => request<{ token: string; expiresAt: string }>(`/api/admin/owners/${encodeURIComponent(id)}/reset-password`, post({ currentPassword })),
    list: () => request<unknown>('/api/admin/owners').then(listFrom<OwnerRequest>),
    updateStatus: (id: string, body: { status: AccountStatus; reason?: string }) => request<OwnerRequest>(`/api/admin/owners/${encodeURIComponent(id)}/status`, post(body)),
    updateSubscription: (id: string, body: { tier: SubscriptionTier; days?: number; expiresAt?: string; reason?: string }) => request<OwnerRequest>(`/api/admin/owners/${encodeURIComponent(id)}/subscription`, post(body)),
  },
  subscription: {
    getStatus: () => request<SubscriptionStatus>('/api/subscription'),
    upgrade: (packageId?: string) => request<TenantCheckout>('/api/subscription/upgrade', post({ packageId })),
    reconcile: (orderCode: number | string) => request<SubscriptionStatus>(`/api/subscription/reconcile/${encodeURIComponent(orderCode)}`, post()),
  },
  paymentSettings: {
    get: () => request<PaymentSettings>('/api/settings/payment'),
    update: (body: { clientId: string; apiKey: string; checksumKey: string }) => request<PaymentSettings>('/api/settings/payment', { method: 'PUT', body: json(body) }),
    verifyWebhook: () => request<PaymentSettings>('/api/settings/payment/verify-webhook', post()),
  },
  tenant: {
    overview: (token: string) => request<TenantOverview>(`/api/tenant/${encodeURIComponent(token)}`),
    createPayment: (token: string, invoiceId: string) => request<TenantCheckout>(`/api/tenant/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/payment`, post()),
    reconcile: (token: string, invoiceId: string) => request<PaymentReconcileResult>(`/api/tenant/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/reconcile`, post()),
  },
  reports: {
    receipts: (filters: ReportFilters) => request<ReportPage<ReceiptReportRow, ReceiptsReportTotals>>(`/api/reports/receipts?${reportQuery(filters)}`),
    debt: (filters: ReportFilters) => request<ReportPage<DebtReportRow, DebtReportTotals>>(`/api/reports/debt?${reportQuery(filters)}`),
    deposits: (filters: ReportFilters) => request<ReportPage<DepositReportRow, DepositsReportTotals>>(`/api/reports/deposits?${reportQuery(filters)}`),
    export: (type: 'receipts' | 'debt' | 'deposits', filters: ReportFilters) => requestBlob(`/api/reports/${type}/export.xlsx?${reportQuery({ ...filters, page: undefined, pageSize: undefined })}`),
  },
};

export interface ReportFilters { dateFrom: string; dateTo: string; buildingId?: string; roomId?: string; page?: number; pageSize?: number; }
function reportQuery(filters: ReportFilters) {
  const query = new URLSearchParams();
  query.set('dateFrom', filters.dateFrom); query.set('dateTo', filters.dateTo);
  if (filters.buildingId) query.set('buildingId', filters.buildingId);
  if (filters.roomId) query.set('roomId', filters.roomId);
  if (filters.page !== undefined) query.set('page', String(filters.page));
  if (filters.pageSize !== undefined) query.set('pageSize', String(filters.pageSize));
  return query.toString();
}

export const formatVnd = (amount?: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount ?? 0);
export const currentPeriod = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  return `${year}-${month}`;
};
export const periodLabel = (period: string) => {
  const [year, month] = period.split('-');
  if (!month || !year || !/^\d{4}-\d{2}$/.test(period) || Number(month) < 1 || Number(month) > 12) return period;
  return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
};

export interface MoveoutDepositSummary { invoiceId: string; required: number; paid: number; settled: number; held: number; outstanding: number; version: number | null; }
export interface MoveoutSummary { occupancyId: string; tenantName: string; roomName: string; startDate: string; endDate: string; invoices: Invoice[]; pendingInvoiceIds: string[]; deposit: MoveoutDepositSummary | null; heldDeposit: number; canComplete: boolean; blockedReason?: string | null; }

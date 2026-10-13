import { errorText } from './i18n/errors';
import { getLocale, t } from './i18n/runtime';
export type Role = 'Admin' | 'Owner';
export type AccountStatus = 'Approved' | 'Pending' | 'Rejected' | 'Suspended';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status?: AccountStatus;
}

export interface Building {
  id: string;
  name: string;
  address: string | null;
  roomCount?: number;
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
  token?: string;
  url?: string;
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
}

export interface DashboardSummary {
  totalRooms: number;
  occupiedRooms: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  pendingReadings: number;
}

export interface Reading {
  id?: string;
  roomId: string;
  roomName: string;
  buildingName?: string;
  period: string;
  previousReading: number;
  currentReading?: number;
  consumption?: number;
  isSubmitted?: boolean;
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
}

export interface OwnerRequest {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: AccountStatus;
  reason?: string | null;
  createdAt?: string;
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

const json = (body: unknown): string => JSON.stringify(body);
const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body === undefined ? {} : { body: json(body) }) });

export const api = {
  auth: {
    login: (email: string, password: string) => request<User>('/api/auth/login', post({ email, password })),
    me: () => request<User>('/api/auth/me'),
    logout: () => request<void>('/api/auth/logout', post()),
    register: (body: { name: string; email: string; password: string; phone: string }) => request<User>('/api/auth/register', post(body)),
  },
  dashboard: () => request<DashboardSummary>('/api/dashboard'),
  buildings: {
    list: () => request<unknown>('/api/buildings').then(listFrom<Building>),
    create: (body: { name: string; address: string }) => request<Building>('/api/buildings', post(body)),
  },
  rooms: {
    moveout: (id: string) => request<MoveoutSummary>(`/api/rooms/${encodeURIComponent(id)}/moveout`),
    finalInvoice: (id: string, body: { requestId: string; occupancyId: string; currentReading: number; additionalAmount: number; description?: string }) => request<Invoice>(`/api/rooms/${encodeURIComponent(id)}/final-invoice`, post(body)),
    completeMoveout: (id: string, body: { occupancyId: string; finalInvoiceId: string }) => request<{ success: boolean }>(`/api/rooms/${encodeURIComponent(id)}/complete-moveout`, post(body)),
    list: (period?: string) => request<unknown>(`/api/rooms${period ? `?period=${encodeURIComponent(period)}` : ''}`).then(listFrom<Room>),
    get: (id: string) => request<Room>(`/api/rooms/${encodeURIComponent(id)}`),
    create: (body: { buildingId: string; name: string; rent: number; electricityRate: number; waterFee: number; waterPerPerson: boolean; serviceFee: number; initialReading: number }) => request<Room>('/api/rooms', post(body)),
    update: (id: string, body: Partial<Room>) => request<Room>(`/api/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(body) }),
    startOccupancy: (id: string, body: { tenantName: string; phone: string; people: number; startDate: string; depositAmount: number }) => request<Room>(`/api/rooms/${encodeURIComponent(id)}/occupancy`, post(body)),
    endOccupancy: (id: string) => request<{ success: boolean }>(`/api/rooms/${encodeURIComponent(id)}/end-occupancy`, post()),
    rotateLink: (id: string) => request<{ token: string; url: string }>(`/api/rooms/${encodeURIComponent(id)}/rotate-link`, post()),
  },
  readings: {
    list: (period: string) => request<unknown>(`/api/readings?period=${encodeURIComponent(period)}`).then(listFrom<Reading>),
    save: (body: { roomId: string; period: string; currentReading: number }) => request<Reading>('/api/readings', post(body)),
  },
  invoices: {
    createSupplemental: (roomId: string, body: { requestId: string; occupancyId: string; description: string; amount: number; dueDate: string }) => request<Invoice>(`/api/rooms/${encodeURIComponent(roomId)}/supplemental-invoices`, post(body)),
    settleDeposit: (id: string, body: { amount: number; kind: 'Refund' | 'Deduction'; reason: string; idempotencyKey: string; targetInvoiceId?: string }) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}/deposit-settlements`, post(body)),
    list: (period?: string) => request<unknown>(`/api/invoices${period ? `?period=${encodeURIComponent(period)}` : ''}`).then(listFrom<Invoice>),
    generate: (period: string) => request<unknown>('/api/invoices/generate', post({ period })),
    get: (id: string) => request<Invoice>(`/api/invoices/${encodeURIComponent(id)}`),
    reconcile: (id: string) => request<PaymentReconcileResult>(`/api/invoices/${encodeURIComponent(id)}/reconcile`, post()),
    addReceipt: (id: string, body: { amount: number; note: string; idempotencyKey: string }) => request<ReceiptResult>(`/api/invoices/${encodeURIComponent(id)}/receipts`, post(body)),
  },
  owners: {
    list: () => request<unknown>('/api/admin/owners').then(listFrom<OwnerRequest>),
    updateStatus: (id: string, body: { status: AccountStatus; reason?: string }) => request<OwnerRequest>(`/api/admin/owners/${encodeURIComponent(id)}/status`, post(body)),
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
};

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

export interface MoveoutSummary { occupancyId: string; tenantName: string; roomName: string; electricityRate: number; meterBaseline: number; invoices: Invoice[]; pendingInvoiceIds: string[]; }

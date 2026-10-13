import { useLanguage } from './i18n/LanguageSelector';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth';
import AppShell from './components/AppShell';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const AccountStatusPage = lazy(() => import('./pages/AccountStatusPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BuildingsPage = lazy(() => import('./pages/BuildingsPage'));
const RoomsPage = lazy(() => import('./pages/RoomsPage'));
const ReadingsPage = lazy(() => import('./pages/ReadingsPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const PaymentSettingsPage = lazy(() => import('./pages/PaymentSettingsPage'));
const AdminOwnersPage = lazy(() => import('./pages/AdminOwnersPage'));
const TenantPage = lazy(() => import('./pages/TenantPage'));
const TenantCheckoutPage = lazy(() => import('./pages/TenantCheckoutPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function Gate({ children, admin = false }: { children: React.ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="screen-center"><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status && user.status !== 'Approved') return <Navigate to="/account-status" replace />;
  if (admin && user.role !== 'Admin') return <Navigate to="/dashboard" replace />;
  if (!admin && user.role === 'Admin') return <Navigate to="/admin/owners" replace />;
  return children;
}

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="screen-center"><Spin size="large" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status && user.status !== 'Approved') return <Navigate to="/account-status" replace />;
  return <Navigate to={user.role === 'Admin' ? '/admin/owners' : '/dashboard'} replace />;
}

function AppFallback() {
  return <div className="screen-center"><Spin size="large" /></div>;
}

export default function App() {
  useLanguage();
  return <Suspense fallback={<AppFallback />}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/account-status" element={<AccountStatusPage />} />
    <Route path="/t/:token" element={<TenantPage />} />
    <Route path="/t/:token/invoices/:invoiceId/checkout" element={<TenantCheckoutPage />} />
    <Route path="/tenant/:token" element={<TenantPage />} />
    <Route path="/tenant/:token/invoices/:invoiceId/checkout" element={<TenantCheckoutPage />} />
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/dashboard" element={<Gate><AppShell><DashboardPage /></AppShell></Gate>} />
    <Route path="/buildings" element={<Gate><AppShell><BuildingsPage /></AppShell></Gate>} />
    <Route path="/rooms" element={<Gate><AppShell><RoomsPage /></AppShell></Gate>} />
    <Route path="/readings" element={<Gate><AppShell><ReadingsPage /></AppShell></Gate>} />
    <Route path="/invoices" element={<Gate><AppShell><InvoicesPage /></AppShell></Gate>} />
    <Route path="/settings/payment" element={<Gate><AppShell><PaymentSettingsPage /></AppShell></Gate>} />
    <Route path="/admin/owners" element={<Gate admin><AppShell><AdminOwnersPage /></AppShell></Gate>} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></Suspense>;
}

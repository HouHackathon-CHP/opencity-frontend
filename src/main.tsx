// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Shell } from './components/Shell';
import { AuthCallback } from './pages/AuthCallback';
import { rolesOf } from './lib/auth';
import { canManage, canOpenFeature, managementOf, type Feature } from './lib/permissions';
import './style.css';

const CatalogPage = React.lazy(() => import('./pages/CatalogPage').then((module) => ({ default: module.CatalogPage })));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const ReportsMapPage = React.lazy(() => import('./pages/ReportsMapPage').then((module) => ({ default: module.ReportsMapPage })));
const ReportsDashboardPage = React.lazy(() => import('./pages/ReportsDashboardPage').then((module) => ({ default: module.ReportsDashboardPage })));
const SurveysPage = React.lazy(() => import('./pages/SurveysPage').then((module) => ({ default: module.SurveysPage })));
const BulletinsPage = React.lazy(() => import('./pages/BulletinsPage').then((module) => ({ default: module.BulletinsPage })));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })));
const AppointmentsPage = React.lazy(() => import('./pages/AppointmentsPage').then((module) => ({ default: module.AppointmentsPage })));
const AdministrativeFeedbackPage = React.lazy(() => import('./pages/AdministrativeFeedbackPage').then((module) => ({ default: module.AdministrativeFeedbackPage })));
const BusinessFeedbackPage = React.lazy(() => import('./pages/BusinessFeedbackPage').then((module) => ({ default: module.BusinessFeedbackPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const HotlinesPage = React.lazy(() => import('./pages/HotlinesPage').then((module) => ({ default: module.HotlinesPage })));
const CommunicationsPage = React.lazy(() => import('./pages/CommunicationsPage').then((module) => ({ default: module.CommunicationsPage })));
const CommunityGroupsPage = React.lazy(() => import('./pages/CommunityGroupsPage').then((module) => ({ default: module.CommunityGroupsPage })));

const managementLinks: { feature: Feature; label: string; href: string }[] = [
  { feature: 'reports', label: 'Xử lý phản ánh', href: '/reports' },
  { feature: 'administrative_feedback', label: 'Phản ánh thủ tục hành chính', href: '/administrative-feedback' },
  { feature: 'business_feedback', label: 'Kiến nghị doanh nghiệp', href: '/business-feedback' },
  { feature: 'bulletins', label: 'Phát hành tin & cảnh báo', href: '/bulletins' },
  { feature: 'surveys', label: 'Điều hành khảo sát', href: '/surveys' },
  { feature: 'appointments', label: 'Tiếp công dân', href: '/appointments' },
  { feature: 'hotlines', label: 'Đường dây nóng', href: '/hotlines' },
  { feature: 'communications', label: 'Thông tin truyền thông', href: '/communications' },
  { feature: 'community_groups', label: 'Nhóm cộng đồng', href: '/community/groups' },
];

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (rolesOf(user).includes('admin')) return <Navigate to="/admin" replace />;
  const management = managementOf(user);
  if (management.length === 0) return <CatalogPage />;
  return (
    <section className="page-width">
      <div className="page-intro-banner">
        <div className="intro-text-col">
          <h1 className="intro-headline">Không gian vận hành OpenCity</h1>
          <p className="intro-paragraph">Chọn nghiệp vụ được cấp cho tài khoản của bạn.</p>
        </div>
      </div>
      <div className="form-grid-two">
        {managementLinks.filter((item) => management.includes(item.feature)).map((item) => (
          <Link className="btn-outline" key={item.feature} to={item.href}>{item.label}</Link>
        ))}
        {management.includes('reports') && <Link className="btn-outline" to="/reports/dashboard">Dashboard điều hành phản ánh</Link>}
      </div>
    </section>
  );
}

function FeatureRoute({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return canOpenFeature(user, feature) ? children : <Navigate to="/" replace />;
}

function ReportsManagementRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return canManage(user, 'reports') ? children : <Navigate to="/" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return rolesOf(user).includes('admin') ? children : <Navigate to="/" replace />;
}

// OIDC state is stored per origin. Use the one origin registered in Keycloak.
if (window.location.hostname === '127.0.0.1' && window.location.port === '3000') {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = 'localhost';
  window.location.replace(canonicalUrl.href);
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <React.Suspense fallback={<div className="page-width">Đang tải chức năng…</div>}>
            <Routes>
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route element={<Shell />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                <Route path="/hotlines" element={<FeatureRoute feature="hotlines"><HotlinesPage /></FeatureRoute>} />
                <Route path="/communications" element={<FeatureRoute feature="communications"><CommunicationsPage /></FeatureRoute>} />
                <Route path="/community/groups" element={<FeatureRoute feature="community_groups"><CommunityGroupsPage /></FeatureRoute>} />
                <Route path="/reports" element={<FeatureRoute feature="reports"><ReportsPage /></FeatureRoute>} />
                <Route path="/reports/map" element={<FeatureRoute feature="reports"><ReportsMapPage /></FeatureRoute>} />
                <Route path="/reports/dashboard" element={<ReportsManagementRoute><ReportsDashboardPage /></ReportsManagementRoute>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/surveys" element={<FeatureRoute feature="surveys"><SurveysPage /></FeatureRoute>} />
                <Route path="/appointments" element={<FeatureRoute feature="appointments"><AppointmentsPage /></FeatureRoute>} />
                <Route path="/administrative-feedback" element={<FeatureRoute feature="administrative_feedback"><AdministrativeFeedbackPage /></FeatureRoute>} />
                <Route path="/business-feedback" element={<FeatureRoute feature="business_feedback"><BusinessFeedbackPage /></FeatureRoute>} />
                <Route path="/bulletins" element={<FeatureRoute feature="bulletins"><BulletinsPage /></FeatureRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </React.Suspense>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

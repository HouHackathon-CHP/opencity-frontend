// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Shell } from './components/Shell';
import { AuthCallback } from './pages/AuthCallback';
import { canOpenFeature, managementOf, type Feature } from './lib/permissions';
import './style.css';

const CatalogPage = React.lazy(() => import('./pages/CatalogPage').then((module) => ({ default: module.CatalogPage })));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const SurveysPage = React.lazy(() => import('./pages/SurveysPage').then((module) => ({ default: module.SurveysPage })));
const BulletinsPage = React.lazy(() => import('./pages/BulletinsPage').then((module) => ({ default: module.BulletinsPage })));

const managementLinks: { feature: Feature; label: string; href: string }[] = [
  { feature: 'reports', label: 'Xử lý phản ánh', href: '/reports' },
  { feature: 'bulletins', label: 'Phát hành tin & cảnh báo', href: '/bulletins' },
  { feature: 'surveys', label: 'Điều hành khảo sát', href: '/surveys' },
];

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return null;
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
      </div>
    </section>
  );
}

function FeatureRoute({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return canOpenFeature(user, feature) ? children : <Navigate to="/" replace />;
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
                <Route path="/reports" element={<FeatureRoute feature="reports"><ReportsPage /></FeatureRoute>} />
                <Route path="/surveys" element={<FeatureRoute feature="surveys"><SurveysPage /></FeatureRoute>} />
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

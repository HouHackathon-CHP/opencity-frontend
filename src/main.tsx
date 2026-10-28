// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/AuthProvider';
import { Shell } from './components/Shell';
import { CatalogPage } from './pages/CatalogPage';
import { ReportsPage } from './pages/ReportsPage';
import { SurveysPage } from './pages/SurveysPage';
import { BulletinsPage } from './pages/BulletinsPage';
import { AuthCallback } from './pages/AuthCallback';
import './style.css';

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
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<Shell />}>
              <Route path="/" element={<CatalogPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/surveys" element={<SurveysPage />} />
              <Route path="/bulletins" element={<BulletinsPage />} />
              <Route path="*" element={<CatalogPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

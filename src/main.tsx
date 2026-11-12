// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BusFront,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe,
  Layers,
  MapPin,
  Megaphone,
  PhoneCall,
  Shield,
  Sparkles,
  UserCheck,
  Wind,
} from 'lucide-react';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Shell } from './components/Shell';
import { AuthCallback } from './pages/AuthCallback';
import { displayName, rolesOf } from './lib/auth';
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
const AirQualityPage = React.lazy(() => import('./pages/AirQualityPage').then((module) => ({ default: module.AirQualityPage })));
const BusinessFeedbackPage = React.lazy(() => import('./pages/BusinessFeedbackPage').then((module) => ({ default: module.BusinessFeedbackPage })));
const AdminPage = React.lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));
const HotlinesPage = React.lazy(() => import('./pages/HotlinesPage').then((module) => ({ default: module.HotlinesPage })));
const CommunicationsPage = React.lazy(() => import('./pages/CommunicationsPage').then((module) => ({ default: module.CommunicationsPage })));
const CommunityGroupsPage = React.lazy(() => import('./pages/CommunityGroupsPage').then((module) => ({ default: module.CommunityGroupsPage })));
const SocialFeedbackPage = React.lazy(() => import('./pages/SocialFeedbackPage').then((module) => ({ default: module.SocialFeedbackPage })));
const DigitalWardPage = React.lazy(() => import('./pages/DigitalWardPage').then((module) => ({ default: module.DigitalWardPage })));
const BusSearchPage = React.lazy(() => import('./pages/BusSearchPage').then((module) => ({ default: module.BusSearchPage })));

type FeatureCardMeta = {
  label: string;
  tag: string;
  desc: string;
  statusBadge: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor: string;
  accentBg: string;
  href: string;
};

const FEATURE_CARDS: Record<Feature, FeatureCardMeta> = {
  air_quality: {
    label: 'Quan trắc Chất lượng Không khí & VN-AQI',
    tag: 'Môi trường số & QCVN',
    desc: 'Bản đồ 3D giám sát cảm biến bụi mịn PM2.5, PM10, phát lệnh cảnh báo ô nhiễm khẩn cấp và bảo trì trạm đo.',
    statusBadge: 'Trực tuyến 24/7',
    icon: Wind,
    accentColor: '#10b981',
    accentBg: '#ecfdf5',
    href: '/air-quality',
  },
  reports: {
    label: 'Trung tâm Xử lý Phản ánh Đô thị',
    tag: 'Đô thị số & Hiện trường',
    desc: 'Tiếp nhận, xử lý, xác minh và phân luồng hiện trường phản ánh của người dân trên bản đồ đô thị.',
    statusBadge: 'Đang tiếp nhận',
    icon: MapPin,
    accentColor: '#2563eb',
    accentBg: '#eff6ff',
    href: '/reports',
  },
  bulletins: {
    label: 'Phát hành Bản tin & Cảnh báo',
    tag: 'Thông tin chính quyền',
    desc: 'Phát hành thông báo khẩn cấp, cảnh báo thời tiết môi trường và thông tin sự kiện tới toàn thể cư dân.',
    statusBadge: 'Sẵn sàng phát hành',
    icon: Megaphone,
    accentColor: '#ef4444',
    accentBg: '#fef2f2',
    href: '/bulletins',
  },
  surveys: {
    label: 'Điều hành Khảo sát Ý kiến',
    tag: 'Dân chủ & Lấy ý kiến',
    desc: 'Khởi tạo và tổng hợp kết quả thăm dò mức độ hài lòng của cộng đồng cư dân đô thị.',
    statusBadge: 'Đang mở khảo sát',
    icon: ClipboardList,
    accentColor: '#8b5cf6',
    accentBg: '#f5f3ff',
    href: '/surveys',
  },
  appointments: {
    label: 'Tiếp Công Dân & Lịch Hẹn',
    tag: 'Dịch vụ hành chính',
    desc: 'Quản lý lịch hẹn làm việc, giải quyết khiếu nại và điều phối cán bộ tiếp công dân định kỳ.',
    statusBadge: 'Sẵn sàng phục vụ',
    icon: CalendarDays,
    accentColor: '#0ea5e9',
    accentBg: '#f0f9ff',
    href: '/appointments',
  },
  administrative_feedback: {
    label: 'Phản ánh Thủ tục Hành chính',
    tag: 'Cải cách thủ tục',
    desc: 'Giám sát ý kiến đóng góp về thủ tục công chứng, hộ tịch, đất đai và dịch vụ công trực tuyến.',
    statusBadge: 'Đang tiếp nhận',
    icon: FileText,
    accentColor: '#f59e0b',
    accentBg: '#fffbeb',
    href: '/administrative-feedback',
  },
  business_feedback: {
    label: 'Kiến nghị Doanh nghiệp',
    tag: 'Đồng hành doanh nghiệp',
    desc: 'Tiếp nhận tháo gỡ khó khăn về mặt bằng, thuế, giấy phép kinh doanh và đầu tư phát triển.',
    statusBadge: 'Đang xử lý',
    icon: Layers,
    accentColor: '#6366f1',
    accentBg: '#eef2ff',
    href: '/business-feedback',
  },
  hotlines: {
    label: 'Đường dây nóng Khẩn cấp',
    tag: 'Phản ứng nhanh 24/7',
    desc: 'Điều hành tổng đài tiếp nhận thông tin cứu hộ, an ninh trật tự, cấp cứu và xử lý sự cố công ích.',
    statusBadge: 'Trực 24/7',
    icon: PhoneCall,
    accentColor: '#ec4899',
    accentBg: '#fdf2f8',
    href: '/hotlines',
  },
  communications: {
    label: 'Thông tin Truyền thông Đô thị',
    tag: 'Báo chí & Tuyên truyền',
    desc: 'Cổng thông tin báo chí, thông điệp truyền thông chính sách và định hướng phát triển đô thị số.',
    statusBadge: 'Công khai',
    icon: Globe,
    accentColor: '#14b8a6',
    accentBg: '#f0fdfa',
    href: '/communications',
  },
  community_groups: {
    label: 'Quản lý Nhóm Cộng đồng',
    tag: 'Tương tác dân cư',
    desc: 'Điều hành các tổ tự quản, câu lạc bộ khu phố và diễn đàn trao đổi đời sống dân sinh.',
    statusBadge: 'Hoạt động',
    icon: UserCheck,
    accentColor: '#10b981',
    accentBg: '#ecfdf5',
    href: '/community/groups',
  },
  social_feedback: {
    label: 'Góp ý & Phản biện Xã hội',
    tag: 'Xây dựng chính sách',
    desc: 'Tổng hợp phản biện dự thảo nghị quyết, quy hoạch đô thị và các đề án an sinh dân sinh.',
    statusBadge: 'Lấy ý kiến',
    icon: Activity,
    accentColor: '#3b82f6',
    accentBg: '#eff6ff',
    href: '/social-feedback',
  },
  digital_ward: {
    label: 'Không gian Xã/Phường Số',
    tag: 'Chính quyền cấp cơ sở',
    desc: 'Chỉ đạo điều hành số cấp phường xã, kết nối dữ liệu địa bàn và tổ chức bộ máy cơ sở.',
    statusBadge: 'Vận hành số',
    icon: Sparkles,
    accentColor: '#8b5cf6',
    accentBg: '#f5f3ff',
    href: '/digital-wards',
  },
  bus_search: {
    label: 'Điều hành Vận tải & Mạng lưới Xe buýt',
    tag: 'Giao thông thông minh',
    desc: 'Bản đồ số hóa lộ trình xe buýt, trạm dừng OpenStreetMap, thuật toán tìm đường thông minh và kiểm toán dữ liệu.',
    statusBadge: 'Vận hành số',
    icon: BusFront,
    accentColor: '#0284c7',
    accentBg: '#f0f9ff',
    href: '/bus-search',
  },
};

function HomePage() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (rolesOf(user).includes('admin')) return <Navigate to="/admin" replace />;
  const management = managementOf(user);
  if (management.length === 0) return <CatalogPage />;

  const userDisplayName = displayName(user);

  return (
    <section className="page-width ops-command-container">
      {/* Command Hero */}
      <div className="ops-command-hero">
        <div className="ops-hero-glow" aria-hidden="true" />
        <div className="ops-hero-content">
          <div className="ops-hero-left">
            <div className="ops-hero-eyebrow">
              <span className="aqi-live-beacon" />
              <span>TRUNG TÂM ĐIỀU HÀNH TÁC NGHIỆP ĐÔ THỊ SỐ</span>
            </div>
            <h1 className="ops-hero-title">
              Chào mừng cán bộ, {userDisplayName}
            </h1>
            <p className="ops-hero-desc">
              Tài khoản của bạn được phân quyền điều hành các phân hệ dịch vụ đô thị dưới đây. Chọn nghiệp vụ để bắt đầu phiên tác nghiệp.
            </p>
          </div>
          <div className="ops-hero-status-pill">
            <Shield size={16} style={{ color: '#60a5fa' }} />
            <span>Nền tảng DX-OS OpenCore · Trực tuyến 100%</span>
          </div>
        </div>
      </div>

      {/* Feature Bento Grid */}
      <div className="ops-features-grid">
        {management.map((featureKey) => {
          const meta = FEATURE_CARDS[featureKey];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <Link key={featureKey} to={meta.href} className="ops-feature-card">
              <div>
                <div className="ops-card-top">
                  <div
                    className="ops-card-icon-box"
                    style={{ backgroundColor: meta.accentBg, color: meta.accentColor }}
                  >
                    <Icon size={28} />
                  </div>
                  <span
                    className="ops-card-badge"
                    style={{ backgroundColor: meta.accentBg, color: meta.accentColor }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: meta.accentColor,
                        display: 'inline-block',
                      }}
                    />
                    <span>{meta.statusBadge}</span>
                  </span>
                </div>

                <div className="ops-card-body">
                  <span className="ops-card-tag">{meta.tag}</span>
                  <h3 className="ops-card-title">{meta.label}</h3>
                  <p className="ops-card-desc">{meta.desc}</p>
                </div>
              </div>

              <div className="ops-card-footer">
                <span className="ops-card-cta">
                  <span>Mở không gian làm việc</span>
                  <ArrowRight size={16} />
                </span>
                {featureKey === 'reports' && (
                  <Link
                    to="/reports/dashboard"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--color-text-secondary)',
                      textDecoration: 'underline',
                    }}
                  >
                    Dashboard phản ánh
                  </Link>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Platform Status Strip */}
      <div className="ops-system-strip">
        <div className="ops-system-item">
          <div className="ops-sys-icon">
            <Shield size={20} />
          </div>
          <div className="ops-sys-text">
            <strong>Bảo mật & Ủy quyền OIDC</strong>
            <span>Keycloak PKCE · Quản trị phân quyền RBAC</span>
          </div>
        </div>
        <div className="ops-system-item">
          <div className="ops-sys-icon">
            <Activity size={20} />
          </div>
          <div className="ops-sys-text">
            <strong>Hạ tầng DX-OS Gateway</strong>
            <span>API Gateway định tuyến Microservices thông suốt</span>
          </div>
        </div>
        <div className="ops-system-item">
          <div className="ops-sys-icon">
            <CheckCircle2 size={20} style={{ color: '#10b981' }} />
          </div>
          <div className="ops-sys-text">
            <strong>Trạng thái vận hành</strong>
            <span>Mọi phân hệ công ích đô thị hoạt động ổn định</span>
          </div>
        </div>
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
                <Route path="/social-feedback" element={<FeatureRoute feature="social_feedback"><SocialFeedbackPage /></FeatureRoute>} />
                <Route path="/digital-wards" element={<FeatureRoute feature="digital_ward"><DigitalWardPage /></FeatureRoute>} />
                <Route path="/reports" element={<FeatureRoute feature="reports"><ReportsPage /></FeatureRoute>} />
                <Route path="/reports/map" element={<FeatureRoute feature="reports"><ReportsMapPage /></FeatureRoute>} />
                <Route path="/reports/dashboard" element={<ReportsManagementRoute><ReportsDashboardPage /></ReportsManagementRoute>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/surveys" element={<FeatureRoute feature="surveys"><SurveysPage /></FeatureRoute>} />
                <Route path="/appointments" element={<FeatureRoute feature="appointments"><AppointmentsPage /></FeatureRoute>} />
                <Route path="/administrative-feedback" element={<FeatureRoute feature="administrative_feedback"><AdministrativeFeedbackPage /></FeatureRoute>} />
                <Route path="/business-feedback" element={<FeatureRoute feature="business_feedback"><BusinessFeedbackPage /></FeatureRoute>} />
                <Route path="/bulletins" element={<FeatureRoute feature="bulletins"><BulletinsPage /></FeatureRoute>} />
                <Route path="/air-quality" element={<FeatureRoute feature="air_quality"><AirQualityPage /></FeatureRoute>} />
                <Route path="/bus-search" element={<BusSearchPage />} />
                <Route path="/bus" element={<Navigate to="/bus-search" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </React.Suspense>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

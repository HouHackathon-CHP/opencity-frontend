// SPDX-License-Identifier: Apache-2.0
import { ArrowRight, ClipboardList, ExternalLink, Globe, LayoutGrid, LogIn, LogOut, MapPin, Newspaper, Shield, ShieldCheck, UserCheck } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { displayName } from '../lib/auth';
import { canOpenFeature, managementOf, type Feature } from '../lib/permissions';
import { Logo } from './Logo';

export function Shell() {
  const { user, loading, login, logout } = useAuth();
  const operator = managementOf(user).length > 0;
  const canSee = (feature: Feature) => !loading && canOpenFeature(user, feature);

  return (
    <div className="app-shell">
      {/* Live Announcement Bar */}
      <div className="announcement-bar">
        <div className="page-width announcement-inner">
          <div className="announcement-left">
            <span className="live-dot" aria-hidden="true" />
            <span className="announcement-tag">DX-OS OpenCore</span>
            <span className="announcement-text">
              Nền tảng dịch vụ đô thị mở · Minh bạch trạng thái kết nối và quy trình xử lý
            </span>
          </div>
          <div className="announcement-right">
            <a
              href="https://github.com/HouHackathon-CHP/dxos-core"
              target="_blank"
              rel="noreferrer"
              className="announcement-link"
            >
              <span>Kiến trúc mã nguồn mở</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* Main Top Navigation */}
      <header className="topbar">
        <div className="topbar-inner page-width">
          {/* Unified Brand Logo */}
          <Link className="brand" to="/" aria-label="OpenCity — Trang chủ">
            <Logo size={38} />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <LayoutGrid size={18} />
              <span>{operator ? 'Vận hành' : 'Dịch vụ'}</span>
            </NavLink>
            {canSee('reports') && <NavLink to="/reports" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <MapPin size={18} />
              <span>Phản ánh hiện trường</span>
            </NavLink>}
            {canSee('surveys') && <NavLink to="/surveys" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <ClipboardList size={18} />
              <span>Khảo sát ý kiến</span>
            </NavLink>}
            {canSee('bulletins') && <NavLink to="/bulletins" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <Newspaper size={18} />
              <span>Tin & Cảnh báo</span>
            </NavLink>}
          </nav>

          {/* User Account / Login Area */}
          <div className="account-area">
            {user ? (
              <div className="user-profile-widget">
                <div className={`user-role-pill ${operator ? 'role-officer' : 'role-citizen'}`}>
                  {operator ? <Shield size={13} /> : <UserCheck size={13} />}
                  <span>{operator ? 'Cán bộ xử lý' : 'Công dân'}</span>
                </div>
                <div className="user-chip">
                  <div className="user-avatar" title={displayName(user)}>
                    {displayName(user).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="user-meta">
                    <strong className="user-name">{displayName(user)}</strong>
                    <span className="user-subtext">{operator ? 'Nghiệp vụ được cấp quyền' : 'Tài khoản DX-OS'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button logout-button"
                  title="Đăng xuất khỏi hệ thống"
                  aria-label="Đăng xuất"
                  onClick={() => void logout()}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="login-btn"
                onClick={() => void login()}
                disabled={loading}
              >
                <LogIn size={16} />
                <span>{loading ? 'Đang kết nối…' : 'Đăng nhập'}</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Comprehensive Footer */}
      <footer className="footer">
        <div className="page-width">
          <div className="footer-top">
            <div className="footer-brand-col">
              <Link className="brand footer-brand" to="/" aria-label="OpenCity — Trang chủ">
                <Logo size={34} variant="white" />
              </Link>
              <p className="footer-desc">
                Cổng dịch vụ và tương tác đô thị thế hệ mới, vận hành trên nền tảng mở DX-OS.
                Kết nối công dân, dữ liệu và chính quyền đô thị theo thời gian thực.
              </p>
              <div className="footer-badges">
                <span className="pill-badge"><ShieldCheck size={13} /> OIDC OAuth 2.0 PKCE</span>
                <span className="pill-badge"><Globe size={13} /> Chuẩn mở Apache-2.0</span>
              </div>
            </div>

            <div className="footer-links-col">
              <h4>Kênh tương tác</h4>
              <ul>
                {canSee('reports') && <li><Link to="/reports">Phản ánh hiện trường</Link></li>}
                {canSee('surveys') && <li><Link to="/surveys">Khảo sát & Lấy ý kiến</Link></li>}
                {canSee('bulletins') && <li><Link to="/bulletins">Bản tin & Cảnh báo khu vực</Link></li>}
                {!operator && <li><Link to="/#danh-muc">Danh mục dịch vụ số</Link></li>}
              </ul>
            </div>

            <div className="footer-links-col">
              <h4>Nền tảng & Kỹ thuật</h4>
              <ul>
                <li>
                  <a href="https://github.com/HouHackathon-CHP/dxos-core" target="_blank" rel="noreferrer">
                    DX-OS OpenCore <ExternalLink size={12} />
                  </a>
                </li>
                <li>
                  <a href="https://github.com/HouHackathon-CHP" target="_blank" rel="noreferrer">
                    Tổ chức HouHackathon-CHP <ExternalLink size={12} />
                  </a>
                </li>
                <li>
                  <a href="https://www.openstreetmap.org" target="_blank" rel="noreferrer">
                    Bản đồ OpenStreetMap <ExternalLink size={12} />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p>© 2026 OpenCity Project · Giấy phép Apache-2.0. Sản phẩm phát triển trên nền tảng DX-OS.</p>
            <div className="footer-meta-tags">
              <span>Được xây dựng cho cộng đồng đô thị thông minh</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Modern Floating Mobile Tab Navigation */}
      <nav className="mobile-nav" aria-label="Điều hướng di động">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
          <LayoutGrid size={20} />
          <span>{operator ? 'Vận hành' : 'Dịch vụ'}</span>
        </NavLink>
        {canSee('reports') && <NavLink to="/reports" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
          <MapPin size={20} />
          <span>Phản ánh</span>
        </NavLink>}
        {canSee('surveys') && <NavLink to="/surveys" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
          <ClipboardList size={20} />
          <span>Khảo sát</span>
        </NavLink>}
        {canSee('bulletins') && <NavLink to="/bulletins" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
          <Newspaper size={20} />
          <span>Tin tức</span>
        </NavLink>}
      </nav>
    </div>
  );
}

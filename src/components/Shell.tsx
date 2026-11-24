// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BusFront,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Compass,
  ExternalLink,
  Globe,
  GraduationCap,
  Hospital,
  Layers,
  LayoutGrid,
  Landmark,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Newspaper,
  PhoneCall,
  Shield,
  ShieldCheck,
  SquareParking,
  UserCheck,
  Wind,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { displayName, rolesOf } from '../lib/auth';
import { canOpenFeature, managementOf, type Feature } from '../lib/permissions';
import { Logo } from './Logo';
import { request, type Notification } from '../lib/api';

export function Shell() {
  const { user, loading, login, logout } = useAuth();
  const operator = managementOf(user).length > 0;
  const admin = rolesOf(user).includes('admin');
  const canSee = (feature: Feature) => !loading && canOpenFeature(user, feature);
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMoreMenuOpen(false);
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileDrawerOpen]);

  const moreRoutes = [
    '/air-quality',
    '/bus-search',
    '/parking',
    '/tourism',
    '/heritage',
    '/healthcare',
    '/education',
    '/facilities',
    '/hotlines',
    '/surveys',
    '/appointments',
    '/communications',
    '/community/groups',
    '/social-feedback',
    '/digital-wards',
  ];
  const isMoreActive = moreRoutes.some((path) => location.pathname.startsWith(path));

  const hasMoreItems =
    canSee('air_quality') ||
    canSee('bus_search') ||
    canSee('parking') ||
    canSee('tourism') ||
    canSee('facilities') ||
    canSee('hotlines') ||
    canSee('surveys') ||
    canSee('appointments') ||
    canSee('communications') ||
    canSee('community_groups') ||
    canSee('social_feedback') ||
    canSee('digital_ward');

  useEffect(() => {
    if (!user?.access_token) { setUnread(0); return; }
    let active = true;
    const poll = () => {
      void request<Notification[]>('/api/opencity/notifications', user.access_token)
        .then((items) => { if (active) setUnread(items.filter((item) => !item.read_at).length); })
        .catch(() => { /* The page presents API errors if opened. */ });
    };
    poll();
    const timer = window.setInterval(poll, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [user?.access_token, location.pathname]);

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
        <div className="topbar-inner">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Mở danh mục dịch vụ"
            title="Mở danh mục dịch vụ"
          >
            <Menu size={22} />
          </button>

          {/* Unified Brand Logo */}
          <Link className="brand" to="/" aria-label="OpenCity — Trang chủ">
            <Logo size={38} />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="desktop-nav" aria-label="Điều hướng chính">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <LayoutGrid size={17} />
              <span>{admin ? 'Quản trị' : operator ? 'Vận hành' : 'Dịch vụ'}</span>
            </NavLink>
            {admin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Shield size={17} />
                <span>Hệ thống</span>
              </NavLink>
            )}
            {canSee('reports') && (
              <NavLink to="/reports" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <MapPin size={17} />
                <span>Phản ánh hiện trường</span>
              </NavLink>
            )}
            {canSee('bulletins') && (
              <NavLink to="/bulletins" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                <Newspaper size={17} />
                <span>Tin & Cảnh báo</span>
              </NavLink>
            )}

            {/* Dropdown for Secondary Civic Services */}
            {hasMoreItems && (
              <div className="nav-dropdown-wrapper" ref={moreMenuRef}>
                <button
                  type="button"
                  className={`nav-link nav-dropdown-btn ${isMoreActive ? 'active' : ''}`}
                  onClick={() => setMoreMenuOpen((prev) => !prev)}
                  aria-expanded={moreMenuOpen}
                >
                  <Layers size={17} />
                  <span>Dịch vụ khác</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transition: 'transform 0.2s ease',
                      transform: moreMenuOpen ? 'rotate(180deg)' : 'none',
                    }}
                  />
                </button>
                {moreMenuOpen && (
                  <div className="nav-dropdown-menu">
                    {canSee('air_quality') && (
                      <NavLink
                        to="/air-quality"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <Wind size={16} />
                        <span>Không khí & AQI</span>
                      </NavLink>
                    )}
                    {canSee('bus_search') && (
                      <NavLink
                        to="/bus-search"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <BusFront size={16} />
                        <span>Tra cứu xe buýt</span>
                      </NavLink>
                    )}
                    {canSee('parking') && (
                      <NavLink
                        to="/parking"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <SquareParking size={16} />
                        <span>Tra cứu điểm đỗ xe</span>
                      </NavLink>
                    )}
                    {canSee('tourism') && (
                      <>
                        <NavLink
                          to="/tourism"
                          className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                        >
                          <Compass size={16} />
                          <span>Bản đồ Du lịch</span>
                        </NavLink>
                        <NavLink
                          to="/heritage"
                          className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                        >
                          <Landmark size={16} />
                          <span>Bản đồ Di tích</span>
                        </NavLink>
                      </>
                    )}
                    {canSee('facilities') && (
                      <>
                        <NavLink
                          to="/healthcare"
                          className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                        >
                          <Hospital size={16} />
                          <span>Cơ sở Y tế & Nhà thuốc</span>
                        </NavLink>
                        <NavLink
                          to="/education"
                          className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                        >
                          <GraduationCap size={16} />
                          <span>Trường học & Đại học</span>
                        </NavLink>
                      </>
                    )}
                    {canSee('hotlines') && (
                      <NavLink
                        to="/hotlines"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <PhoneCall size={16} />
                        <span>Đường dây nóng 24/7</span>
                      </NavLink>
                    )}
                    {canSee('surveys') && (
                      <NavLink
                        to="/surveys"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <ClipboardList size={16} />
                        <span>Khảo sát ý kiến</span>
                      </NavLink>
                    )}
                    {canSee('appointments') && (
                      <NavLink
                        to="/appointments"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <CalendarDays size={16} />
                        <span>Tiếp công dân</span>
                      </NavLink>
                    )}
                    {canSee('communications') && (
                      <NavLink
                        to="/communications"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <Newspaper size={16} />
                        <span>Thông tin truyền thông</span>
                      </NavLink>
                    )}
                    {canSee('community_groups') && (
                      <NavLink
                        to="/community/groups"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <Globe size={16} />
                        <span>Nhóm cộng đồng</span>
                      </NavLink>
                    )}
                    {canSee('social_feedback') && (
                      <NavLink
                        to="/social-feedback"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <Globe size={16} />
                        <span>Góp ý, phản biện xã hội</span>
                      </NavLink>
                    )}
                    {canSee('digital_ward') && (
                      <NavLink
                        to="/digital-wards"
                        className={({ isActive }) => `nav-dropdown-item ${isActive ? 'active' : ''}`}
                      >
                        <MapPin size={16} />
                        <span>Xã/phường số</span>
                      </NavLink>
                    )}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* User Account / Login Area */}
          <div className="account-area">
            {user ? (
              <>
                <NavLink
                  to="/notifications"
                  className="notification-nav-link"
                  aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}
                >
                  <Bell size={20} />
                  {unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}
                </NavLink>
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
              </>
            ) : (
              <button
                type="button"
                className="login-btn"
                onClick={() => void login()}
                disabled={loading}
              >
                <LogIn size={16} />
                <span>{loading ? 'Đang kết nối…' : 'Đăng nhập'}</span>
                <ArrowRight size={15} className="login-arrow-icon" />
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
                {canSee('administrative_feedback') && <li><Link to="/administrative-feedback">Phản ánh thủ tục hành chính</Link></li>}
                {canSee('business_feedback') && <li><Link to="/business-feedback">Doanh nghiệp kiến nghị</Link></li>}
                {canSee('surveys') && <li><Link to="/surveys">Khảo sát & Lấy ý kiến</Link></li>}
                {canSee('bulletins') && <li><Link to="/bulletins">Bản tin & Cảnh báo khu vực</Link></li>}
                {canSee('appointments') && <li><Link to="/appointments">Đăng ký tiếp công dân</Link></li>}
                {canSee('hotlines') && <li><Link to="/hotlines">Danh bạ đường dây nóng</Link></li>}
                {canSee('communications') && <li><Link to="/communications">Thông tin truyền thông</Link></li>}
                {canSee('community_groups') && <li><Link to="/community/groups">Nhóm cộng đồng</Link></li>}
                {canSee('social_feedback') && <li><Link to="/social-feedback">Góp ý, phản biện xã hội</Link></li>}
                {canSee('digital_ward') && <li><Link to="/digital-wards">Xã/phường số</Link></li>}
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
          <span>{admin ? 'Quản trị' : operator ? 'Vận hành' : 'Dịch vụ'}</span>
        </NavLink>
        {canSee('reports') && (
          <NavLink to="/reports" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
            <MapPin size={20} />
            <span>Phản ánh</span>
          </NavLink>
        )}
        <button
          type="button"
          className={`mobile-nav-item ${isMoreActive || mobileDrawerOpen ? 'active' : ''}`}
          onClick={() => setMobileDrawerOpen(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Layers size={20} />
          <span>Dịch vụ khác</span>
        </button>
        {canSee('bulletins') && (
          <NavLink to="/bulletins" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
            <Newspaper size={20} />
            <span>Tin tức</span>
          </NavLink>
        )}
        {user ? (
          <NavLink to="/notifications" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
            <Bell size={20} />
            <span>Thông báo{unread ? ` (${unread})` : ''}</span>
          </NavLink>
        ) : (
          <NavLink to="/surveys" className={({ isActive }) => (isActive ? 'mobile-nav-item active' : 'mobile-nav-item')}>
            <ClipboardList size={20} />
            <span>Khảo sát</span>
          </NavLink>
        )}
      </nav>

      {/* Modern Slide-out Mobile Services Sidebar Drawer */}
      {mobileDrawerOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileDrawerOpen(false)}>
          <div className="mobile-drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-header">
              <Link to="/" className="brand" onClick={() => setMobileDrawerOpen(false)} aria-label="OpenCity">
                <Logo size={32} />
              </Link>
              <button
                type="button"
                className="mobile-drawer-close"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Đóng danh mục"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mobile-drawer-content">
              {/* User profile / login widget */}
              {user ? (
                <div className="mobile-drawer-user-card">
                  <div className="user-avatar" title={displayName(user)}>
                    {displayName(user).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="user-meta" style={{ display: 'flex' }}>
                    <strong className="user-name">{displayName(user)}</strong>
                    <span className="user-subtext">{operator ? 'Cán bộ xử lý' : 'Tài khoản công dân'}</span>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mobile-drawer-login-btn"
                  onClick={() => {
                    setMobileDrawerOpen(false);
                    void login();
                  }}
                  disabled={loading}
                >
                  <LogIn size={16} />
                  <span>{loading ? 'Đang kết nối…' : 'Đăng nhập hệ thống'}</span>
                </button>
              )}

              {/* Main Channels */}
              <div className="mobile-drawer-section">
                <span className="mobile-drawer-section-title">Kênh điều hành</span>
                <NavLink to="/" end className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                  <LayoutGrid size={18} />
                  <span>{admin ? 'Quản trị hệ thống' : operator ? 'Vận hành dịch vụ' : 'Cổng dịch vụ đô thị'}</span>
                </NavLink>
                {admin && (
                  <NavLink to="/admin" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Shield size={18} />
                    <span>Hệ thống quản trị</span>
                  </NavLink>
                )}
                {canSee('reports') && (
                  <NavLink to="/reports" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <MapPin size={18} />
                    <span>Phản ánh hiện trường</span>
                  </NavLink>
                )}
                {canSee('bulletins') && (
                  <NavLink to="/bulletins" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Newspaper size={18} />
                    <span>Tin tức & Cảnh báo</span>
                  </NavLink>
                )}
              </div>

              {/* Secondary Civic Services (All items from Ảnh 2) */}
              <div className="mobile-drawer-section">
                <span className="mobile-drawer-section-title">Dịch vụ đô thị mở</span>
                {canSee('air_quality') && (
                  <NavLink to="/air-quality" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Wind size={18} style={{ color: '#0d9488' }} />
                    <span>Không khí & AQI</span>
                  </NavLink>
                )}
                {canSee('bus_search') && (
                  <NavLink to="/bus-search" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <BusFront size={18} style={{ color: '#2563eb' }} />
                    <span>Tra cứu xe buýt</span>
                  </NavLink>
                )}
                {canSee('parking') && (
                  <NavLink to="/parking" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <SquareParking size={18} style={{ color: '#2563eb' }} />
                    <span>Tra cứu điểm đỗ xe</span>
                  </NavLink>
                )}
                {canSee('tourism') && (
                  <>
                    <NavLink to="/tourism" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                      <Compass size={18} style={{ color: '#059669' }} />
                      <span>Bản đồ Du lịch</span>
                    </NavLink>
                    <NavLink to="/heritage" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                      <Landmark size={18} style={{ color: '#e11d48' }} />
                      <span>Bản đồ Di tích</span>
                    </NavLink>
                  </>
                )}
                {canSee('facilities') && (
                  <>
                    <NavLink to="/healthcare" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                      <Hospital size={18} style={{ color: '#e11d48' }} />
                      <span>Cơ sở Y tế & Nhà thuốc</span>
                    </NavLink>
                    <NavLink to="/education" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                      <GraduationCap size={18} style={{ color: '#4f46e5' }} />
                      <span>Trường học & Đại học</span>
                    </NavLink>
                  </>
                )}
                {canSee('hotlines') && (
                  <NavLink to="/hotlines" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <PhoneCall size={18} style={{ color: '#d97706' }} />
                    <span>Đường dây nóng 24/7</span>
                  </NavLink>
                )}
                {canSee('surveys') && (
                  <NavLink to="/surveys" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <ClipboardList size={18} style={{ color: '#6366f1' }} />
                    <span>Khảo sát ý kiến</span>
                  </NavLink>
                )}
                {canSee('appointments') && (
                  <NavLink to="/appointments" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <CalendarDays size={18} style={{ color: '#9333ea' }} />
                    <span>Tiếp công dân</span>
                  </NavLink>
                )}
                {canSee('communications') && (
                  <NavLink to="/communications" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Newspaper size={18} style={{ color: '#475569' }} />
                    <span>Thông tin truyền thông</span>
                  </NavLink>
                )}
                {canSee('community_groups') && (
                  <NavLink to="/community/groups" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Globe size={18} style={{ color: '#0284c7' }} />
                    <span>Nhóm cộng đồng</span>
                  </NavLink>
                )}
                {canSee('social_feedback') && (
                  <NavLink to="/social-feedback" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <Globe size={18} style={{ color: '#0891b2' }} />
                    <span>Góp ý, phản biện xã hội</span>
                  </NavLink>
                )}
                {canSee('digital_ward') && (
                  <NavLink to="/digital-wards" className={({ isActive }) => `mobile-drawer-item ${isActive ? 'active' : ''}`}>
                    <MapPin size={18} style={{ color: '#dc2626' }} />
                    <span>Xã/phường số</span>
                  </NavLink>
                )}
              </div>

              {/* Logout button if user logged in */}
              {user && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    className="mobile-drawer-item"
                    style={{ color: '#ef4444', width: '100%', border: 'none', background: 'none' }}
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      void logout();
                    }}
                  >
                    <LogOut size={18} />
                    <span>Đăng xuất tài khoản</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

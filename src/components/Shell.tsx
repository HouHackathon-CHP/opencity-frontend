// SPDX-License-Identifier: Apache-2.0
import { ArrowRight, LayoutGrid, LogIn, LogOut, MapPin, Menu, ShieldCheck } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { displayName, rolesOf } from '../lib/auth';

export function Shell() {
  const { user, loading, login, logout } = useAuth();
  const operator = rolesOf(user).some((role) => role === 'operator' || role === 'admin');

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner page-width">
        <Link className="brand" to="/" aria-label="OpenCity, về trang chủ">
          <span className="brand-symbol"><span>O</span><span>C</span></span>
          <span className="brand-name">open<span>city</span><small>Trên nền tảng DX-OS</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Điều hướng chính">
          <NavLink to="/" end><LayoutGrid size={17} /> Danh mục</NavLink>
          <NavLink to="/reports"><MapPin size={17} /> Phản ánh hiện trường</NavLink>
        </nav>
        <div className="account-area">
          {user ? <>
            <div className="user-chip"><span className="user-avatar">{displayName(user).slice(0, 1).toUpperCase()}</span><span><strong>{displayName(user)}</strong><small>{operator ? 'Cán bộ xử lý' : 'Công dân'}</small></span></div>
            <button type="button" className="icon-button logout-button" title="Đăng xuất" onClick={() => void logout()}><LogOut size={18} /></button>
          </> : <button type="button" className="login-button" onClick={() => void login()} disabled={loading}><LogIn size={17} /> Đăng nhập <ArrowRight size={15} /></button>}
        </div>
      </div>
    </header>
    <div className="notice-bar"><div className="page-width"><ShieldCheck size={15} /> Bản thử nghiệm nguồn mở · Dữ liệu dịch vụ chưa kết nối được đánh dấu rõ ràng</div></div>
    <main><Outlet /></main>
    <footer className="footer"><div className="page-width footer-inner"><div><strong>OpenCity</strong><p>Cổng dịch vụ đô thị có thể mở rộng, vận hành trên DX-OS Open-Core.</p></div><div><span>Mã nguồn mở · Apache-2.0</span><a href="https://github.com/HouHackathon-CHP" target="_blank" rel="noreferrer">HouHackathon-CHP <ArrowRight size={14} /></a></div></div></footer>
    <nav className="mobile-nav" aria-label="Điều hướng di động"><NavLink to="/" end><Menu size={20} /><span>Danh mục</span></NavLink><NavLink to="/reports"><MapPin size={20} /><span>Phản ánh</span></NavLink></nav>
  </div>;
}

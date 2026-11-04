// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { authority } from '../lib/auth';
import { request, type AdminOverview } from '../lib/api';
import { services } from '../lib/catalog';

const modules = [
  { title: 'Phản ánh hiện trường', href: '/reports', description: 'Phân công, theo dõi tiến độ và hạn xử lý.' },
  { title: 'Phản ánh thủ tục hành chính', href: '/administrative-feedback', description: 'Xem xét và trả lời hồ sơ của người dân.' },
  { title: 'Kiến nghị doanh nghiệp', href: '/business-feedback', description: 'Tiếp nhận, yêu cầu bổ sung và phản hồi.' },
  { title: 'Lịch tiếp công dân', href: '/appointments', description: 'Mở khung giờ và duyệt lịch hẹn.' },
  { title: 'Tin tức & cảnh báo', href: '/bulletins', description: 'Đăng thông tin trong phạm vi tenant.' },
  { title: 'Khảo sát ý kiến', href: '/surveys', description: 'Tạo khảo sát và xem kết quả.' },
  { title: 'Đường dây nóng', href: '/hotlines', description: 'Cập nhật danh bạ liên hệ và giờ trực.' },
  { title: 'Thông tin truyền thông', href: '/communications', description: 'Phát hành thông tin và chiến dịch truyền thông.' },
  { title: 'Nhóm cộng đồng', href: '/community/groups', description: 'Tạo không gian trao đổi cho cư dân.' },
];

const identity = new URL(authority);
const realm = identity.pathname.split('/').filter(Boolean).at(-1) || 'dxos';
const keycloakUsersUrl = `${identity.origin}/admin/master/console/#/${encodeURIComponent(realm)}/users`;

export function AdminPage() {
  const { user } = useAuth();
  const token = user?.access_token || '';
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setOverview(await request<AdminOverview>('/api/opencity/admin/overview', token));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được số liệu quản trị.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const available = services.filter((service) => service.status === 'available').length;
  const planned = services.filter((service) => service.status === 'planned').length;
  const integrations = services.length - available - planned;
  const metrics = overview ? [
    { label: 'Phản ánh hiện trường', value: overview.reports.total, detail: `${overview.reports.overdue} quá hạn`, href: '/reports/dashboard' },
    { label: 'Lịch tiếp công dân', value: overview.appointments.total, detail: `${overview.appointments.breakdown.pending || 0} chờ duyệt`, href: '/appointments' },
    { label: 'Phản ánh thủ tục', value: overview.administrative_feedback.total, detail: `${overview.administrative_feedback.breakdown.submitted || 0} mới gửi`, href: '/administrative-feedback' },
    { label: 'Kiến nghị doanh nghiệp', value: overview.business_feedback.total, detail: `${overview.business_feedback.breakdown.submitted || 0} mới gửi`, href: '/business-feedback' },
    { label: 'Tin, cảnh báo & truyền thông', value: overview.bulletins.total, detail: 'Đã phát hành', href: '/bulletins' },
    { label: 'Khảo sát', value: overview.surveys.total, detail: `${overview.surveys.breakdown.open || 0} đang mở`, href: '/surveys' },
    { label: 'Đường dây nóng', value: overview.hotlines.total, detail: `${overview.hotlines.breakdown['1'] || 0} đang hiển thị`, href: '/hotlines' },
    { label: 'Nhóm cộng đồng', value: overview.community_groups.total, detail: 'Nhóm trong đơn vị', href: '/community/groups' },
  ] : [];

  return <div className="admin-page page-width">
    <div className="page-breadcrumb"><Link to="/">OpenCity</Link><span>›</span><span>Quản trị hệ thống</span></div>
    <header className="admin-hero">
      <div><p className="intro-eyebrow">TRUNG TÂM QUẢN TRỊ</p><h1>Vận hành OpenCity</h1>
        <p>Số liệu theo tenant của tài khoản. Các thao tác nghiệp vụ mở trong từng module; tài khoản và role quản lý tại Keycloak.</p>
      </div>
      <ShieldCheck size={54} aria-hidden="true" />
    </header>

    <div className="admin-section-heading"><div><h2>Tình hình xử lý</h2>
      {overview && <small>Cập nhật: {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(overview.generated_at))}</small>}</div>
      <button className="btn-outline" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> Làm mới</button>
    </div>
    {error && <div className="alert-box alert-error" role="alert">{error}</div>}
    {loading && !overview && <p>Đang tải số liệu quản trị…</p>}
    {overview && <section className="admin-metrics" aria-label="Số liệu nghiệp vụ">
      {metrics.map((metric) => <Link key={metric.label} to={metric.href} className="admin-metric">
        <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail} <ArrowRight size={13} /></small>
      </Link>)}
    </section>}

    <div className="admin-section-heading"><h2>Quản lý nghiệp vụ</h2></div>
    <section className="admin-modules" aria-label="Các module nghiệp vụ">
      {modules.map((module) => <Link key={module.href} to={module.href} className="admin-module">
        <strong>{module.title}</strong><p>{module.description}</p><span>Mở module <ArrowRight size={16} /></span>
      </Link>)}
    </section>

    <div className="admin-bottom-grid">
      <section className="admin-panel"><h2>Danh mục dịch vụ</h2>
        <p>Trạng thái danh mục được quản lý trong mã nguồn và đưa lên qua quy trình kiểm thử, review.</p>
        <div className="admin-catalog-counts"><span><strong>{available}</strong> đang hoạt động</span>
          <span><strong>{planned}</strong> dự kiến</span><span><strong>{integrations}</strong> chờ kết nối</span></div>
      </section>
      <section className="admin-panel"><h2>Tài khoản và phân quyền</h2>
        <p>Keycloak quản lý tài khoản và role. Trang này không lưu mật khẩu hoặc cấp quyền trực tiếp.</p>
        <a className="btn-outline" href={keycloakUsersUrl} target="_blank" rel="noreferrer">Mở Keycloak <ExternalLink size={16} /></a>
        <small>Cần tài khoản quản trị Keycloak riêng để thay đổi role.</small>
      </section>
    </div>
  </div>;
}

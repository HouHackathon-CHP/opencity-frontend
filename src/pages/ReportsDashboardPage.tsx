// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Clock3, MapPin, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type ReportsDashboard } from '../lib/api';

const unitNames: Record<string, string> = {
  infrastructure: 'Hạ tầng & chiếu sáng',
  environment: 'Môi trường & cây xanh',
  transport: 'Giao thông',
  intake: 'Tiếp nhận chung',
  unassigned: 'Không gắn đơn vị',
};

const metrics = [
  { key: 'total', title: 'Tổng hồ sơ', href: '/reports/map', tone: 'neutral' },
  { key: 'new', title: 'Mới gửi', href: '/reports/map?status=submitted', tone: 'blue' },
  { key: 'triaged', title: 'Đã tiếp nhận', href: '/reports/map?status=triaged', tone: 'blue' },
  { key: 'in_progress', title: 'Đang xử lý', href: '/reports/map?status=assigned', tone: 'amber' },
  { key: 'resolved', title: 'Đã hoàn tất', href: '/reports/map?status=resolved', tone: 'green' },
  { key: 'unassigned', title: 'Chưa phân công', href: '/reports/map?unit=unassigned&status=open', tone: 'violet' },
  { key: 'due_soon', title: 'Sắp đến hạn · 24 giờ', href: '/reports/map?due=due_soon', tone: 'amber' },
  { key: 'overdue', title: 'Quá hạn', href: '/reports/map?due=overdue', tone: 'red' },
] as const;

const priorityLabels: Record<string, string> = {
  overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', unassigned: 'Chưa phân công',
};

function formatDate(value: string | null): string {
  if (!value) return 'Chưa đặt hạn';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value :
    new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function ReportsDashboardPage() {
  const { user } = useAuth();
  const token = user?.access_token || '';
  const [dashboard, setDashboard] = useState<ReportsDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setDashboard(await request<ReportsDashboard>('/api/opencity/reports/dashboard', token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu điều hành.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="reports-dashboard-page page-width">
      <div className="page-breadcrumb"><Link className="breadcrumb-link" to="/reports">Phản ánh hiện trường</Link><span> / Dashboard SLA</span></div>
      <div className="reports-dashboard-heading">
        <div>
          <p className="reports-dashboard-eyebrow">TRUNG TÂM ĐIỀU HÀNH</p>
          <h1>Tiến độ xử lý phản ánh</h1>
          <p>Số liệu trong phạm vi tenant và đơn vị mà tài khoản được phép xem.</p>
          {dashboard && <small>Cập nhật lúc {formatDate(dashboard.generated_at)}</small>}
        </div>
        <div className="reports-dashboard-actions">
          <button type="button" className="btn-outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới
          </button>
          <Link className="btn-outline" to="/reports/map"><MapPin size={16} /> Bản đồ hiện trường</Link>
        </div>
      </div>
      {error && <div className="alert-box alert-error" role="alert"><TriangleAlert size={18} />{error}</div>}
      {!dashboard && loading && <p className="reports-dashboard-empty">Đang tải số liệu điều hành…</p>}
      {dashboard && <>
        <section className="reports-dashboard-metrics" aria-label="Chỉ số xử lý phản ánh">
          {metrics.map((metric) => (
            <Link key={metric.key} className={`reports-dashboard-metric tone-${metric.tone}`} to={metric.href}>
              <span>{metric.title}</span>
              <strong>{dashboard.counts[metric.key]}</strong>
              <small>Xem hồ sơ <ArrowRight size={13} /></small>
            </Link>
          ))}
        </section>

        <div className="reports-dashboard-grid">
          <section className="reports-dashboard-panel" aria-labelledby="urgent-heading">
            <div className="reports-dashboard-panel-heading">
              <div><p>ƯU TIÊN HÔM NAY</p><h2 id="urgent-heading">Hồ sơ cần chú ý</h2></div>
              <span>{dashboard.urgent.length} hồ sơ</span>
            </div>
            {dashboard.urgent.length === 0 ? (
              <p className="reports-dashboard-empty">Không có hồ sơ quá hạn, sắp đến hạn hoặc chờ phân công.</p>
            ) : (
              <div className="reports-dashboard-urgent-list">
                {dashboard.urgent.map((report) => (
                  <Link key={report.id} className="reports-dashboard-urgent-item"
                    to={`/reports?report=${encodeURIComponent(report.id)}`}>
                    <span className={`reports-dashboard-priority priority-${report.priority}`}>
                      {priorityLabels[report.priority]}
                    </span>
                    <strong>{report.title}</strong>
                    <small>{report.address || 'Chưa có địa chỉ'} · {report.category}</small>
                    <span className="reports-dashboard-urgent-meta"><Clock3 size={13} /> {formatDate(report.due_at)} <ArrowRight size={15} /></span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="reports-dashboard-panel" aria-labelledby="units-heading">
            <div className="reports-dashboard-panel-heading">
              <div><p>THEO ĐƠN VỊ</p><h2 id="units-heading">Khối lượng xử lý</h2></div>
            </div>
            {dashboard.units.length === 0 ? (
              <p className="reports-dashboard-empty">Chưa có hồ sơ trong phạm vi tài khoản.</p>
            ) : (
              <div className="reports-dashboard-units">
                {dashboard.units.map((row) => (
                  <Link key={row.unit_id} className="reports-dashboard-unit" to={`/reports/map?unit=${encodeURIComponent(row.unit_id)}`}>
                    <span className="reports-dashboard-unit-title"><strong>{unitNames[row.unit_id] || row.unit_id}</strong><b>{row.total}</b></span>
                    <span className="reports-dashboard-unit-bar"><i style={{ width: `${dashboard.counts.total ? row.total / dashboard.counts.total * 100 : 0}%` }} /></span>
                    <small>{row.active} đang mở · {row.resolved} hoàn tất{row.overdue ? ` · ${row.overdue} quá hạn` : ''}</small>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </>}
    </div>
  );
}

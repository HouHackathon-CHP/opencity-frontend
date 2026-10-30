// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Clock3, RefreshCw, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type Notification } from '../lib/api';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function NotificationsPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const token = user?.access_token || '';
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      setItems(await request<Notification[]>('/api/opencity/notifications', token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function openNotification(item: Notification) {
    if (!token || busyId) return;
    setBusyId(item.id);
    try {
      if (!item.read_at) {
        const result = await request<{ id: string; read_at: string }>(
          `/api/opencity/notifications/${encodeURIComponent(item.id)}/read`, token, { method: 'POST' },
        );
        setItems((current) => current.map((entry) => entry.id === item.id
          ? { ...entry, read_at: result.read_at } : entry));
      }
      navigate(`/reports?report=${encodeURIComponent(item.report_id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể mở thông báo.');
    } finally {
      setBusyId(null);
    }
  }

  const unread = items.filter((item) => !item.read_at).length;

  return <section className="page-width notifications-page">
    <div className="page-intro-banner">
      <div className="intro-text-col">
        <span className="intro-eyebrow"><Bell size={16} /> TRUNG TÂM THÔNG BÁO</span>
        <h1 className="intro-headline">Thông báo của bạn</h1>
        <p className="intro-paragraph">Theo dõi hồ sơ được giao, tiến độ xử lý và các mốc thời hạn.</p>
      </div>
    </div>
    {!user ? <div className="notifications-empty">
      <p>Đăng nhập để xem thông báo gắn với tài khoản của bạn.</p>
      <button className="btn-primary" type="button" onClick={() => void login()}>Đăng nhập</button>
    </div> : <>
      <div className="notifications-toolbar">
        <strong>{unread ? `${unread} thông báo chưa đọc` : 'Đã xem hết thông báo'}</strong>
        <button type="button" className="btn-outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới
        </button>
      </div>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      <div className="notifications-list">
        {items.map((item) => <button type="button" key={item.id}
          className={`notification-card ${item.read_at ? '' : 'is-unread'}`}
          disabled={busyId === item.id} onClick={() => void openNotification(item)}>
          <span className="notification-mark">{item.read_at ? <CheckCheck size={20} /> : <Bell size={20} />}</span>
          <span className="notification-copy">
            <strong>{item.title}</strong>
            <span>{item.body}</span>
            <small><Clock3 size={13} /> {formatDate(item.created_at)}</small>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>)}
        {!loading && items.length === 0 && !error && <div className="notifications-empty">
          <Bell size={28} />
          <p>Chưa có thông báo nào. Các thay đổi của hồ sơ sẽ xuất hiện tại đây.</p>
        </div>}
      </div>
    </>}
  </section>;
}

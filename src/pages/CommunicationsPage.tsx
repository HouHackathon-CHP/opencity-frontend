// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type Bulletin } from '../lib/api';
import { canManage } from '../lib/permissions';

const endpoint = '/api/opencity/communications';

export function CommunicationsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'communications');
  const [items, setItems] = useState<Bulletin[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState({ title: '', summary: '', body: '', area: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const list = await request<Bulletin[]>(endpoint, token);
      setItems(list);
      setSelectedId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || '');
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được thông tin truyền thông.'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operator || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<Bulletin>(endpoint, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, area: form.area.trim() || null }),
      });
      setForm({ title: '', summary: '', body: '', area: '' });
      await refresh(); setSelectedId(created.id); setNotice('Đã phát hành thông tin truyền thông.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không phát hành được nội dung.'); }
    finally { setBusy(false); }
  }

  const selected = items.find((item) => item.id === selectedId);
  return <div className="page-width hotlines-page">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Thông tin truyền thông</span></div>
    <div className="page-intro-banner"><div className="intro-text-col">
      <p className="intro-eyebrow">KÊNH TRUYỀN THÔNG ĐÔ THỊ</p>
      <h1 className="intro-headline">Thông tin truyền thông</h1>
      <p className="intro-paragraph">Các chương trình và thông báo do đơn vị vận hành OpenCity phát hành cho địa bàn của bạn.</p>
    </div></div>
    {!user ? <section className="appointment-panel"><h2>Đăng nhập để xem nội dung</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {operator && <section className="appointment-panel"><h2>Phát hành thông tin</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void publish(event)}>
          <label>Tiêu đề<input required minLength={5} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Khu vực<input maxLength={120} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Tóm tắt<textarea required minLength={10} maxLength={300} rows={2} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Nội dung<textarea required minLength={20} maxLength={5000} rows={6} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
          <button className="btn-primary" type="submit" disabled={busy}>Phát hành</button>
        </form>
      </section>}
      <div className="appointment-toolbar"><h2>Thông tin đã phát hành</h2><button type="button" className="btn-outline" onClick={() => void refresh()}>Làm mới</button></div>
      {items.length === 0 ? <section className="appointment-panel">Chưa có thông tin truyền thông.</section> :
        <div className="form-grid-two"><div className="appointment-panel">
          {items.map((item) => <button key={item.id} type="button" className="btn-outline" onClick={() => setSelectedId(item.id)} aria-pressed={selectedId === item.id}>
            {item.title} · {new Date(item.published_at).toLocaleDateString('vi-VN')}
          </button>)}
        </div><article className="appointment-panel" aria-live="polite">
          {selected && <><h2>{selected.title}</h2><p>{selected.summary}</p>
            {selected.area && <p>Khu vực: {selected.area}</p>}
            <p>{new Date(selected.published_at).toLocaleString('vi-VN')}</p>
            <div style={{ whiteSpace: 'pre-wrap' }}>{selected.body}</div></>}
        </article></div>}
    </>}
  </div>;
}

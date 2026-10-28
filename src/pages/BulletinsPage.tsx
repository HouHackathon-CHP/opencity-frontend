// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Newspaper, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { rolesOf } from '../lib/auth';
import { request, type Bulletin } from '../lib/api';

const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function BulletinsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = rolesOf(user).some(role => role === 'operator' || role === 'admin');
  const [items, setItems] = useState<Bulletin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'news' | 'alert'>('all');
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<'news' | 'alert'>('news');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [body, setBody] = useState('');
  const [area, setArea] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try { setItems(await request<Bulletin[]>('/api/opencity/bulletins', token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được bản tin.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !operator || busy) return;
    const hasLatitude = latitude.trim().length > 0;
    const hasLongitude = longitude.trim().length > 0;
    if (hasLatitude !== hasLongitude) { setError('Cần nhập cả vĩ độ và kinh độ, hoặc để trống cả hai.'); return; }
    const lat = hasLatitude ? Number(latitude) : null;
    const lon = hasLongitude ? Number(longitude) : null;
    if (lat !== null && lon !== null && (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) {
      setError('Tọa độ không hợp lệ.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<Bulletin>('/api/opencity/bulletins', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, title: title.trim(), summary: summary.trim(), body: body.trim(), area: area.trim() || null, latitude: lat, longitude: lon }),
      });
      setTitle(''); setSummary(''); setBody(''); setArea(''); setLatitude(''); setLongitude(''); setShowForm(false);
      setFilter('all'); setSelectedId(created.id); setNotice('Đã đăng nội dung cho người dùng trong đơn vị.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đăng được nội dung.'); }
    finally { setBusy(false); }
  }

  const visible = items.filter(item => filter === 'all' || item.category === filter);
  const selected = items.find(item => item.id === selectedId);
  return <div className="bulletins-page page-width">
    <div className="breadcrumb"><Link to="/">Danh mục</Link><ArrowRight size={14} /> Tin & cảnh báo</div>
    <div className="reports-intro"><div><span className="kicker">THÔNG TIN ĐỊA PHƯƠNG</span><h1>Tin & cảnh báo</h1><p>Nội dung do đơn vị vận hành OpenCity đăng tải. Dữ liệu thử nghiệm được gắn nhãn [DEMO].</p></div><div className="reports-intro-icon"><Newspaper size={42} /></div></div>
    {!user ? <section className="login-prompt"><div className="login-prompt-icon"><LockKeyhole size={28} /></div><div><h2>{authLoading ? 'Đang kiểm tra phiên…' : 'Đăng nhập để xem thông tin'}</h2><p>Thông tin hiển thị theo đơn vị của tài khoản bạn.</p></div><button type="button" onClick={() => void login()} disabled={authLoading}>Đăng nhập <ArrowRight size={17} /></button></section> : <>
      <div className="reports-toolbar"><div><h2>Bản tin trong đơn vị</h2><p>Chọn mục để đọc đầy đủ nội dung.</p></div><div className="toolbar-actions"><button className="refresh-button" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={17} /> Làm mới</button>{operator && <button className="new-report-button" type="button" onClick={() => setShowForm(value => !value)}><Plus size={17} /> Đăng nội dung</button>}</div></div>
      {error && <div className="alert error" role="alert"><TriangleAlert size={17} /> {error}</div>}
      {notice && <div className="alert success" role="status"><CheckCircle2 size={17} /> {notice}</div>}
      {operator && showForm && <section className="report-form-card bulletin-form"><h2>Đăng tin hoặc cảnh báo</h2><form onSubmit={(event) => void publish(event)}>
        <div className="form-row"><label>Loại nội dung<select value={category} onChange={event => setCategory(event.target.value as 'news' | 'alert')}><option value="news">Tin tức</option><option value="alert">Cảnh báo</option></select></label><label>Khu vực (tùy chọn)<input value={area} onChange={event => setArea(event.target.value)} maxLength={120} placeholder="Ví dụ: Quận Hoàn Kiếm" /></label></div>
        <label>Tiêu đề<input value={title} onChange={event => setTitle(event.target.value)} minLength={5} maxLength={160} required /></label>
        <label>Tóm tắt<input value={summary} onChange={event => setSummary(event.target.value)} minLength={10} maxLength={300} required /></label>
        <label>Nội dung<textarea value={body} onChange={event => setBody(event.target.value)} minLength={20} maxLength={5000} rows={6} required /></label>
        <div className="form-row"><label>Vĩ độ (tùy chọn)<input value={latitude} onChange={event => setLatitude(event.target.value)} inputMode="decimal" placeholder="21.0285" /></label><label>Kinh độ (tùy chọn)<input value={longitude} onChange={event => setLongitude(event.target.value)} inputMode="decimal" placeholder="105.8542" /></label></div>
        <div className="form-footer"><p>Nội dung xuất hiện ngay trên web và app của người dùng trong đơn vị. Kiểm tra kỹ trước khi đăng.</p><button type="submit" disabled={busy}>{busy ? 'Đang đăng…' : 'Công bố nội dung'}</button></div>
      </form></section>}
      <div className="bulletin-filters">{([['all', 'Tất cả'], ['news', 'Tin tức'], ['alert', 'Cảnh báo']] as const).map(([key, label]) => <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => { setFilter(key); setSelectedId(null); }}>{label}</button>)}</div>
      <div className="reports-layout"><div className="report-list">{loading && !items.length ? <div className="report-empty">Đang tải bản tin…</div> : visible.length ? visible.map(item => <button key={item.id} type="button" className={`report-list-item ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><div className="report-item-top"><span className={`report-type ${item.category === 'alert' ? 'bulletin-alert-label' : ''}`}>{item.category === 'alert' ? 'Cảnh báo' : 'Tin tức'}</span></div><strong>{item.title}</strong><p>{item.summary}</p><small>{item.area ? `${item.area} · ` : ''}{formatDate(item.published_at)}</small></button>) : <div className="report-empty"><Newspaper size={30} /><h3>Chưa có nội dung</h3><p>{operator ? 'Đăng nội dung đầu tiên cho đơn vị.' : 'Quay lại khi đơn vị có thông tin mới.'}</p></div>}</div>
      <section className="report-detail bulletin-detail">{selected ? <><div className="detail-top"><span className={`kicker ${selected.category === 'alert' ? 'bulletin-alert-label' : ''}`}>{selected.category === 'alert' ? 'CẢNH BÁO' : 'TIN TỨC'}</span><span className="muted">{formatDate(selected.published_at)}</span></div><h2>{selected.title}</h2><p className="bulletin-summary">{selected.summary}</p><p className="bulletin-body">{selected.body}</p>{selected.area && <p className="muted">Khu vực: {selected.area}</p>}{selected.latitude != null && selected.longitude != null && <a className="bulletin-map-link" href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=16/${selected.latitude}/${selected.longitude}`} target="_blank" rel="noreferrer">Xem vị trí trên bản đồ <ArrowRight size={15} /></a>}</> : <div className="detail-placeholder"><div><Newspaper size={33} /></div><h3>Chọn một bản tin</h3><p>Nội dung đầy đủ sẽ hiện ở đây.</p></div>}</section></div>
    </>}
  </div>;
}

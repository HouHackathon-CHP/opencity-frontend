// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { PhoneCall, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type Hotline } from '../lib/api';
import { canManage } from '../lib/permissions';

const base = '/api/opencity/hotlines';
const emptyForm = { name: '', unit: '', phone: '', area: '', hours: '', description: '', active: true };

export function HotlinesPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'hotlines');
  const [items, setItems] = useState<Hotline[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) { setItems([]); return; }
    setLoading(true);
    try {
      setItems(await request<Hotline[]>(base, token));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được danh bạ.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => items.filter((item) => {
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return !needle || [item.name, item.unit, item.area, item.phone]
      .some((value) => value.toLocaleLowerCase('vi-VN').includes(needle));
  }), [items, query]);

  function edit(item: Hotline) {
    setEditingId(item.id);
    setForm({ name: item.name, unit: item.unit, phone: item.phone, area: item.area,
      hours: item.hours, description: item.description, active: item.active });
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operator || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<Hotline>(editingId ? `${base}/${encodeURIComponent(editingId)}` : base, token, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setForm(emptyForm); setEditingId(null);
      await refresh();
      setNotice('Đã lưu thông tin đường dây nóng.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được liên hệ.'); }
    finally { setBusy(false); }
  }

  return <div className="hotlines-page page-width">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Đường dây nóng</span></div>
    <div className="page-intro-banner"><div className="intro-text-col">
      <p className="intro-eyebrow">KÊNH HỖ TRỢ ĐÔ THỊ</p><h1 className="intro-headline">Danh bạ đường dây nóng</h1>
      <p className="intro-paragraph">Tra cứu số liên hệ và giờ trực do đơn vị vận hành OpenCity công bố. Chạm số điện thoại để mở ứng dụng gọi.</p>
    </div><PhoneCall size={46} aria-hidden="true" /></div>

    {!user ? <section className="appointment-panel"><h2>Đăng nhập để xem danh bạ</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      <div className="appointment-toolbar"><p>{operator ? 'Quản lý danh bạ trong tenant' : 'Liên hệ hỗ trợ trong tenant của bạn'}</p>
        <button className="btn-outline" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> Làm mới</button></div>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}

      {operator && <section className="appointment-panel hotlines-editor">
        <h2>{editingId ? 'Cập nhật liên hệ' : 'Thêm đường dây nóng'}</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void save(event)}>
          <label>Tên kênh hỗ trợ<input required minLength={3} maxLength={120} value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Đơn vị phụ trách<input required minLength={3} maxLength={120} value={form.unit}
            onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
          <label>Số điện thoại<input required type="tel" pattern="\+?[0-9][0-9\s().-]{4,22}" value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Khu vực<input maxLength={120} value={form.area}
            onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
          <label>Giờ trực<input maxLength={120} value={form.hours}
            onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Mô tả<textarea maxLength={500} rows={3} value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="hotlines-active"><input type="checkbox" checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Hiển thị cho người dân</label>
          <div className="appointment-actions"><button className="btn-primary" type="submit" disabled={busy}>Lưu liên hệ</button>
            {editingId && <button className="btn-outline" type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Hủy sửa</button>}</div>
        </form>
      </section>}

      <div className="hotlines-list-heading"><h2>Liên hệ hỗ trợ</h2>
        <label>Tìm theo tên, đơn vị, khu vực hoặc số<input value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {loading && items.length === 0 && <p>Đang tải danh bạ…</p>}
      {!loading && visible.length === 0 && <p>Chưa có liên hệ phù hợp.</p>}
      <section className="hotlines-grid" aria-label="Danh bạ đường dây nóng">{visible.map((item) =>
        <article className="hotline-card" key={item.id}>
          <div className="hotline-card-heading"><h3>{item.name}</h3>
            {operator && <span className={item.active ? 'hotline-active-tag' : 'hotline-inactive-tag'}>{item.active ? 'Đang hiển thị' : 'Đã ẩn'}</span>}</div>
          <p className="hotline-unit">{item.unit}</p>
          {item.area && <p>Khu vực: {item.area}</p>}
          {item.hours && <p>Giờ trực: {item.hours}</p>}
          {item.description && <p>{item.description}</p>}
          <div className="hotline-actions"><a className="btn-primary" href={`tel:${item.phone.replace(/[^\d+]/g, '')}`}><PhoneCall size={16} /> {item.phone}</a>
            {operator && <button className="btn-outline" type="button" onClick={() => edit(item)}>Chỉnh sửa</button>}</div>
        </article>)}</section>
    </>}
  </div>;
}

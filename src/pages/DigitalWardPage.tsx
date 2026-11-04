// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type DigitalWard } from '../lib/api';
import { canManage, canOpenFeature } from '../lib/permissions';

const endpoint = '/api/opencity/digital-wards';
const emptyForm = { code: '', name: '', address: '', phone: '', office_hours: '',
  description: '', latitude: '', longitude: '', active: true };

export function DigitalWardPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'digital_ward');
  const [wards, setWards] = useState<DigitalWard[]>([]);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try { setWards(await request<DigitalWard[]>(endpoint, token)); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được thông tin xã/phường.'); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => wards.filter((ward) => {
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return !needle || [ward.code, ward.name, ward.address].some((value) => value.toLocaleLowerCase('vi-VN').includes(needle));
  }), [wards, query]);

  function edit(ward: DigitalWard) {
    setEditingId(ward.id);
    setForm({ code: ward.code, name: ward.name, address: ward.address, phone: ward.phone,
      office_hours: ward.office_hours, description: ward.description,
      latitude: ward.latitude?.toString() || '', longitude: ward.longitude?.toString() || '', active: ward.active });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!operator || !token || busy) return;
    const hasLat = form.latitude.trim() !== ''; const hasLon = form.longitude.trim() !== '';
    if (hasLat !== hasLon) { setError('Cần nhập cả vĩ độ và kinh độ, hoặc để trống cả hai.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await request<DigitalWard>(editingId ? `${endpoint}/${encodeURIComponent(editingId)}` : endpoint, token, {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, latitude: hasLat ? Number(form.latitude) : null,
          longitude: hasLon ? Number(form.longitude) : null }),
      });
      setForm(emptyForm); setEditingId(null); await refresh(); setNotice('Đã lưu thông tin xã/phường.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được thông tin.'); }
    finally { setBusy(false); }
  }

  return <div className="page-width hotlines-page">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Xã/phường số</span></div>
    <div className="page-intro-banner"><div className="intro-text-col"><p className="intro-eyebrow">DỊCH VỤ CẤP CƠ SỞ</p>
      <h1 className="intro-headline">Xã/phường số</h1>
      <p className="intro-paragraph">Tra cứu điểm phục vụ, giờ làm việc và liên hệ do đơn vị vận hành công bố.</p>
    </div></div>
    {!user ? <section className="appointment-panel"><h2>Đăng nhập để tra cứu</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {operator && <section className="appointment-panel"><h2>{editingId ? 'Cập nhật điểm phục vụ' : 'Thêm điểm phục vụ'}</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void save(event)}>
          <label>Mã xã/phường<input required pattern="[A-Za-z0-9_-]{2,24}" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
          <label>Tên xã/phường<input required minLength={3} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Địa chỉ<input required minLength={5} maxLength={200} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label>Số điện thoại<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Giờ làm việc<input required minLength={3} maxLength={160} value={form.office_hours} onChange={(event) => setForm({ ...form, office_hours: event.target.value })} /></label>
          <label>Vĩ độ<input type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} /></label>
          <label>Kinh độ<input type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Giới thiệu<textarea required minLength={20} maxLength={2000} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Hiển thị cho người dân</label>
          <button className="btn-primary" type="submit" disabled={busy}>Lưu điểm phục vụ</button>
          {editingId && <button className="btn-outline" type="button" onClick={() => { setEditingId(null); setForm(emptyForm); }}>Hủy sửa</button>}
        </form></section>}
      <section className="appointment-panel"><label>Tìm xã/phường<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã hoặc địa chỉ" /></label></section>
      {visible.length === 0 ? <section className="appointment-panel">Chưa có điểm phục vụ phù hợp.</section> :
        <div className="form-grid-two">{visible.map((ward) => <article key={ward.id} className="appointment-panel">
          <h2>{ward.name}</h2>{operator && !ward.active && <p>Đang ẩn với người dân</p>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{ward.description}</p>
          <p>Địa chỉ: {ward.address}</p><p>Giờ làm việc: {ward.office_hours}</p>
          <p>Liên hệ: <a href={`tel:${ward.phone.replace(/[^\d+]/g, '')}`}>{ward.phone}</a></p>
          {ward.latitude !== null && ward.longitude !== null && <a target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${ward.latitude}&mlon=${ward.longitude}#map=17/${ward.latitude}/${ward.longitude}`}>Xem vị trí trên bản đồ</a>}
          <div className="appointment-actions">
            {canOpenFeature(user, 'appointments') && <Link to="/appointments">Đặt lịch</Link>}
            {canOpenFeature(user, 'administrative_feedback') && <Link to="/administrative-feedback">Phản ánh thủ tục</Link>}
            {canOpenFeature(user, 'hotlines') && <Link to="/hotlines">Đường dây nóng</Link>}
          </div>
          {operator && <button className="btn-outline" type="button" onClick={() => edit(ward)}>Chỉnh sửa</button>}
        </article>)}</div>}
    </>}
  </div>;
}

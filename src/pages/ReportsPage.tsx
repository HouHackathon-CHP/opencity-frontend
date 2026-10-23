// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Camera, CheckCircle2, Clock3, Crosshair, FileText, LoaderCircle, MapPin, Plus, RefreshCw, Send, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { rolesOf } from '../lib/auth';
import { downloadAttachment, reportStates, request, type Report } from '../lib/api';

const types = ['Hạ tầng', 'Môi trường', 'Giao thông', 'Chiếu sáng', 'Cây xanh', 'Khác'];
const actions: Record<string, { key: string; text: string }> = {
  submitted: { key: 'triage', text: 'Tiếp nhận phản ánh' },
  triaged: { key: 'assign', text: 'Chuyển xử lý' },
  assigned: { key: 'resolve', text: 'Xác nhận hoàn tất' },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Status({ state }: { state: string | null }) {
  return <span className={`report-status state-${state || 'none'}`}><span className="status-dot" />{state ? reportStates[state] || state : 'Chưa có quy trình'}</span>;
}

function Photo({ reportId, objectId, token }: { reportId: string; objectId: string; token: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let url = '';
    let active = true;
    downloadAttachment(reportId, objectId, token).then((blob) => {
      url = URL.createObjectURL(blob);
      if (active) setSrc(url);
      else URL.revokeObjectURL(url);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [reportId, objectId, token]);
  if (error) return <div className="photo-error">Không tải được ảnh</div>;
  return src ? <img className="report-photo" src={src} alt="Ảnh người dân đính kèm phản ánh" /> : <div className="photo-loading"><LoaderCircle className="spin" size={18} /> Đang tải ảnh</div>;
}

export function ReportsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const isOperator = rolesOf(user).some((role) => role === 'operator' || role === 'admin');
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(types[0]);
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try {
      setReports(await request<Report[]>('/api/opencity/reports', token));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu từ OpenCity API.'); }
    finally { setLoading(false); }
  }, [token]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    try { setDetail(await request<Report>(`/api/opencity/reports/${encodeURIComponent(id)}`, token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết phản ánh.'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    setDetail(null);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 10 * 1024 * 1024)) {
      setError('Ảnh cần là JPEG, PNG hoặc WebP và không quá 10 MB.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData();
      form.append('title', title.trim()); form.append('description', description.trim());
      form.append('category', category); form.append('address', address.trim());
      if (coordinates) { form.append('latitude', String(coordinates.latitude)); form.append('longitude', String(coordinates.longitude)); }
      if (photo) form.append('photo', photo);
      const result = await request<Report>('/api/opencity/reports', token, { method: 'POST', body: form });
      setNotice(`Đã lưu phản ánh ${result.id.slice(0, 8)}.${result.warnings?.length ? ` ${result.warnings.join(' ')}` : ' Quy trình xử lý đã bắt đầu.'}`);
      setShowForm(false); setTitle(''); setDescription(''); setAddress(''); setCoordinates(null); setPhoto(null);
      await refresh(); setSelectedId(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể gửi phản ánh.'); }
    finally { setBusy(false); }
  }

  async function takeAction(action: string) {
    if (!detail || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`/api/opencity/reports/${encodeURIComponent(detail.id)}/actions/${action}`, token, { method: 'POST' });
      setNotice('Trạng thái đã được cập nhật và ghi vào lịch sử quy trình.');
      await refresh(); await loadDetail(detail.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật quy trình.'); }
    finally { setBusy(false); }
  }

  async function retryWorkflow() {
    if (!detail || detail.workflow_id || !token || busy) return;
    setBusy(true); setError('');
    try {
      await request(`/api/opencity/reports/${encodeURIComponent(detail.id)}/retry-workflow`, token, { method: 'POST' });
      setNotice('Quy trình xử lý đã được khởi tạo.');
      await refresh(); await loadDetail(detail.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể khởi tạo quy trình.'); }
    finally { setBusy(false); }
  }

  function locate() {
    if (!navigator.geolocation) { setError('Trình duyệt không hỗ trợ vị trí.'); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setError(''); },
      () => setError('Không lấy được vị trí. Bạn vẫn có thể nhập địa chỉ thủ công.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return <div className="reports-page page-width">
    <div className="breadcrumb"><Link to="/">Danh mục</Link><ArrowRight size={14} /> Phản ánh hiện trường</div>
    <div className="reports-intro"><div><span className="kicker">KÊNH TƯƠNG TÁC ĐÔ THỊ</span><h1>Phản ánh hiện trường</h1><p>Gửi một vấn đề bạn thấy trong khu vực và theo dõi từng bước xử lý minh bạch.</p></div><div className="reports-intro-icon"><MapPin size={42} /></div></div>
    {!user ? <section className="login-prompt"><div className="login-prompt-icon"><ShieldCheck size={30} /></div><div><h2>{authLoading ? 'Đang kiểm tra phiên đăng nhập…' : 'Đăng nhập để bắt đầu'}</h2><p>Dùng tài khoản DX-OS để gửi phản ánh, xem hồ sơ của bạn và nhận kết quả xử lý.</p></div><button type="button" onClick={() => void login()} disabled={authLoading}>Đăng nhập <ArrowRight size={17} /></button></section> : <>
      <div className="reports-toolbar"><div><h2>{isOperator ? 'Danh sách phản ánh' : 'Phản ánh của tôi'}</h2><p>{isOperator ? 'Hồ sơ trong đơn vị bạn có quyền xử lý.' : 'Chỉ bạn và cán bộ có thẩm quyền xem được hồ sơ này.'}</p></div><div className="toolbar-actions"><button className="refresh-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} /> Làm mới</button><button className="new-report-button" type="button" onClick={() => { setShowForm(true); setSelectedId(null); }}><Plus size={18} /> Tạo phản ánh</button></div></div>
      {error && <div className="alert error"><TriangleAlert size={18} /> {error}<button onClick={() => setError('')} type="button" aria-label="Đóng thông báo"><X size={16} /></button></div>}
      {notice && <div className="alert success"><CheckCircle2 size={18} /> {notice}<button onClick={() => setNotice('')} type="button" aria-label="Đóng thông báo"><X size={16} /></button></div>}
      {showForm && <section className="report-form-card"><div className="form-heading"><div><span className="kicker">PHẢN ÁNH MỚI</span><h2>Cho chúng tôi biết điều đang xảy ra</h2></div><button className="icon-button" aria-label="Đóng biểu mẫu" type="button" onClick={() => setShowForm(false)}><X size={20} /></button></div><form onSubmit={(event) => void submit(event)}><div className="form-row"><label>Tiêu đề <span>*</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} minLength={5} required placeholder="Ví dụ: Đèn đường không hoạt động" /></label><label>Lĩnh vực <span>*</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></label></div><label>Mô tả chi tiết <span>*</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={15} maxLength={2000} rows={5} required placeholder="Mô tả tình trạng, thời điểm và ảnh hưởng..." /></label><label>Địa chỉ hoặc vị trí gần nhất <span>*</span><input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={250} required placeholder="Số nhà, tuyến đường, phường/xã..." /></label><div className="form-extras"><button className="location-button" type="button" onClick={locate}><Crosshair size={18} /> {coordinates ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : 'Thêm vị trí hiện tại'}</button><label className="photo-picker"><Camera size={18} /> {photo ? photo.name : 'Đính kèm ảnh (tối đa 10 MB)'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} /></label></div><div className="form-footer"><p>Thông tin được lưu trong phạm vi đơn vị; ảnh chỉ người có quyền xem được.</p><button type="submit" disabled={busy}><Send size={17} /> {busy ? 'Đang gửi…' : 'Gửi phản ánh'}</button></div></form></section>}
      <div className="reports-layout"><div className="report-list">{loading && !reports.length ? <div className="report-empty"><LoaderCircle className="spin" size={25} /> Đang tải phản ánh…</div> : reports.length ? reports.map((report) => <button type="button" key={report.id} className={`report-list-item ${selectedId === report.id ? 'selected' : ''}`} onClick={() => { setSelectedId(report.id); setShowForm(false); }}><div className="report-item-top"><span className="report-type">{report.category}</span><Status state={report.state} /></div><strong>{report.title}</strong><p><MapPin size={14} /> {report.address}</p><small><Clock3 size={14} /> {formatDate(report.created_at)}</small></button>) : <div className="report-empty"><FileText size={30} /><h3>Chưa có phản ánh</h3><p>{isOperator ? 'Các phản ánh thuộc đơn vị sẽ xuất hiện ở đây.' : 'Bạn có thể gửi phản ánh đầu tiên ngay bây giờ.'}</p></div>}</div>
      <div className="report-detail">{detail ? <><div className="detail-top"><span className="kicker">HỒ SƠ #{detail.id.slice(0, 8).toUpperCase()}</span><Status state={detail.state} /></div><h2>{detail.title}</h2><p className="detail-description">{detail.description}</p><div className="detail-meta"><div><span>Lĩnh vực</span><strong>{detail.category}</strong></div><div><span>Vị trí</span><strong>{detail.address}</strong></div><div><span>Thời gian gửi</span><strong>{formatDate(detail.created_at)}</strong></div>{detail.latitude != null && detail.longitude != null && <div><span>Tọa độ</span><a href={`https://www.openstreetmap.org/?mlat=${detail.latitude}&mlon=${detail.longitude}#map=17/${detail.latitude}/${detail.longitude}`} target="_blank" rel="noreferrer">Xem trên bản đồ <ArrowRight size={14} /></a></div>}</div>{detail.attachment_ids.length > 0 && <div className="detail-section"><h3>Ảnh đính kèm</h3><div className="photo-grid">{detail.attachment_ids.map((id) => <Photo reportId={detail.id} objectId={id} token={token} key={id} />)}</div></div>}<div className="detail-section"><h3>Lịch sử xử lý</h3>{detail.history.length ? <ol className="timeline">{detail.history.map((event, index) => <li key={`${event.action}-${index}`}><span className="timeline-node" /><strong>{event.action === 'start' ? 'Đã gửi phản ánh' : reportStates[event.to_state] || event.to_state}</strong><small>{formatDate(event.created_at)}</small></li>)}</ol> : <p className="muted">Quy trình xử lý chưa khởi tạo.</p>}</div>{!detail.workflow_id && <button className="detail-action" type="button" onClick={() => void retryWorkflow()} disabled={busy}><RefreshCw size={17} /> Khởi tạo quy trình xử lý</button>}{isOperator && detail.state && actions[detail.state] && <button className="detail-action" type="button" onClick={() => void takeAction(actions[detail.state!].key)} disabled={busy}><CheckCircle2 size={17} /> {busy ? 'Đang cập nhật…' : actions[detail.state].text}</button>}</> : <div className="detail-placeholder"><div><MapPin size={33} /></div><h3>Chọn một phản ánh</h3><p>Thông tin, ảnh và lịch sử xử lý sẽ hiện ở đây.</p></div>}</div></div>
    </>}
  </div>;
}

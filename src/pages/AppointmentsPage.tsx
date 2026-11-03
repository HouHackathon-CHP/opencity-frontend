// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, Clock3, MapPin, Plus, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type Appointment, type AppointmentSlot } from '../lib/api';
import { canManage } from '../lib/permissions';

const base = '/api/opencity/appointments';
const statusName: Record<Appointment['status'], string> = {
  pending: 'Chờ xác nhận', confirmed: 'Đã xác nhận', rejected: 'Đã từ chối', cancelled: 'Đã hủy',
};
const formatTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export function AppointmentsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'appointments');
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [reason, setReason] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [available, requests] = await Promise.all([
        request<AppointmentSlot[]>(`${base}/slots`, token),
        request<Appointment[]>(base, token),
      ]);
      setSlots(available);
      setAppointments(requests);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được lịch tiếp công dân.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !operator || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<AppointmentSlot>(`${base}/slots`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString(),
          location: location.trim(), capacity,
        }),
      });
      setStart(''); setEnd(''); setLocation(''); setCapacity(1);
      setNotice('Đã mở khung giờ tiếp công dân.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tạo được khung giờ.');
    } finally { setBusy(false); }
  }

  async function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedSlot || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<Appointment>(base, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_id: selectedSlot, reason: reason.trim() }),
      });
      setSelectedSlot(''); setReason('');
      setNotice('Đã gửi yêu cầu. Bạn sẽ thấy trạng thái sau khi cán bộ xem xét.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được yêu cầu.');
    } finally { setBusy(false); }
  }

  async function decide(id: string, decision: 'confirmed' | 'rejected') {
    if (!token || !operator || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<Appointment>(`${base}/${encodeURIComponent(id)}/decision`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewNotes[id] || '' }),
      });
      setNotice(decision === 'confirmed' ? 'Đã xác nhận lịch hẹn.' : 'Đã từ chối yêu cầu.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không cập nhật được yêu cầu.');
    } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (!token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<Appointment>(`${base}/${encodeURIComponent(id)}/cancel`, token, { method: 'POST' });
      setNotice('Đã hủy yêu cầu của bạn.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không hủy được yêu cầu.');
    } finally { setBusy(false); }
  }

  return (
    <div className="appointments-page page-width">
      <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Tiếp công dân</span></div>
      <div className="page-intro-banner">
        <div className="intro-text-col">
          <p className="intro-eyebrow">KÊNH TIẾP CÔNG DÂN OPENCITY</p>
          <h1 className="intro-headline">Đăng ký tiếp công dân</h1>
          <p className="intro-paragraph">Chọn khung giờ, gửi nội dung cần trao đổi và theo dõi xác nhận. Đây là lịch thử nghiệm trong OpenCity, chưa kết nối hệ thống tiếp dân chính thức.</p>
        </div>
        <CalendarDays size={48} aria-hidden="true" />
      </div>

      {!user ? (
        <section className="appointment-panel">
          <h2>Đăng nhập để xem và đăng ký lịch</h2>
          <p>Yêu cầu và lịch hẹn được gắn với tài khoản DX-OS của bạn.</p>
          <button className="btn-primary" type="button" onClick={() => void login()} disabled={authLoading}>Đăng nhập</button>
        </section>
      ) : (
        <>
          <div className="appointment-toolbar">
            <p>{operator ? 'Quản lý khung giờ và duyệt yêu cầu trong đơn vị.' : 'Chọn một khung giờ còn chỗ để gửi yêu cầu.'}</p>
            <button className="btn-outline" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} /> Làm mới</button>
          </div>
          {error && <div className="alert-box alert-error" role="alert">{error}</div>}
          {notice && <div className="alert-box alert-success" role="status">{notice}</div>}

          {operator && (
            <section className="appointment-panel">
              <h2><Plus size={20} /> Mở khung giờ</h2>
              <form className="appointment-form" onSubmit={(event) => void createSlot(event)}>
                <label>Bắt đầu<input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
                <label>Kết thúc<input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required /></label>
                <label>Địa điểm<input value={location} onChange={(event) => setLocation(event.target.value)} minLength={3} maxLength={200} required placeholder="Ví dụ: Phòng tiếp dân thử nghiệm" /></label>
                <label>Số chỗ<input type="number" min="1" max="20" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} required /></label>
                <button className="btn-primary" type="submit" disabled={busy}>Tạo khung giờ</button>
              </form>
            </section>
          )}

          <div className="appointment-layout">
            <section className="appointment-panel">
              <h2>Khung giờ sắp tới</h2>
              {loading && slots.length === 0 && <p>Đang tải lịch…</p>}
              {!loading && slots.length === 0 && <p>Chưa có khung giờ tiếp công dân.</p>}
              <div className="appointment-list">
                {slots.map((slot) => (
                  <article className="appointment-item" key={slot.id}>
                    <strong><Clock3 size={16} /> {formatTime(slot.starts_at)} – {new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short' }).format(new Date(slot.ends_at))}</strong>
                    <span><MapPin size={15} /> {slot.location}</span>
                    <small>Còn {slot.remaining_capacity}/{slot.capacity} chỗ đã xác nhận</small>
                    {!operator && <button className="btn-outline" type="button" disabled={slot.remaining_capacity < 1} onClick={() => setSelectedSlot(slot.id)}>Chọn khung giờ</button>}
                  </article>
                ))}
              </div>
            </section>

            {!operator && selectedSlot && (
              <section className="appointment-panel">
                <h2>Nội dung đề nghị tiếp</h2>
                <form className="appointment-form" onSubmit={(event) => void book(event)}>
                  <label>Trình bày ngắn gọn nội dung<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} rows={5} required /></label>
                  <p>Yêu cầu chỉ được xác nhận sau khi cán bộ phụ trách xem xét.</p>
                  <button className="btn-primary" type="submit" disabled={busy}>Gửi yêu cầu</button>
                </form>
              </section>
            )}

            <section className="appointment-panel">
              <h2>{operator ? 'Yêu cầu cần xử lý' : 'Lịch hẹn của tôi'}</h2>
              {appointments.length === 0 && <p>Chưa có yêu cầu nào.</p>}
              <div className="appointment-list">
                {appointments.map((item) => (
                  <article className="appointment-item" key={item.id}>
                    <div className="appointment-item-heading"><strong>{formatTime(item.starts_at)}</strong><span className={`appointment-status status-${item.status}`}>{statusName[item.status]}</span></div>
                    <span><MapPin size={15} /> {item.location}</span>
                    {operator && <small>Người gửi: {item.user_id}</small>}
                    <p>{item.reason}</p>
                    {item.review_note && <small>Phản hồi: {item.review_note}</small>}
                    {operator && item.status === 'pending' && (
                      <div className="appointment-actions">
                        <input aria-label="Ghi chú duyệt hoặc lý do từ chối" placeholder="Ghi chú / lý do từ chối" value={reviewNotes[item.id] || ''} onChange={(event) => setReviewNotes({ ...reviewNotes, [item.id]: event.target.value })} maxLength={500} />
                        <button className="btn-primary" type="button" disabled={busy} onClick={() => void decide(item.id, 'confirmed')}><Check size={16} /> Xác nhận</button>
                        <button className="btn-outline" type="button" disabled={busy} onClick={() => void decide(item.id, 'rejected')}><X size={16} /> Từ chối</button>
                      </div>
                    )}
                    {!operator && (item.status === 'pending' || item.status === 'confirmed') && new Date(item.starts_at).getTime() > Date.now() && (
                      <button className="btn-outline" type="button" disabled={busy} onClick={() => void cancel(item.id)}>Hủy yêu cầu</button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { rolesOf } from '../lib/auth';
import { request, type SurveyDetail, type SurveySummary } from '../lib/api';

const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function SurveysPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = rolesOf(user).some(role => role === 'operator' || role === 'admin');
  const [items, setItems] = useState<SurveySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SurveyDetail | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try { setItems(await request<SurveySummary[]>('/api/opencity/surveys', token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được khảo sát.'); }
    finally { setLoading(false); }
  }, [token]);

  const loadDetail = useCallback(async (id: string) => {
    if (!token) return;
    try { setDetail(await request<SurveyDetail>(`/api/opencity/surveys/${encodeURIComponent(id)}`, token)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được chi tiết khảo sát.'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { setDetail(null); setChoice(null); if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !operator || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<SurveyDetail>('/api/opencity/surveys', token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), options: options.map(value => value.trim()) }),
      });
      setShowForm(false); setTitle(''); setDescription(''); setOptions(['', '']);
      setNotice('Đã công bố khảo sát cho người dùng trong đơn vị.');
      await refresh(); setSelectedId(created.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được khảo sát.'); }
    finally { setBusy(false); }
  }

  async function answer() {
    if (!token || !detail || !choice || busy || detail.status !== 'open' || detail.my_option_id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await request<SurveyDetail>(`/api/opencity/surveys/${encodeURIComponent(detail.id)}/answers`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_id: choice }),
      });
      setDetail(updated); setNotice('Đã ghi nhận ý kiến của bạn.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được ý kiến.'); }
    finally { setBusy(false); }
  }

  async function closeSurvey() {
    if (!token || !detail || !operator || busy || detail.status !== 'open') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await request<SurveyDetail>(`/api/opencity/surveys/${encodeURIComponent(detail.id)}/close`, token, { method: 'POST' });
      setDetail(updated); setNotice('Đã đóng khảo sát.'); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đóng được khảo sát.'); }
    finally { setBusy(false); }
  }

  return <div className="surveys-page page-width">
    <div className="breadcrumb"><Link to="/">Danh mục</Link><ArrowRight size={14} /> Khảo sát ý kiến</div>
    <div className="reports-intro"><div><span className="kicker">TƯƠNG TÁC CỘNG ĐỒNG</span><h1>Khảo sát ý kiến</h1><p>Mỗi tài khoản chọn một phương án. Kết quả hiện sau khi trả lời hoặc khi khảo sát đóng.</p></div><div className="reports-intro-icon"><ClipboardList size={42} /></div></div>
    {!user ? <section className="login-prompt"><div className="login-prompt-icon"><LockKeyhole size={28} /></div><div><h2>{authLoading ? 'Đang kiểm tra phiên…' : 'Đăng nhập để tham gia'}</h2><p>Khảo sát và câu trả lời được giới hạn trong đơn vị của bạn.</p></div><button type="button" onClick={() => void login()} disabled={authLoading}>Đăng nhập <ArrowRight size={17} /></button></section> : <>
      <div className="reports-toolbar"><div><h2>{operator ? 'Quản lý khảo sát' : 'Khảo sát trong đơn vị'}</h2><p>Ý kiến được tổng hợp theo phương án, không hiển thị người trả lời.</p></div><div className="toolbar-actions"><button className="refresh-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} /> Làm mới</button>{operator && <button className="new-report-button" type="button" onClick={() => setShowForm(value => !value)}><Plus size={17} /> Tạo khảo sát</button>}</div></div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status"><CheckCircle2 size={17} /> {notice}</div>}
      {operator && showForm && <section className="report-form-card survey-form"><h2>Tạo khảo sát mới</h2><form onSubmit={(event) => void create(event)}>
        <label>Tiêu đề<input value={title} onChange={event => setTitle(event.target.value)} minLength={5} maxLength={160} required placeholder="Ví dụ: Ưu tiên cải thiện không gian công cộng" /></label>
        <label>Mô tả<textarea value={description} onChange={event => setDescription(event.target.value)} minLength={20} maxLength={2000} rows={4} required placeholder="Mục đích khảo sát và phạm vi lấy ý kiến" /></label>
        <div className="survey-option-fields"><strong>Phương án (2–8)</strong>{options.map((option, index) => <label key={index}>Phương án {index + 1}<input value={option} onChange={event => setOptions(values => values.map((value, position) => position === index ? event.target.value : value))} maxLength={120} required /></label>)}</div>
        <div className="survey-form-actions">{options.length < 8 && <button className="refresh-button" type="button" onClick={() => setOptions(values => [...values, ''])}>Thêm phương án</button>}{options.length > 2 && <button className="refresh-button" type="button" onClick={() => setOptions(values => values.slice(0, -1))}>Bớt phương án</button>}<button className="new-report-button" type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Công bố khảo sát'}</button></div>
      </form></section>}
      <div className="reports-layout"><div className="report-list">{loading && !items.length ? <div className="report-empty">Đang tải khảo sát…</div> : items.length ? items.map(item => <button key={item.id} type="button" className={`report-list-item ${selectedId === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}><div className="report-item-top"><span className="report-type">{item.status === 'closed' ? 'Đã đóng' : item.my_option_id ? 'Đã trả lời' : 'Đang nhận ý kiến'}</span></div><strong>{item.title}</strong><p>{item.description}</p><small>{formatDate(item.created_at)}</small></button>) : <div className="report-empty"><ClipboardList size={30} /><h3>Chưa có khảo sát</h3><p>{operator ? 'Tạo khảo sát đầu tiên để bắt đầu lấy ý kiến.' : 'Quay lại khi đơn vị công bố khảo sát.'}</p></div>}</div>
      <section className="report-detail survey-detail">{detail ? <><div className="detail-top"><span className="kicker">{detail.status === 'closed' ? 'ĐÃ ĐÓNG' : 'ĐANG NHẬN Ý KIẾN'}</span><span className="muted">{formatDate(detail.created_at)}</span></div><h2>{detail.title}</h2><p className="detail-description">{detail.description}</p><h3>{detail.total_responses === null ? 'Chọn một phương án' : 'Kết quả khảo sát'}</h3><div className="survey-options">{detail.options.map(option => {
        const selected = detail.my_option_id === option.id || (!detail.my_option_id && choice === option.id);
        const percent = detail.total_responses ? Math.round((option.votes || 0) * 100 / detail.total_responses) : 0;
        return <button key={option.id} className={`survey-option ${selected ? 'selected' : ''}`} type="button" disabled={detail.total_responses !== null || detail.status === 'closed'} onClick={() => setChoice(option.id)} aria-pressed={selected}><strong>{option.label}{detail.my_option_id === option.id ? ' ✓' : ''}</strong>{option.votes !== null && <><span className="survey-bar"><span style={{ width: `${percent}%` }} /></span><small>{option.votes} ý kiến · {percent}%</small></>}</button>;
      })}</div>{detail.total_responses !== null && <p className="muted">Tổng cộng {detail.total_responses} ý kiến.</p>}{!detail.my_option_id && detail.status === 'open' && detail.total_responses === null && <button className="detail-action" type="button" disabled={!choice || busy} onClick={() => void answer()}>Gửi ý kiến</button>}{operator && detail.status === 'open' && <button className="refresh-button survey-close" type="button" disabled={busy} onClick={() => void closeSurvey()}>Đóng khảo sát</button>}</> : <div className="detail-placeholder"><div><ClipboardList size={33} /></div><h3>Chọn một khảo sát</h3><p>Nội dung và các phương án sẽ hiện ở đây.</p></div>}</section></div>
    </>}
  </div>;
}

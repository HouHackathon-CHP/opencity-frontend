// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type ConsultationOpinion, type ConsultationTopic } from '../lib/api';
import { canManage } from '../lib/permissions';

const endpoint = '/api/opencity/social-feedback/topics';

export function SocialFeedbackPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'social_feedback');
  const [topics, setTopics] = useState<ConsultationTopic[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [opinions, setOpinions] = useState<ConsultationOpinion[]>([]);
  const [form, setForm] = useState({ title: '', description: '', area: '' });
  const [opinionBody, setOpinionBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await request<ConsultationTopic[]>(endpoint, token);
      setTopics(data);
      setSelectedId((current) => current && data.some((topic) => topic.id === current) ? current : data[0]?.id || '');
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được chủ đề góp ý.'); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);
  const selected = topics.find((topic) => topic.id === selectedId);
  useEffect(() => { setOpinionBody(selected?.my_opinion?.body || ''); }, [selectedId, selected?.my_opinion?.body]);
  useEffect(() => {
    if (!operator || !token || !selectedId) { setOpinions([]); return; }
    let active = true;
    void request<ConsultationOpinion[]>(`${endpoint}/${encodeURIComponent(selectedId)}/opinions`, token)
      .then((data) => { if (active) setOpinions(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được ý kiến.'); });
    return () => { active = false; };
  }, [operator, token, selectedId, selected?.opinion_count]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!operator || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<ConsultationTopic>(endpoint, token, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, area: form.area.trim() || null }) });
      setForm({ title: '', description: '', area: '' }); await refresh();
      setSelectedId(created.id); setNotice('Đã mở chủ đề lấy ý kiến.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không mở được chủ đề.'); }
    finally { setBusy(false); }
  }

  async function submitOpinion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !token || busy || selected.status !== 'open') return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${endpoint}/${encodeURIComponent(selected.id)}/opinion`, token, { method: 'PUT',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: opinionBody.trim() }) });
      await refresh(); setNotice('Đã lưu ý kiến của bạn. Bạn có thể sửa khi chủ đề còn mở.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được ý kiến.'); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!operator || !selected || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${endpoint}/${encodeURIComponent(selected.id)}/close`, token, { method: 'POST' });
      await refresh(); setNotice('Đã đóng chủ đề.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đóng được chủ đề.'); }
    finally { setBusy(false); }
  }

  return <div className="page-width hotlines-page">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Góp ý, phản biện xã hội</span></div>
    <div className="page-intro-banner"><div className="intro-text-col"><p className="intro-eyebrow">LẮNG NGHE CỘNG ĐỒNG</p>
      <h1 className="intro-headline">Góp ý, phản biện xã hội</h1><p className="intro-paragraph">Đóng góp ý kiến cho các chủ đề do đơn vị vận hành trong địa bàn mở.</p>
    </div></div>
    {!user ? <section className="appointment-panel"><h2>Đăng nhập để góp ý</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {operator && <section className="appointment-panel"><h2>Mở chủ đề lấy ý kiến</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void create(event)}>
          <label>Tiêu đề<input required minLength={5} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Khu vực<input maxLength={120} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Nội dung chủ đề<textarea required minLength={20} maxLength={5000} rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <button className="btn-primary" type="submit" disabled={busy}>Mở chủ đề</button>
        </form></section>}
      {topics.length === 0 ? <section className="appointment-panel">Chưa có chủ đề lấy ý kiến.</section> :
        <div className="form-grid-two"><section className="appointment-panel"><h2>Chủ đề</h2>
          {topics.map((topic) => <button key={topic.id} type="button" className="btn-outline" aria-pressed={topic.id === selectedId}
            onClick={() => setSelectedId(topic.id)}>{topic.title} · {topic.status === 'open' ? 'Đang mở' : 'Đã đóng'} · {topic.opinion_count} ý kiến</button>)}
        </section><section className="appointment-panel" aria-live="polite">{selected && <>
          <h2>{selected.title}</h2><p style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</p>
          {selected.area && <p>Khu vực: {selected.area}</p>}
          <p>{selected.opinion_count} ý kiến · {selected.status === 'open' ? 'Đang tiếp nhận' : 'Đã kết thúc'}</p>
          {selected.status === 'open' && <form onSubmit={(event) => void submitOpinion(event)}>
            <label>Ý kiến của bạn<textarea required minLength={10} maxLength={3000} rows={5} value={opinionBody}
              onChange={(event) => setOpinionBody(event.target.value)} /></label>
            <button className="btn-primary" type="submit" disabled={busy}>Lưu ý kiến</button>
          </form>}
          {selected.status === 'closed' && selected.my_opinion && <p>Ý kiến của bạn: {selected.my_opinion.body}</p>}
          {operator && <><h3>Ý kiến đã gửi</h3>
            {selected.status === 'open' && <button type="button" className="btn-outline" disabled={busy} onClick={() => void close()}>Đóng chủ đề</button>}
            {opinions.length === 0 ? <p>Chưa có ý kiến.</p> : opinions.map((item) => <article key={item.id}>
              <strong>{item.user_id}</strong> · {new Date(item.updated_at).toLocaleString('vi-VN')}
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p></article>)}
          </>}
        </>}</section></div>}
    </>}
  </div>;
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ClipboardCheck, MessageSquareText, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type AdministrativeFeedback } from '../lib/api';
import { canManage } from '../lib/permissions';

const base = '/api/opencity/administrative-feedback';
const issues = {
  delay: 'Chậm xử lý', instructions: 'Hướng dẫn chưa rõ',
  conduct: 'Thái độ phục vụ', other: 'Vấn đề khác',
} as const;
const statuses: Record<AdministrativeFeedback['status'], string> = {
  submitted: 'Mới gửi', in_review: 'Đang xem xét',
  answered: 'Đã trả lời', closed: 'Đã kết thúc',
};
const actions: Record<string, string> = {
  submitted: 'Người dân đã gửi phản ánh', start_review: 'Cán bộ đã tiếp nhận',
  answer: 'Cán bộ đã trả lời', clarification: 'Người dân yêu cầu làm rõ',
  close: 'Người dân đã kết thúc hồ sơ',
};
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export function AdministrativeFeedbackPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'administrative_feedback');
  const [items, setItems] = useState<AdministrativeFeedback[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [procedure, setProcedure] = useState('');
  const [agency, setAgency] = useState('');
  const [issueType, setIssueType] = useState<AdministrativeFeedback['issue_type']>('delay');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = items.find((item) => item.id === selectedId) || null;

  const refresh = useCallback(async () => {
    if (!token) { setItems([]); return; }
    setLoading(true);
    try {
      const list = await request<AdministrativeFeedback[]>(base, token);
      setItems(list);
      setSelectedId((current) => current && list.some((item) => item.id === current) ? current : list[0]?.id || null);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được phản ánh thủ tục hành chính.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || operator || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<AdministrativeFeedback>(base, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), procedure: procedure.trim(),
          agency: agency.trim(), issue_type: issueType, description: description.trim() }),
      });
      setTitle(''); setProcedure(''); setAgency(''); setDescription('');
      await refresh(); setSelectedId(created.id);
      setNotice('Đã ghi nhận phản ánh. Bạn có thể theo dõi trạng thái tại đây.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được phản ánh.');
    } finally { setBusy(false); }
  }

  async function transition(action: 'review' | 'answer' | 'clarification' | 'close') {
    if (!token || !selected || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<AdministrativeFeedback>(`${base}/${encodeURIComponent(selected.id)}/${action}`, token, {
        method: 'POST', ...(action === 'answer' || action === 'clarification' ? {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }),
        } : {}),
      });
      setNote(''); await refresh();
      setNotice('Trạng thái hồ sơ đã được cập nhật.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không cập nhật được hồ sơ.');
    } finally { setBusy(false); }
  }

  return <div className="administrative-feedback-page page-width">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Phản ánh thủ tục hành chính</span></div>
    <div className="page-intro-banner"><div className="intro-text-col">
      <p className="intro-eyebrow">TIẾP NHẬN TRONG OPENCITY</p>
      <h1 className="intro-headline">Phản ánh thủ tục hành chính</h1>
      <p className="intro-paragraph">{operator
        ? 'Tiếp nhận, xem xét và trả lời ý kiến của người dân trong phạm vi đơn vị.'
        : 'Gửi góp ý về quy trình hoặc chất lượng phục vụ và theo dõi phản hồi của cán bộ.'}</p>
    </div><ClipboardCheck size={46} aria-hidden="true" /></div>

    {!user ? <section className="appointment-panel">
      <h2>Đăng nhập để gửi và theo dõi phản ánh</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      <div className="appointment-toolbar"><p>{operator ? 'Hồ sơ trong tenant của đơn vị' : 'Hồ sơ của bạn'}</p>
        <button type="button" className="btn-outline" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> Làm mới</button>
      </div>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {!operator && <section className="appointment-panel">
        <h2><MessageSquareText size={20} /> Gửi phản ánh mới</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void submit(event)}>
          <label>Tiêu đề<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={120} required /></label>
          <label>Thủ tục liên quan<input value={procedure} onChange={(event) => setProcedure(event.target.value)} minLength={3} maxLength={120} required placeholder="Ví dụ: Đăng ký kinh doanh" /></label>
          <label>Cơ quan, bộ phận tiếp nhận<input value={agency} onChange={(event) => setAgency(event.target.value)} minLength={3} maxLength={120} required /></label>
          <label>Nhóm vấn đề<select value={issueType} onChange={(event) => setIssueType(event.target.value as AdministrativeFeedback['issue_type'])}>
            {Object.entries(issues).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="administrative-feedback-wide">Nội dung<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={2000} rows={5} required /></label>
          <button className="btn-primary" type="submit" disabled={busy}>Gửi phản ánh <ArrowRight size={16} /></button>
        </form>
      </section>}
      <div className="administrative-feedback-layout">
        <section className="appointment-panel">
          <h2>{operator ? 'Hồ sơ cần xử lý' : 'Phản ánh của tôi'}</h2>
          {loading && items.length === 0 && <p>Đang tải hồ sơ…</p>}
          {!loading && items.length === 0 && <p>Chưa có phản ánh nào.</p>}
          <div className="administrative-feedback-list">{items.map((item) =>
            <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setNote(''); }}
              className={`administrative-feedback-item ${selectedId === item.id ? 'selected' : ''}`}>
              <span><strong>{item.title}</strong><small>{date(item.created_at)}</small></span>
              <span className={`appointment-status status-${item.status}`}>{statuses[item.status]}</span>
            </button>)}</div>
        </section>
        {selected && <section className="appointment-panel administrative-feedback-detail">
          <div className="appointment-item-heading"><h2>{selected.title}</h2><span className={`appointment-status status-${selected.status}`}>{statuses[selected.status]}</span></div>
          <p><strong>Thủ tục:</strong> {selected.procedure}</p>
          <p><strong>Bộ phận:</strong> {selected.agency}</p>
          {operator && <p><strong>Người gửi:</strong> {selected.user_id}</p>}
          <p><strong>Vấn đề:</strong> {issues[selected.issue_type]}</p>
          <p className="administrative-feedback-description">{selected.description}</p>
          {selected.response && <div className="administrative-feedback-response"><strong>Phản hồi gần nhất</strong><p>{selected.response}</p></div>}
          {operator && selected.status === 'submitted' && <button className="btn-primary" type="button" disabled={busy} onClick={() => void transition('review')}>Tiếp nhận xem xét</button>}
          {operator && selected.status === 'in_review' && <div className="administrative-feedback-action">
            <label>Trả lời người dân<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} rows={4} /></label>
            <button className="btn-primary" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('answer')}>Gửi trả lời</button>
          </div>}
          {!operator && selected.status === 'answered' && <div className="administrative-feedback-action">
            <label>Cần làm rõ thêm?<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} rows={3} /></label>
            <div className="appointment-actions"><button className="btn-outline" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('clarification')}>Yêu cầu làm rõ</button>
              <button className="btn-primary" type="button" disabled={busy} onClick={() => void transition('close')}>Đã rõ, kết thúc</button></div>
          </div>}
          <h3>Lịch sử xử lý</h3>
          <ol className="administrative-feedback-history">{selected.history.map((entry, index) => <li key={`${entry.created_at}-${index}`}>
            <strong>{actions[entry.action] || entry.action}</strong><small>{date(entry.created_at)}</small>
            {entry.note && <p>{entry.note}</p>}
          </li>)}</ol>
        </section>}
      </div>
    </>}
  </div>;
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type BusinessPetition } from '../lib/api';
import { canManage } from '../lib/permissions';

const base = '/api/opencity/business-feedback';
const emptyPetitions: BusinessPetition[] = [];
const sectors: Record<BusinessPetition['sector'], string> = {
  investment: 'Đầu tư', tax: 'Thuế', land: 'Đất đai',
  labor: 'Lao động', other: 'Lĩnh vực khác',
};
const statuses: Record<BusinessPetition['status'], string> = {
  submitted: 'Mới gửi', in_review: 'Đang xem xét', needs_info: 'Cần bổ sung',
  resolved: 'Đã trả lời', closed: 'Đã kết thúc',
};
const actions: Record<string, string> = {
  submitted: 'Đã gửi kiến nghị', review: 'Cán bộ đã tiếp nhận',
  request_info: 'Cán bộ yêu cầu bổ sung', provide_info: 'Doanh nghiệp đã bổ sung',
  resolve: 'Cán bộ đã trả lời', reopen: 'Doanh nghiệp đề nghị xem xét lại',
  close: 'Doanh nghiệp đã kết thúc hồ sơ',
};
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

type Action = 'review' | 'request-info' | 'provide-info' | 'resolve' | 'reopen' | 'close';

export function BusinessFeedbackPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'business_feedback');
  const [cache, setCache] = useState<{ token: string; items: BusinessPetition[] }>({ token: '', items: [] });
  const items = cache.token === token ? cache.items : emptyPetitions;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [representative, setRepresentative] = useState('');
  const [sector, setSector] = useState<BusinessPetition['sector']>('investment');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requestedResolution, setRequestedResolution] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const filtered = useMemo(() => items.filter((item) => {
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return (statusFilter === 'all' || item.status === statusFilter) &&
      (!needle || [item.title, item.company_name, item.tax_code]
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(needle)));
  }), [items, query, statusFilter]);
  const selected = filtered.find((item) => item.id === selectedId) || null;

  const refresh = useCallback(async () => {
    if (!token) { setCache({ token: '', items: [] }); return; }
    setLoading(true);
    try {
      const list = await request<BusinessPetition[]>(base, token);
      setCache({ token, items: list });
      setSelectedId((current) => current && list.some((item) => item.id === current)
        ? current : list[0]?.id || null);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được kiến nghị.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || operator || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<BusinessPetition>(base, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(), tax_code: taxCode.trim(),
          representative: representative.trim(), sector, title: title.trim(),
          description: description.trim(), requested_resolution: requestedResolution.trim(),
        }),
      });
      setTitle(''); setDescription(''); setRequestedResolution('');
      setQuery(''); setStatusFilter('all');
      await refresh(); setSelectedId(created.id);
      setNotice('Đã ghi nhận kiến nghị. Thông tin doanh nghiệp là tự khai và sẽ được cán bộ xem xét.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được kiến nghị.');
    } finally { setBusy(false); }
  }

  async function transition(action: Action) {
    if (!token || !selected || busy) return;
    const needsNote = action !== 'review' && action !== 'close';
    if (needsNote && note.trim().length < 10) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request<BusinessPetition>(`${base}/${encodeURIComponent(selected.id)}/${action}`, token, {
        method: 'POST', ...(needsNote ? {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }),
        } : {}),
      });
      setNote(''); await refresh();
      setNotice('Trạng thái kiến nghị đã được cập nhật.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không cập nhật được kiến nghị.');
    } finally { setBusy(false); }
  }

  return <div className="administrative-feedback-page business-feedback-page page-width">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Doanh nghiệp kiến nghị</span></div>
    <div className="page-intro-banner"><div className="intro-text-col">
      <p className="intro-eyebrow">KÊNH KIẾN NGHỊ DOANH NGHIỆP</p>
      <h1 className="intro-headline">Doanh nghiệp kiến nghị</h1>
      <p className="intro-paragraph">{operator
        ? 'Tiếp nhận, yêu cầu bổ sung và trả lời kiến nghị của doanh nghiệp trong phạm vi đơn vị.'
        : 'Gửi kiến nghị, bổ sung thông tin khi được yêu cầu và theo dõi kết quả xử lý.'}</p>
    </div><BriefcaseBusiness size={46} aria-hidden="true" /></div>

    {!user ? <section className="appointment-panel">
      <h2>Đăng nhập để gửi và theo dõi kiến nghị</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      <div className="appointment-toolbar"><p>{operator ? 'Kiến nghị trong tenant của đơn vị' : 'Kiến nghị do bạn gửi'}</p>
        <button className="btn-outline" type="button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /> Làm mới</button>
      </div>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {!operator && <section className="appointment-panel">
        <h2>Gửi kiến nghị mới</h2>
        <p>Thông tin doanh nghiệp và mã số thuế do người gửi tự khai; hệ thống chưa xác minh với cơ quan thuế.</p>
        <form className="administrative-feedback-form" onSubmit={(event) => void submit(event)}>
          <label>Tên doanh nghiệp<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} minLength={3} maxLength={160} required /></label>
          <label>Mã số thuế<input value={taxCode} onChange={(event) => setTaxCode(event.target.value)} pattern="[0-9]{10}([0-9]{3})?" inputMode="numeric" required /></label>
          <label>Người đại diện gửi<input value={representative} onChange={(event) => setRepresentative(event.target.value)} minLength={3} maxLength={120} required /></label>
          <label>Lĩnh vực<select value={sector} onChange={(event) => setSector(event.target.value as BusinessPetition['sector'])}>
            {Object.entries(sectors).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="administrative-feedback-wide">Tiêu đề<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={160} required /></label>
          <label className="administrative-feedback-wide">Nội dung<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={20} maxLength={4000} rows={5} required /></label>
          <label className="administrative-feedback-wide">Hướng giải quyết đề nghị<textarea value={requestedResolution} onChange={(event) => setRequestedResolution(event.target.value)} minLength={10} maxLength={2000} rows={3} required /></label>
          <button className="btn-primary" type="submit" disabled={busy}>Gửi kiến nghị</button>
        </form>
      </section>}
      <section className="business-feedback-filters" aria-label="Lọc kiến nghị">
        <label>Tìm theo tiêu đề, doanh nghiệp hoặc mã số thuế<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
      </section>
      <div className="administrative-feedback-layout">
        <section className="appointment-panel">
          <h2>{operator ? 'Hồ sơ cần xử lý' : 'Kiến nghị của tôi'}</h2>
          {loading && items.length === 0 && <p>Đang tải kiến nghị…</p>}
          {!loading && filtered.length === 0 && <p>Không có kiến nghị phù hợp.</p>}
          <div className="administrative-feedback-list">{filtered.map((item) =>
            <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setNote(''); }}
              className={`administrative-feedback-item ${selectedId === item.id ? 'selected' : ''}`}>
              <span><strong>{item.title}</strong><small>{item.company_name} · {date(item.created_at)}</small></span>
              <span className={`appointment-status status-${item.status}`}>{statuses[item.status]}</span>
            </button>)}</div>
        </section>
        {selected && <section className="appointment-panel administrative-feedback-detail">
          <div className="appointment-item-heading"><h2>{selected.title}</h2><span className={`appointment-status status-${selected.status}`}>{statuses[selected.status]}</span></div>
          <p><strong>Doanh nghiệp:</strong> {selected.company_name}</p>
          <p><strong>Mã số thuế tự khai:</strong> {selected.tax_code}</p>
          <p><strong>Người đại diện:</strong> {selected.representative}</p>
          <p><strong>Lĩnh vực:</strong> {sectors[selected.sector]}</p>
          <p className="administrative-feedback-description">{selected.description}</p>
          <div className="administrative-feedback-response"><strong>Hướng giải quyết đề nghị</strong><p>{selected.requested_resolution}</p></div>
          {selected.response && <div className="administrative-feedback-response"><strong>Phản hồi gần nhất</strong><p>{selected.response}</p></div>}
          {operator && selected.status === 'submitted' && <button className="btn-primary" type="button" disabled={busy} onClick={() => void transition('review')}>Tiếp nhận xem xét</button>}
          {operator && selected.status === 'in_review' && <div className="administrative-feedback-action">
            <label>Nội dung gửi doanh nghiệp<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} rows={4} /></label>
            <div className="appointment-actions">
              <button className="btn-outline" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('request-info')}>Yêu cầu bổ sung</button>
              <button className="btn-primary" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('resolve')}>Trả lời và hoàn tất</button>
            </div>
          </div>}
          {!operator && selected.status === 'needs_info' && <div className="administrative-feedback-action">
            <label>Thông tin bổ sung<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} rows={4} /></label>
            <button className="btn-primary" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('provide-info')}>Gửi bổ sung</button>
          </div>}
          {!operator && selected.status === 'resolved' && <div className="administrative-feedback-action">
            <label>Cần xem xét lại?<textarea value={note} onChange={(event) => setNote(event.target.value)} minLength={10} maxLength={2000} rows={3} /></label>
            <div className="appointment-actions">
              <button className="btn-outline" type="button" disabled={busy || note.trim().length < 10} onClick={() => void transition('reopen')}>Đề nghị xem xét lại</button>
              <button className="btn-primary" type="button" disabled={busy} onClick={() => void transition('close')}>Đã rõ, kết thúc</button>
            </div>
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

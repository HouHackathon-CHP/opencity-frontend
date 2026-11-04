// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { request, type CommunityGroup, type CommunityPost } from '../lib/api';
import { canManage } from '../lib/permissions';

const endpoint = '/api/opencity/community/groups';

export function CommunityGroupsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'community_groups');
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [form, setForm] = useState({ title: '', description: '', area: '' });
  const [postBody, setPostBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await request<CommunityGroup[]>(endpoint, token);
      setGroups(data);
      setSelectedId((current) => current && data.some((group) => group.id === current) ? current : data[0]?.id || '');
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được nhóm cộng đồng.'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);
  const selected = groups.find((group) => group.id === selectedId);
  const canReadPosts = selected?.joined || operator;
  useEffect(() => {
    if (!token || !selectedId || !canReadPosts) { setPosts([]); return; }
    let active = true;
    void request<CommunityPost[]>(`${endpoint}/${encodeURIComponent(selectedId)}/posts`, token)
      .then((data) => { if (active) setPosts(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được bài viết.'); });
    return () => { active = false; };
  }, [token, selectedId, canReadPosts]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!operator || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const group = await request<CommunityGroup>(endpoint, token, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, area: form.area.trim() || null }) });
      setForm({ title: '', description: '', area: '' });
      await refresh(); setSelectedId(group.id); setNotice('Đã tạo nhóm cộng đồng.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tạo được nhóm.'); }
    finally { setBusy(false); }
  }

  async function membership(join: boolean) {
    if (!selected || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${endpoint}/${encodeURIComponent(selected.id)}/join`, token, { method: join ? 'POST' : 'DELETE' });
      setPosts([]); await refresh(); setNotice(join ? 'Đã tham gia nhóm.' : 'Đã rời nhóm.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được thành viên.'); }
    finally { setBusy(false); }
  }

  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected?.joined || !token || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const created = await request<CommunityPost>(`${endpoint}/${encodeURIComponent(selected.id)}/posts`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: postBody.trim() }),
      });
      setPosts((current) => [created, ...current]); setPostBody(''); setNotice('Đã đăng bài viết.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đăng được bài viết.'); }
    finally { setBusy(false); }
  }

  return <div className="page-width hotlines-page">
    <div className="page-breadcrumb"><Link to="/">Danh mục dịch vụ</Link><span>›</span><span>Nhóm cộng đồng</span></div>
    <div className="page-intro-banner"><div className="intro-text-col"><p className="intro-eyebrow">CỘNG ĐỒNG ĐỊA PHƯƠNG</p>
      <h1 className="intro-headline">Nhóm cộng đồng</h1><p className="intro-paragraph">Tham gia nhóm trong địa bàn và trao đổi với các thành viên.</p>
    </div></div>
    {!user ? <section className="appointment-panel"><h2>Đăng nhập để tham gia nhóm</h2>
      <button className="btn-primary" type="button" disabled={authLoading} onClick={() => void login()}>Đăng nhập</button>
    </section> : <>
      {error && <div className="alert-box alert-error" role="alert">{error}</div>}
      {notice && <div className="alert-box alert-success" role="status">{notice}</div>}
      {operator && <section className="appointment-panel"><h2>Tạo nhóm trong đơn vị</h2>
        <form className="administrative-feedback-form" onSubmit={(event) => void create(event)}>
          <label>Tên nhóm<input required minLength={5} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>Khu vực<input maxLength={120} value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label>
          <label className="administrative-feedback-wide">Mô tả<textarea required minLength={20} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <button className="btn-primary" type="submit" disabled={busy}>Tạo nhóm</button>
        </form></section>}
      {groups.length === 0 ? <section className="appointment-panel">Chưa có nhóm trong đơn vị này.</section> :
        <div className="form-grid-two"><section className="appointment-panel"><h2>Danh sách nhóm</h2>
          {groups.map((group) => <button key={group.id} type="button" className="btn-outline" aria-pressed={group.id === selectedId}
            onClick={() => setSelectedId(group.id)}>{group.title} · {group.member_count} thành viên</button>)}
        </section><section className="appointment-panel" aria-live="polite">{selected && <>
          <h2>{selected.title}</h2><p>{selected.description}</p>
          {selected.area && <p>Khu vực: {selected.area}</p>}
          <p>{selected.member_count} thành viên</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void membership(!selected.joined)}>
            {selected.joined ? 'Rời nhóm' : 'Tham gia nhóm'}</button>
          {canReadPosts ? <><h3>Bài viết trong nhóm</h3>
            {selected.joined && <form onSubmit={(event) => void post(event)}><label>Nội dung bài viết
              <textarea required minLength={3} maxLength={2000} value={postBody} onChange={(event) => setPostBody(event.target.value)} /></label>
              <button className="btn-primary" type="submit" disabled={busy}>Đăng bài</button></form>}
            {posts.length === 0 ? <p>Chưa có bài viết.</p> : posts.map((item) => <article key={item.id}>
              <strong>{item.user_id}</strong> · {new Date(item.created_at).toLocaleString('vi-VN')}
              <p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p></article>)}
          </> : <p>Tham gia nhóm để xem và đăng bài viết.</p>}
        </>}</section></div>}
    </>}
  </div>;
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  ExternalLink,
  LockKeyhole,
  MapPin,
  Newspaper,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Shield,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import { request, type Bulletin } from '../lib/api';

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

export function BulletinsPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'bulletins');

  const [items, setItems] = useState<Bulletin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'news' | 'alert'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Officer Publish Form State
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
    setLoading(true);
    setError('');
    try {
      const data = await request<Bulletin[]>('/api/opencity/bulletins', token);
      setItems(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được bản tin từ OpenCity API.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Officer publish news or alert
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !operator || busy) return;

    const hasLatitude = latitude.trim().length > 0;
    const hasLongitude = longitude.trim().length > 0;
    if (hasLatitude !== hasLongitude) {
      setError('Cần nhập đầy đủ cả vĩ độ và kinh độ, hoặc để trống cả hai.');
      return;
    }

    const lat = hasLatitude ? Number(latitude) : null;
    const lon = hasLongitude ? Number(longitude) : null;
    if (
      lat !== null &&
      lon !== null &&
      (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    ) {
      setError('Tọa độ địa lý không hợp lệ. Vĩ độ từ -90 đến 90, kinh độ từ -180 đến 180.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await request<Bulletin>('/api/opencity/bulletins', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title: title.trim(),
          summary: summary.trim(),
          body: body.trim(),
          area: area.trim() || null,
          latitude: lat,
          longitude: lon,
        }),
      });

      setTitle('');
      setSummary('');
      setBody('');
      setArea('');
      setLatitude('');
      setLongitude('');
      setShowForm(false);
      setFilter('all');
      setSelectedId(created.id);
      setNotice('Đã phát hành bản tin mới tới toàn bộ người dùng trong đơn vị.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể phát hành nội dung.');
    } finally {
      setBusy(false);
    }
  }

  // Geolocation for officer
  function locate() {
    if (!navigator.geolocation) {
      setError('Trình duyệt không hỗ trợ định vị.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        setError('');
      },
      () => setError('Không lấy được vị trí GPS hiện tại.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const visible = items.filter((item) => {
    if (filter !== 'all' && item.category !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        (item.area && item.area.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selected = items.find((item) => item.id === selectedId);

  return (
    <div className="bulletins-page page-width">
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          Danh mục dịch vụ
        </Link>
        <ChevronRight size={14} />
        <span className="breadcrumb-current">Tin & Cảnh báo</span>
      </div>

      {/* Intro Banner */}
      <div className="page-intro-banner">
        <div className="intro-text-col">
          <div className="intro-eyebrow">
            <span className="pulse-indicator" />
            <span>KÊNH THÔNG TIN CHÍNH THỐNG ĐÔ THỊ</span>
          </div>
          <h1 className="intro-headline">Tin Tức & Cảnh Báo An Toàn Khu Vực</h1>
          <p className="intro-paragraph">
            Cập nhật chỉ đạo điều hành, tình hình giao thông, thời tiết cực đoan và các cảnh báo khẩn
            cấp trực tiếp từ đơn vị quản lý vận hành OpenCity.
          </p>
        </div>
        <div className="intro-badge-icon" aria-hidden="true">
          <Newspaper size={40} />
        </div>
      </div>

      {/* Not Logged In Gate */}
      {!user ? (
        <section className="login-gate-card">
          <div className="gate-icon-box">
            <LockKeyhole size={36} />
          </div>
          <div className="gate-content">
            <h2 className="gate-title">
              {authLoading ? 'Đang kiểm tra phiên làm việc…' : 'Đăng nhập để xem tin tức đơn vị'}
            </h2>
            <p className="gate-desc">
              Bản tin và thông báo được hiển thị theo địa bàn đơn vị hành chính mà tài khoản bạn trực
              thuộc.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void login()}
            disabled={authLoading}
          >
            <span>Đăng nhập ngay</span>
            <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <>
          {/* Controls Bar */}
          <div className="reports-control-panel">
            <div className="control-panel-heading">
              <div className="panel-title-wrap">
                <h2>{operator ? 'Trung Tâm Phát Tin & Cảnh Báo' : 'Bản Tin & Cảnh Báo Đơn Vị'}</h2>
                <span className={`panel-role-tag ${operator ? 'tag-officer' : 'tag-citizen'}`}>
                  {operator ? <Shield size={13} /> : <Radio size={13} />}
                  <span>{operator ? 'Quyền cán bộ phát hành' : 'Kênh thông tin cư dân'}</span>
                </span>
              </div>
              <p className="panel-subtext">
                {operator
                  ? 'Soạn thảo và phát hành thông tin chính thống hoặc cảnh báo khẩn cấp tới ứng dụng di động và cổng web.'
                  : 'Nội dung cập nhật thường xuyên, phục vụ đời sống và đảm bảo trật tự an toàn đô thị.'}
              </p>
            </div>

            <div className="control-actions-wrap">
              <button
                className="btn-outline"
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                <span>Làm mới</span>
              </button>

              {operator && (
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => setShowForm((val) => !val)}
                >
                  <Plus size={18} />
                  <span>Đăng nội dung mới</span>
                </button>
              )}
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert-box alert-error" role="alert">
              <TriangleAlert size={18} />
              <div className="alert-message">{error}</div>
              <button
                type="button"
                className="alert-close-btn"
                onClick={() => setError('')}
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="alert-box alert-success" role="status">
              <CheckCircle2 size={18} />
              <div className="alert-message">{notice}</div>
              <button
                type="button"
                className="alert-close-btn"
                onClick={() => setNotice('')}
                aria-label="Đóng"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Form for Officer to publish */}
          {operator && showForm && (
            <section className="form-card-container">
              <div className="form-card-header">
                <div>
                  <span className="form-eyebrow">PHÁT HÀNH BẢN TIN / CẢNH BÁO MỚI</span>
                  <h3 className="form-title">Soạn thảo nội dung gửi đến người dân trong đơn vị</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Đóng"
                  onClick={() => setShowForm(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={(e) => void publish(e)} className="report-create-form">
                <div className="form-grid-two">
                  <div className="form-field">
                    <label>
                      Phân loại thông tin <span className="req-star">*</span>
                    </label>
                    <div className="category-select-pill-group">
                      <button
                        type="button"
                        className={`type-choice-btn ${category === 'news' ? 'selected-news' : ''}`}
                        onClick={() => setCategory('news')}
                      >
                        <Newspaper size={16} />
                        <span>Tin tức chính sách / đô thị</span>
                      </button>
                      <button
                        type="button"
                        className={`type-choice-btn ${category === 'alert' ? 'selected-alert' : ''}`}
                        onClick={() => setCategory('alert')}
                      >
                        <AlertTriangle size={16} />
                        <span>Cảnh báo an toàn / khẩn cấp</span>
                      </button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label htmlFor="bulletin-area">Khu vực ảnh hưởng (Tùy chọn)</label>
                    <input
                      id="bulletin-area"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      maxLength={120}
                      placeholder="Ví dụ: Phường Tràng Tiền, Quận Hoàn Kiếm"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="bulletin-title">
                    Tiêu đề bản tin <span className="req-star">*</span>
                  </label>
                  <input
                    id="bulletin-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    minLength={5}
                    maxLength={160}
                    required
                    placeholder="Tiêu đề súc tích, phản ánh đúng trọng tâm vấn đề"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="bulletin-summary">
                    Tóm tắt cốt lõi <span className="req-star">*</span>
                  </label>
                  <input
                    id="bulletin-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    minLength={10}
                    maxLength={300}
                    required
                    placeholder="Tóm tắt 1 - 2 câu quan trọng nhất để hiển thị nhanh trên app và danh sách"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="bulletin-body">
                    Nội dung chi tiết <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="bulletin-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    minLength={20}
                    maxLength={5000}
                    rows={6}
                    required
                    placeholder="Toàn văn thông báo, khuyến cáo, số điện thoại liên hệ khẩn cấp..."
                  />
                </div>

                {/* Coordinate inputs with quick locate */}
                <div className="form-grid-two">
                  <div className="form-field">
                    <label htmlFor="bulletin-lat">Vĩ độ (Latitude - Tùy chọn)</label>
                    <input
                      id="bulletin-lat"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      inputMode="decimal"
                      placeholder="21.0285"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="bulletin-lon">Kinh độ (Longitude - Tùy chọn)</label>
                    <input
                      id="bulletin-lon"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      inputMode="decimal"
                      placeholder="105.8542"
                    />
                  </div>
                </div>

                <div>
                  <button type="button" className="btn-outline-sm" onClick={locate}>
                    <Crosshair size={14} />
                    <span>Lấy tọa độ hiện tại của thiết bị</span>
                  </button>
                </div>

                <div className="form-actions-footer">
                  <p className="privacy-note">
                    Nội dung sau khi phát hành sẽ xuất hiện đồng thời trên bản đồ, web và ứng dụng
                    công dân của đơn vị.
                  </p>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    <Send size={16} />
                    <span>{busy ? 'Đang công bố…' : 'Phát hành thông tin ngay'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Master-Detail Dual Pane Workspace */}
          <div className="workspace-layout">
            {/* Left Pane: Bulletins List */}
            <div className="workspace-list-pane">
              {/* Search in list */}
              <div className="list-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Lọc tin tức, cảnh báo..."
                  aria-label="Tìm kiếm trong danh sách tin tức"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Xóa tìm kiếm">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter tabs */}
              <div className="list-status-tabs" role="tablist">
                <button
                  type="button"
                  className={`status-tab ${filter === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setFilter('all');
                  }}
                >
                  Tất cả ({items.length})
                </button>
                <button
                  type="button"
                  className={`status-tab ${filter === 'news' ? 'active' : ''}`}
                  onClick={() => {
                    setFilter('news');
                  }}
                >
                  Tin tức ({items.filter((i) => i.category === 'news').length})
                </button>
                <button
                  type="button"
                  className={`status-tab ${filter === 'alert' ? 'active' : ''}`}
                  onClick={() => {
                    setFilter('alert');
                  }}
                >
                  <AlertTriangle size={13} className="text-danger" />
                  Cảnh báo ({items.filter((i) => i.category === 'alert').length})
                </button>
              </div>

              {/* List Feed */}
              <div className="report-items-container">
                {loading && !items.length ? (
                  <div className="loading-state-card">
                    <RefreshCw className="spin" size={24} />
                    <span>Đang tải danh sách bản tin…</span>
                  </div>
                ) : visible.length ? (
                  visible.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`report-item-card bulletin-feed-card ${
                        item.category === 'alert' ? 'card-alert-glow' : ''
                      } ${selectedId === item.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="item-card-top">
                        <span
                          className={`bulletin-category-tag ${
                            item.category === 'alert' ? 'tag-alert-badge' : 'tag-news-badge'
                          }`}
                        >
                          {item.category === 'alert' ? (
                            <>
                              <AlertTriangle size={12} />
                              <span>CẢNH BÁO KHẨN</span>
                            </>
                          ) : (
                            <>
                              <Newspaper size={12} />
                              <span>TIN TỨC</span>
                            </>
                          )}
                        </span>

                        {item.area && (
                          <span className="bulletin-area-tag">
                            <MapPin size={11} />
                            <span>{item.area}</span>
                          </span>
                        )}
                      </div>

                      <h4 className="item-card-title">{item.title}</h4>
                      <p className="item-card-desc-snippet">{item.summary}</p>

                      <div className="item-card-footer">
                        <span className="item-time">{formatDate(item.published_at)}</span>
                        {item.latitude != null && item.longitude != null && (
                          <span className="bulletin-geo-badge">Có tọa độ bản đồ</span>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty-list-card">
                    <Newspaper size={32} />
                    <h4>Chưa có bản tin nào</h4>
                    <p>
                      {searchQuery
                        ? 'Không tìm thấy nội dung khớp với từ khóa tìm kiếm.'
                        : operator
                        ? 'Nhấn nút "Đăng nội dung mới" để thông tin đến cư dân.'
                        : 'Chưa có thông báo hoặc cảnh báo nào trong mục này.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Bulletin Detail Reading View */}
            <div className="workspace-detail-pane">
              {selected ? (
                <div className="detail-card-inner">
                  {/* Category & Date */}
                  <div className="detail-header-row">
                    <span
                      className={`bulletin-category-tag ${
                        selected.category === 'alert' ? 'tag-alert-badge' : 'tag-news-badge'
                      }`}
                    >
                      {selected.category === 'alert' ? (
                        <>
                          <AlertTriangle size={14} />
                          <span>CẢNH BÁO KHẨN CẤP</span>
                        </>
                      ) : (
                        <>
                          <Newspaper size={14} />
                          <span>TIN TỨC ĐÔ THỊ</span>
                        </>
                      )}
                    </span>
                    <span className="detail-pub-date">{formatDate(selected.published_at)}</span>
                  </div>

                  <h2 className="detail-title bulletin-full-title">{selected.title}</h2>

                  {/* Area badge */}
                  {selected.area && (
                    <div className="bulletin-location-banner">
                      <MapPin size={16} />
                      <span>
                        Khu vực áp dụng: <strong>{selected.area}</strong>
                      </span>
                    </div>
                  )}

                  {/* Highlight summary card */}
                  <div
                    className={`bulletin-summary-card ${
                      selected.category === 'alert' ? 'summary-alert-theme' : ''
                    }`}
                  >
                    <div className="summary-card-label">Tóm lược sự vụ:</div>
                    <p className="summary-card-text">{selected.summary}</p>
                  </div>

                  {/* Full body */}
                  <div className="bulletin-full-body">
                    {selected.body.split('\n\n').map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>

                  {/* Map Coordinate Link */}
                  {selected.latitude != null && selected.longitude != null && (
                    <div className="bulletin-map-container">
                      <div className="map-banner-info">
                        <MapPin size={20} className="text-primary" />
                        <div>
                          <strong>Vị trí trên bản đồ đô thị</strong>
                          <p>
                            Tọa độ GPS: {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=16/${selected.latitude}/${selected.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary"
                      >
                        <span>Mở trên OpenStreetMap</span>
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="detail-empty-placeholder">
                  <div className="placeholder-icon-wrap">
                    <Newspaper size={40} />
                  </div>
                  <h3>Chọn một bản tin để đọc</h3>
                  <p>Toàn văn nội dung, khuyến cáo và vị trí bản đồ sẽ hiển thị tại đây.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

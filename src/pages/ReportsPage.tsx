// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crosshair,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { rolesOf } from '../lib/auth';
import { downloadAttachment, reportStates, request, type Report } from '../lib/api';

const types = ['Hạ tầng', 'Môi trường', 'Giao thông', 'Chiếu sáng', 'Cây xanh', 'Khác'];

const actions: Record<string, { key: string; text: string; nextState: string }> = {
  submitted: { key: 'triage', text: 'Tiếp nhận phản ánh', nextState: 'triaged' },
  triaged: { key: 'assign', text: 'Chuyển đơn vị xử lý', nextState: 'assigned' },
  assigned: { key: 'resolve', text: 'Xác nhận hoàn tất', nextState: 'resolved' },
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function StatusPill({ state }: { state: string | null }) {
  const normalized = state || 'submitted';
  let className = 'status-pill-submitted';
  let label = 'Mới gửi';

  if (normalized === 'triaged') {
    className = 'status-pill-triaged';
    label = 'Đã tiếp nhận';
  } else if (normalized === 'assigned') {
    className = 'status-pill-assigned';
    label = 'Đang xử lý';
  } else if (normalized === 'resolved') {
    className = 'status-pill-resolved';
    label = 'Đã hoàn tất';
  }

  return (
    <span className={`status-pill ${className}`}>
      <span className="status-dot-pulse" />
      {reportStates[normalized] || label}
    </span>
  );
}

function PhotoThumbnail({
  reportId,
  objectId,
  token,
}: {
  reportId: string;
  objectId: string;
  token: string;
}) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let url = '';
    let active = true;
    setLoading(true);
    setError(false);
    downloadAttachment(reportId, objectId, token)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (active) {
          setSrc(url);
          setLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [reportId, objectId, token]);

  if (error) {
    return (
      <div className="report-photo-error">
        <AlertCircle size={16} />
        <span>Không thể tải ảnh</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="report-photo-loading">
        <LoaderCircle className="spin" size={18} />
        <span>Tải ảnh…</span>
      </div>
    );
  }

  return (
    <div className="report-photo-wrap">
      <img className="report-photo-img" src={src} alt="Minh chứng hiện trường do người dân gửi" />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="photo-zoom-btn"
        title="Xem ảnh kích thước gốc"
      >
        <ExternalLink size={14} />
      </a>
    </div>
  );
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

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'submitted' | 'triaged' | 'assigned' | 'resolved'>('all');

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(types[0]);
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await request<Report[]>('/api/opencity/reports', token);
      setReports(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu từ OpenCity API.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const item = await request<Report>(`/api/opencity/reports/${encodeURIComponent(id)}`, token);
        setDetail(item);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết phản ánh.');
      }
    },
    [token],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    }
  }, [selectedId, loadDetail]);

  // Form submit
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    if (
      photo &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
        photo.size > 10 * 1024 * 1024)
    ) {
      setError('Ảnh cần có định dạng JPEG, PNG hoặc WebP và dung lượng không quá 10 MB.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('category', category);
      form.append('address', address.trim());
      if (coordinates) {
        form.append('latitude', String(coordinates.latitude));
        form.append('longitude', String(coordinates.longitude));
      }
      if (photo) form.append('photo', photo);

      const result = await request<Report>('/api/opencity/reports', token, {
        method: 'POST',
        body: form,
      });

      setNotice(
        `Đã ghi nhận phản ánh #${result.id.slice(0, 8).toUpperCase()}.${
          result.warnings?.length
            ? ` Lưu ý: ${result.warnings.join(' ')}`
            : ' Quy trình tự động xử lý đã bắt đầu.'
        }`,
      );
      setShowForm(false);
      setTitle('');
      setDescription('');
      setAddress('');
      setCoordinates(null);
      setPhoto(null);
      await refresh();
      setSelectedId(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể gửi phản ánh.');
    } finally {
      setBusy(false);
    }
  }

  // Officer take action
  async function takeAction(action: string) {
    if (!detail || !token || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(
        `/api/opencity/reports/${encodeURIComponent(detail.id)}/actions/${action}`,
        token,
        { method: 'POST' },
      );
      setNotice('Trạng thái quy trình đã được cập nhật và ghi nhận vào lịch sử kiểm toán.');
      await refresh();
      await loadDetail(detail.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật quy trình.');
    } finally {
      setBusy(false);
    }
  }

  // Retry workflow if not initiated
  async function retryWorkflow() {
    if (!detail || detail.workflow_id || !token || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(
        `/api/opencity/reports/${encodeURIComponent(detail.id)}/retry-workflow`,
        token,
        { method: 'POST' },
      );
      setNotice('Quy trình xử lý tự động đã được kích hoạt thành công.');
      await refresh();
      await loadDetail(detail.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể khởi tạo lại quy trình.');
    } finally {
      setBusy(false);
    }
  }

  // Geolocation
  function locate() {
    if (!navigator.geolocation) {
      setError('Trình duyệt của bạn không hỗ trợ định vị.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setError('');
      },
      () => setError('Không thể lấy tọa độ GPS. Bạn có thể nhập địa chỉ chi tiết bằng chữ.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((item) => {
      if (stateFilter !== 'all' && item.state !== stateFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.title.toLowerCase().includes(q) ||
          item.address.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [reports, stateFilter, searchQuery]);

  return (
    <div className="reports-page page-width">
      {/* Breadcrumb Navigation */}
      <div className="page-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          Danh mục dịch vụ
        </Link>
        <ChevronRight size={14} />
        <span className="breadcrumb-current">Phản ánh hiện trường</span>
      </div>

      {/* Page Header Banner */}
      <div className="page-intro-banner">
        <div className="intro-text-col">
          <div className="intro-eyebrow">
            <span className="pulse-indicator" />
            <span>KÊNH TƯƠNG TÁC ĐÔ THỊ ĐA CHIỀU</span>
          </div>
          <h1 className="intro-headline">Phản Ánh & Giám Sát Hiện Trường</h1>
          <p className="intro-paragraph">
            Tiếp nhận sự cố hạ tầng, môi trường, giao thông từ người dân. Minh bạch toàn bộ tiến trình
            từ lúc gửi đến khi cán bộ hoàn tất giải quyết.
          </p>
        </div>
        <div className="intro-badge-icon" aria-hidden="true">
          <MapPin size={40} />
        </div>
      </div>

      {/* Not Logged In Gate */}
      {!user ? (
        <section className="login-gate-card">
          <div className="gate-icon-box">
            <ShieldCheck size={36} />
          </div>
          <div className="gate-content">
            <h2 className="gate-title">
              {authLoading ? 'Đang xác thực tài khoản…' : 'Đăng nhập bằng tài khoản DX-OS'}
            </h2>
            <p className="gate-desc">
              Đăng nhập qua chuẩn định danh mở OIDC để gửi phản ánh hiện trường, nhận thông báo tiến
              độ xử lý và theo dõi kết quả thực tế.
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
          {/* Officer / Citizen Toolbar */}
          <div className="reports-control-panel">
            <div className="control-panel-heading">
              <div className="panel-title-wrap">
                <h2>{isOperator ? 'Bàn Xử Lý Phản Ánh Đô Thị' : 'Hồ Sơ Phản Ánh Của Tôi'}</h2>
                <span className={`panel-role-tag ${isOperator ? 'tag-officer' : 'tag-citizen'}`}>
                  {isOperator ? <Shield size={13} /> : <User size={13} />}
                  <span>{isOperator ? 'Quyền cán bộ thụ lý' : 'Quyền công dân'}</span>
                </span>
              </div>
              <p className="panel-subtext">
                {isOperator
                  ? 'Theo dõi, phân loại và cập nhật tiến trình giải quyết cho các phản ánh trong đơn vị.'
                  : 'Chỉ bạn và cán bộ có thẩm quyền trong đơn vị mới xem được thông tin hồ sơ này.'}
              </p>
            </div>

            <div className="control-actions-wrap">
              <button
                className="btn-outline"
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                title="Làm mới dữ liệu từ máy chủ"
              >
                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                <span>Làm mới</span>
              </button>

              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setShowForm(true);
                  setSelectedId(null);
                }}
              >
                <Plus size={18} />
                <span>Gửi phản ánh mới</span>
              </button>
            </div>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="alert-box alert-error" role="alert">
              <TriangleAlert size={18} />
              <div className="alert-message">{error}</div>
              <button
                type="button"
                className="alert-close-btn"
                onClick={() => setError('')}
                aria-label="Đóng cảnh báo"
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
                aria-label="Đóng thông báo"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Modal / Card Form for New Report */}
          {showForm && (
            <section className="form-card-container">
              <div className="form-card-header">
                <div>
                  <span className="form-eyebrow">GỬI PHẢN ÁNH HIỆN TRƯỜNG</span>
                  <h3 className="form-title">Mô tả sự việc cần chính quyền tiếp nhận</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Đóng biểu mẫu"
                  onClick={() => setShowForm(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={(e) => void submit(e)} className="report-create-form">
                <div className="form-grid-two">
                  <div className="form-field">
                    <label htmlFor="report-title">
                      Tiêu đề sự việc <span className="req-star">*</span>
                    </label>
                    <input
                      id="report-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={120}
                      minLength={5}
                      required
                      placeholder="Ví dụ: Nắp cống hỏng tại ngã tư Trần Phú"
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="report-category">
                      Lĩnh vực liên quan <span className="req-star">*</span>
                    </label>
                    <select
                      id="report-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      {types.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label htmlFor="report-desc">
                    Mô tả cụ thể hiện trạng <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="report-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    minLength={15}
                    maxLength={2000}
                    rows={4}
                    required
                    placeholder="Mô tả chi tiết vị trí, mức độ ảnh hưởng, thời điểm phát hiện sự việc..."
                  />
                  <div className="field-hint">Tối thiểu 15 ký tự để đảm bảo đủ thông tin thụ lý.</div>
                </div>

                <div className="form-field">
                  <label htmlFor="report-address">
                    Địa chỉ / Vị trí cụ thể <span className="req-star">*</span>
                  </label>
                  <input
                    id="report-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={250}
                    required
                    placeholder="Số nhà, ngõ/ngách, tên đường, phường/xã..."
                  />
                </div>

                {/* Location & Image Pickers */}
                <div className="form-media-pickers">
                  <button
                    type="button"
                    className={`media-picker-btn ${coordinates ? 'is-attached' : ''}`}
                    onClick={locate}
                  >
                    <Crosshair size={18} />
                    <span>
                      {coordinates
                        ? `GPS: ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`
                        : 'Gắn tọa độ GPS hiện tại'}
                    </span>
                  </button>

                  <label className={`media-picker-btn file-picker ${photo ? 'is-attached' : ''}`}>
                    <Camera size={18} />
                    <span>{photo ? photo.name : 'Đính kèm ảnh minh chứng (tối đa 10 MB)'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {photoPreview && (
                  <div className="form-photo-preview-tray">
                    <img src={photoPreview} alt="Xem trước ảnh chọn" className="form-preview-thumb" />
                    <div className="preview-meta">
                      <span>{photo?.name}</span>
                      <small>{photo ? (photo.size / (1024 * 1024)).toFixed(2) + ' MB' : ''}</small>
                    </div>
                    <button
                      type="button"
                      className="remove-photo-btn"
                      onClick={() => setPhoto(null)}
                      title="Bỏ ảnh này"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}

                <div className="form-actions-footer">
                  <p className="privacy-note">
                    Dữ liệu được lưu trữ an toàn trong phạm vi đơn vị hành chính; ảnh chụp chỉ có
                    người có thẩm quyền mới được truy cập.
                  </p>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    <Send size={16} />
                    <span>{busy ? 'Đang gửi phản ánh…' : 'Xác nhận gửi phản ánh'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Master-Detail Dual Pane Workspace */}
          <div className="workspace-layout">
            {/* Left Pane: Report List with filters */}
            <div className="workspace-list-pane">
              {/* Filter & Search Bar */}
              <div className="list-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Lọc danh sách..."
                  aria-label="Tìm kiếm trong danh sách phản ánh"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Xóa tìm kiếm">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status filter tabs */}
              <div className="list-status-tabs" role="tablist">
                <button
                  type="button"
                  className={`status-tab ${stateFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setStateFilter('all')}
                >
                  Tất cả ({reports.length})
                </button>
                <button
                  type="button"
                  className={`status-tab ${stateFilter === 'submitted' ? 'active' : ''}`}
                  onClick={() => setStateFilter('submitted')}
                >
                  Mới
                </button>
                <button
                  type="button"
                  className={`status-tab ${stateFilter === 'triaged' ? 'active' : ''}`}
                  onClick={() => setStateFilter('triaged')}
                >
                  Đã nhận
                </button>
                <button
                  type="button"
                  className={`status-tab ${stateFilter === 'assigned' ? 'active' : ''}`}
                  onClick={() => setStateFilter('assigned')}
                >
                  Đang xử lý
                </button>
                <button
                  type="button"
                  className={`status-tab ${stateFilter === 'resolved' ? 'active' : ''}`}
                  onClick={() => setStateFilter('resolved')}
                >
                  Hoàn tất
                </button>
              </div>

              {/* Items Feed */}
              <div className="report-items-container">
                {loading && !reports.length ? (
                  <div className="loading-state-card">
                    <LoaderCircle className="spin" size={24} />
                    <span>Đang nạp danh sách phản ánh…</span>
                  </div>
                ) : filteredReports.length ? (
                  filteredReports.map((report) => (
                    <button
                      type="button"
                      key={report.id}
                      className={`report-item-card ${selectedId === report.id ? 'is-selected' : ''}`}
                      onClick={() => {
                        setSelectedId(report.id);
                        setShowForm(false);
                      }}
                    >
                      <div className="item-card-top">
                        <span className="item-category-tag">{report.category}</span>
                        <StatusPill state={report.state} />
                      </div>
                      <h4 className="item-card-title">{report.title}</h4>
                      <div className="item-card-address">
                        <MapPin size={13} />
                        <span>{report.address}</span>
                      </div>
                      <div className="item-card-footer">
                        <span className="item-time">
                          <Clock3 size={12} />
                          {formatDate(report.created_at)}
                        </span>
                        {report.attachment_ids?.length > 0 && (
                          <span className="item-attach-count">
                            <ImageIcon size={12} />
                            {report.attachment_ids.length} ảnh
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty-list-card">
                    <FileText size={32} />
                    <h4>Không có phản ánh nào</h4>
                    <p>
                      {searchQuery
                        ? 'Không tìm thấy hồ sơ khớp với từ khóa tìm kiếm.'
                        : isOperator
                        ? 'Chưa có phản ánh nào được chuyển đến đơn vị bạn.'
                        : 'Bạn chưa có phản ánh nào. Hãy nhấn "Gửi phản ánh mới" để bắt đầu.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Report Inspection & Officer Command Center */}
            <div className="workspace-detail-pane">
              {detail ? (
                <div className="detail-card-inner">
                  {/* Top Header */}
                  <div className="detail-header-row">
                    <div>
                      <span className="detail-id-code">
                        HỒ SƠ #{detail.id.slice(0, 8).toUpperCase()}
                      </span>
                      <h2 className="detail-title">{detail.title}</h2>
                    </div>
                    <StatusPill state={detail.state} />
                  </div>

                  {/* Officer Command Action Bar (If Officer) */}
                  {isOperator && detail.state && actions[detail.state] && (
                    <div className="officer-action-panel">
                      <div className="action-panel-text">
                        <ShieldAlert size={18} />
                        <div>
                          <strong>Thao tác chuyển bước quy trình xử lý</strong>
                          <p>
                            Là cán bộ quản lý, bạn có quyền chuyển trạng thái hồ sơ sang bước tiếp
                            theo sau khi kiểm tra hiện trường.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => void takeAction(actions[detail.state!].key)}
                        disabled={busy}
                      >
                        <CheckCircle2 size={16} />
                        <span>{busy ? 'Đang cập nhật…' : actions[detail.state].text}</span>
                      </button>
                    </div>
                  )}

                  {/* Retry Workflow Button if workflow wasn't started */}
                  {!detail.workflow_id && (
                    <div className="workflow-retry-banner">
                      <div className="retry-banner-text">
                        <TriangleAlert size={18} />
                        <span>Quy trình tự động chưa được gán mã xử lý.</span>
                      </div>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => void retryWorkflow()}
                        disabled={busy}
                      >
                        <RefreshCw size={15} />
                        <span>Khởi tạo quy trình</span>
                      </button>
                    </div>
                  )}

                  {/* Body description */}
                  <div className="detail-section-block">
                    <h4 className="section-block-title">Mô tả hiện trạng</h4>
                    <div className="detail-body-text">{detail.description}</div>
                  </div>

                  {/* Meta grid */}
                  <div className="detail-meta-grid">
                    <div className="meta-cell">
                      <span className="meta-cell-label">Lĩnh vực</span>
                      <strong className="meta-cell-val">{detail.category}</strong>
                    </div>

                    <div className="meta-cell">
                      <span className="meta-cell-label">Vị trí ghi nhận</span>
                      <strong className="meta-cell-val">{detail.address}</strong>
                    </div>

                    <div className="meta-cell">
                      <span className="meta-cell-label">Thời gian tạo</span>
                      <strong className="meta-cell-val">{formatDate(detail.created_at)}</strong>
                    </div>

                    <div className="meta-cell">
                      <span className="meta-cell-label">Tọa độ địa lý</span>
                      {detail.latitude != null && detail.longitude != null ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${detail.latitude}&mlon=${detail.longitude}#map=17/${detail.latitude}/${detail.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-map-link"
                        >
                          <MapPin size={14} />
                          <span>
                            {detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)}
                          </span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="meta-cell-none">Không gắn tọa độ</span>
                      )}
                    </div>
                  </div>

                  {/* Attached Photos */}
                  {detail.attachment_ids && detail.attachment_ids.length > 0 && (
                    <div className="detail-section-block">
                      <h4 className="section-block-title">
                        Ảnh hiện trường ({detail.attachment_ids.length})
                      </h4>
                      <div className="detail-photo-gallery">
                        {detail.attachment_ids.map((objectId) => (
                          <PhotoThumbnail
                            key={objectId}
                            reportId={detail.id}
                            objectId={objectId}
                            token={token}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit Trail Timeline */}
                  <div className="detail-section-block">
                    <h4 className="section-block-title">Tiến trình và lịch sử xử lý</h4>
                    {detail.history && detail.history.length > 0 ? (
                      <div className="process-timeline">
                        {detail.history.map((event, index) => (
                          <div key={`${event.action}-${index}`} className="timeline-item">
                            <div className="timeline-marker">
                              <span className="timeline-dot" />
                              {index < detail.history.length - 1 && <span className="timeline-line" />}
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <strong className="timeline-title">
                                  {event.action === 'start'
                                    ? 'Người dân gửi phản ánh'
                                    : reportStates[event.to_state] || event.to_state}
                                </strong>
                                <span className="timeline-date">{formatDate(event.created_at)}</span>
                              </div>
                              <span className="timeline-actor">
                                Tác nhân: {event.actor || 'Hệ thống'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="timeline-empty-note">
                        Chưa có sự kiện quy trình nào được ghi nhận.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="detail-empty-placeholder">
                  <div className="placeholder-icon-wrap">
                    <MapPin size={40} />
                  </div>
                  <h3>Chọn một phản ánh để xem chi tiết</h3>
                  <p>
                    Thông tin hiện trường, hình ảnh đính kèm và lịch sử xử lý từng bước sẽ hiển thị ở
                    đây.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

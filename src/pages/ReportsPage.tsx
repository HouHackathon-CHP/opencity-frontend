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
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { rolesOf, unitOf } from '../lib/auth';
import { canDispatch, canManage } from '../lib/permissions';
import { ApiError, downloadAttachment, reportStates, request, type Report } from '../lib/api';

const types = ['Hạ tầng', 'Môi trường', 'Giao thông', 'Chiếu sáng', 'Cây xanh', 'Khác'];
const unitNames: Record<string, string> = {
  infrastructure: 'Hạ tầng & chiếu sáng',
  environment: 'Môi trường & cây xanh',
  transport: 'Giao thông',
  intake: 'Tiếp nhận chung',
};

const routingActions: Record<string, string> = {
  assigned: 'Đã phân công đơn vị', reassigned: 'Đã chuyển đơn vị',
  accepted: 'Đơn vị đã nhận việc', transfer_requested: 'Đề nghị chuyển đơn vị',
  transfer_rejected: 'Đã từ chối chuyển đơn vị', progress: 'Đã cập nhật tiến độ',
  resolved: 'Đã hoàn tất xử lý',
};

function isOverdue(report: Report): boolean {
  return Boolean(report.due_at && report.state !== 'resolved' && new Date(report.due_at).getTime() < Date.now());
}

function localDateTime(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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
  const [searchParams] = useSearchParams();
  const linkedReport = searchParams.get('report');
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const isOperator = canManage(user, 'reports');
  const isDispatcher = canDispatch(user);
  const roles = rolesOf(user);
  const unitName = unitNames[unitOf(user) || ''];

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dispatchUnit, setDispatchUnit] = useState('infrastructure');
  const [dispatchDue, setDispatchDue] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [transferUnit, setTransferUnit] = useState('environment');
  const [transferReason, setTransferReason] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  useEffect(() => {
    if (linkedReport) setSelectedId(linkedReport);
  }, [linkedReport]);

  useEffect(() => {
    if (!detail) return;
    setDispatchUnit(detail.pending_unit || detail.assigned_unit || detail.unit_id);
    setDispatchDue(localDateTime(new Date(Date.now() + 3 * 86400000)));
    setDispatchNote('');
    setTransferUnit(Object.keys(unitNames).find((unit) => unit !== detail.assigned_unit) || 'intake');
    setTransferReason('');
    setProgressNote('');
    setRejectNote('');
  }, [detail?.id]);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'submitted' | 'triaged' | 'assigned' | 'resolved' | 'overdue'>('all');

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
      setSelectedId((current) => current && data.some((item) => item.id === current)
        ? current : data[0]?.id || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu từ OpenCity API.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const item = await request<Report>(`/api/opencity/reports/${encodeURIComponent(id)}`, token);
        setDetail(item);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) {
          setDetail(null);
          void refresh();
        }
        setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết phản ánh.');
      }
    },
    [token, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId);
    } else {
      setDetail(null);
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

  async function updateReport(path: string, message: string, body?: object): Promise<boolean> {
    if (!detail || !token || busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request(`/api/opencity/reports/${encodeURIComponent(detail.id)}${path}`, token, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      setNotice(message);
      await refresh();
      await loadDetail(detail.id);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật quy trình.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submitDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dispatchDue) return;
    void updateReport('/dispatch', 'Đã phân công hồ sơ và lưu hạn xử lý.', {
      unit_id: dispatchUnit, due_at: new Date(dispatchDue).toISOString(), note: dispatchNote.trim(),
    });
  }

  function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updateReport('/transfer-request', 'Đã gửi đề nghị chuyển đơn vị.', {
      unit_id: transferUnit, reason: transferReason.trim(),
    });
  }

  async function submitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await updateReport('/progress', 'Đã cập nhật tiến độ xử lý.', { note: progressNote.trim() })) {
      setProgressNote('');
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
      if (stateFilter === 'overdue' && !isOverdue(item)) return false;
      if (stateFilter !== 'all' && stateFilter !== 'overdue' && item.state !== stateFilter) return false;
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
  const isHandler = Boolean(detail?.assigned_unit && (
    roles.includes('admin') ||
    (roles.includes('reports_operator') && unitOf(user) === detail.assigned_unit)
  ));

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
                  <span>{isDispatcher ? 'Quyền điều phối' : isOperator ? 'Quyền cán bộ thụ lý' : 'Quyền công dân'}</span>
                </span>
              </div>
              <p className="panel-subtext">
                {isOperator
                  ? `Theo dõi và xử lý phản ánh thuộc ${unitName || 'mọi đơn vị trong tenant'}.`
                  : 'Chỉ bạn và cán bộ có thẩm quyền trong đơn vị mới xem được thông tin hồ sơ này.'}
              </p>
            </div>

            <div className="control-actions-wrap">
              {isOperator && (
                <Link className="btn-outline" to="/reports/map">
                  <MapPin size={16} />
                  <span>Bản đồ điều hành</span>
                </Link>
              )}
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
                {isOperator && <button type="button"
                  className={`status-tab ${stateFilter === 'overdue' ? 'active' : ''}`}
                  onClick={() => setStateFilter('overdue')}>
                  Quá hạn ({reports.filter(isOverdue).length})
                </button>}
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
                      {isOverdue(report) && <span className="item-category-tag">Quá hạn {report.due_at && formatDate(report.due_at)}</span>}
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

                  {isDispatcher && detail.state !== 'resolved' && (
                    <div className="officer-action-panel">
                      <form onSubmit={submitDispatch} className="report-create-form">
                        <div className="action-panel-text"><ShieldAlert size={18} /><strong>Điều phối hồ sơ</strong></div>
                        {detail.pending_unit && <p>Đơn vị đề nghị chuyển đến {unitNames[detail.pending_unit]}: {detail.pending_reason}</p>}
                        <div className="form-grid-two">
                          <div className="form-field">
                            <label htmlFor="dispatch-unit">Đơn vị xử lý</label>
                            <select id="dispatch-unit" value={dispatchUnit} onChange={(e) => setDispatchUnit(e.target.value)}>
                              {Object.entries(unitNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                          </div>
                          <div className="form-field">
                            <label htmlFor="dispatch-due">Hạn xử lý</label>
                            <input id="dispatch-due" type="datetime-local" required value={dispatchDue}
                              onChange={(e) => setDispatchDue(e.target.value)} />
                          </div>
                        </div>
                        <div className="form-field">
                          <label htmlFor="dispatch-note">Lý do phân công</label>
                          <textarea id="dispatch-note" required minLength={3} maxLength={500}
                            value={dispatchNote} onChange={(e) => setDispatchNote(e.target.value)} />
                        </div>
                        <button type="submit" className="btn-primary" disabled={busy || !detail.workflow_id}>
                          <CheckCircle2 size={16} />{busy ? 'Đang lưu…' : detail.assigned_unit ? 'Cập nhật phân công' : 'Phân công xử lý'}
                        </button>
                      </form>
                      {detail.pending_unit && (
                        <form onSubmit={(e) => { e.preventDefault(); void updateReport('/transfer-request/reject', 'Đã từ chối đề nghị chuyển.', { note: rejectNote.trim() }); }} className="report-create-form">
                          <div className="form-field">
                            <label htmlFor="reject-note">Lý do từ chối đề nghị chuyển</label>
                            <input id="reject-note" required minLength={3} maxLength={500} value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)} />
                          </div>
                          <button type="submit" className="btn-outline" disabled={busy}>Từ chối đề nghị</button>
                        </form>
                      )}
                    </div>
                  )}

                  {isHandler && detail.state === 'assigned' && (
                    <div className="officer-action-panel">
                      {!detail.accepted_at ? (
                        <button type="button" className="btn-primary" disabled={busy}
                          onClick={() => void updateReport('/accept', 'Đơn vị đã nhận việc.')}>Nhận xử lý</button>
                      ) : (
                        <>
                          <button type="button" className="btn-primary" disabled={busy || Boolean(detail.pending_unit)}
                            onClick={() => void updateReport('/actions/resolve', 'Đã hoàn tất xử lý phản ánh.')}>Xác nhận hoàn tất</button>
                          {!detail.pending_unit && (
                            <form onSubmit={(event) => void submitProgress(event)} className="report-create-form">
                              <div className="form-field">
                                <label htmlFor="progress-note">Cập nhật tiến độ cho người dân</label>
                                <textarea id="progress-note" required minLength={3} maxLength={500}
                                  value={progressNote} onChange={(e) => setProgressNote(e.target.value)}
                                  placeholder="Ví dụ: Đã kiểm tra hiện trường, đang đặt linh kiện thay thế" />
                              </div>
                              <button type="submit" className="btn-outline" disabled={busy}>Lưu tiến độ</button>
                            </form>
                          )}
                          {detail.pending_unit ? (
                            <p>Đang chờ điều phối viên xem xét đề nghị chuyển đến {unitNames[detail.pending_unit]}.</p>
                          ) : (
                            <form onSubmit={submitTransfer} className="report-create-form">
                              <div className="form-field">
                                <label htmlFor="transfer-unit">Đề nghị chuyển đến</label>
                                <select id="transfer-unit" value={transferUnit} onChange={(e) => setTransferUnit(e.target.value)}>
                                  {Object.entries(unitNames).filter(([id]) => id !== detail.assigned_unit).map(([id, name]) =>
                                    <option key={id} value={id}>{name}</option>)}
                                </select>
                              </div>
                              <div className="form-field">
                                <label htmlFor="transfer-reason">Lý do đề nghị</label>
                                <textarea id="transfer-reason" required minLength={5} maxLength={500}
                                  value={transferReason} onChange={(e) => setTransferReason(e.target.value)} />
                              </div>
                              <button type="submit" className="btn-outline" disabled={busy}>Gửi đề nghị chuyển đơn vị</button>
                            </form>
                          )}
                        </>
                      )}
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
                      <span className="meta-cell-label">Đơn vị xử lý</span>
                      <strong className="meta-cell-val">{detail.assigned_unit ? unitNames[detail.assigned_unit] : 'Chưa phân công'}</strong>
                    </div>

                    <div className="meta-cell">
                      <span className="meta-cell-label">Hạn xử lý</span>
                      <strong className="meta-cell-val">{detail.due_at ? `${formatDate(detail.due_at)}${isOverdue(detail) ? ' · Quá hạn' : ''}` : 'Chưa có'}</strong>
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
                                    : routingActions[event.action] || (event.to_state ? reportStates[event.to_state] || event.to_state : event.action)}
                                </strong>
                                <span className="timeline-date">{formatDate(event.created_at)}</span>
                              </div>
                              <span className="timeline-actor">
                                Tác nhân: {event.actor || 'Hệ thống'}
                              </span>
                              {event.to_unit && <span className="timeline-actor">Đơn vị: {unitNames[event.to_unit] || event.to_unit}</span>}
                              {event.note && <p>{event.note}</p>}
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

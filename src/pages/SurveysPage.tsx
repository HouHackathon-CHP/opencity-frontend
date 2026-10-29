// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Lock,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import { request, type SurveyDetail, type SurveySummary } from '../lib/api';

const formatDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

export function SurveysPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'surveys');

  const [items, setItems] = useState<SurveySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SurveyDetail | null>(null);
  const [choice, setChoice] = useState<string | null>(null);

  // Form states (Officer)
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
    setLoading(true);
    setError('');
    try {
      const data = await request<SurveySummary[]>('/api/opencity/surveys', token);
      setItems(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được danh sách khảo sát.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const item = await request<SurveyDetail>(`/api/opencity/surveys/${encodeURIComponent(id)}`, token);
        setDetail(item);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không tải được nội dung khảo sát.');
      }
    },
    [token],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setDetail(null);
    setChoice(null);
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Create survey (Officer only)
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !operator || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await request<SurveyDetail>('/api/opencity/surveys', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          options: options.map((value) => value.trim()),
        }),
      });
      setShowForm(false);
      setTitle('');
      setDescription('');
      setOptions(['', '']);
      setNotice('Đã công bố khảo sát mới thành công cho công dân trong đơn vị.');
      await refresh();
      setSelectedId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tạo được khảo sát.');
    } finally {
      setBusy(false);
    }
  }

  // Submit citizen answer
  async function answer() {
    if (!token || !detail || !choice || busy || detail.status !== 'open' || detail.my_option_id) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<SurveyDetail>(
        `/api/opencity/surveys/${encodeURIComponent(detail.id)}/answers`,
        token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ option_id: choice }),
        },
      );
      setDetail(updated);
      setNotice('Ý kiến biểu quyết của bạn đã được ghi nhận vào cơ sở dữ liệu.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không gửi được ý kiến.');
    } finally {
      setBusy(false);
    }
  }

  // Close survey (Officer only)
  async function closeSurvey() {
    if (!token || !detail || !operator || busy || detail.status !== 'open') return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await request<SurveyDetail>(
        `/api/opencity/surveys/${encodeURIComponent(detail.id)}/close`,
        token,
        { method: 'POST' },
      );
      setDetail(updated);
      setNotice('Đã đóng khảo sát. Không thể tiếp nhận thêm ý kiến.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đóng được khảo sát.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surveys-page page-width">
      {/* Breadcrumb */}
      <div className="page-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          Danh mục dịch vụ
        </Link>
        <ChevronRight size={14} />
        <span className="breadcrumb-current">Khảo sát ý kiến</span>
      </div>

      {/* Intro Banner */}
      <div className="page-intro-banner">
        <div className="intro-text-col">
          <div className="intro-eyebrow">
            <span className="pulse-indicator" />
            <span>KÊNH LẤY Ý KIẾN CỘNG ĐỒNG</span>
          </div>
          <h1 className="intro-headline">Tham Vấn & Khảo Sát Ý Kiến Cư Dân</h1>
          <p className="intro-paragraph">
            Mỗi tài khoản công dân tham gia biểu quyết một lần cho từng chủ trương. Dữ liệu tổng hợp
            được hiển thị tự động, đảm bảo tính bảo mật và khách quan.
          </p>
        </div>
        <div className="intro-badge-icon" aria-hidden="true">
          <Vote size={40} />
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
              {authLoading ? 'Đang kiểm tra phiên làm việc…' : 'Đăng nhập để tham gia khảo sát'}
            </h2>
            <p className="gate-desc">
              Khảo sát và kết quả ý kiến được phân tách theo phạm vi quản lý của đơn vị bạn.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void login()}
            disabled={authLoading}
          >
            <span>Đăng nhập tài khoản</span>
            <ArrowRight size={16} />
          </button>
        </section>
      ) : (
        <>
          {/* Controls Bar */}
          <div className="reports-control-panel">
            <div className="control-panel-heading">
              <div className="panel-title-wrap">
                <h2>{operator ? 'Trung Tâm Điều Hành Khảo Sát' : 'Khảo Sát Đang Mở Tại Đơn Vị'}</h2>
                <span className={`panel-role-tag ${operator ? 'tag-officer' : 'tag-citizen'}`}>
                  {operator ? <Shield size={13} /> : <UserCheck size={13} />}
                  <span>{operator ? 'Quyền cán bộ điều hành' : 'Quyền công dân'}</span>
                </span>
              </div>
              <p className="panel-subtext">
                {operator
                  ? 'Tạo mới, theo dõi phản hồi và đóng khảo sát khi đã đủ số lượng mẫu.'
                  : 'Ý kiến của bạn giúp cơ quan chức năng cải thiện chất lượng phục vụ và hạ tầng khu vực.'}
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
                  <span>Tạo khảo sát mới</span>
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

          {/* Form for Officer to create survey */}
          {operator && showForm && (
            <section className="form-card-container">
              <div className="form-card-header">
                <div>
                  <span className="form-eyebrow">KHẢO SÁT Ý KIẾN MỚI</span>
                  <h3 className="form-title">Thiết lập câu hỏi và các phương án biểu quyết</h3>
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

              <form onSubmit={(e) => void create(e)} className="report-create-form">
                <div className="form-field">
                  <label htmlFor="survey-title">
                    Tiêu đề khảo sát <span className="req-star">*</span>
                  </label>
                  <input
                    id="survey-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    minLength={5}
                    maxLength={160}
                    required
                    placeholder="Ví dụ: Đóng góp ý kiến về quy hoạch tuyến phố đi bộ"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="survey-desc">
                    Mô tả mục đích và phạm vi lấy ý kiến <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="survey-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    minLength={20}
                    maxLength={2000}
                    rows={4}
                    required
                    placeholder="Mục đích khảo sát, đối tượng thụ hưởng và thời hạn lấy ý kiến..."
                  />
                </div>

                <div className="survey-options-builder">
                  <div className="options-builder-header">
                    <strong>Danh sách phương án lựa chọn (2 – 8 phương án)</strong>
                    <div className="options-counter-actions">
                      {options.length < 8 && (
                        <button
                          type="button"
                          className="btn-outline-sm"
                          onClick={() => setOptions((v) => [...v, ''])}
                        >
                          <Plus size={14} />
                          <span>Thêm phương án</span>
                        </button>
                      )}
                      {options.length > 2 && (
                        <button
                          type="button"
                          className="btn-outline-sm text-danger"
                          onClick={() => setOptions((v) => v.slice(0, -1))}
                        >
                          <Minus size={14} />
                          <span>Bớt phương án</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="options-inputs-grid">
                    {options.map((opt, idx) => (
                      <div key={idx} className="option-field-row">
                        <span className="option-num-badge">{idx + 1}</span>
                        <input
                          value={opt}
                          onChange={(e) =>
                            setOptions((values) =>
                              values.map((v, p) => (p === idx ? e.target.value : v)),
                            )
                          }
                          maxLength={120}
                          required
                          placeholder={`Nội dung phương án ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-actions-footer">
                  <p className="privacy-note">
                    Khảo sát sau khi công bố sẽ hiển thị ngay cho công dân trong đơn vị. Mỗi tài
                    khoản chỉ được biểu quyết 1 lần.
                  </p>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    <Send size={16} />
                    <span>{busy ? 'Đang công bố…' : 'Công bố khảo sát cho cư dân'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Master-Detail Dual Pane Workspace */}
          <div className="workspace-layout">
            {/* Left Pane: Surveys List */}
            <div className="workspace-list-pane">
              <div className="pane-header-strip">
                <span className="pane-title">Danh sách khảo sát</span>
                <span className="pane-count-badge">{items.length} chủ đề</span>
              </div>

              <div className="report-items-container">
                {loading && !items.length ? (
                  <div className="loading-state-card">
                    <RefreshCw className="spin" size={24} />
                    <span>Đang nạp dữ liệu khảo sát…</span>
                  </div>
                ) : items.length ? (
                  items.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`report-item-card ${selectedId === item.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="item-card-top">
                        <span
                          className={`survey-status-tag ${
                            item.status === 'closed'
                              ? 'status-closed'
                              : item.my_option_id
                              ? 'status-voted'
                              : 'status-open'
                          }`}
                        >
                          {item.status === 'closed'
                            ? 'Đã đóng'
                            : item.my_option_id
                            ? 'Đã tham gia'
                            : 'Đang mở nhận ý kiến'}
                        </span>
                      </div>
                      <h4 className="item-card-title">{item.title}</h4>
                      <p className="item-card-desc-snippet">{item.description}</p>
                      <div className="item-card-footer">
                        <span className="item-time">
                          <Clock3 size={12} />
                          {formatDate(item.created_at)}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="empty-list-card">
                    <ClipboardList size={32} />
                    <h4>Chưa có cuộc khảo sát nào</h4>
                    <p>
                      {operator
                        ? 'Nhấn nút "Tạo khảo sát mới" để bắt đầu tham vấn ý kiến cư dân.'
                        : 'Hiện tại chưa có khảo sát nào đang mở trong đơn vị của bạn.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Survey Interaction & Results */}
            <div className="workspace-detail-pane">
              {detail ? (
                <div className="detail-card-inner">
                  {/* Top Header */}
                  <div className="detail-header-row">
                    <div>
                      <span className="detail-id-code">
                        {detail.status === 'closed' ? 'TRẠNG THÁI: ĐÃ ĐÓNG' : 'TRẠNG THÁI: ĐANG MỞ'}
                      </span>
                      <h2 className="detail-title">{detail.title}</h2>
                    </div>
                    <span
                      className={`survey-status-tag ${
                        detail.status === 'closed'
                          ? 'status-closed'
                          : detail.my_option_id
                          ? 'status-voted'
                          : 'status-open'
                      }`}
                    >
                      {detail.status === 'closed'
                        ? 'Đã đóng'
                        : detail.my_option_id
                        ? 'Đã ghi nhận ý kiến'
                        : 'Đang tiếp nhận ý kiến'}
                    </span>
                  </div>

                  <p className="detail-description">{detail.description}</p>

                  <div className="survey-interaction-box">
                    <div className="interaction-heading">
                      <BarChart3 size={18} />
                      <h3>
                        {detail.total_responses === null
                          ? 'Chọn một phương án bên dưới:'
                          : 'Kết quả tổng hợp biểu quyết:'}
                      </h3>
                    </div>

                    <div className="survey-options-list">
                      {detail.options.map((option) => {
                        const isChosen =
                          detail.my_option_id === option.id ||
                          (!detail.my_option_id && choice === option.id);
                        const hasResults = detail.total_responses !== null;
                        const percent =
                          hasResults && detail.total_responses
                            ? Math.round(((option.votes || 0) * 100) / detail.total_responses)
                            : 0;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`survey-option-btn ${isChosen ? 'is-selected' : ''} ${
                              hasResults ? 'has-results' : ''
                            }`}
                            disabled={hasResults || detail.status === 'closed'}
                            onClick={() => setChoice(option.id)}
                            aria-pressed={isChosen}
                          >
                            <div className="option-content-row">
                              <div className="option-radio-mark">
                                {isChosen && <Check size={14} />}
                              </div>
                              <span className="option-label-text">
                                {option.label}
                                {detail.my_option_id === option.id && (
                                  <span className="my-vote-tag">Ý kiến của bạn</span>
                                )}
                              </span>

                              {hasResults && (
                                <span className="option-vote-summary">
                                  <strong>{percent}%</strong>
                                  <small>({option.votes || 0} phiếu)</small>
                                </span>
                              )}
                            </div>

                            {/* Progress bar fill */}
                            {hasResults && (
                              <div className="option-progress-track">
                                <div
                                  className="option-progress-fill"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Submit vote action */}
                    {!detail.my_option_id &&
                      detail.status === 'open' &&
                      detail.total_responses === null && (
                        <div className="vote-action-footer">
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={!choice || busy}
                            onClick={() => void answer()}
                          >
                            <Send size={16} />
                            <span>{busy ? 'Đang gửi ý kiến…' : 'Gửi biểu quyết của tôi'}</span>
                          </button>
                          {!choice && (
                            <span className="vote-hint-text">
                              Vui lòng nhấn chọn một phương án trước khi gửi.
                            </span>
                          )}
                        </div>
                      )}

                    {/* Total responses summary */}
                    {detail.total_responses !== null && (
                      <div className="total-responses-banner">
                        <Users size={16} />
                        <span>
                          Tổng cộng có <strong>{detail.total_responses}</strong> lượt biểu quyết đã
                          được ghi nhận trong đơn vị.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Officer Close Survey Action */}
                  {operator && detail.status === 'open' && (
                    <div className="officer-danger-zone">
                      <div className="danger-zone-text">
                        <ShieldAlert size={18} />
                        <div>
                          <strong>Đóng phiên khảo sát</strong>
                          <p>
                            Khi đóng khảo sát, công dân sẽ không thể gửi thêm biểu quyết và kết quả
                            cuối cùng sẽ được công khai.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-danger-outline"
                        disabled={busy}
                        onClick={() => void closeSurvey()}
                      >
                        <Lock size={15} />
                        <span>Đóng khảo sát này</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="detail-empty-placeholder">
                  <div className="placeholder-icon-wrap">
                    <ClipboardList size={40} />
                  </div>
                  <h3>Chọn một cuộc khảo sát</h3>
                  <p>Mục đích, các phương án lựa chọn và thống kê biểu quyết sẽ hiển thị ở đây.</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

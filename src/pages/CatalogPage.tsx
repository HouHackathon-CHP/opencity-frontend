// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Heart,
  Info,
  Layers,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { categories, featured, serviceHref, services, type Service } from '../lib/catalog';

const favoriteKey = 'opencity-favorites-v1';

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function statusBadge(status: Service['status']) {
  switch (status) {
    case 'available':
      return { label: 'Sẵn sàng dùng', className: 'status-tag-available', dot: true };
    case 'planned':
      return { label: 'Đang phát triển', className: 'status-tag-planned', dot: false };
    case 'needs-integration':
    default:
      return { label: 'Chờ kết nối API', className: 'status-tag-integration', dot: false };
  }
}

function kindBadge(kind: Service['kind']) {
  switch (kind) {
    case 'native':
      return { label: 'OpenCity Trực tiếp', className: 'kind-tag-native' };
    case 'connector':
      return { label: 'Đầu nối DX-OS', className: 'kind-tag-connector' };
    case 'link':
    default:
      return { label: 'Cổng đối tác', className: 'kind-tag-link' };
  }
}

function ServiceCard({
  service,
  favorite,
  onFavorite,
  onDetails,
}: {
  service: Service;
  favorite: boolean;
  onFavorite: (id: string) => void;
  onDetails: (service: Service) => void;
}) {
  const href = serviceHref(service);
  const statusInfo = statusBadge(service.status);
  const kindInfo = kindBadge(service.kind);

  const cardInner = (
    <>
      <div className="service-card-header">
        <div className={`service-icon-box tone-${service.category}`}>
          <Icon name={service.icon} size={22} />
        </div>
        <div className="service-card-badges">
          <span className={`service-kind-badge ${kindInfo.className}`}>
            {kindInfo.label}
          </span>
          <span className={`service-status-pill ${statusInfo.className}`}>
            {statusInfo.dot && <span className="status-live-indicator" />}
            {statusInfo.label}
          </span>
        </div>
      </div>

      <div className="service-card-body">
        <h4 className="service-name">{service.name}</h4>
        <p className="service-desc">{service.description}</p>
      </div>

      <div className="service-card-footer">
        <span className="service-action-hint">
          {href ? (
            <>
              Truy cập dịch vụ
              {service.kind === 'native' ? <ArrowRight size={14} /> : <ExternalLink size={13} />}
            </>
          ) : (
            <>
              Xem thông tin
              <ChevronRight size={14} />
            </>
          )}
        </span>
      </div>
    </>
  );

  return (
    <div className={`service-card ${service.status === 'available' ? 'is-available' : ''}`}>
      {href && service.kind === 'native' ? (
        <Link className="service-card-clickable" to={href}>
          {cardInner}
        </Link>
      ) : href ? (
        <a
          className="service-card-clickable"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
        >
          {cardInner}
        </a>
      ) : (
        <button
          className="service-card-clickable"
          type="button"
          onClick={() => onDetails(service)}
        >
          {cardInner}
        </button>
      )}

      <button
        className={`favorite-toggle-btn ${favorite ? 'active' : ''}`}
        type="button"
        title={favorite ? 'Bỏ lưu yêu thích' : 'Lưu vào mục yêu thích'}
        aria-label={favorite ? `Bỏ yêu thích ${service.name}` : `Yêu thích ${service.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onFavorite(service.id);
        }}
      >
        <Heart size={16} fill={favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

export function CatalogPage() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'planned' | 'needs-integration'>('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
      return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [details, setDetails] = useState<Service | null>(null);

  useEffect(() => {
    localStorage.setItem(favoriteKey, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id: string) =>
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const normalizedQuery = fold(query.trim());

  const visible = useMemo(() => {
    return services.filter((service) => {
      // Category filter
      if (selectedCategory === 'favorites' && !favorites.includes(service.id)) return false;
      if (selectedCategory !== 'all' && selectedCategory !== 'favorites' && service.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && service.status !== statusFilter) {
        return false;
      }
      // Text query
      if (!normalizedQuery) return true;
      const catName = categories.find((c) => c.id === service.category)?.name || '';
      return fold(`${service.name} ${service.description} ${catName}`).includes(normalizedQuery);
    });
  }, [selectedCategory, statusFilter, normalizedQuery, favorites]);

  const groups = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: visible.filter((service) => service.category === category.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [visible]);

  const featuredServices = useMemo(() => {
    return featured
      .map((id) => services.find((service) => service.id === id))
      .filter((service): service is Service => Boolean(service));
  }, []);

  const totalAvailable = useMemo(
    () => services.filter((s) => s.status === 'available').length,
    [],
  );

  return (
    <div className="catalog-page">
      {/* Dynamic Luminous Hero Section */}
      <section className="hero-section">
        <div className="hero-glow-orb hero-glow-1" aria-hidden="true" />
        <div className="hero-glow-orb hero-glow-2" aria-hidden="true" />
        <div className="hero-grid-pattern" aria-hidden="true" />

        <div className="page-width hero-container">
          <div className="hero-content">
            <div className="hero-tag-badge">
              <span className="hero-pulse-dot" />
              <span>Nền Tảng Dịch Vụ Đô Thị Số DX-OS</span>
            </div>

            <h1 className="hero-main-title">
              Thành phố minh bạch,
              <br />
              <span className="hero-gradient-text">chuyển động cùng công dân.</span>
            </h1>

            <p className="hero-lead-text">
              Một cổng truy cập hợp nhất các tiện ích đô thị số, phản ánh hiện trường tức thì,
              tin tức cảnh báo khu vực và khảo sát ý kiến cộng đồng trên nền tảng mở.
            </p>

            <div className="hero-cta-group">
              <Link className="btn-primary hero-btn" to="/reports">
                <MapPin size={18} />
                <span>Gửi phản ánh ngay</span>
                <ArrowRight size={17} />
              </Link>
              <a className="btn-secondary hero-btn" href="#danh-muc">
                <SlidersHorizontal size={17} />
                <span>Tra cứu {services.length} dịch vụ</span>
              </a>
            </div>

            {/* Live Metrics Bar */}
            <div className="hero-metrics-grid">
              <div className="metric-card">
                <strong className="metric-number">{services.length}+</strong>
                <span className="metric-label">Dịch vụ tích hợp</span>
              </div>
              <div className="metric-card">
                <strong className="metric-number">{categories.length}</strong>
                <span className="metric-label">Lĩnh vực quản lý</span>
              </div>
              <div className="metric-card">
                <strong className="metric-number metric-highlight">{totalAvailable}</strong>
                <span className="metric-label">Dịch vụ sẵn sàng</span>
              </div>
              <div className="metric-card">
                <strong className="metric-number">100%</strong>
                <span className="metric-label">Mã nguồn mở</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Services (Tiện ích nổi bật) */}
      <section className="featured-section page-width">
        <div className="section-header-row">
          <div>
            <div className="section-eyebrow">
              <Zap size={15} />
              <span>TIỆN ÍCH NỔI BẬT</span>
            </div>
            <h2 className="section-title">Khám phá nhanh các dịch vụ trọng tâm</h2>
          </div>
          <p className="section-subtitle">
            Những dịch vụ thường nhật và tiện ích thiết yếu được lựa chọn cho bạn.
          </p>
        </div>

        <div className="featured-cards-grid">
          {featuredServices.map((service) => {
            const href = serviceHref(service);
            const statusInfo = statusBadge(service.status);
            return (
              <button
                type="button"
                key={service.id}
                className={`featured-tile ${service.status === 'available' ? 'is-active' : ''}`}
                onClick={() => {
                  if (href && service.kind === 'native') {
                    window.location.assign(href);
                  } else {
                    setDetails(service);
                  }
                }}
              >
                <div className="featured-tile-top">
                  <div className={`tile-icon-box tone-${service.category}`}>
                    <Icon name={service.icon} size={24} />
                  </div>
                  <span className={`tile-status ${statusInfo.className}`}>
                    {statusInfo.dot && <span className="status-live-indicator" />}
                    {statusInfo.label}
                  </span>
                </div>

                <div className="featured-tile-info">
                  <strong className="tile-title">{service.name}</strong>
                  <p className="tile-desc">{service.description}</p>
                </div>

                <div className="featured-tile-arrow">
                  <span>Khám phá</span>
                  <ArrowUpRight size={16} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Comprehensive Catalog Directory Section */}
      <section className="catalog-directory-section" id="danh-muc">
        <div className="page-width">
          <div className="catalog-directory-header">
            <div className="catalog-header-text">
              <div className="section-eyebrow">
                <Layers size={15} />
                <span>TOÀN BỘ DANH MỤC DỊCH VỤ</span>
              </div>
              <h2 className="section-title">Tìm đúng điều bạn cần cho đời sống đô thị</h2>
              <p className="section-subtitle">
                Hệ thống phân loại minh bạch: dịch vụ đã kết nối thực tế, đang thử nghiệm, và kế hoạch mở rộng.
              </p>
            </div>

            {/* Search and Quick Tools */}
            <div className="catalog-search-wrapper">
              <div className="catalog-search-bar">
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên dịch vụ, mô tả, từ khóa..."
                  aria-label="Tìm kiếm dịch vụ đô thị"
                />
                {query && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setQuery('')}
                    aria-label="Xóa nội dung tìm kiếm"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filtering Controls Row */}
          <div className="catalog-filters-bar">
            {/* Status Filter Chips */}
            <div className="status-filter-pills" role="radiogroup" aria-label="Lọc theo trạng thái">
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Tất cả trạng thái
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'available' ? 'active' : ''}`}
                onClick={() => setStatusFilter('available')}
              >
                <span className="status-live-indicator" />
                Sẵn sàng ({totalAvailable})
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'planned' ? 'active' : ''}`}
                onClick={() => setStatusFilter('planned')}
              >
                Đang phát triển
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'needs-integration' ? 'active' : ''}`}
                onClick={() => setStatusFilter('needs-integration')}
              >
                Chờ kết nối API
              </button>
            </div>

            <div className="catalog-count-badge">
              <span>{visible.length}</span> dịch vụ hiển thị
            </div>
          </div>

          {/* Horizontal Category Scroll Tabs */}
          <div className="category-scroll-tabs" role="group" aria-label="Lọc theo lĩnh vực">
            <button
              type="button"
              className={`cat-tab-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              <span>Tất cả lĩnh vực</span>
            </button>
            <button
              type="button"
              className={`cat-tab-btn ${selectedCategory === 'favorites' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('favorites')}
            >
              <Heart size={14} fill={selectedCategory === 'favorites' ? 'currentColor' : 'none'} />
              <span>Yêu thích ({favorites.length})</span>
            </button>
            {categories.map((cat) => {
              const count = services.filter((s) => s.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`cat-tab-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  <Icon name={cat.icon} size={15} />
                  <span>{cat.name}</span>
                  <span className="cat-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Services Grouping or Empty Results */}
          {groups.length > 0 ? (
            <div className="catalog-groups-container">
              {groups.map(({ category, items }) => (
                <div key={category.id} className="catalog-category-group">
                  <div className="category-group-header">
                    <div className="group-title-wrap">
                      <div className={`group-header-icon tone-${category.id}`}>
                        <Icon name={category.icon} size={20} />
                      </div>
                      <h3 className="group-title">{category.name}</h3>
                    </div>
                    <span className="group-item-counter">{items.length} dịch vụ</span>
                  </div>

                  <div className="catalog-services-grid">
                    {items.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        favorite={favorites.includes(service.id)}
                        onFavorite={toggleFavorite}
                        onDetails={setDetails}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="catalog-empty-box">
              <div className="empty-icon-circle">
                <Search size={32} />
              </div>
              <h3>Không tìm thấy dịch vụ phù hợp</h3>
              <p>
                Thử đổi từ khóa tìm kiếm hoặc bỏ chọn các bộ lọc trạng thái và lĩnh vực hiện tại.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setQuery('');
                  setSelectedCategory('all');
                  setStatusFilter('all');
                }}
              >
                Đặt lại toàn bộ bộ lọc
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Platform Architecture Callout */}
      <section className="page-width platform-callout-section">
        <div className="callout-card">
          <div className="callout-left">
            <div className="callout-badge">
              <Sparkles size={16} />
              <span>KIẾN TRÚC MỞ · DX-OS CORE</span>
            </div>
            <h2 className="callout-heading">
              Một nền tảng chung, kết nối đa dịch vụ và linh hoạt mở rộng.
            </h2>
            <p className="callout-description">
              OpenCity phân biệt rõ ràng giữa dịch vụ đang vận hành chính thức, chức năng đang được
              cộng đồng phát triển và các đầu nối đang chờ cơ quan thẩm quyền chia sẻ API. Không tạo
              nút giả, minh bạch từng luồng dữ liệu.
            </p>
          </div>
          <div className="callout-action-col">
            <a
              href="https://github.com/HouHackathon-CHP/dxos-core"
              target="_blank"
              rel="noreferrer"
              className="btn-light-solid"
            >
              <span>Xem tài liệu DX-OS</span>
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* Modern Detail Modal */}
      {details && (
        <div className="modal-overlay" onClick={() => setDetails(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-service-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              type="button"
              aria-label="Đóng cửa sổ"
              onClick={() => setDetails(null)}
            >
              <X size={20} />
            </button>

            <div className="modal-header">
              <div className={`modal-icon-badge tone-${details.category}`}>
                <Icon name={details.icon} size={32} />
              </div>
              <div className="modal-tags">
                <span className="modal-category-name">
                  {categories.find((c) => c.id === details.category)?.name}
                </span>
                <span className={`modal-status-badge ${statusBadge(details.status).className}`}>
                  {statusBadge(details.status).label}
                </span>
              </div>
              <h2 id="modal-service-title" className="modal-title">
                {details.name}
              </h2>
            </div>

            <div className="modal-body">
              <p className="modal-description">{details.description}</p>

              <div className="modal-info-panel">
                <div className="info-panel-item">
                  <span className="info-panel-label">Phân loại kiến trúc</span>
                  <strong className="info-panel-val">{kindBadge(details.kind).label}</strong>
                </div>
                <div className="info-panel-item">
                  <span className="info-panel-label">Mã định danh tiện ích</span>
                  <code className="info-panel-code">{details.id}</code>
                </div>
              </div>

              <div className="modal-status-notice">
                <Info size={18} className="notice-icon" />
                <div className="notice-text">
                  {details.status === 'planned' ? (
                    <span>
                      Tiện ích này đang trong lộ trình phát triển của cộng đồng OpenCity. Mã nguồn và
                      giao diện đang được hoàn thiện trước khi mở chính thức.
                    </span>
                  ) : details.status === 'available' ? (
                    <span>
                      Tiện ích này đã sẵn sàng để thử nghiệm và tương tác qua tài khoản công dân
                      hoặc cán bộ OpenCity.
                    </span>
                  ) : (
                    <span>
                      Tiện ích này yêu cầu đầu nối (connector) hoặc ủy quyền truy cập từ hệ thống
                      chuyên ngành. Bạn có thể theo dõi tiến độ tích hợp trên kho mã nguồn.
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {serviceHref(details) ? (
                details.kind === 'native' ? (
                  <Link
                    to={serviceHref(details)!}
                    className="btn-primary"
                    onClick={() => setDetails(null)}
                  >
                    <span>Mở tiện ích ngay</span>
                    <ArrowRight size={16} />
                  </Link>
                ) : (
                  <a
                    href={serviceHref(details)!}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary"
                    onClick={() => setDetails(null)}
                  >
                    <span>Đến cổng dịch vụ</span>
                    <ExternalLink size={16} />
                  </a>
                )
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setDetails(null)}
                >
                  <span>Đã hiểu</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

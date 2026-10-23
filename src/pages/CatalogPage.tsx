// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Heart, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { categories, featured, serviceHref, services, type Service } from '../lib/catalog';

const favoriteKey = 'opencity-favorites-v1';

function fold(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

function statusLabel(service: Service) {
  if (service.status === 'available') return 'Dùng thử';
  return service.status === 'planned' ? 'Đang phát triển' : 'Chờ kết nối';
}

function ServiceCard({ service, favorite, onFavorite, onDetails }: {
  service: Service; favorite: boolean; onFavorite: (id: string) => void; onDetails: (service: Service) => void;
}) {
  const href = serviceHref(service);
  const content = <>
    <span className={`service-icon tone-${service.category}`}><Icon name={service.icon} size={25} /></span>
    <span className="service-info"><strong>{service.name}</strong><small>{service.description}</small></span>
    <span className={`service-status ${service.status === 'available' ? 'ready' : ''}`}>{service.status === 'available' && <span className="status-dot" />}{statusLabel(service)}</span>
    {href ? <ArrowUpRight className="service-arrow" size={18} /> : <ChevronRight className="service-arrow" size={18} />}
  </>;
  return <div className="service-card">
    {href && service.kind === 'native' ? <Link className="service-main" to={href}>{content}</Link> : href ? <a className="service-main" href={href} target="_blank" rel="noreferrer noopener">{content}</a> : <button className="service-main" type="button" onClick={() => onDetails(service)}>{content}</button>}
    <button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} type="button" title={favorite ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'} aria-label={favorite ? `Bỏ yêu thích ${service.name}` : `Yêu thích ${service.name}`} onClick={() => onFavorite(service.id)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button>
  </div>;
}

export function CatalogPage() {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem(favoriteKey) || '[]'); return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []; }
    catch { return []; }
  });
  const [details, setDetails] = useState<Service | null>(null);

  useEffect(() => localStorage.setItem(favoriteKey, JSON.stringify(favorites)), [favorites]);
  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const normalizedQuery = fold(query.trim());
  const visible = useMemo(() => services.filter((service) => {
    if (selectedCategory === 'favorites' && !favorites.includes(service.id)) return false;
    if (selectedCategory !== 'all' && selectedCategory !== 'favorites' && service.category !== selectedCategory) return false;
    return !normalizedQuery || fold(`${service.name} ${service.description} ${categories.find((category) => category.id === service.category)?.name || ''}`).includes(normalizedQuery);
  }), [selectedCategory, normalizedQuery, favorites]);
  const groups = categories.map((category) => ({ category, items: visible.filter((service) => service.category === category.id) })).filter((group) => group.items.length);
  const featuredServices = featured.map((id) => services.find((service) => service.id === id)).filter((service): service is Service => Boolean(service));

  return <>
    <section className="hero"><div className="page-width hero-inner"><div className="hero-copy"><div className="hero-eyebrow"><span className="pulse" /> Nền tảng đô thị mở</div><h1>Thành phố trong <em>tầm tay bạn.</em></h1><p>Một cổng chung để kết nối người dân, dịch vụ và những người đang làm cho đô thị tốt hơn mỗi ngày.</p><div className="hero-actions"><Link className="hero-primary" to="/reports">Gửi phản ánh đầu tiên <ArrowRight size={18} /></Link><a className="hero-secondary" href="#danh-muc">Khám phá dịch vụ <ChevronRight size={17} /></a></div></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="city-hill hill-back" /><div className="city-hill hill-front" /><div className="city-building b-one" /><div className="city-building b-two" /><div className="city-building b-three" /><div className="city-building b-four" /><div className="hero-pin"><Icon name="MapPin" size={24} /></div><div className="hero-floating float-one"><Check size={14} /> Đã tiếp nhận</div><div className="hero-floating float-two"><Icon name="MessagesSquare" size={16} /> Cộng đồng kết nối</div></div></div></section>

    <section className="page-width quick-section"><div className="section-heading"><div><span className="kicker">BẮT ĐẦU TỪ ĐÂY</span><h2>Tiện ích nổi bật</h2></div><p>Những việc thường cần, gom lại một nơi.</p></div><div className="quick-grid">{featuredServices.map((service) => <button className={`quick-card ${service.status === 'available' ? 'quick-ready' : ''}`} type="button" key={service.id} onClick={() => { const href = serviceHref(service); if (href && service.kind === 'native') window.location.assign(href); else setDetails(service); }}><span className={`quick-icon tone-${service.category}`}><Icon name={service.icon} size={26} /></span><strong>{service.name}</strong><small>{statusLabel(service)}</small><ArrowUpRight size={17} className="quick-arrow" /></button>)}</div></section>

    <section className="catalog-zone" id="danh-muc"><div className="page-width"><div className="section-heading catalog-heading"><div><span className="kicker">DANH MỤC DỊCH VỤ</span><h2>Tìm đúng điều bạn cần</h2></div><div className="catalog-count"><strong>{services.length}</strong><span>dịch vụ trong<br />{categories.length} lĩnh vực</span></div></div><div className="catalog-controls"><label className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm dịch vụ, lĩnh vực..." aria-label="Tìm dịch vụ" />{query && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')}><X size={17} /></button>}</label><span className="filter-label"><SlidersHorizontal size={17} /> Lọc theo lĩnh vực</span></div><div className="category-tabs" role="group" aria-label="Lọc theo lĩnh vực"><button className={selectedCategory === 'all' ? 'active' : ''} onClick={() => setSelectedCategory('all')} type="button">Tất cả</button><button className={selectedCategory === 'favorites' ? 'active' : ''} onClick={() => setSelectedCategory('favorites')} type="button"><Heart size={15} /> Yêu thích</button>{categories.map((category) => <button key={category.id} className={selectedCategory === category.id ? 'active' : ''} onClick={() => setSelectedCategory(category.id)} type="button">{category.name}</button>)}</div>{groups.length ? <div className="catalog-groups">{groups.map(({ category, items }) => <section className="catalog-group" key={category.id}><div className="group-heading"><span className={`group-icon tone-${category.id}`}><Icon name={category.icon} size={20} /></span><h3>{category.name}</h3><span>{items.length} dịch vụ</span></div><div className="services-grid">{items.map((service) => <ServiceCard key={service.id} service={service} favorite={favorites.includes(service.id)} onFavorite={toggleFavorite} onDetails={setDetails} />)}</div></section>)}</div> : <div className="empty-state"><Search size={28} /><h3>Chưa tìm thấy dịch vụ</h3><p>Thử từ khóa khác hoặc xem toàn bộ danh mục.</p><button type="button" onClick={() => { setQuery(''); setSelectedCategory('all'); }}>Xem tất cả <ArrowRight size={16} /></button></div>}</div></section>

    <section className="page-width callout"><div className="callout-icon"><Sparkles size={24} /></div><div><span className="kicker">MỘT NỀN TẢNG, NHIỀU ỨNG DỤNG</span><h2>Dịch vụ mới có thể được thêm vào danh mục mà không thay đổi lõi.</h2><p>OpenCity phân biệt dịch vụ đang vận hành, chức năng đang phát triển và kết nối cần sự cho phép của đơn vị cung cấp.</p></div><a href="https://github.com/HouHackathon-CHP/dxos-core" target="_blank" rel="noreferrer">Khám phá DX-OS <ArrowUpRight size={17} /></a></section>

    {details && <div className="modal-backdrop" onClick={() => setDetails(null)}><section className="service-modal" role="dialog" aria-modal="true" aria-labelledby="service-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" aria-label="Đóng" onClick={() => setDetails(null)}><X size={20} /></button><span className={`modal-service-icon tone-${details.category}`}><Icon name={details.icon} size={30} /></span><span className="kicker">{details.kind === 'native' ? 'DỊCH VỤ OPENCity' : details.kind === 'connector' ? 'DỊCH VỤ TÍCH HỢP' : 'LIÊN KẾT NGOÀI'}</span><h2 id="service-title">{details.name}</h2><p>{details.description}</p><div className="modal-note">{details.status === 'planned' ? 'Chức năng này đang được phát triển. Thông tin trong danh mục là kế hoạch, chưa phải dịch vụ đang vận hành.' : 'Dịch vụ này cần API hoặc đường dẫn chính thức từ đơn vị cung cấp trước khi có thể truy cập.'}</div><button className="modal-action" type="button" onClick={() => setDetails(null)}>Đã hiểu <ArrowRight size={16} /></button></section></div>}
  </>;
}

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock3, ListFilter, MapPin, RefreshCw, TriangleAlert } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canDispatch } from '../lib/permissions';
import { reportStates, request, type Report } from '../lib/api';

const unitNames: Record<string, string> = {
  infrastructure: 'Hạ tầng & chiếu sáng',
  environment: 'Môi trường & cây xanh',
  transport: 'Giao thông',
  intake: 'Tiếp nhận chung',
};
const osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileUrl = import.meta.env.VITE_MAP_TILE_URL || osmTiles;

function hasCoordinates(report: Report): report is Report & { latitude: number; longitude: number } {
  return typeof report.latitude === 'number' && Number.isFinite(report.latitude) &&
    report.latitude >= -90 && report.latitude <= 90 &&
    typeof report.longitude === 'number' && Number.isFinite(report.longitude) &&
    report.longitude >= -180 && report.longitude <= 180;
}

function isOverdue(report: Report): boolean {
  return Boolean(report.due_at && report.state !== 'resolved' && Date.parse(report.due_at) < Date.now());
}

function isDueSoon(report: Report): boolean {
  if (!report.due_at || report.state === 'resolved') return false;
  const due = Date.parse(report.due_at);
  return due >= Date.now() && due <= Date.now() + 24 * 60 * 60 * 1000;
}

function reportLabel(report: Report): string {
  return reportStates[report.state || 'submitted'] || report.state || 'Mới gửi';
}

export function ReportsMapPage() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const token = user?.access_token || '';
  const dispatcher = canDispatch(user);
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [unit, setUnit] = useState(searchParams.get('unit') || 'all');
  const [state, setState] = useState(searchParams.get('status') || 'all');
  const [dueFilter, setDueFilter] = useState(searchParams.get('due') || 'all');
  const [listMode, setListMode] = useState<'all' | 'without-coordinates'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await request<Report[]>('/api/opencity/reports', token);
      setReports(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được hồ sơ phản ánh.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const categories = useMemo(() => [...new Set(reports.map((report) => report.category).filter(Boolean))].sort(), [reports]);
  const units = useMemo(() => [...new Set(reports.map((report) => report.assigned_unit || 'unassigned'))].sort(), [reports]);
  const filtered = useMemo(() => reports.filter((report) => {
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return (category === 'all' || report.category === category) &&
      (unit === 'all' || (report.assigned_unit || 'unassigned') === unit) &&
      (state === 'all' || (state === 'open' ? report.state !== 'resolved' : (report.state || 'submitted') === state)) &&
      (dueFilter === 'all' || (dueFilter === 'overdue' && isOverdue(report)) ||
        (dueFilter === 'due_soon' && isDueSoon(report))) &&
      (!needle || [report.id, report.title, report.address, report.category]
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(needle)));
  }), [reports, query, category, unit, state, dueFilter]);
  const located = useMemo(() => filtered.filter(hasCoordinates), [filtered]);
  const withoutCoordinates = useMemo(() => filtered.filter((report) => !hasCoordinates(report)), [filtered]);
  const visibleList = listMode === 'all' ? filtered : withoutCoordinates;
  const selected = filtered.find((report) => report.id === selectedId) || null;
  const overdueCount = filtered.filter(isOverdue).length;

  useEffect(() => {
    if (!mapElement.current) return;
    try {
      maplibregl.setWorkerUrl(workerUrl);
      const map = new maplibregl.Map({
        container: mapElement.current,
        style: {
          version: 8,
          sources: {
            osm: { type: 'raster', tiles: [tileUrl], tileSize: 256,
              attribution: '© OpenStreetMap contributors' },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [105.8342, 21.0278],
        zoom: 10,
        maxZoom: 18,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        map.addSource('reports', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 14,
        });
        map.addLayer({ id: 'report-clusters', type: 'circle', source: 'reports',
          filter: ['has', 'point_count'],
          paint: { 'circle-color': '#1d4ed8', 'circle-radius': ['step', ['get', 'point_count'], 19, 10, 24, 50, 30],
            'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'report-cluster-count', type: 'symbol', source: 'reports',
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
          paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'report-points', type: 'circle', source: 'reports',
          filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': ['case', ['get', 'overdue'], '#dc2626',
            ['match', ['get', 'state'], 'resolved', '#059669', 'assigned', '#d97706', '#2563eb']],
            'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'report-selected', type: 'circle', source: 'reports',
          filter: ['==', ['get', 'id'], ''],
          paint: { 'circle-color': '#ffffff', 'circle-opacity': 0,
            'circle-radius': 16, 'circle-stroke-color': '#111827', 'circle-stroke-width': 3 } });
        map.on('click', 'report-points', (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string') setSelectedId(id);
        });
        map.on('click', 'report-clusters', (event) => {
          const feature = event.features?.[0];
          const clusterId = feature?.properties?.cluster_id;
          if (!feature || typeof clusterId !== 'number' || feature.geometry.type !== 'Point') return;
          const coordinates = feature.geometry.coordinates as [number, number];
          const source = map.getSource('reports') as GeoJSONSource;
          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            map.easeTo({ center: coordinates, zoom });
          }).catch(() => { /* The map may have been removed during navigation. */ });
        });
        for (const layer of ['report-points', 'report-clusters']) {
          map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
        }
        setMapReady(true);
      });
      map.on('error', (event) => {
        if (!event.error) return;
        setMapError('Không tải được nền bản đồ. Danh sách hồ sơ vẫn có thể sử dụng.');
      });
      return () => { mapRef.current = null; map.remove(); setMapReady(false); };
    } catch {
      setMapError('Trình duyệt không thể khởi tạo bản đồ. Danh sách hồ sơ vẫn có thể sử dụng.');
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('reports') as GeoJSONSource | undefined;
    if (!source) return;
    const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: located.map((report) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [report.longitude, report.latitude] },
        properties: { id: report.id, state: report.state || 'submitted', overdue: isOverdue(report) },
      })),
    };
    void source.setData(collection);
    if (located.length === 1) {
      map.flyTo({ center: [located[0].longitude, located[0].latitude], zoom: 13 });
    } else if (located.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      located.forEach((report) => bounds.extend([report.longitude, report.latitude]));
      map.fitBounds(bounds, { padding: 64, maxZoom: 13 });
    }
  }, [located, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setFilter('report-selected', ['==', ['get', 'id'], selectedId || '']);
    if (selected && hasCoordinates(selected)) {
      map.easeTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(map.getZoom(), 12) });
    }
  }, [selectedId, selected, mapReady]);

  return (
    <div className="reports-map-page page-width">
      <div className="page-breadcrumb"><Link className="breadcrumb-link" to="/reports">Phản ánh hiện trường</Link><span> / Bản đồ điều hành</span></div>
      <div className="reports-map-heading">
        <div>
          <p className="reports-map-eyebrow">ĐIỀU HÀNH PHẢN ÁNH</p>
          <h1>Bản đồ hiện trường</h1>
          <p>Dữ liệu hồ sơ được giới hạn theo quyền và đơn vị của tài khoản đang đăng nhập.</p>
        </div>
        <div className="reports-map-heading-actions">
          <button type="button" className="btn-outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Làm mới
          </button>
          <Link className="btn-outline" to="/reports"><ArrowLeft size={16} /> Danh sách hồ sơ</Link>
        </div>
      </div>

      {error && <div className="alert-box alert-error" role="alert"><TriangleAlert size={18} />{error}</div>}
      <div className="reports-map-stats" aria-label="Thống kê theo bộ lọc">
        <div><strong>{filtered.length}</strong><span>Hồ sơ</span></div>
        <div><strong>{located.length}</strong><span>Có tọa độ</span></div>
        <div><strong>{withoutCoordinates.length}</strong><span>Chưa có tọa độ</span></div>
        <div className="reports-map-stat-overdue"><strong>{overdueCount}</strong><span>Quá hạn</span></div>
      </div>

      <section className="reports-map-filters" aria-label="Lọc hồ sơ">
        <label>Tìm hồ sơ<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, địa chỉ hoặc mã hồ sơ" /></label>
        <label>Lĩnh vực<select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">Tất cả lĩnh vực</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Đơn vị<select value={unit} onChange={(event) => setUnit(event.target.value)}>
          <option value="all">Tất cả đơn vị được xem</option>
          {units.map((value) => <option key={value} value={value}>{value === 'unassigned' ? 'Không gắn đơn vị' : unitNames[value] || value}</option>)}
        </select></label>
        <label>Trạng thái<select value={state} onChange={(event) => setState(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="open">Chưa hoàn tất</option>
          {Object.entries(reportStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Hạn xử lý<select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
          <option value="all">Tất cả hạn xử lý</option>
          <option value="due_soon">Sắp đến hạn (24 giờ)</option>
          <option value="overdue">Đã quá hạn</option>
        </select></label>
      </section>

      <div className="reports-map-layout">
        <section className="reports-map-canvas-card" aria-label="Bản đồ hồ sơ phản ánh">
          <div ref={mapElement} className="reports-map-canvas" />
          {mapError && <div className="reports-map-map-error" role="status">{mapError}</div>}
          <div className="reports-map-legend"><span><i className="legend-new" /> Mới / tiếp nhận</span><span><i className="legend-assigned" /> Đang xử lý</span><span><i className="legend-overdue" /> Quá hạn</span><span><i className="legend-resolved" /> Hoàn tất</span></div>
          {selected && (
            <div className="reports-map-selected">
              <span className="reports-map-selected-label">Hồ sơ đang chọn</span>
              <strong>{selected.title}</strong>
              <small>{selected.address || 'Chưa có địa chỉ'} · {reportLabel(selected)}</small>
              <Link className="btn-primary" to={`/reports?report=${encodeURIComponent(selected.id)}`}>
                {dispatcher ? 'Mở hồ sơ / phân công' : 'Mở hồ sơ xử lý'}
              </Link>
            </div>
          )}
        </section>

        <section className="reports-map-list" aria-label="Danh sách hồ sơ theo bộ lọc">
          <div className="reports-map-list-head"><ListFilter size={17} /><strong>Hồ sơ theo bộ lọc</strong></div>
          <div className="reports-map-list-tabs">
            <button type="button" className={listMode === 'all' ? 'active' : ''} onClick={() => setListMode('all')}>Tất cả ({filtered.length})</button>
            <button type="button" className={listMode === 'without-coordinates' ? 'active' : ''} onClick={() => setListMode('without-coordinates')}>Thiếu tọa độ ({withoutCoordinates.length})</button>
          </div>
          <div className="reports-map-list-items">
            {loading && reports.length === 0 && <p className="reports-map-empty">Đang tải hồ sơ…</p>}
            {!loading && visibleList.length === 0 && <p className="reports-map-empty">Không có hồ sơ phù hợp.</p>}
            {visibleList.map((report) => (
              <button key={report.id} type="button" onClick={() => setSelectedId(report.id)}
                className={`reports-map-item ${selectedId === report.id ? 'selected' : ''}`}>
                <span className="reports-map-item-top"><strong>{report.title}</strong>{isOverdue(report) && <em>Quá hạn</em>}</span>
                <span>{report.address || 'Chưa có địa chỉ'}</span>
                <small><span>{reportLabel(report)}</span><span>{unitNames[report.assigned_unit || ''] || 'Chưa phân công'}</span></small>
                <span className="reports-map-item-location">{hasCoordinates(report) ? <><MapPin size={13} /> Có tọa độ</> : <><Clock3 size={13} /> Chưa có tọa độ</>}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

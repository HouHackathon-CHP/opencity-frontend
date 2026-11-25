// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  Crosshair,
  FileText,
  Landmark,
  Layers,
  Map as MapIcon,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { apiBase } from '../lib/auth';
import { Pagination } from '../components/Pagination';
import {
  getWardDetail,
  listWardDistricts,
  listWards,
  locateWard,
  type DistrictSummary,
  type WardDetail,
  type WardSummary,
} from '../lib/api';

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const ITEMS_PER_PAGE = 8;
const HANOI_CENTER: [number, number] = [105.8342, 21.0278];

function setup3DBuildings(map: MapLibreMap) {
  if (map.getLayer('3d-buildings')) return;
  const style = map.getStyle();
  if (!style || !map.getSource('openmaptiles')) return;

  let firstLabelId: string | undefined;
  for (const layer of style.layers || []) {
    if (layer.type === 'symbol') {
      firstLabelId = layer.id;
      break;
    }
  }

  try {
    if (map.getLayer('building')) {
      map.removeLayer('building');
    }
    map.addLayer(
      {
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#d5dbe4',
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            0,
            14.5,
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            0,
            14.5,
            ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
          ],
          'fill-extrusion-opacity': 0.82,
        },
      },
      firstLabelId
    );
  } catch (err) {
    console.warn('Cannot setup 3D buildings layer', err);
  }
}

export function WardMapPage() {
  const { user } = useAuth();
  const token = user?.access_token || '';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [wards, setWards] = useState<WardSummary[]>([]);
  const [districts, setDistricts] = useState<DistrictSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [selectedDistrict, setSelectedDistrict] = useState(searchParams.get('district') || 'all');
  const [selectedType, setSelectedType] = useState(searchParams.get('type') || 'all');
  const [currentPage, setCurrentPage] = useState(1);

  // Selected ward
  const [selectedWardId, setSelectedWardId] = useState<string | null>(searchParams.get('id'));
  const selectedWardIdRef = useRef<string | null>(selectedWardId);
  const prevSelectedWardIdRef = useRef<string | null>(null);
  const [selectedWardDetail, setSelectedWardDetail] = useState<WardDetail | null>(null);

  useEffect(() => {
    selectedWardIdRef.current = selectedWardId;
  }, [selectedWardId]);

  // User location & toast
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Map state
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const [is3D, setIs3D] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);

  useEffect(() => {
    listWardDistricts(token)
      .then((data) => {
        if (Array.isArray(data)) setDistricts(data);
      })
      .catch((err) => console.error('Failed to load districts', err));
  }, [token]);

  const fetchWards = useCallback(() => {
    setLoading(true);
    setError(null);
    listWards(token, {
      keyword: keyword.trim() || undefined,
      district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
      lat: userLocation?.lat,
      lon: userLocation?.lon,
      limit: 300,
    })
      .then((data) => {
        setWards(data);
        setCurrentPage(1);
      })
      .catch((err) => {
        console.error('Failed to load wards', err);
        setError('Không thể tải danh sách xã/phường. Vui lòng thử lại sau.');
      })
      .finally(() => setLoading(false));
  }, [token, keyword, selectedDistrict, userLocation]);

  useEffect(() => {
    fetchWards();
  }, [fetchWards]);

  const typeCounts = useMemo(() => ({
    all: wards.length,
    Phường: wards.filter((w) => w.type === 'Phường').length,
    Xã: wards.filter((w) => w.type === 'Xã').length,
    'Thị trấn': wards.filter((w) => w.type === 'Thị trấn').length,
  }), [wards]);

  const filteredWards = useMemo(() => {
    if (selectedType === 'all') return wards;
    return wards.filter((w) => w.type === selectedType);
  }, [wards, selectedType]);

  useEffect(() => {
    if (!selectedWardId) {
      setSelectedWardDetail(null);
      return;
    }
    getWardDetail(selectedWardId, token)
      .then((detail) => {
        setSelectedWardDetail(detail);
      })
      .catch((err) => console.error('Failed to load ward detail', err));
  }, [selectedWardId, token]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (selectedDistrict !== 'all') params.set('district', selectedDistrict);
    if (selectedType !== 'all') params.set('type', selectedType);
    if (selectedWardId) params.set('id', selectedWardId);
    setSearchParams(params, { replace: true });
  }, [keyword, selectedDistrict, selectedType, selectedWardId, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil(filteredWards.length / ITEMS_PER_PAGE));
  const paginatedWards = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredWards.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredWards, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      maplibregl.setWorkerUrl(workerUrl);
    } catch {
      // ignore
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: POSITRON_STYLE,
      center: HANOI_CENTER,
      zoom: 10.3,
      pitch: 0,
      bearing: 0,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      setup3DBuildings(map);

      const boundariesUrl = `${apiBase.replace(/\/$/, '')}/api/opencity/wards/boundaries`;
      map.addSource('ward-boundaries', {
        type: 'geojson',
        data: boundariesUrl,
      });

      const beforeBuildings = map.getLayer('3d-buildings') ? '3d-buildings' : undefined;

      // 1. Fill layer
      map.addLayer(
        {
          id: 'ward-boundary-fill',
          type: 'fill',
          source: 'ward-boundaries',
          paint: {
            'fill-color': [
              'match',
              ['get', 'type'],
              'Phường',
              '#3b82f6',
              'Xã',
              '#10b981',
              'Thị trấn',
              '#8b5cf6',
              '#64748b',
            ],
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              0.42,
              ['boolean', ['feature-state', 'selected'], false],
              0.55,
              0.16,
            ],
          },
        },
        beforeBuildings
      );

      // 2. Line layer
      map.addLayer(
        {
          id: 'ward-boundary-line',
          type: 'line',
          source: 'ward-boundaries',
          paint: {
            'line-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#ea580c',
              ['boolean', ['feature-state', 'hover'], false],
              '#2563eb',
              '#94a3b8',
            ],
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              4.5,
              ['boolean', ['feature-state', 'hover'], false],
              2.5,
              1.2,
            ],
            'line-opacity': 0.9,
          },
        },
        beforeBuildings
      );

      // 3. Labels
      map.addLayer({
        id: 'ward-labels',
        type: 'symbol',
        source: 'ward-boundaries',
        minzoom: 11,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Regular', 'Open Sans Regular'],
          'text-anchor': 'center',
          'text-offset': [0, 0],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });

      // Hover
      let hoveredId: string | number | null = null;
      map.on('mousemove', 'ward-boundary-fill', (e) => {
        if (e.features && e.features.length > 0) {
          map.getCanvas().style.cursor = 'pointer';
          const feat = e.features[0];
          const wid = feat.id ?? null;

          if (hoveredId !== null && hoveredId !== wid) {
            map.setFeatureState({ source: 'ward-boundaries', id: hoveredId }, { hover: false });
          }
          hoveredId = wid;
          if (hoveredId !== null) {
            map.setFeatureState({ source: 'ward-boundaries', id: hoveredId }, { hover: true });
          }

          // Tooltip on hover
          const props = feat.properties || {};
          const fullName = props.fullName || props.name || 'Xã / Phường';
          const district = props.district || 'Hà Nội';
          const type = props.type || 'Phường';
          const areaKm2 = props.areaKm2 ? `${props.areaKm2} km²` : '';
          const population = props.population ? `${Number(props.population).toLocaleString('vi-VN')} dân` : '';

          const badgeBg = type === 'Phường' ? '#eff6ff' : type === 'Xã' ? '#ecfdf5' : '#f5f3ff';
          const badgeColor = type === 'Phường' ? '#2563eb' : type === 'Xã' ? '#059669' : '#7c3aed';
          const badgeBorder = type === 'Phường' ? '#bfdbfe' : type === 'Xã' ? '#a7f3d0' : '#ddd6fe';

          if (!hoverPopupRef.current) {
            hoverPopupRef.current = new maplibregl.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 14,
              className: 'ward-map-hover-popup',
            });
          }

          hoverPopupRef.current
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 2px 4px; min-width: 140px; font-family: inherit;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 3px;">
                  <span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder};">
                    ${type}
                  </span>
                  <span style="font-size: 11px; font-weight: 600; color: #475569;">
                    ${district}
                  </span>
                </div>
                <div style="font-size: 13.5px; font-weight: 750; color: #0f172a; line-height: 1.3;">
                  ${fullName}
                </div>
                ${areaKm2 || population ? `
                  <div style="display: flex; gap: 10px; margin-top: 5px; padding-top: 4px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #64748b;">
                    ${areaKm2 ? `<span>Diện tích: <strong style="color: #334155;">${areaKm2}</strong></span>` : ''}
                    ${population ? `<span>Dân số: <strong style="color: #334155;">${population}</strong></span>` : ''}
                  </div>
                ` : ''}
                <div style="margin-top: 6px; font-size: 10.5px; color: #4338ca; font-weight: 600;">
                  Nhấp để xem trụ sở & dịch vụ công
                </div>
              </div>
            `)
            .addTo(map);
        }
      });

      map.on('mouseleave', 'ward-boundary-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'ward-boundaries', id: hoveredId }, { hover: false });
          hoveredId = null;
        }
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
          hoverPopupRef.current = null;
        }
      });

      map.on('click', 'ward-boundary-fill', (e) => {
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
          hoverPopupRef.current = null;
        }
        if (e.features && e.features.length > 0) {
          const feat = e.features[0];
          const wid = String(feat.id || feat.properties?.code || feat.properties?.id);
          if (selectedWardIdRef.current === wid) {
            setSelectedWardId(null);
          } else {
            setSelectedWardId(wid);
            const center = feat.properties?.center;
            if (center && Array.isArray(center) && center.length === 2) {
              map.flyTo({ center: [center[0], center[1]], zoom: 12.5, duration: 1000 });
            }
          }
        }
      });

      map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['ward-boundary-fill'] });
        if (!features || features.length === 0) {
          setSelectedWardId(null);
        }
      });
    });

    mapRef.current = map;

    return () => {
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('ward-boundaries')) return;

    if (prevSelectedWardIdRef.current) {
      try {
        map.setFeatureState(
          { source: 'ward-boundaries', id: prevSelectedWardIdRef.current },
          { selected: false }
        );
      } catch {
        // ignore
      }
    }

    if (selectedWardId) {
      try {
        map.setFeatureState({ source: 'ward-boundaries', id: selectedWardId }, { selected: true });
      } catch {
        // ignore
      }
    }

    prevSelectedWardIdRef.current = selectedWardId;
  }, [selectedWardId]);

  const handleSelectWard = (ward: WardSummary) => {
    if (selectedWardId === ward.id) {
      setSelectedWardId(null);
    } else {
      setSelectedWardId(ward.id);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [ward.center_lon, ward.center_lat],
          zoom: 13,
          pitch: is3D ? 38 : 0,
          duration: 1200,
        });
      }
    }
  };

  const toggle3DMode = (enable: boolean) => {
    if (!mapRef.current) return;
    setIs3D(enable);
    const zoom = mapRef.current.getZoom();
    if (enable) {
      setup3DBuildings(mapRef.current);
      mapRef.current.easeTo({
        pitch: 42,
        bearing: -15,
        zoom: zoom < 12 ? 13.5 : zoom,
        duration: 800,
      });
    } else {
      mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  };

  const centerHanoi = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: HANOI_CENTER,
      zoom: 10.3,
      pitch: 0,
      bearing: 0,
      duration: 1000,
    });
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setToast({ type: 'error', message: 'Trình duyệt không hỗ trợ định vị GPS.' });
      return;
    }
    setIsLocating(true);
    setToast({ type: 'info', message: 'Đang xác định toạ độ GPS của bạn...' });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation({ lat, lon });

        if (mapRef.current) {
          if (!userMarkerRef.current) {
            const el = document.createElement('div');
            el.innerHTML = `
              <div style="background:#2563eb; width:16px; height:16px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 12px rgba(37,99,235,0.7); animation: pulse 2s infinite;"></div>
            `;
            userMarkerRef.current = new maplibregl.Marker({ element: el })
              .setLngLat([lon, lat])
              .addTo(mapRef.current);
          } else {
            userMarkerRef.current.setLngLat([lon, lat]);
          }

          mapRef.current.flyTo({ center: [lon, lat], zoom: 13.5, duration: 1200 });
        }

        locateWard(lat, lon, token)
          .then((res) => {
            if (res && res.ward) {
              setSelectedWardId(res.ward.id);
              setSelectedWardDetail(res.ward);
              setToast({
                type: 'success',
                message: `Bạn đang ở ${res.ward.full_name}, ${res.ward.district} (Cách trụ sở ~${res.distance_km} km)`,
              });
            }
          })
          .catch(() => {
            setToast({ type: 'info', message: 'Đã định vị toạ độ GPS, không nằm trong các xã/phường có sẵn.' });
          })
          .finally(() => setIsLocating(false));
      },
      (err) => {
        console.warn('Geolocation error', err);
        setIsLocating(false);
        setToast({ type: 'error', message: 'Không thể lấy toạ độ GPS. Vui lòng cấp quyền truy cập vị trí.' });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const toggleBoundaries = () => {
    if (!mapRef.current) return;
    const nextState = !showBoundaries;
    setShowBoundaries(nextState);
    const vis = nextState ? 'visible' : 'none';
    if (mapRef.current.getLayer('ward-boundary-fill')) {
      mapRef.current.setLayoutProperty('ward-boundary-fill', 'visibility', vis);
    }
    if (mapRef.current.getLayer('ward-boundary-line')) {
      mapRef.current.setLayoutProperty('ward-boundary-line', 'visibility', vis);
    }
    if (mapRef.current.getLayer('ward-labels')) {
      mapRef.current.setLayoutProperty('ward-labels', 'visibility', vis);
    }
  };

  return (
    <div className="bus-search-page">
      {/* Hero Header matching Parking & Tourism pages */}
      <div
        className="bus-hero page-width"
        style={{
          background: 'radial-gradient(circle at 85% 20%, rgba(199, 210, 254, 0.35) 0%, rgba(99, 102, 241, 0.2) 35%, transparent 65%), linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #4338ca 100%)',
          boxShadow: '0 16px 42px -6px rgba(49, 46, 129, 0.42), 0 0 70px -10px rgba(67, 56, 202, 0.32)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -50,
            right: 120,
            width: 280,
            height: 280,
            background: 'radial-gradient(circle, rgba(129, 140, 248, 0.38) 0%, transparent 70%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }}
        />

        <div className="bus-hero-content" style={{ position: 'relative', zIndex: 2 }}>
          <div className="bus-hero-eyebrow">
            <span className="badge-pill-light" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(255, 255, 255, 0.2)' }}>
              <Landmark size={14} /> Hệ thống Thông tin Địa giới Hành chính Hà Nội
            </span>
            <span className="badge-pill-light osm-badge" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(254, 240, 138, 0.3)' }}>
              <MapPin size={14} /> 126 Xã / Phường • 30 Quận / Huyện
            </span>
          </div>

          <h1>Bản đồ Đơn vị Hành chính Xã / Phường</h1>
          <p>
            Tra cứu ranh giới địa giới hành chính, trụ sở UBND, đường dây nóng và các thủ tục dịch vụ công cơ sở tại 126 xã, phường, thị trấn trên toàn địa bàn Thủ đô Hà Nội.
          </p>
        </div>

        <div className="bus-hero-actions" style={{ position: 'relative', zIndex: 2 }}>
          <button
            type="button"
            className="btn btn-primary-contrast"
            onClick={handleLocateMe}
            disabled={isLocating}
            style={{ boxShadow: '0 4px 18px rgba(255, 255, 255, 0.4), 0 0 24px rgba(255, 255, 255, 0.25)' }}
          >
            <Crosshair size={16} /> {isLocating ? 'Đang xác định vị trí...' : 'Vị trí của tôi'}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`custom-toast custom-toast-${toast.type}`}>
          <div className="custom-toast-icon">
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.type === 'info' && <Compass size={18} />}
          </div>
          <span className="custom-toast-msg">{toast.message}</span>
          <button
            type="button"
            className="custom-toast-close"
            onClick={() => setToast(null)}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="bus-container page-width">
        {/* Quick Type Filter Tabs */}
        <div className="bus-nav-tabs" style={{ marginBottom: 16 }}>
          {[
            { key: 'all', label: 'Tất cả đơn vị', count: typeCounts.all },
            { key: 'Phường', label: 'Phường (Đô thị)', count: typeCounts['Phường'] },
            { key: 'Xã', label: 'Xã (Ngoại thành)', count: typeCounts['Xã'] },
            { key: 'Thị trấn', label: 'Thị trấn', count: typeCounts['Thị trấn'] },
          ].map((t) => {
            const isActive = selectedType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`bus-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setSelectedType(t.key);
                  setCurrentPage(1);
                }}
                style={{
                  borderColor: isActive ? '#4f46e5' : 'var(--color-border)',
                  color: isActive ? '#4338ca' : 'var(--color-text-secondary)',
                  background: isActive ? '#eef2ff' : 'var(--color-bg-surface)',
                }}
              >
                <span>{t.label}</span>
                <span
                  className="bus-tab-badge"
                  style={{
                    background: isActive ? '#4338ca' : 'var(--color-bg-subtle)',
                    color: isActive ? '#ffffff' : 'var(--color-text-muted)',
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Layout Grid */}
        <div className="bus-layout-grid">
          {/* Left Panel: Search & Cards */}
          <div className="bus-left-panel">
            <div
              className="bus-filter-box"
              style={{
                boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.06), 0 0 16px rgba(79, 70, 229, 0.06)',
                border: '1px solid #c7d2fe',
              }}
            >
              {/* Keyword Search */}
              <div className="bus-search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="bus-search-input"
                  placeholder="Tìm tên xã, phường, thị trấn, quận/huyện..."
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {keyword && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => {
                      setKeyword('');
                      setCurrentPage(1);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* District Filter Dropdown */}
              <div style={{ marginTop: 8 }}>
                <select
                  className="bus-search-input"
                  value={selectedDistrict}
                  onChange={(e) => {
                    setSelectedDistrict(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '6px 10px',
                    borderRadius: 10,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: 'var(--color-bg-main)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">Tất cả quận / huyện ({districts.length || 30} quận/huyện)</option>
                  {districts.map((d) => (
                    <option key={d.district} value={d.district}>
                      {d.district} ({d.ward_count} xã/phường)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Suggestion Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>Quận trọng điểm:</span>
                {['Ba Đình', 'Hoàn Kiếm', 'Cầu Giấy', 'Đống Đa', 'Tây Hồ', 'Hà Đông', 'Long Biên'].map((dist) => {
                  const isActive = selectedDistrict === dist;
                  return (
                    <button
                      key={dist}
                      type="button"
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        background: isActive ? '#4f46e5' : 'var(--color-bg-main)',
                        color: isActive ? '#ffffff' : 'var(--color-text-secondary)',
                        border: '1px solid ' + (isActive ? '#4f46e5' : 'var(--color-border)'),
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 650,
                        boxShadow: isActive ? '0 2px 10px rgba(79, 70, 229, 0.4)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => {
                        setSelectedDistrict(selectedDistrict === dist ? 'all' : dist);
                        setCurrentPage(1);
                      }}
                    >
                      {dist}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="banner error" style={{ margin: '8px 0', fontSize: 13 }}>
                {error}
              </div>
            )}

            {/* List Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>Đang tải dữ liệu xã/phường Hà Nội...</div>
                </div>
              ) : paginatedWards.length === 0 ? (
                <div
                  style={{
                    background: 'var(--color-bg-surface)',
                    border: '1px dashed var(--color-border)',
                    borderRadius: 14,
                    padding: '32px 20px',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  <MapIcon size={32} style={{ margin: '0 auto 8px', color: 'var(--color-border-hover)' }} />
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)' }}>
                    Không tìm thấy xã/phường phù hợp
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>
                    Thử đổi từ khoá tìm kiếm hoặc chọn quận/huyện khác
                  </div>
                </div>
              ) : (
                paginatedWards.map((w) => {
                  const isSelected = selectedWardId === w.id;
                  const isPhuong = w.type === 'Phường';
                  const isXa = w.type === 'Xã';

                  const badgeBg = isPhuong ? '#eff6ff' : isXa ? '#ecfdf5' : '#f5f3ff';
                  const badgeColor = isPhuong ? '#2563eb' : isXa ? '#059669' : '#7c3aed';
                  const badgeBorder = isPhuong ? '#bfdbfe' : isXa ? '#a7f3d0' : '#ddd6fe';

                  return (
                    <div
                      key={w.id}
                      className="bus-card"
                      style={{
                        padding: '14px 16px',
                        cursor: 'pointer',
                        borderColor: isSelected ? '#4f46e5' : undefined,
                        boxShadow: isSelected
                          ? '0 0 0 2px rgba(79, 70, 229, 0.25), 0 8px 24px -4px rgba(79, 70, 229, 0.15)'
                          : undefined,
                        background: isSelected ? '#f8faff' : undefined,
                      }}
                      onClick={() => handleSelectWard(w)}
                    >
                      <div className="bus-card-header" style={{ marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontWeight: 700,
                                background: badgeBg,
                                color: badgeColor,
                                border: `1px solid ${badgeBorder}`,
                              }}
                            >
                              {w.type}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontWeight: 600,
                                background: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              {w.district}
                            </span>
                            {w.postal_code && (
                              <span style={{ fontSize: 10.5, color: '#94a3b8', fontFamily: 'monospace' }}>
                                #{w.postal_code}
                              </span>
                            )}
                          </div>

                          <div
                            className="bus-card-title"
                            style={{
                              fontSize: 16,
                              fontWeight: 750,
                              color: 'var(--color-text-primary)',
                              marginTop: 4,
                            }}
                          >
                            {w.full_name}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-select-route"
                          style={{
                            padding: '6px 12px',
                            fontSize: 11.5,
                            fontWeight: 700,
                            borderRadius: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            background: isSelected ? '#ea580c' : '#eef2ff',
                            color: isSelected ? '#ffffff' : '#4338ca',
                            border: '1px solid ' + (isSelected ? '#ea580c' : '#c7d2fe'),
                            transition: 'all 0.15s ease',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectWard(w);
                          }}
                          title={isSelected ? 'Bấm để hủy chọn' : 'Xem vị trí trên bản đồ'}
                        >
                          {isSelected ? (
                            <>
                              <X size={13} />
                              <span>Hủy chọn</span>
                            </>
                          ) : (
                            <>
                              <MapPin size={13} />
                              <span>Bản đồ</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="bus-card-info-row" style={{ marginTop: 6, fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: 2, color: 'var(--color-text-muted)' }} />
                        <span style={{ wordBreak: 'break-word' }}>{w.office_address}</span>
                      </div>

                      {/* Metrics bar */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 6,
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: '1px solid var(--color-border)',
                          fontSize: 11.5,
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 10 }}>Diện tích</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{w.area_km2} km²</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 10 }}>Dân số ước tính</span>
                          <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {w.population > 0 ? w.population.toLocaleString('vi-VN') : '—'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 10 }}>Đường dây nóng</span>
                          <a
                            href={`tel:${w.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontWeight: 700, color: '#4f46e5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                          >
                            <Phone size={11} />
                            <span>{w.phone || '1022'}</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {filteredWards.length > ITEMS_PER_PAGE && (
              <div style={{ marginTop: 12 }}>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filteredWards.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  itemLabel="xã/phường"
                  onPageChange={handlePageChange}
                  accentColor="#4f46e5"
                />
              </div>
            )}
          </div>

          {/* Right Panel: Map Container */}
          <div className="bus-right-map-panel">
            <div className="map-view-header">
              <div className="map-title-badge" style={{ background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                <MapIcon size={14} /> Bản đồ ranh giới xã/phường 3D
              </div>

              {selectedWardDetail ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="dot" style={{ backgroundColor: '#ea580c' }} />
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedWardDetail.full_name} ({selectedWardDetail.district})
                  </span>
                  <button
                    type="button"
                    className="btn-clear-selection"
                    style={{
                      marginLeft: 6,
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onClick={() => setSelectedWardId(null)}
                    title="Hủy chọn xã/phường này"
                  >
                    <X size={12} /> Hủy chọn
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#4338ca', fontWeight: 600 }}>
                  <Building2 size={14} />
                  <span>
                    126 đơn vị hành chính cấp xã/phường toàn Hà Nội
                  </span>
                </div>
              )}
            </div>

            <div className="map-canvas-container">
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

              {/* Map Legend Overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  zIndex: 10,
                  background: 'rgba(255, 255, 255, 0.94)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid #c7d2fe',
                  borderRadius: 10,
                  padding: '6px 12px',
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 11.5,
                  fontWeight: 650,
                  color: '#334155',
                  pointerEvents: 'auto',
                }}
              >
                <span style={{ fontSize: 10.5, color: '#6366f1', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Chú thích:
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981', border: '1px solid #059669' }} />
                  Xã (Ngoại thành)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#3b82f6', border: '1px solid #2563eb' }} />
                  Phường (Đô thị)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#8b5cf6', border: '1px solid #7c3aed' }} />
                  Thị trấn
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ea580c', border: '1px solid #c2410c' }} />
                  Đang chọn
                </span>
              </div>

              {/* Floating Toolbar */}
              <div className="map-floating-bar">
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={handleLocateMe}
                  disabled={isLocating}
                  title="Tìm vị trí xã/phường hiện tại của bạn"
                >
                  <Crosshair size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  Vị trí của tôi
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={() => toggle3DMode(!is3D)}
                  title="Nghiêng góc nhìn 3D"
                  style={{ background: is3D ? '#4f46e5' : undefined, color: is3D ? '#ffffff' : undefined }}
                >
                  <Layers size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  {is3D ? 'Góc nhìn 3D' : 'Góc nhìn 2D'}
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={toggleBoundaries}
                  title="Bật/tắt đa giác ranh giới"
                  style={{ background: showBoundaries ? '#eef2ff' : undefined, color: showBoundaries ? '#4338ca' : undefined }}
                >
                  Ranh giới
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={centerHanoi}
                  title="Căn giữa Thủ đô Hà Nội"
                >
                  Trung tâm Hà Nội
                </button>
              </div>

              {/* Floating Detail Card on Map */}
              {selectedWardDetail && (
                <div
                  className="floating-stop-detail"
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    right: 16,
                    maxWidth: 420,
                    zIndex: 20,
                    borderRadius: 14,
                    boxShadow: '0 12px 36px -4px rgba(15, 23, 42, 0.22), 0 0 20px rgba(79, 70, 229, 0.15)',
                    background: '#ffffff',
                    border: '1px solid #c7d2fe',
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: '#eef2ff',
                            color: '#4338ca',
                            border: '1px solid #c7d2fe',
                          }}
                        >
                          {selectedWardDetail.type}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                          {selectedWardDetail.district}
                        </span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                        {selectedWardDetail.full_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <MapPin size={12} style={{ flexShrink: 0, color: '#94a3b8' }} />
                        <span>{selectedWardDetail.office_address}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedWardId(null)}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: '#64748b',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11.5,
                        fontWeight: 650,
                      }}
                      title="Hủy chọn xã/phường này"
                    >
                      <X size={13} />
                      <span>Hủy chọn</span>
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                      background: '#f8fafc',
                      padding: 8,
                      borderRadius: 10,
                      margin: '10px 0',
                      textAlign: 'center',
                      fontSize: 11.5,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>Diện tích</span>
                      <span style={{ fontWeight: 750, color: '#1e293b' }}>{selectedWardDetail.area_km2} km²</span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>Dân số</span>
                      <span style={{ fontWeight: 750, color: '#1e293b' }}>
                        {selectedWardDetail.population.toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>Mã bưu điện</span>
                      <span style={{ fontWeight: 750, color: '#1e293b' }}>{selectedWardDetail.postal_code || '10000'}</span>
                    </div>
                  </div>

                  {/* Public Services list */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <FileText size={12} color="#4f46e5" />
                      <span>Thủ tục hành chính công trực tuyến:</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 11, color: '#475569' }}>
                      {selectedWardDetail.services_list.slice(0, 3).map((s, idx) => (
                        <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '2px 0' }}>
                          <CheckCircle2 size={11} color="#10b981" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <a
                      href={`tel:${selectedWardDetail.phone}`}
                      style={{
                        flex: 1,
                        padding: '7px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 700,
                        textDecoration: 'none',
                        background: '#f1f5f9',
                        color: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <Phone size={12} color="#4f46e5" />
                      <span>{selectedWardDetail.phone}</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => navigate('/reports/create')}
                      style={{
                        flex: 1.2,
                        padding: '7px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: '#4f46e5',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.35)',
                      }}
                    >
                      <ShieldCheck size={12} />
                      <span>Phản ánh địa bàn</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WardMapPage;

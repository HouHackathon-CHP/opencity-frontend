// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  Crosshair,
  ExternalLink,
  Landmark,
  Layers,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import { Pagination } from '../components/Pagination';
import {
  createTourismDestination,
  deleteTourismDestination,
  getTourismCategories,
  getTourismDistricts,
  listTourismDestinations,
  updateTourismDestination,
  type TourismDestination,
  type TourismDestinationInput,
} from '../lib/api';

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const ITEMS_PER_PAGE = 10;

type CategoryMeta = {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof Landmark;
};

const CATEGORIES: Record<string, CategoryMeta> = {
  all: {
    key: 'all',
    label: 'Tất cả di tích',
    color: '#0f172a',
    bg: '#f1f5f9',
    border: '#cbd5e1',
    icon: Compass,
  },
  monument: {
    key: 'monument',
    label: 'Di tích Lịch sử',
    color: '#be123c',
    bg: '#fff1f2',
    border: '#fecdd3',
    icon: Landmark,
  },
  museum: {
    key: 'museum',
    label: 'Bảo tàng',
    color: '#3730a3',
    bg: '#eef2ff',
    border: '#c7d2fe',
    icon: Building2,
  },
  religious: {
    key: 'religious',
    label: 'Chùa & Đền cổ',
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: Sparkles,
  },
  cultural: {
    key: 'cultural',
    label: 'Không gian Văn hóa',
    color: '#6d28d9',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    icon: Layers,
  },
  landscape: {
    key: 'landscape',
    label: 'Danh lam Thắng cảnh',
    color: '#047857',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: Compass,
  },
};

function setup3DBuildings(map: any) {
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
      map.setLayoutProperty('building', 'visibility', 'none');
    }

    map.addLayer(
      {
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 12.5,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 12],
            0, '#cbd5e1',
            15, '#94a3b8',
            35, '#64748b',
            70, '#475569',
            150, '#334155',
            300, '#1e293b',
          ] as any,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12.5, 0,
            14, [
              '*',
              [
                'case',
                ['has', 'render_height'],
                ['max', ['get', 'render_height'], 10],
                15,
              ],
              1.5,
            ],
          ] as any,
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12.5, 0,
            14, ['coalesce', ['get', 'render_min_height'], 0],
          ] as any,
          'fill-extrusion-opacity': 0.92,
        },
      } as any,
      firstLabelId
    );

    map.setLight({
      anchor: 'viewport',
      color: '#f8fafc',
      intensity: 0.65,
      position: [1.5, 180, 42],
    });
  } catch (err) {
    console.warn('Failed to add 3D building layer:', err);
  }
}

export function TourismPage({ mode: initialMode }: { mode?: 'tourism' | 'heritage' } = {}) {
  const { user } = useAuth();
  const token = user?.access_token || '';

  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isHeritage =
    initialMode === 'heritage' ||
    location.pathname.startsWith('/heritage') ||
    searchParams.get('mode') === 'heritage';
  const mode: 'tourism' | 'heritage' = isHeritage ? 'heritage' : 'tourism';

  const defaultTab = isHeritage ? 'monument' : 'all';
  const activeTab = searchParams.get('tab') || defaultTab;

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [mode]);

  const [destinations, setDestinations] = useState<TourismDestination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [is3D, setIs3D] = useState(true);

  const operator = canManage(user, 'tourism');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TourismDestination | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<TourismDestination | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const defaultForm: TourismDestinationInput = {
    name: '',
    category: 'monument',
    address: '',
    district: 'Hoàn Kiếm',
    latitude: 21.03,
    longitude: 105.85,
    description: '',
    opening_hours: '8:00 - 17:00',
    admission_fee: 'Miễn phí',
    heritage_level: 'Di tích Lịch sử - Văn hóa',
    connecting_bus_routes: [],
    tags: [],
    audio_guide: false,
    active: true,
  };

  const [formData, setFormData] = useState<TourismDestinationInput>(defaultForm);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const destinationsRef = useRef<TourismDestination[]>([]);
  destinationsRef.current = destinations;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const syncMapSource = useCallback((items: TourismDestination[], selId: string | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('tourism') as GeoJSONSource | undefined;
    if (!source) return;

    const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: items.map((d) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [d.longitude, d.latitude],
        },
        properties: {
          id: d.id,
          name: d.name,
          category: d.category,
          district: d.district,
          heritage_level: d.heritage_level,
        },
      })),
    };

    source.setData(collection);

    if (map.getLayer('selected-point-halo')) {
      map.setFilter('selected-point-halo', ['==', ['get', 'id'], selId || '']);
    }
  }, []);

  const setTab = (tabKey: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tabKey);
    setSearchParams(params);
    setCurrentPage(1);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await listTourismDestinations(token, {
        keyword: query.trim() || undefined,
        category: activeTab !== 'all' ? activeTab : undefined,
        district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        lat: userLocation?.lat,
        lon: userLocation?.lng,
      });
      setDestinations(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu điểm du lịch di tích');
    } finally {
      setLoading(false);
    }
  }, [token, query, activeTab, selectedDistrict, userLocation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setToast({ message: 'Trình duyệt không hỗ trợ định vị GPS.', type: 'info' });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 14, duration: 800 });
        }
      },
      () => {
        setIsLocating(false);
        setToast({ message: 'Không thể xác định vị trí. Vui lòng cấp quyền truy cập GPS trong trình duyệt.', type: 'error' });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    let centerLat = 21.03;
    let centerLng = 105.85;
    if (mapRef.current) {
      const c = mapRef.current.getCenter();
      centerLat = Number(c.lat.toFixed(5));
      centerLng = Number(c.lng.toFixed(5));
    }
    setFormData({
      ...defaultForm,
      latitude: centerLat,
      longitude: centerLng,
      district: selectedDistrict !== 'all' ? selectedDistrict : 'Hoàn Kiếm',
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: TourismDestination, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      address: item.address || '',
      district: item.district || 'Hà Nội',
      latitude: item.latitude,
      longitude: item.longitude,
      description: item.description || '',
      opening_hours: item.opening_hours || '8:00 - 17:00',
      admission_fee: item.admission_fee || 'Miễn phí',
      heritage_level: item.heritage_level || 'Di tích Lịch sử - Văn hóa',
      connecting_bus_routes: item.connecting_bus_routes || [],
      tags: item.tags || [],
      audio_guide: !!item.audio_guide,
      active: item.active !== false,
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleDelete = (item: TourismDestination, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token || !operator) return;
    setDeleteConfirmItem(item);
  };

  const executeDelete = async () => {
    if (!deleteConfirmItem || !token || !operator) return;
    setIsDeleting(true);
    try {
      await deleteTourismDestination(token, deleteConfirmItem.id);
      setToast({ message: `Đã xóa thành công "${deleteConfirmItem.name}".`, type: 'success' });
      if (selectedId === deleteConfirmItem.id) setSelectedId(null);
      setDeleteConfirmItem(null);
      await loadData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Không thể xóa điểm di tích.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !operator || formBusy) return;
    setFormBusy(true);
    setFormError('');
    try {
      if (editingItem) {
        await updateTourismDestination(token, editingItem.id, formData);
        setToast({ message: `Đã cập nhật thành công "${formData.name}".`, type: 'success' });
      } else {
        const created = await createTourismDestination(token, formData);
        setToast({ message: `Đã thêm thành công "${created.name}".`, type: 'success' });
        setSelectedId(created.id);
      }
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lỗi khi lưu dữ liệu điểm di tích.');
    } finally {
      setFormBusy(false);
    }
  };

  const toggle3D = () => {
    if (!mapRef.current) return;
    const next = !is3D;
    setIs3D(next);
    const currentZoom = mapRef.current.getZoom();
    mapRef.current.easeTo({
      pitch: next ? 58 : 0,
      bearing: next ? -18 : 0,
      zoom: next && currentZoom < 14 ? 14.8 : currentZoom,
      duration: 800,
    });
  };

  const centerHanoi = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [105.848, 21.032],
      zoom: 14.8,
      pitch: is3D ? 58 : 0,
      bearing: is3D ? -18 : 0,
      duration: 800,
    });
  };

  const selectedDestination = useMemo(() => {
    return destinations.find((d) => d.id === selectedId) || null;
  }, [destinations, selectedId]);

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({
    all: 387,
    monument: 119,
    museum: 38,
    religious: 26,
    cultural: 179,
    landscape: 25,
  });

  const [districts, setDistricts] = useState<string[]>([
    'Cầu Giấy',
    'Hai Bà Trưng',
    'Hoàn Kiếm',
    'Huyện Ba Vì',
    'Long Biên',
    'Nam Từ Liêm',
    'Phường Ba Đình',
    'Phường Hoàn Kiếm',
    'Quận Ba Đình',
    'Quận Cầu Giấy',
    'Thanh Xuân',
    'Tây Hồ',
    'Đống Đa',
  ]);

  useEffect(() => {
    getTourismCategories(token)
      .then((cats) => {
        if (!Array.isArray(cats)) return;
        const counts: Record<string, number> = {
          all: 0,
          monument: 0,
          museum: 0,
          religious: 0,
          cultural: 0,
          landscape: 0,
        };
        let total = 0;
        cats.forEach((c) => {
          if (counts[c.key] !== undefined) {
            counts[c.key] = c.count;
          }
          total += c.count;
        });
        counts.all = total || 387;
        setCategoryCounts(counts);
      })
      .catch(() => { });

    getTourismDistricts(token)
      .then((dists) => {
        if (Array.isArray(dists) && dists.length > 0) {
          setDistricts(dists);
        }
      })
      .catch(() => { });
  }, [token]);

  useEffect(() => {
    if (destinations.length > 0) {
      setDistricts((prev) => {
        const set = new Set(prev);
        destinations.forEach((d) => {
          if (d.district && d.district !== 'Hà Nội') set.add(d.district);
        });
        return Array.from(set).sort();
      });
    }
  }, [destinations]);

  const totalPages = Math.max(1, Math.ceil(destinations.length / ITEMS_PER_PAGE));
  const paginatedDestinations = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return destinations.slice(start, start + ITEMS_PER_PAGE);
  }, [destinations, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      maplibregl.setWorkerUrl(workerUrl);
    } catch {
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: POSITRON_STYLE,
      center: [105.848, 21.032],
      zoom: 14.8,
      pitch: 58,
      bearing: -18,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      setup3DBuildings(map);

      map.addSource('tourism', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'tourism',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#be123c',
            10,
            '#9f1239',
            30,
            '#881337',
            100,
            '#4c0519',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            10,
            22,
            30,
            26,
            100,
            32,
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'tourism',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'unclustered-point-glow',
        type: 'circle',
        source: 'tourism',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'museum',
            '#6366f1',
            'religious',
            '#f59e0b',
            'cultural',
            '#8b5cf6',
            'landscape',
            '#10b981',
            '#f43f5e',
          ],
          'circle-radius': 14,
          'circle-blur': 0.75,
          'circle-opacity': 0.55,
        },
      });

      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'tourism',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'museum',
            '#3730a3',
            'religious',
            '#b45309',
            'cultural',
            '#6d28d9',
            'landscape',
            '#047857',
            '#be123c',
          ],
          'circle-radius': 7.5,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'selected-point-halo',
        type: 'circle',
        source: 'tourism',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-color': 'rgba(244, 63, 94, 0.22)',
          'circle-radius': 22,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#be123c',
          'circle-blur': 0.2,
        },
      });

      map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = features[0]?.properties?.cluster_id;
        if (typeof clusterId !== 'number') return;
        const source = map.getSource('tourism') as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom: Math.min(zoom, 16) });
      });

      map.on('click', 'unclustered-point', (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const id = feat.properties?.id;
        if (typeof id === 'string') {
          setSelectedId(id);
          const coords = (feat.geometry as GeoJSON.Point).coordinates as [number, number];
          map.flyTo({
            center: coords,
            zoom: 16.5,
            pitch: is3D ? 58 : 0,
            bearing: is3D ? -20 : 0,
            duration: 800,
          });
        }
      });

      map.on('mouseenter', 'unclustered-point', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const feat = e.features?.[0];
        if (!feat) return;
        const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const props = feat.properties;

        if (hoverPopupRef.current) hoverPopupRef.current.remove();
        hoverPopupRef.current = new maplibregl.Popup({ closeButton: false, offset: 12 })
          .setLngLat(coords)
          .setHTML(`
            <div style="font-family: inherit; font-size: 12px; padding: 2px 4px;">
              <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">${props?.name || ''}</div>
              <div style="color: #64748b; font-size: 11px;">${props?.district || 'Hà Nội'}</div>
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseleave', 'unclustered-point', () => {
        map.getCanvas().style.cursor = '';
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
          hoverPopupRef.current = null;
        }
      });

      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      syncMapSource(destinationsRef.current, selectedIdRef.current);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [syncMapSource]);

  useEffect(() => {
    syncMapSource(destinations, selectedId);
  }, [destinations, selectedId, syncMapSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLocation) {
      if (userMarkerRef.current) userMarkerRef.current.remove();
      const el = document.createElement('div');
      el.className = 'user-current-location-marker';
      el.innerHTML = `
        <div style="
          width: 18px;
          height: 18px;
          background: #2563eb;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(37,99,235,0.7);
        "></div>
      `;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    }
  }, [userLocation]);

  const heritageTabs = [
    { key: 'all', label: 'Tất cả di tích', icon: Landmark, color: '#0f172a', bg: '#f1f5f9' },
    { key: 'monument', label: 'Di tích Lịch sử', icon: Landmark, color: '#be123c', bg: '#fff1f2' },
    { key: 'museum', label: 'Bảo tàng', icon: Building2, color: '#3730a3', bg: '#eef2ff' },
    { key: 'religious', label: 'Chùa & Đền cổ', icon: Sparkles, color: '#b45309', bg: '#fffbeb' },
    { key: 'cultural', label: 'Không gian Văn hóa', icon: Layers, color: '#6d28d9', bg: '#f5f3ff' },
    { key: 'landscape', label: 'Danh lam Thắng cảnh', icon: Compass, color: '#047857', bg: '#ecfdf5' },
  ];

  const tourismTabs = [
    { key: 'all', label: 'Tất cả điểm đến', icon: Compass, color: '#0f172a', bg: '#f1f5f9' },
    { key: 'monument', label: 'Di tích Lịch sử', icon: Landmark, color: '#be123c', bg: '#fff1f2' },
    { key: 'landscape', label: 'Danh lam Thắng cảnh', icon: Compass, color: '#047857', bg: '#ecfdf5' },
    { key: 'cultural', label: 'Không gian Văn hóa', icon: Layers, color: '#6d28d9', bg: '#f5f3ff' },
    { key: 'religious', label: 'Chùa & Tâm linh', icon: Sparkles, color: '#b45309', bg: '#fffbeb' },
    { key: 'museum', label: 'Bảo tàng & Triển lãm', icon: Building2, color: '#3730a3', bg: '#eef2ff' },
  ];

  const currentTabs = isHeritage ? heritageTabs : tourismTabs;

  return (
    <div className="bus-search-page">
      <div
        className="bus-hero page-width"
        style={{
          background: isHeritage
            ? 'radial-gradient(circle at 85% 20%, rgba(254, 205, 211, 0.32) 0%, rgba(244, 63, 94, 0.18) 35%, transparent 65%), linear-gradient(135deg, #4c0519 0%, #881337 45%, #be123c 100%)'
            : 'radial-gradient(circle at 85% 20%, rgba(167, 243, 208, 0.35) 0%, rgba(16, 185, 129, 0.2) 35%, transparent 65%), linear-gradient(135deg, #064e3b 0%, #047857 45%, #0f766e 100%)',
          boxShadow: isHeritage
            ? '0 16px 42px -6px rgba(190, 18, 60, 0.42), 0 0 70px -10px rgba(244, 63, 94, 0.32)'
            : '0 16px 42px -6px rgba(4, 120, 87, 0.42), 0 0 70px -10px rgba(16, 185, 129, 0.32)',
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
            background: isHeritage
              ? 'radial-gradient(circle, rgba(251, 113, 133, 0.38) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(52, 211, 153, 0.38) 0%, transparent 70%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: 180,
            width: 240,
            height: 240,
            background: isHeritage
              ? 'radial-gradient(circle, rgba(244, 63, 94, 0.25) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, transparent 70%)',
            filter: 'blur(45px)',
            pointerEvents: 'none',
          }}
        />

        <div className="bus-hero-content" style={{ position: 'relative', zIndex: 2 }}>
          <div className="bus-hero-eyebrow">
            <span className="badge-pill-light" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(255, 255, 255, 0.2)' }}>
              {isHeritage ? (
                <>
                  <Landmark size={14} /> OpenCity Di tích & Di sản Lịch sử
                </>
              ) : (
                <>
                  <Compass size={14} /> OpenCity Du lịch & Điểm đến Đô thị
                </>
              )}
            </span>
            <span className="badge-pill-light osm-badge" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(254, 240, 138, 0.3)' }}>
              {isHeritage ? (
                <>
                  <Building2 size={14} /> Số hóa 387 Di tích OpenStreetMap (ODbL)
                </>
              ) : (
                <>
                  <MapPin size={14} /> Dữ liệu mở OpenStreetMap (ODbL)
                </>
              )}
            </span>
          </div>
          <h1>
            {isHeritage ? 'Bản đồ Di tích Lịch sử & Di sản Hà Nội' : 'Bản đồ Du lịch & Danh lam Thắng cảnh Hà Nội'}
          </h1>
          <p>
            {isHeritage
              ? 'Hệ thống tra cứu số hóa 387 di tích lịch sử, bảo tàng, chùa cổ và không gian văn hiến ngàn năm của Thủ đô trên bản đồ 3D tương tác.'
              : 'Khám phá các danh lam thắng cảnh, không gian văn hóa, phố đi bộ, điểm trải nghiệm và tuyến xe buýt kết nối của Thủ đô Hà Nội trên bản đồ 3D tương tác.'}
          </p>
        </div>

        <div className="bus-hero-actions" style={{ position: 'relative', zIndex: 2 }}>
          {operator && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreate}
              style={{
                background: isHeritage ? '#be123c' : '#047857',
                borderColor: isHeritage ? '#fb7185' : '#34d399',
                color: '#ffffff',
                boxShadow: isHeritage
                  ? '0 4px 18px rgba(190, 18, 60, 0.45), 0 0 20px rgba(251, 113, 133, 0.35)'
                  : '0 4px 18px rgba(4, 120, 87, 0.45), 0 0 20px rgba(52, 211, 153, 0.35)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={16} /> {isHeritage ? 'Thêm điểm di tích' : 'Thêm điểm du lịch'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary-contrast"
            onClick={handleLocateMe}
            disabled={isLocating}
            style={{ boxShadow: '0 4px 18px rgba(255, 255, 255, 0.4), 0 0 24px rgba(255, 255, 255, 0.25)' }}
          >
            <Crosshair size={16} /> {isLocating ? 'Đang định vị...' : 'Vị trí của tôi'}
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
        {/* Nav Tabs */}
        <div
          className="bus-nav-tabs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            overflowX: 'auto',
            paddingBottom: '4px',
            paddingRight: '36px',
          }}
        >
          {currentTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            const count = categoryCounts[tab.key] ?? (tab.key === 'all' ? destinations.length : 0);
            return (
              <button
                key={tab.key}
                type="button"
                className={`bus-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setTab(tab.key)}
                style={{
                  padding: '7px 11px',
                  fontSize: '13px',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  ...(isActive
                    ? {
                      color: tab.color,
                      borderBottomColor: tab.color,
                      fontWeight: 750,
                      textShadow: `0 0 10px ${tab.color}33`,
                    }
                    : {}),
                }}
              >
                <Icon size={14} /> {tab.label}
                <span
                  className="bus-tab-badge"
                  style={
                    isActive
                      ? {
                        background: tab.bg,
                        color: tab.color,
                        boxShadow: `0 0 8px ${tab.color}44`,
                      }
                      : {}
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="bus-layout-grid">
          <div className="bus-left-panel">
            <div
              className="bus-filter-box"
              style={{
                boxShadow: isHeritage
                  ? '0 4px 20px -4px rgba(15, 23, 42, 0.06), 0 0 16px rgba(190, 18, 60, 0.06)'
                  : '0 4px 20px -4px rgba(15, 23, 42, 0.06), 0 0 16px rgba(4, 120, 87, 0.06)',
                border: isHeritage ? '1px solid #fee2e2' : '1px solid #d1fae5',
              }}
            >
              <div className="bus-search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="bus-search-input"
                  placeholder={
                    isHeritage
                      ? 'Tìm kiếm di tích, đình, đền, chùa cổ, bảo tàng (Hoàng Thành, Văn Miếu, Lăng Bác...)'
                      : 'Tìm điểm du lịch, danh lam, phố đi bộ, ẩm thực (Hồ Gươm, Phố Cổ, Hồ Tây...)'
                  }
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
                {query && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => {
                      setQuery('');
                      setCurrentPage(1);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {districts.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    <MapPin size={15} style={{ color: isHeritage ? '#be123c' : '#047857', flexShrink: 0 }} />
                    <span>Khu vực:</span>
                  </div>
                  <select
                    className="bus-search-input"
                    value={selectedDistrict}
                    onChange={(e) => {
                      setSelectedDistrict(e.target.value);
                      setCurrentPage(1);
                    }}
                    style={{
                      flex: 1,
                      height: 38,
                      padding: '6px 12px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      background: 'var(--color-bg-main)',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="all">Tất cả quận / huyện ({destinations.length} địa điểm)</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>Gợi ý:</span>
                {(isHeritage
                  ? ['Hoàng Thành', 'Văn Miếu', 'Lăng Bác', 'Chùa Một Cột', 'Cầu Thê Húc', 'Đền Quán Thánh']
                  : ['Hồ Gươm', 'Phố Cổ', 'Hồ Tây', 'Nhà Hát Lớn', 'Chợ Đồng Xuân', 'Phố Đi Bộ']
                ).map((kw) => {
                  const activeColor = isHeritage ? '#be123c' : '#047857';
                  const isKwActive = query === kw;
                  return (
                    <button
                      key={kw}
                      type="button"
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        background: isKwActive ? activeColor : 'var(--color-bg-main)',
                        color: isKwActive ? '#ffffff' : 'var(--color-text-secondary)',
                        border: '1px solid ' + (isKwActive ? activeColor : 'var(--color-border)'),
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 650,
                        boxShadow: isKwActive ? `0 2px 10px ${isHeritage ? 'rgba(190, 18, 60, 0.4)' : 'rgba(4, 120, 87, 0.4)'}` : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() => {
                        setQuery(query === kw ? '' : kw);
                        setCurrentPage(1);
                      }}
                    >
                      {kw}
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

            <div className="stops-grid-list">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13 }}>Đang tải danh bạ {isHeritage ? 'di tích' : 'điểm du lịch'} từ dữ liệu OpenStreetMap...</div>
                </div>
              ) : destinations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: 13 }}>
                  Không tìm thấy {isHeritage ? 'địa điểm di tích' : 'điểm đến du lịch'} nào phù hợp với từ khóa &quot;{query}&quot;.
                </div>
              ) : (
                paginatedDestinations.map((item) => {
                  const isSelected = item.id === selectedId;
                  const catMeta = CATEGORIES[item.category] || CATEGORIES.monument;
                  const IconComp = catMeta.icon;

                  return (
                    <div
                      key={item.id}
                      className={`bus-stop-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        if (mapRef.current) {
                          mapRef.current.flyTo({
                            center: [item.longitude, item.latitude],
                            zoom: 16.5,
                            pitch: is3D ? 58 : 0,
                            bearing: is3D ? -20 : 0,
                            duration: 800,
                          });
                        }
                        if (window.innerWidth < 960 && mapContainerRef.current) {
                          mapContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      }}
                    >
                      <div className="stop-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                          <IconComp size={18} className="stop-pin-icon" style={{ color: catMeta.color }} />
                          <div>
                            <h4>{item.name}</h4>
                            <p>{item.address}</p>
                          </div>
                        </div>
                        {item.distance_km !== undefined && item.distance_km !== null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                            <Navigation size={11} />
                            <span>{item.distance_km} km</span>
                          </span>
                        )}
                        {operator && (
                          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Sửa thông tin di tích"
                              style={{ padding: '3px 6px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, cursor: 'pointer', color: '#0369a1', display: 'flex', alignItems: 'center' }}
                              onClick={(e) => handleOpenEdit(item, e)}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              title="Xóa di tích khỏi hệ thống"
                              style={{ padding: '3px 6px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', color: '#be123c', display: 'flex', alignItems: 'center' }}
                              onClick={(e) => handleDelete(item, e)}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="stop-card-tags">
                        <span className="shelter-tag" style={{ background: catMeta.bg, color: catMeta.color }}>
                          {catMeta.label}
                        </span>
                        <span className="osm-tag">
                          {item.heritage_level || 'Di tích kiến trúc'}
                        </span>
                        {item.district && item.district !== 'Hà Nội' && (
                          <span className="osm-tag">{item.district}</span>
                        )}
                      </div>

                      {item.connecting_bus_routes && item.connecting_bus_routes.length > 0 && (
                        <div className="stop-passing-routes">
                          <small>Tuyến buýt kết nối lân cận:</small>
                          <div className="routes-pills-row">
                            {item.connecting_bus_routes.map((rt) => (
                              <Link
                                key={rt}
                                to={`/bus-search?q=${rt}`}
                                className="route-pill-badge"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Tuyến {rt}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={destinations.length}
              itemsPerPage={ITEMS_PER_PAGE}
              itemLabel="địa điểm"
              onPageChange={handlePageChange}
              accentColor={isHeritage ? '#be123c' : '#059669'}
            />
          </div>

          <div
            className="bus-right-map-panel"
            style={{
              boxShadow: '0 14px 40px -6px rgba(15, 23, 42, 0.14), 0 0 24px rgba(190, 18, 60, 0.08)',
              border: '1.5px solid #fee2e2',
            }}
          >
            <div className="map-view-header">
              <div className="map-title-badge">
                <Compass size={14} /> Bản đồ không gian 3D
              </div>
              {selectedDestination ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="dot"
                    style={{ backgroundColor: CATEGORIES[selectedDestination.category]?.color || '#be123c' }}
                  />
                  <span>{selectedDestination.name} ({selectedDestination.district || 'Hà Nội'})</span>
                  <button
                    type="button"
                    className="btn-clear-selection"
                    style={{
                      marginLeft: 6,
                      padding: '3px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: '#e0f2fe',
                      color: '#0369a1',
                      border: '1px solid #bae6fd',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedId(null)}
                    title="Đóng chi tiết địa điểm"
                  >
                    <X size={12} /> Đóng
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#0284c7', fontWeight: 600 }}>
                  <MapPin size={14} />
                  <span>
                    Mạng lưới di tích toàn Hà Nội ({destinations.length.toLocaleString('vi-VN')} / {categoryCounts.all} địa điểm)
                  </span>
                </div>
              )}
            </div>

            <div className="map-canvas-container">
              {/* Map Canvas */}
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

              <div className="map-floating-bar">
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={handleLocateMe}
                  title="Bay đến vị trí GPS hiện tại của bạn"
                >
                  <Crosshair size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  Vị trí của tôi
                </button>
                <button
                  type="button"
                  className={`map-float-btn ${is3D ? 'active-3d' : ''}`}
                  onClick={toggle3D}
                  title="Chuyển đổi góc nhìn 3D / 2D (Kéo chuột phải để tự do xoay 3D)"
                  style={is3D ? { background: '#be123c', color: '#ffffff', borderColor: '#be123c', fontWeight: 600 } : {}}
                >
                  <Layers size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  {is3D ? 'Chế độ 3D: Bật' : 'Bật góc nhìn 3D'}
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

              {selectedDestination && (
                <div
                  className="destination-detail-floating-card"
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    right: 16,
                    maxWidth: 540,
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '18px 20px',
                    border: '1.5px solid rgba(190, 18, 60, 0.3)',
                    boxShadow: '0 16px 42px rgba(15, 23, 42, 0.18), 0 0 30px rgba(190, 18, 60, 0.16)',
                    zIndex: 15,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: 14,
                      background: '#f1f5f9',
                      border: 'none',
                      borderRadius: '50%',
                      width: 26,
                      height: 26,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#64748b',
                    }}
                  >
                    <X size={15} />
                  </button>

                  {operator && (
                    <div style={{ position: 'absolute', right: 48, top: 12, display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        style={{ padding: '3px 8px', fontSize: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, cursor: 'pointer', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                        onClick={() => handleOpenEdit(selectedDestination)}
                      >
                        <Pencil size={12} /> Sửa
                      </button>
                      <button
                        type="button"
                        style={{ padding: '3px 8px', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#be123c', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                        onClick={() => handleDelete(selectedDestination)}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: CATEGORIES[selectedDestination.category]?.bg || '#f1f5f9',
                        color: CATEGORIES[selectedDestination.category]?.color || '#0f172a',
                      }}
                    >
                      {CATEGORIES[selectedDestination.category]?.label || 'Di tích'}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      {selectedDestination.heritage_level}
                    </span>
                    {selectedDestination.distance_km !== undefined && selectedDestination.distance_km !== null && (
                      <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, marginLeft: 'auto', paddingRight: 24 }}>
                        Cách bạn {selectedDestination.distance_km} km
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                    {selectedDestination.name}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 12.5, marginBottom: 10 }}>
                    <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span>{selectedDestination.address}</span>
                  </div>

                  {selectedDestination.description && (
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#334155', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #f1f5f9', marginBottom: 12 }}>
                      {selectedDestination.description}
                    </div>
                  )}

                  {selectedDestination.connecting_bus_routes && selectedDestination.connecting_bus_routes.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>Buýt đi qua:</span>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {selectedDestination.connecting_bus_routes.map((rt) => (
                          <Link
                            key={rt}
                            to={`/bus-search?q=${rt}`}
                            className="route-pill-badge"
                            style={{ fontSize: 11 }}
                          >
                            Tuyến {rt}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${selectedDestination.latitude},${selectedDestination.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, padding: '8px 12px', textDecoration: 'none' }}
                    >
                      <Navigation size={14} /> Chỉ đường (Bản đồ OSM)
                    </a>
                    {selectedDestination.osm_id && (
                      <a
                        href={`https://www.openstreetmap.org/${selectedDestination.osm_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 12px', textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} /> Đối tượng OSM
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="map-footer-attribution">
              <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)</span>
              <span>• Không gian 3D • {destinations.length} địa điểm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Create / Edit Modal */}
      {isFormOpen && (
        <div className="modal-backdrop" onClick={() => !formBusy && setIsFormOpen(false)}>
          <div
            className="modal-card bus-import-modal"
            style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                {isHeritage ? (
                  <Landmark size={20} style={{ color: '#be123c' }} />
                ) : (
                  <Compass size={20} style={{ color: '#047857' }} />
                )}
                <span>
                  {editingItem
                    ? `Chỉnh sửa: ${editingItem.name}`
                    : isHeritage
                      ? 'Thêm điểm di tích mới'
                      : 'Thêm điểm du lịch mới'}
                </span>
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => !formBusy && setIsFormOpen(false)}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#be123c', borderRadius: 10, fontSize: 13, marginBottom: 14, border: '1px solid #fecdd3' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveForm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">
                  Tên điểm {isHeritage ? 'di tích' : 'du lịch'} / Danh thắng <span className="required">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ví dụ: Hoàng Thành Thăng Long, Chùa Trấn Quốc..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">
                    Phân loại danh mục <span className="required">*</span>
                  </label>
                  <select
                    className="form-input"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="monument">Di tích lịch sử</option>
                    <option value="museum">Bảo tàng</option>
                    <option value="religious">Chùa & Đền cổ</option>
                    <option value="cultural">Không gian văn hóa</option>
                    <option value="landscape">Danh lam thắng cảnh</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Quận / Huyện <span className="required">*</span>
                  </label>
                  <select
                    className="form-input"
                    value={formData.district || 'Hoàn Kiếm'}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  >
                    {districts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Địa chỉ chi tiết</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Ví dụ: 19C Hoàng Diệu, Quán Thánh, Ba Đình, Hà Nội"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">
                    Vĩ độ (Latitude) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    className="form-input"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Kinh độ (Longitude) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    className="form-input"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Giờ mở cửa</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.opening_hours || ''}
                    onChange={(e) => setFormData({ ...formData, opening_hours: e.target.value })}
                    placeholder="8:00 - 17:00"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Giá vé / Phí vào cổng</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.admission_fee || ''}
                    onChange={(e) => setFormData({ ...formData, admission_fee: e.target.value })}
                    placeholder="Miễn phí / 30.000 VNĐ"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cấp xếp hạng di sản</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.heritage_level || ''}
                  onChange={(e) => setFormData({ ...formData, heritage_level: e.target.value })}
                  placeholder="Di tích Quốc gia đặc biệt / Di sản UNESCO / Di tích cấp Thành phố"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mô tả / Lịch sử di tích</label>
                <textarea
                  rows={3}
                  className="form-input"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Giới thiệu sơ lược lịch sử, niên đại xây dựng, giá trị văn hóa..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.audio_guide}
                      onChange={(e) => setFormData({ ...formData, audio_guide: e.target.checked })}
                    />
                    <span>Có thuyết minh số (Audio Guide)</span>
                  </label>
                </div>
                <div className="form-group-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.active}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    />
                    <span>Hiển thị trên bản đồ 3D</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={formBusy}
                  onClick={() => setIsFormOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formBusy}
                  style={{
                    background: isHeritage ? '#be123c' : '#047857',
                    borderColor: isHeritage ? '#be123c' : '#047857',
                  }}
                >
                  {formBusy
                    ? 'Đang lưu...'
                    : editingItem
                      ? 'Cập nhật thay đổi'
                      : isHeritage
                        ? 'Thêm di tích mới'
                        : 'Thêm điểm du lịch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {deleteConfirmItem && (
        <div className="modal-backdrop" onClick={() => !isDeleting && setDeleteConfirmItem(null)}>
          <div className="modal-card delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-confirm-icon-wrap">
              <Trash2 size={26} />
            </div>
            <h3 className="delete-confirm-title">
              {isHeritage ? 'Xác nhận xóa di tích' : 'Xác nhận xóa điểm du lịch'}
            </h3>
            <p className="delete-confirm-desc">
              Bạn có chắc chắn muốn xóa <strong>"{deleteConfirmItem.name}"</strong> khỏi hệ thống? Thao tác này sẽ xóa vĩnh viễn và không thể hoàn tác.
            </p>
            <div className="delete-confirm-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={isDeleting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={executeDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

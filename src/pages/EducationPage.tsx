// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Crosshair,
  GraduationCap,
  Layers,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  School,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import { Pagination } from '../components/Pagination';
import {
  createFacility,
  deleteFacility,
  getFacilityCategories,
  getFacilityDistricts,
  listFacilities,
  updateFacility,
  type FacilityInput,
  type FacilitySummary,
} from '../lib/api';

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const ITEMS_PER_PAGE = 10;

type CategoryMeta = {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof GraduationCap;
};

const CATEGORIES: Record<string, CategoryMeta> = {
  all: {
    key: 'all',
    label: 'Tất cả Giáo dục',
    color: '#4f46e5',
    bg: '#eef2ff',
    border: '#c7d2fe',
    icon: GraduationCap,
  },
  university: {
    key: 'university',
    label: 'Đại học & Học viện',
    color: '#4f46e5',
    bg: '#eef2ff',
    border: '#c7d2fe',
    icon: GraduationCap,
  },
  high_school: {
    key: 'high_school',
    label: 'Trường THPT',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: School,
  },
  secondary_school: {
    key: 'secondary_school',
    label: 'Trường THCS',
    color: '#0d9488',
    bg: '#f0fdfa',
    border: '#99f6e4',
    icon: School,
  },
  primary_school: {
    key: 'primary_school',
    label: 'Trường Tiểu học',
    color: '#db2777',
    bg: '#fdf2f8',
    border: '#fbcfe8',
    icon: School,
  },
  kindergarten: {
    key: 'kindergarten',
    label: 'Trường Mầm non',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: School,
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

export function EducationPage() {
  const { user } = useAuth();
  const token = user?.access_token || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'all';

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [is3D, setIs3D] = useState(true);

  const operator = canManage(user, 'facilities');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FacilitySummary | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<FacilitySummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const defaultForm: FacilityInput = {
    name: '',
    category: 'university',
    facility_type: 'education',
    address: '',
    district: 'Cầu Giấy',
    latitude: 21.0375,
    longitude: 105.7825,
    operator_type: 'Công lập',
    opening_hours: '07:30 - 17:30',
    phone: '',
    emergency_phone: '',
    level: 'Trọng điểm quốc gia',
    description: '',
    website: '',
    connecting_bus_routes: [],
    tags: [],
    active: true,
  };

  const [formData, setFormData] = useState<FacilityInput>(defaultForm);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const facilitiesRef = useRef<FacilitySummary[]>([]);
  facilitiesRef.current = facilities;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // GeoJSON source
  const syncMapSource = useCallback((items: FacilitySummary[], selId: string | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('facilities') as GeoJSONSource | undefined;
    if (!source) return;

    const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: items.map((f) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [f.longitude, f.latitude],
        },
        properties: {
          id: f.id,
          name: f.name,
          category: f.category,
          facility_type: f.facility_type,
          district: f.district,
          operator_type: f.operator_type,
          emergency_phone: f.emergency_phone || '',
          phone: f.phone || '',
          level: f.level || '',
        },
      })),
    };

    source.setData(collection);

    if (map.getLayer('selected-facility-halo')) {
      map.setFilter('selected-facility-halo', ['==', ['get', 'id'], selId || '']);
    }
  }, []);

  const setCategoryFilter = (catKey: string) => {
    const params = new URLSearchParams(searchParams);
    if (catKey === 'all') {
      params.delete('category');
    } else {
      params.set('category', catKey);
    }
    setSearchParams(params);
    setCurrentPage(1);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await listFacilities(token, {
        keyword: query.trim() || undefined,
        facility_type: 'education',
        category: activeCategory !== 'all' ? activeCategory : undefined,
        district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        lat: userLocation?.lat,
        lon: userLocation?.lng,
      });
      setFacilities(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu mạng lưới trường học');
    } finally {
      setLoading(false);
    }
  }, [token, query, activeCategory, selectedDistrict, userLocation]);

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
          mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 14.5, duration: 800 });
        }
      },
      () => {
        setIsLocating(false);
        setToast({ message: 'Không thể xác định vị trí. Vui lòng cấp quyền truy cập GPS.', type: 'error' });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    let centerLat = 21.0375;
    let centerLng = 105.7825;
    if (mapRef.current) {
      const c = mapRef.current.getCenter();
      centerLat = Number(c.lat.toFixed(5));
      centerLng = Number(c.lng.toFixed(5));
    }
    setFormData({
      ...defaultForm,
      latitude: centerLat,
      longitude: centerLng,
      district: selectedDistrict !== 'all' ? selectedDistrict : 'Cầu Giấy',
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (item: FacilitySummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      facility_type: 'education',
      address: item.address,
      district: item.district,
      latitude: item.latitude,
      longitude: item.longitude,
      operator_type: item.operator_type || 'Công lập',
      opening_hours: item.opening_hours || '07:30 - 17:30',
      phone: item.phone || '',
      emergency_phone: '',
      level: item.level || 'Chuẩn Quốc gia',
      description: '',
      website: '',
      connecting_bus_routes: [],
      tags: item.tags || [],
      active: true,
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleDelete = (item: FacilitySummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token || !operator) return;
    setDeleteConfirmItem(item);
  };

  const executeDelete = async () => {
    if (!deleteConfirmItem || !token || !operator) return;
    setIsDeleting(true);
    try {
      await deleteFacility(token, deleteConfirmItem.id);
      setToast({ message: `Đã xóa thành công "${deleteConfirmItem.name}".`, type: 'success' });
      if (selectedId === deleteConfirmItem.id) setSelectedId(null);
      setDeleteConfirmItem(null);
      await loadData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Không thể xóa trường học.',
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
        await updateFacility(token, editingItem.id, formData);
        setToast({ message: `Đã cập nhật thành công "${formData.name}".`, type: 'success' });
      } else {
        const created = await createFacility(token, formData);
        setToast({ message: `Đã thêm thành công "${created.name}".`, type: 'success' });
        setSelectedId(created.id);
      }
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lỗi khi lưu dữ liệu trường học.');
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
      center: [105.805, 21.032],
      zoom: 13.8,
      pitch: is3D ? 58 : 0,
      bearing: is3D ? -18 : 0,
      duration: 800,
    });
  };

  const selectedFacility = useMemo(() => {
    return facilities.find((f) => f.id === selectedId) || null;
  }, [facilities, selectedId]);

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [districts, setDistricts] = useState<string[]>([]);

  useEffect(() => {
    getFacilityCategories(token)
      .then((cats) => {
        if (!Array.isArray(cats)) return;
        const counts: Record<string, number> = {};
        cats.forEach((c) => {
          counts[c.key] = c.count;
        });
        setCategoryCounts(counts);
      })
      .catch(() => { });

    getFacilityDistricts(token, 'education')
      .then((dists) => {
        if (Array.isArray(dists) && dists.length > 0) {
          setDistricts(dists);
        }
      })
      .catch(() => { });
  }, [token]);

  const totalPages = Math.max(1, Math.ceil(facilities.length / ITEMS_PER_PAGE));
  const paginatedFacilities = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return facilities.slice(start, start + ITEMS_PER_PAGE);
  }, [facilities, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

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
      center: [105.805, 21.032],
      zoom: 13.8,
      pitch: 58,
      bearing: -18,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      setup3DBuildings(map);

      map.addSource('facilities', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: 'facility-clusters',
        type: 'circle',
        source: 'facilities',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#4f46e5',
            5,
            '#4338ca',
            15,
            '#3730a3',
            50,
            '#312e81',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            5,
            22,
            15,
            26,
            50,
            32,
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'facility-cluster-count',
        type: 'symbol',
        source: 'facilities',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Bold'],
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'facility-unclustered-glow',
        type: 'circle',
        source: 'facilities',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'university', '#4f46e5',
            'high_school', '#d97706',
            'secondary_school', '#0d9488',
            'primary_school', '#db2777',
            'kindergarten', '#2563eb',
            '#4f46e5',
          ],
          'circle-radius': 14,
          'circle-opacity': 0.28,
        },
      });

      map.addLayer({
        id: 'facility-unclustered-point',
        type: 'circle',
        source: 'facilities',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'university', '#4f46e5',
            'high_school', '#d97706',
            'secondary_school', '#0d9488',
            'primary_school', '#db2777',
            'kindergarten', '#2563eb',
            '#4f46e5',
          ],
          'circle-radius': 7.5,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'selected-facility-halo',
        type: 'circle',
        source: 'facilities',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 18,
          'circle-color': 'transparent',
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-width': 3.5,
          'circle-stroke-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'facility-point-label',
        type: 'symbol',
        source: 'facilities',
        filter: ['!', ['has', 'point_count']],
        minzoom: 13.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 12,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      map.on('click', 'facility-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['facility-clusters'] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource('facilities') as any;
        if (source && clusterId !== undefined) {
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            const coords = (features[0].geometry as any).coordinates;
            map.easeTo({ center: coords, zoom: zoom + 0.5 });
          });
        }
      });

      map.on('click', 'facility-unclustered-point', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const id = feature.properties?.id;
        if (id) {
          setSelectedId(id);
          const coords = (feature.geometry as any).coordinates.slice();
          map.flyTo({
            center: coords,
            zoom: 16.5,
            pitch: is3D ? 58 : 0,
            duration: 800,
          });
        }
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 12,
      });
      hoverPopupRef.current = popup;

      map.on('mouseenter', 'facility-unclustered-point', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature) return;
        const coords = (feature.geometry as any).coordinates.slice();
        const p = feature.properties || {};
        const meta = CATEGORIES[p.category] || CATEGORIES.university;

        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="font-family: inherit; font-size: 12px; padding: 3px 6px; max-width: 240px;">
              <div style="font-weight: 750; color: ${meta.color}; margin-bottom: 2px;">${p.name || ''}</div>
              <div style="font-size: 11px; color: #64748b; margin-bottom: 2px;">${meta.label} • ${p.district || ''}</div>
              ${p.level ? `<div style="font-size: 10.5px; color: #475569;">⭐ ${p.level}</div>` : ''}
              ${p.operator_type ? `<div style="font-size: 10px; color: #94a3b8;">${p.operator_type}</div>` : ''}
            </div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', 'facility-unclustered-point', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });

      map.on('mouseenter', 'facility-clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'facility-clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      syncMapSource(facilitiesRef.current, selectedIdRef.current);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncMapSource(facilities, selectedId);
  }, [facilities, selectedId, syncMapSource]);

  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-gps-marker';
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#2563eb';
      el.style.border = '3px solid #ffffff';
      el.style.boxShadow = '0 0 12px rgba(37, 99, 235, 0.7)';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  const educationTabs = [
    { key: 'all', label: 'Tất cả Giáo dục', icon: GraduationCap, color: '#4f46e5', bg: '#eef2ff' },
    { key: 'university', label: 'Đại học & Học viện', icon: GraduationCap, color: '#4f46e5', bg: '#eef2ff' },
    { key: 'high_school', label: 'Trường THPT', icon: School, color: '#d97706', bg: '#fffbeb' },
    { key: 'secondary_school', label: 'Trường THCS', icon: School, color: '#0d9488', bg: '#f0fdfa' },
    { key: 'primary_school', label: 'Trường Tiểu học', icon: School, color: '#db2777', bg: '#fdf2f8' },
    { key: 'kindergarten', label: 'Trường Mầm non', icon: School, color: '#2563eb', bg: '#eff6ff' },
  ];

  return (
    <div className="bus-search-page">
      {/* Hero Header */}
      <div
        className="bus-hero page-width"
        style={{
          background: 'radial-gradient(circle at 85% 20%, rgba(199, 210, 254, 0.35) 0%, rgba(99, 102, 241, 0.2) 35%, transparent 65%), linear-gradient(135deg, #312e81 0%, #3730a3 45%, #4f46e5 100%)',
          boxShadow: '0 16px 42px -6px rgba(79, 70, 229, 0.42), 0 0 70px -10px rgba(99, 102, 241, 0.32)',
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
            background: 'radial-gradient(circle, rgba(165, 180, 252, 0.4) 0%, transparent 70%)',
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
            background: 'radial-gradient(circle, rgba(79, 70, 229, 0.25) 0%, transparent 70%)',
            filter: 'blur(45px)',
            pointerEvents: 'none',
          }}
        />

        <div className="bus-hero-content" style={{ position: 'relative', zIndex: 2 }}>
          <div className="bus-hero-eyebrow">
            <span className="badge-pill-light" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(255, 255, 255, 0.2)' }}>
              <GraduationCap size={14} /> OpenCity Mạng lưới Trường học & Giáo dục
            </span>
            <span className="badge-pill-light osm-badge" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(254, 240, 138, 0.3)' }}>
              <MapPin size={14} /> Dữ liệu mở OpenStreetMap (ODbL)
            </span>
          </div>

          <h1>Bản đồ Mạng lưới Trường học, THPT & Đại học Hà Nội</h1>
          <p>
            Tra cứu thông tin, địa chỉ, vị trí địa lý và các tuyến xe buýt kết nối tới các trường Đại học, THPT, THCS và Tiểu học của Thủ đô Hà Nội.
          </p>
        </div>

        <div className="bus-hero-actions" style={{ position: 'relative', zIndex: 2 }}>
          {operator && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreate}
              style={{
                background: '#4338ca',
                borderColor: '#818cf8',
                color: '#ffffff',
                boxShadow: '0 4px 18px rgba(67, 56, 202, 0.45), 0 0 20px rgba(129, 140, 248, 0.35)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={16} /> Thêm trường học
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
            {toast.type === 'info' && <BookOpen size={18} />}
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
        {/* Category Tabs */}
        <div
          className="bus-nav-tabs"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '4px',
            paddingRight: '36px',
          }}
        >
          {educationTabs.map((tab) => {
            const isActive = activeCategory === tab.key;
            const Icon = tab.icon;
            const count = categoryCounts[tab.key] ?? (tab.key === 'all' ? facilities.length : 0);
            return (
              <button
                key={tab.key}
                type="button"
                className={`bus-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setCategoryFilter(tab.key)}
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
          {/* Left Panel: Search & List */}
          <div className="bus-left-panel">
            <div
              className="bus-filter-box"
              style={{
                boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.06), 0 0 16px rgba(79, 70, 229, 0.06)',
                border: '1px solid #e0e7ff',
              }}
            >
              <div className="bus-search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="bus-search-input"
                  placeholder="Tìm trường học, Đại học, THPT (Bách Khoa, Amsterdam, Chu Văn An...)"
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
                <div className="filter-district-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    <MapPin size={15} style={{ color: '#4f46e5', flexShrink: 0 }} />
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
                    <option value="all">Tất cả quận / huyện ({facilities.length} trường)</option>
                    {districts.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Keywords */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>Gợi ý nhanh:</span>
                {['Bách Khoa', 'Quốc Gia', 'Kinh Tế', 'Y Hà Nội', 'Amsterdam', 'Chu Văn An'].map((kw) => {
                  const isKwActive = query === kw;
                  return (
                    <button
                      key={kw}
                      type="button"
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        background: isKwActive ? '#4f46e5' : 'var(--color-bg-main)',
                        color: isKwActive ? '#ffffff' : 'var(--color-text-secondary)',
                        border: '1px solid ' + (isKwActive ? '#4f46e5' : 'var(--color-border)'),
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 650,
                        boxShadow: isKwActive ? '0 2px 10px rgba(79, 70, 229, 0.4)' : 'none',
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

            {/* List Cards */}
            <div className="stops-grid-list">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 13 }}>Đang tải mạng lưới trường học từ dữ liệu OpenStreetMap...</div>
                </div>
              ) : facilities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: 13 }}>
                  Không tìm thấy trường học nào phù hợp với điều kiện tìm kiếm.
                </div>
              ) : (
                paginatedFacilities.map((item) => {
                  const isSelected = item.id === selectedId;
                  const catMeta = CATEGORIES[item.category] || CATEGORIES.university;
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
                              title="Sửa thông tin trường học"
                              style={{ padding: '3px 6px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 4, cursor: 'pointer', color: '#0369a1', display: 'flex', alignItems: 'center' }}
                              onClick={(e) => handleOpenEdit(item, e)}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              title="Xóa trường khỏi hệ thống"
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
                        {item.level && (
                          <span className="osm-tag" style={{ fontWeight: 600 }}>
                            {item.level}
                          </span>
                        )}
                        {item.district && (
                          <span className="osm-tag">{item.district}</span>
                        )}
                        {item.operator_type && (
                          <span className="osm-tag" style={{ color: '#475569' }}>
                            {item.operator_type}
                          </span>
                        )}
                      </div>

                      {/* Phone call shortcut */}
                      {item.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: '#0369a1' }}>
                          <Phone size={12} />
                          <a
                            href={`tel:${item.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#0284c7', textDecoration: 'none', fontWeight: 600 }}
                          >
                            Hotline: {item.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={facilities.length}
              itemsPerPage={ITEMS_PER_PAGE}
              itemLabel="trường học"
              onPageChange={handlePageChange}
              accentColor="#4f46e5"
            />
          </div>

          {/* Right Panel: Interactive 3D Map */}
          <div
            className="bus-right-map-panel"
            style={{
              boxShadow: '0 14px 40px -6px rgba(15, 23, 42, 0.14), 0 0 24px rgba(79, 70, 229, 0.08)',
              border: '1.5px solid #e0e7ff',
            }}
          >
            <div className="map-view-header">
              <div className="map-title-badge">
                <Layers size={14} /> Bản đồ không gian 3D
              </div>
              {selectedFacility ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="dot"
                    style={{ backgroundColor: CATEGORIES[selectedFacility.category]?.color || '#4f46e5' }}
                  />
                  <span>{selectedFacility.name} ({selectedFacility.district || 'Hà Nội'})</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#4f46e5', fontWeight: 600 }}>
                  <MapPin size={14} />
                  <span>
                    Mạng lưới trường học Hà Nội ({facilities.length.toLocaleString('vi-VN')} điểm)
                  </span>
                </div>
              )}
            </div>

            <div className="map-canvas-container">
              {/* Map Canvas */}
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

              {/* Floating Action Buttons */}
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
                  style={
                    is3D
                      ? {
                        background: '#4338ca',
                        color: '#ffffff',
                        borderColor: '#4338ca',
                        fontWeight: 600,
                      }
                      : {}
                  }
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

              {/* Detail Floating Card / Mobile Bottom Sheet */}
              {selectedFacility && (
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
                    border: '1.5px solid rgba(79, 70, 229, 0.3)',
                    boxShadow: '0 16px 42px rgba(15, 23, 42, 0.18), 0 0 30px rgba(79, 70, 229, 0.16)',
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
                        onClick={() => handleOpenEdit(selectedFacility)}
                      >
                        <Pencil size={12} /> Sửa
                      </button>
                      <button
                        type="button"
                        style={{ padding: '3px 8px', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#be123c', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                        onClick={() => handleDelete(selectedFacility)}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: CATEGORIES[selectedFacility.category]?.bg || '#eef2ff',
                        color: CATEGORIES[selectedFacility.category]?.color || '#4f46e5',
                      }}
                    >
                      {CATEGORIES[selectedFacility.category]?.label || 'Trường học'}
                    </span>

                    {selectedFacility.level && (
                      <span style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>
                        {selectedFacility.level}
                      </span>
                    )}

                    {selectedFacility.operator_type && (
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        • {selectedFacility.operator_type}
                      </span>
                    )}

                    {selectedFacility.distance_km !== undefined && selectedFacility.distance_km !== null && (
                      <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700, marginLeft: 'auto', paddingRight: 24 }}>
                        Cách bạn {selectedFacility.distance_km} km
                      </span>
                    )}
                  </div>

                  <h3 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                    {selectedFacility.name}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 12.5, marginBottom: 8 }}>
                    <MapPin size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
                    <span>{selectedFacility.address} ({selectedFacility.district})</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#475569', marginBottom: 10, flexWrap: 'wrap' }}>
                    <span>🕒 {selectedFacility.opening_hours || '07:30 - 17:30'}</span>

                    {selectedFacility.phone && (
                      <a
                        href={`tel:${selectedFacility.phone}`}
                        style={{
                          color: '#0284c7',
                          fontWeight: 650,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Phone size={13} /> {selectedFacility.phone}
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <a
                      href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${selectedFacility.latitude},${selectedFacility.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        fontSize: 12.5,
                        padding: '8px 12px',
                        textDecoration: 'none',
                        background: '#4338ca',
                        borderColor: '#818cf8',
                      }}
                    >
                      <Navigation size={14} /> Chỉ đường (Bản đồ OSM)
                    </a>

                    {selectedFacility.phone && (
                      <a
                        href={`tel:${selectedFacility.phone}`}
                        className="btn btn-outline"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 12px', textDecoration: 'none', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
                      >
                        <Phone size={14} /> Gọi điện
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="map-footer-attribution">
              <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)</span>
              <span>• Không gian 3D • {facilities.length} trường học</span>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#e0e7ff',
                    color: '#4338ca',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <GraduationCap size={20} />
                </div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                  {editingItem ? `Chỉnh sửa: ${editingItem.name}` : 'Thêm trường học / cơ sở đào tạo mới'}
                </h3>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => !formBusy && setIsFormOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="modal-body bus-form">
              {formError && (
                <div className="banner error" style={{ marginBottom: 12 }}>
                  {formError}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  Tên trường / Học viện / Cơ sở đào tạo <span className="required">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Ví dụ: Trường Đại học Bách Khoa Hà Nội"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label className="form-label">Cấp bậc trường học</label>
                  <select
                    className="form-input"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="university">Đại học & Học viện</option>
                    <option value="high_school">Trường THPT</option>
                    <option value="secondary_school">Trường THCS</option>
                    <option value="primary_school">Trường Tiểu học</option>
                    <option value="kindergarten">Trường Mầm non</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Loại hình trường</label>
                  <select
                    className="form-input"
                    value={formData.operator_type || 'Công lập'}
                    onChange={(e) => setFormData({ ...formData, operator_type: e.target.value })}
                  >
                    <option value="Công lập">Công lập</option>
                    <option value="Tư thục">Tư thục / Dân lập</option>
                    <option value="Quốc tế">Song ngữ / Quốc tế</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Địa chỉ cụ thể <span className="required">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="Số nhà, tên đường, phố..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label className="form-label">Quận / Huyện</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Cầu Giấy, Hai Bà Trưng, Đống Đa..."
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phân cấp / Đạt chuẩn</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Trọng điểm quốc gia / Chuẩn Quốc gia Mức 2"
                    value={formData.level || ''}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-grid-2col">
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

              <div className="form-grid-2col">
                <div className="form-group">
                  <label className="form-label">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="024 38xx xxxx"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Website / Cổng thông tin</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://..."
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Thời gian làm việc / Học tập</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="07:30 - 17:30 (Thứ 2 - Thứ 6)"
                  value={formData.opening_hours || ''}
                  onChange={(e) => setFormData({ ...formData, opening_hours: e.target.value })}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsFormOpen(false)}
                  disabled={formBusy}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 14,
                    color: '#64748b',
                    borderColor: '#cbd5e1',
                    background: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formBusy}
                  style={{
                    padding: '10px 24px',
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 14,
                    background: '#4f46e5',
                    borderColor: '#4f46e5',
                    boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {formBusy ? 'Đang lưu...' : editingItem ? 'Lưu thay đổi' : 'Thêm mới'}
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
              <Trash2 size={24} />
            </div>
            <h3 className="delete-confirm-title">Xác nhận xóa trường học</h3>
            <p className="delete-confirm-desc">
              Bạn có chắc chắn muốn xóa trường học <strong>"{deleteConfirmItem.name}"</strong>? Thao tác này sẽ xóa vĩnh viễn và không thể hoàn tác.
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

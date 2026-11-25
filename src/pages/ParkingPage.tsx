// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Car,
  CheckCircle2,
  CircleDot,
  Clock,
  Compass,
  Crosshair,
  DollarSign,
  Layers,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SquareParking,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { apiBase } from '../lib/auth';
import { canManage } from '../lib/permissions';
import { Pagination } from '../components/Pagination';
import {
  createParking,
  deleteParking,
  getParkingCategories,
  getParkingDistricts,
  listParking,
  updateParking,
  type ParkingInput,
  type ParkingSummary,
} from '../lib/api';

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const ITEMS_PER_PAGE = 10;

type CategoryMeta = {
  key: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof SquareParking;
};

const CATEGORIES: Record<string, CategoryMeta> = {
  all: {
    key: 'all',
    label: 'Tất cả điểm đỗ',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: SquareParking,
  },
  car_parking: {
    key: 'car_parking',
    label: 'Bãi đỗ ô tô',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    icon: Car,
  },
  motorcycle_parking: {
    key: 'motorcycle_parking',
    label: 'Điểm đỗ xe máy',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icon: Bike,
  },
  mixed_parking: {
    key: 'mixed_parking',
    label: 'Bãi gửi chung ô tô & xe máy',
    color: '#6366f1',
    bg: '#eef2ff',
    border: '#c7d2fe',
    icon: Warehouse,
  },
  street_parking: {
    key: 'street_parking',
    label: 'Đỗ xe lòng đường',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    icon: CircleDot,
  },
};

const PARKING_TYPE_LABELS: Record<string, string> = {
  surface: 'Mặt đất ngoài trời',
  underground: 'Hầm đỗ ngầm',
  'multi-storey': 'Nhà cao tầng / Giàn thông minh',
  street_side: 'Sát lề đường',
  rooftop: 'Sân thượng / Mái',
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
          'fill-extrusion-opacity': 0.98,
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

export function ParkingPage() {
  const { user } = useAuth();
  const token = user?.access_token || '';
  const [searchParams, setSearchParams] = useSearchParams();

  const activeCategory = searchParams.get('category') || 'all';

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const [parkings, setParkings] = useState<ParkingSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedParkingType, setSelectedParkingType] = useState<string>('all');
  const [only247, setOnly247] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [is3D, setIs3D] = useState(true);

  const operator = canManage(user, 'parking');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ParkingSummary | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ParkingSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const defaultForm: ParkingInput = {
    name: '',
    category: 'car_parking',
    parking_type: 'surface',
    address: '',
    district: 'Cầu Giấy',
    latitude: 21.0375,
    longitude: 105.7825,
    fee: 'Có phí',
    fee_details: 'Theo giờ quy định',
    capacity: 50,
    access: 'Công cộng',
    supervised: true,
    opening_hours: '24/7',
    operator: 'Công ty Khai thác Điểm đỗ xe Hà Nội',
    description: '',
    contact: '',
    tags: [],
    active: true,
  };

  const [formData, setFormData] = useState<ParkingInput>(defaultForm);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const parkingsRef = useRef<ParkingSummary[]>([]);
  parkingsRef.current = parkings;

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Sync GeoJSON data to map source
  const syncMapSource = useCallback((items: ParkingSummary[], selId: string | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('parking-spots') as GeoJSONSource | undefined;
    if (!source) return;

    const collection: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: items.map((p) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.longitude, p.latitude],
        },
        properties: {
          id: p.id,
          name: p.name,
          category: p.category,
          parking_type: p.parking_type,
          district: p.district,
          fee: p.fee,
          capacity: p.capacity || 0,
          opening_hours: p.opening_hours,
          access: p.access,
        },
      })),
    };

    source.setData(collection);

    if (map.getLayer('selected-parking-halo')) {
      map.setFilter('selected-parking-halo', ['==', ['get', 'id'], selId || '']);
    }
    if (map.getLayer('selected-footprint-outline')) {
      map.setFilter('selected-footprint-outline', ['==', ['get', 'id'], selId || '']);
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
      const items = await listParking(token, {
        keyword: query.trim() || undefined,
        category: activeCategory !== 'all' ? activeCategory : undefined,
        parking_type: selectedParkingType !== 'all' ? selectedParkingType : undefined,
        district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        fee_type: onlyFree ? 'free' : undefined,
        is_24_7: only247,
        lat: userLocation?.lat,
        lon: userLocation?.lng,
      });
      setParkings(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu bãi đỗ xe.');
    } finally {
      setLoading(false);
    }
  }, [token, query, activeCategory, selectedParkingType, selectedDistrict, onlyFree, only247, userLocation]);

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
          mapRef.current.flyTo({ center: [loc.lng, loc.lat], zoom: 15, duration: 800 });
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

  const handleOpenEdit = (item: ParkingSummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      parking_type: item.parking_type,
      address: item.address,
      district: item.district,
      latitude: item.latitude,
      longitude: item.longitude,
      fee: item.fee || 'Có phí',
      fee_details: item.fee_details || '',
      capacity: item.capacity || 50,
      access: item.access || 'Công cộng',
      supervised: item.supervised !== false,
      opening_hours: item.opening_hours || '24/7',
      operator: item.operator || '',
      description: '',
      contact: '',
      tags: item.tags || [],
      active: true,
    });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleDelete = (item: ParkingSummary, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!token || !operator) return;
    setDeleteConfirmItem(item);
  };

  const executeDelete = async () => {
    if (!deleteConfirmItem || !token || !operator) return;
    setIsDeleting(true);
    try {
      await deleteParking(token, deleteConfirmItem.id);
      setToast({
        message: `Đã xóa điểm đỗ "${deleteConfirmItem.name}" thành công.`,
        type: 'success',
      });
      if (selectedId === deleteConfirmItem.id) {
        setSelectedId(null);
      }
      setDeleteConfirmItem(null);
      await loadData();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Lỗi khi xóa điểm đỗ.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !operator) return;

    if (!formData.name.trim()) {
      setFormError('Vui lòng nhập tên điểm / bãi đỗ xe.');
      return;
    }
    if (!formData.address.trim()) {
      setFormError('Vui lòng nhập địa chỉ cụ thể.');
      return;
    }

    setFormBusy(true);
    setFormError('');
    try {
      if (editingItem) {
        const updated = await updateParking(token, editingItem.id, formData);
        setToast({ message: `Cập nhật điểm đỗ "${updated.name}" thành công!`, type: 'success' });
        setSelectedId(updated.id);
      } else {
        const created = await createParking(token, formData);
        setToast({ message: `Thêm mới điểm đỗ "${created.name}" thành công!`, type: 'success' });
        setSelectedId(created.id);
      }
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lỗi khi lưu dữ liệu bãi đỗ xe.');
    } finally {
      setFormBusy(false);
    }
  };

  const set3DMode = (enable: boolean) => {
    if (!mapRef.current) return;
    setIs3D(enable);
    const currentZoom = mapRef.current.getZoom();
    if (enable) {
      setup3DBuildings(mapRef.current);
      mapRef.current.easeTo({
        pitch: 36,
        bearing: -12,
        zoom: currentZoom < 14 ? 15.2 : currentZoom,
        duration: 800,
      });
    } else {
      mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  };

  const centerHanoi = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [105.805, 21.032],
      zoom: 13.8,
      pitch: is3D ? 36 : 0,
      bearing: is3D ? -12 : 0,
      duration: 800,
    });
  };

  const selectedParking = useMemo(() => {
    return parkings.find((p) => p.id === selectedId) || null;
  }, [parkings, selectedId]);

  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [districts, setDistricts] = useState<string[]>([]);

  useEffect(() => {
    getParkingCategories(token)
      .then((cats) => {
        if (!Array.isArray(cats)) return;
        const counts: Record<string, number> = {};
        cats.forEach((c) => {
          counts[c.key] = c.count;
        });
        setCategoryCounts(counts);
      })
      .catch(() => {});

    getParkingDistricts(token)
      .then((dists) => {
        if (Array.isArray(dists) && dists.length > 0) {
          setDistricts(dists);
        }
      })
      .catch(() => {});
  }, [token]);

  const totalPages = Math.max(1, Math.ceil(parkings.length / ITEMS_PER_PAGE));
  const paginatedParkings = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return parkings.slice(start, start + ITEMS_PER_PAGE);
  }, [parkings, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.min(Math.max(1, newPage), totalPages));
  };

  // Map initialization
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
      pitch: 36,
      bearing: -12,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      // 1. Setup 3D buildings first
      setup3DBuildings(map);

      // 2. Add real OSM parking polygon footprints from backend API
      const footprintsUrl = `${apiBase.replace(/\/$/, '')}/api/opencity/parking/footprints`;
      map.addSource('parking-footprints', {
        type: 'geojson',
        data: footprintsUrl,
      });

      // 3. Footprint polygon fill (rendered on the ground BEFORE 3d-buildings)
      const beforeBuildings = map.getLayer('3d-buildings') ? '3d-buildings' : undefined;
      map.addLayer(
        {
          id: 'parking-footprint-fill',
          type: 'fill',
          source: 'parking-footprints',
          minzoom: 12.5,
          paint: {
            'fill-color': [
              'match',
              ['get', 'amenity'],
              'motorcycle_parking', '#10b981',
              '#3b82f6',
            ],
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12.5, 0.25,
              15.5, 0.45,
              18, 0.65,
            ],
          },
        },
        beforeBuildings
      );

      // 4. Footprint polygon dashed boundary line (rendered on ground BEFORE 3d-buildings)
      map.addLayer(
        {
          id: 'parking-footprint-line',
          type: 'line',
          source: 'parking-footprints',
          minzoom: 12.5,
          paint: {
            'line-color': [
              'match',
              ['get', 'amenity'],
              'motorcycle_parking', '#059669',
              '#1d4ed8',
            ],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12.5, 1.2,
              16, 2.5,
              18, 3.8,
            ],
            'line-dasharray': [2, 1],
          },
        },
        beforeBuildings
      );

      // Selected footprint highlight
      map.addLayer({
        id: 'selected-footprint-outline',
        type: 'line',
        source: 'parking-footprints',
        minzoom: 13,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'line-color': '#f59e0b',
          'line-width': 4.5,
        },
      });

      map.addSource('parking-spots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 40,
        clusterMaxZoom: 14,
      });

      // Cluster circle
      map.addLayer({
        id: 'parking-clusters',
        type: 'circle',
        source: 'parking-spots',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#2563eb',
            5,
            '#1d4ed8',
            15,
            '#1e40af',
            50,
            '#172554',
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

      // Cluster count label
      map.addLayer({
        id: 'parking-cluster-count',
        type: 'symbol',
        source: 'parking-spots',
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

      // Unclustered point glow
      map.addLayer({
        id: 'parking-unclustered-glow',
        type: 'circle',
        source: 'parking-spots',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'car_parking', '#2563eb',
            'motorcycle_parking', '#059669',
            'mixed_parking', '#6366f1',
            'street_parking', '#d97706',
            '#2563eb',
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 14,
            15, 9,
            17, 5,
          ],
          'circle-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13, 0.28,
            16, 0.12,
          ],
        },
      });

      // Unclustered point inner dot
      map.addLayer({
        id: 'parking-unclustered-point',
        type: 'circle',
        source: 'parking-spots',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'match',
            ['get', 'category'],
            'car_parking', '#2563eb',
            'motorcycle_parking', '#059669',
            'mixed_parking', '#6366f1',
            'street_parking', '#d97706',
            '#2563eb',
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 7.5,
            15, 5.5,
            17, 3.5,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Selected halo
      map.addLayer({
        id: 'selected-parking-halo',
        type: 'circle',
        source: 'parking-spots',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 18,
          'circle-color': 'transparent',
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-width': 3.5,
          'circle-stroke-opacity': 0.95,
        },
      });

      // Point label
      map.addLayer({
        id: 'parking-point-label',
        type: 'symbol',
        source: 'parking-spots',
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

      // Click on cluster
      map.on('click', 'parking-clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['parking-clusters'] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource('parking-spots') as any;
        if (source && clusterId !== undefined) {
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return;
            const coords = (features[0].geometry as any).coordinates;
            map.easeTo({ center: coords, zoom: zoom + 0.5 });
          });
        }
      });

      // Click on single point
      map.on('click', 'parking-unclustered-point', (e) => {
        const f = e.features?.[0];
        if (!f || !f.properties) return;
        const id = f.properties.id;
        setSelectedId(id);
        const coords = (f.geometry as any).coordinates;
        map.flyTo({
          center: coords,
          zoom: 16.5,
          duration: 700,
        });
      });

      // Hover popup
      map.on('mouseenter', 'parking-unclustered-point', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f || !f.properties) return;
        const coords = (f.geometry as any).coordinates.slice();
        const pName = f.properties.name;
        const pFee = f.properties.fee;
        const pCap = f.properties.capacity;

        if (hoverPopupRef.current) hoverPopupRef.current.remove();
        hoverPopupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: 'map-facility-hover-popup',
        })
          .setLngLat(coords)
          .setHTML(
            `<div style="font-size:12px; font-weight:600; color:#0f172a;">${pName}</div>` +
            `<div style="font-size:11px; color:#64748b; margin-top:2px;">` +
            `<span style="color:#2563eb; font-weight:700;">${pFee}</span>` +
            `${pCap > 0 ? ` · ${pCap} chỗ` : ''}</div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', 'parking-unclustered-point', () => {
        map.getCanvas().style.cursor = '';
        if (hoverPopupRef.current) {
          hoverPopupRef.current.remove();
          hoverPopupRef.current = null;
        }
      });

      map.on('mouseenter', 'parking-clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'parking-clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', 'parking-footprint-fill', (e) => {
        const f = e.features?.[0];
        if (!f || !f.properties) return;
        const id = f.properties.id;
        setSelectedId(id);
      });
      map.on('mouseenter', 'parking-footprint-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'parking-footprint-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      // Sync initial data if already loaded
      syncMapSource(parkingsRef.current, selectedIdRef.current);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [syncMapSource]);

  // Sync data to map when parkings or selectedId change
  useEffect(() => {
    syncMapSource(parkings, selectedId);
  }, [parkings, selectedId, syncMapSource]);

  // User location marker
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-location-marker';
      el.innerHTML = '<div class="user-location-pulse"></div><div class="user-location-dot"></div>';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapRef.current);
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  const parkingTabs = useMemo(() => {
    return [
      CATEGORIES.all,
      CATEGORIES.car_parking,
      CATEGORIES.motorcycle_parking,
      CATEGORIES.mixed_parking,
      CATEGORIES.street_parking,
    ];
  }, []);

  return (
    <div className="bus-search-page">
      {/* Hero Header */}
      <div
        className="bus-hero page-width"
        style={{
          background: 'radial-gradient(circle at 85% 20%, rgba(191, 219, 254, 0.35) 0%, rgba(59, 130, 246, 0.2) 35%, transparent 65%), linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #2563eb 100%)',
          boxShadow: '0 16px 42px -6px rgba(29, 78, 216, 0.42), 0 0 70px -10px rgba(59, 130, 246, 0.32)',
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
            background: 'radial-gradient(circle, rgba(96, 165, 250, 0.38) 0%, transparent 70%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }}
        />

        <div className="bus-hero-content" style={{ position: 'relative', zIndex: 2 }}>
          <div className="bus-hero-eyebrow">
            <span className="badge-pill-light" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(255, 255, 255, 0.2)' }}>
              <SquareParking size={14} /> OpenCity Tiện ích Điểm đỗ xe
            </span>
            <span className="badge-pill-light osm-badge" style={{ backdropFilter: 'blur(8px)', boxShadow: '0 0 12px rgba(254, 240, 138, 0.3)' }}>
              <MapPin size={14} /> Số hóa 994 Bãi đỗ OpenStreetMap (ODbL)
            </span>
          </div>

          <h1>Bản đồ Điểm & Bãi đỗ xe Hà Nội</h1>
          <p>
            Hệ thống tra cứu số hóa vị trí bãi đỗ ô tô, điểm gửi xe máy, hầm đỗ thông minh và điểm trông giữ xe lòng đường trên nền tảng bản đồ 3D tương tác.
          </p>
        </div>

        <div className="bus-hero-actions" style={{ position: 'relative', zIndex: 2 }}>
          {operator && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenCreate}
              style={{
                background: '#1d4ed8',
                borderColor: '#60a5fa',
                color: '#ffffff',
                boxShadow: '0 4px 18px rgba(29, 78, 216, 0.45), 0 0 20px rgba(96, 165, 250, 0.35)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={16} /> Thêm bãi đỗ xe
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
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {parkingTabs.map((tab) => {
            const isActive = activeCategory === tab.key;
            const Icon = tab.icon;
            const count = categoryCounts[tab.key] ?? (tab.key === 'all' ? parkings.length : 0);
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
                boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.06), 0 0 16px rgba(37, 99, 235, 0.06)',
                border: '1px solid #bfdbfe',
              }}
            >
              {/* Keyword Search */}
              <div className="bus-search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  className="bus-search-input"
                  placeholder="Tìm bãi đỗ, đường phố (Keangnam, Vincom, Bờ Hồ, Cầu Giấy...)"
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

              {/* Filters Row: District & Parking Type */}
              <div className="form-grid-2col" style={{ gap: 8, marginBottom: 8 }}>
                {districts.length > 0 && (
                  <div>
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
                      <option value="all">Tất cả quận / huyện ({parkings.length})</option>
                      {districts.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <select
                    className="bus-search-input"
                    value={selectedParkingType}
                    onChange={(e) => {
                      setSelectedParkingType(e.target.value);
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
                    <option value="all">Tất cả hình thức bãi</option>
                    <option value="surface">Mặt đất ngoài trời</option>
                    <option value="underground">Hầm đỗ ngầm</option>
                    <option value="multi-storey">Nhà đỗ cao tầng</option>
                    <option value="street_side">Sát lề đường</option>
                    <option value="rooftop">Sân thượng / Mái</option>
                  </select>
                </div>
              </div>

              {/* Toggles: 24/7 & Free */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontWeight: 650,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: '1px solid ' + (only247 ? '#2563eb' : 'var(--color-border)'),
                    background: only247 ? '#2563eb' : 'var(--color-bg-main)',
                    color: only247 ? '#ffffff' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setOnly247(!only247);
                    setCurrentPage(1);
                  }}
                >
                  <Clock size={13} />
                  <span>Mở cửa 24/7</span>
                </button>

                <button
                  type="button"
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 20,
                    cursor: 'pointer',
                    fontWeight: 650,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    border: '1px solid ' + (onlyFree ? '#059669' : 'var(--color-border)'),
                    background: onlyFree ? '#059669' : 'var(--color-bg-main)',
                    color: onlyFree ? '#ffffff' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setOnlyFree(!onlyFree);
                    setCurrentPage(1);
                  }}
                >
                  <DollarSign size={13} />
                  <span>Miễn phí</span>
                </button>
              </div>

              {/* Quick Suggestions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>Gợi ý:</span>
                {['Keangnam', 'Vincom', 'Bờ Hồ', 'Mỹ Đình', 'Ga Hà Nội', 'Trần Hưng Đạo', 'Hoàn Kiếm'].map((kw) => {
                  const isKwActive = query === kw;
                  return (
                    <button
                      key={kw}
                      type="button"
                      style={{
                        fontSize: 12,
                        padding: '4px 10px',
                        background: isKwActive ? '#2563eb' : 'var(--color-bg-main)',
                        color: isKwActive ? '#ffffff' : 'var(--color-text-secondary)',
                        border: '1px solid ' + (isKwActive ? '#2563eb' : 'var(--color-border)'),
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 650,
                        boxShadow: isKwActive ? '0 2px 10px rgba(37, 99, 235, 0.4)' : 'none',
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
                  <div style={{ fontSize: 13 }}>Đang tải danh sách điểm đỗ xe từ OpenStreetMap...</div>
                </div>
              ) : parkings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: 13 }}>
                  Không tìm thấy điểm đỗ nào phù hợp với bộ lọc hiện tại.
                </div>
              ) : (
                paginatedParkings.map((item) => {
                  const isSelected = item.id === selectedId;
                  const catMeta = CATEGORIES[item.category] || CATEGORIES.car_parking;
                  const IconComp = catMeta.icon;
                  const typeLabel = PARKING_TYPE_LABELS[item.parking_type] || item.parking_type;
                  const isFree = item.fee.toLowerCase().includes('miễn phí');

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
                            pitch: is3D ? 36 : 0,
                            bearing: is3D ? -12 : 0,
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
                              className="btn btn-outline"
                              style={{ padding: '3px 6px', fontSize: 11 }}
                              onClick={(e) => handleOpenEdit(item, e)}
                              title="Chỉnh sửa điểm đỗ"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              style={{ padding: '3px 6px', fontSize: 11, color: '#ef4444', borderColor: '#fca5a5' }}
                              onClick={(e) => handleDelete(item, e)}
                              title="Xóa điểm đỗ"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Badges Info */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontWeight: 700,
                            background: isFree ? '#ecfdf5' : '#eff6ff',
                            color: isFree ? '#059669' : '#2563eb',
                            border: `1px solid ${isFree ? '#a7f3d0' : '#bfdbfe'}`,
                          }}
                        >
                          {item.fee}
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontWeight: 600,
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {typeLabel}
                        </span>

                        {item.capacity && item.capacity > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              background: '#f8fafc',
                              color: '#475569',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            ~{item.capacity} chỗ đỗ
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontWeight: 600,
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Clock size={10} />
                          {item.opening_hours}
                        </span>

                        {item.supervised && (
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontWeight: 600,
                              background: '#f0fdf4',
                              color: '#16a34a',
                              border: '1px solid #bbf7d0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <ShieldCheck size={10} />
                            Có bảo vệ
                          </span>
                        )}
                      </div>

                      {/* Direction Link */}
                      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                        <a
                          href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation ? `${userLocation.lat},${userLocation.lng}` : ''}%3B${item.latitude},${item.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: '#2563eb',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            textDecoration: 'none',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#eff6ff',
                          }}
                        >
                          <Navigation size={12} /> Chỉ đường OSM
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            {parkings.length > ITEMS_PER_PAGE && (
              <div style={{ marginTop: 12 }}>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={parkings.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  itemLabel="điểm đỗ xe"
                  onPageChange={handlePageChange}
                  accentColor="#2563eb"
                />
              </div>
            )}
          </div>

          {/* Right Panel: Map Container with Rounded Frame */}
          <div className="bus-right-map-panel">
            <div className="map-view-header">
              <div className="map-title-badge">
                <Compass size={14} /> Bản đồ không gian 3D
              </div>
              {selectedParking ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="dot"
                    style={{ backgroundColor: CATEGORIES[selectedParking.category]?.color || '#2563eb' }}
                  />
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    {selectedParking.name} ({selectedParking.district || 'Hà Nội'})
                  </span>
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
                    title="Đóng chi tiết bãi đỗ"
                  >
                    <X size={12} /> Đóng
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#0284c7', fontWeight: 600 }}>
                  <MapPin size={14} />
                  <span>
                    Mạng lưới điểm đỗ xe toàn Hà Nội ({(parkings.length || 994).toLocaleString('vi-VN')} điểm đỗ)
                  </span>
                </div>
              )}
            </div>

            <div className="map-canvas-container">
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

              <div className="map-floating-bar">
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={handleLocateMe}
                  title="Bay đến vị trí hiện tại của bạn"
                >
                  <Crosshair size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  Vị trí của tôi
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={() => set3DMode(true)}
                  title="Nghiêng góc nhìn 3D và hiển thị khối nhà"
                >
                  <Layers size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
                  Góc nhìn 3D
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={() => set3DMode(false)}
                  title="Góc nhìn phẳng 2D"
                >
                  Góc nhìn 2D
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={centerHanoi}
                  title="Căn giữa Hà Nội"
                >
                  Trung tâm Hà Nội
                </button>
              </div>

              {/* Floating Detail Card on Map */}
              {selectedParking && (
                <div
                  className="floating-stop-detail"
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 12,
                    right: 12,
                    maxWidth: 440,
                    maxHeight: 'calc(100% - 64px)',
                    overflowY: 'auto',
                    background: 'var(--color-bg-surface, #ffffff)',
                    borderRadius: 16,
                    padding: '14px 16px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)',
                    border: '1px solid var(--color-border, #e2e8f0)',
                    zIndex: 10,
                    backdropFilter: 'blur(10px)',
                    animation: 'fadeInUp 0.25s ease-out',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                    }}
                    aria-label="Đóng chi tiết"
                  >
                    <X size={18} />
                  </button>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#eff6ff',
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <SquareParking size={22} />
                    </div>
                    <div style={{ flex: 1, paddingRight: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750, color: 'var(--color-text-main, #0f172a)' }}>
                        {selectedParking.name}
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#64748b' }}>
                        {selectedParking.address}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12, fontSize: 12 }}>
                    <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                      <span style={{ color: '#64748b' }}>Hình thức: </span>
                      <strong style={{ color: '#0f172a' }}>{PARKING_TYPE_LABELS[selectedParking.parking_type] || selectedParking.parking_type}</strong>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                      <span style={{ color: '#64748b' }}>Biểu phí: </span>
                      <strong style={{ color: '#2563eb' }}>{selectedParking.fee}</strong>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                      <span style={{ color: '#64748b' }}>Sức chứa: </span>
                      <strong style={{ color: '#0f172a' }}>{selectedParking.capacity ? `~${selectedParking.capacity} vị trí` : 'Theo quy chuẩn'}</strong>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                      <span style={{ color: '#64748b' }}>Giờ mở cửa: </span>
                      <strong style={{ color: '#0f172a' }}>{selectedParking.opening_hours}</strong>
                    </div>
                  </div>

                  {selectedParking.operator && (
                    <div style={{ marginTop: 8, fontSize: 11.5, color: '#64748b' }}>
                      <span>Đơn vị vận hành: </span>
                      <strong>{selectedParking.operator}</strong>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <a
                      href={`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation ? `${userLocation.lat},${userLocation.lng}` : ''}%3B${selectedParking.latitude},${selectedParking.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{
                        padding: '6px 12px',
                        fontSize: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        textDecoration: 'none',
                      }}
                    >
                      <Navigation size={13} /> Chỉ đường bản đồ OSM
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="map-footer-attribution">
              <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)</span>
              <span>• Không gian 3D</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Create / Edit Modal */}
      {isFormOpen && (
        <div className="modal-backdrop" onClick={() => !formBusy && setIsFormOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SquareParking size={20} style={{ color: '#2563eb' }} />
                <h3>{editingItem ? 'Chỉnh sửa điểm đỗ xe' : 'Thêm điểm / bãi đỗ xe mới'}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsFormOpen(false)}
                disabled={formBusy}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="modal-body">
              {formError && (
                <div className="banner error" style={{ marginBottom: 12, fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Tên điểm / bãi đỗ xe *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Bãi đỗ xe Keangnam Landmark 72"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-grid-2col" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Loại bãi đỗ</label>
                  <select
                    className="form-input"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="car_parking">Bãi đỗ ô tô</option>
                    <option value="motorcycle_parking">Điểm đỗ xe máy</option>
                    <option value="mixed_parking">Bãi gửi chung ô tô & xe máy</option>
                    <option value="street_parking">Đỗ xe lòng đường</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Hình thức bãi đỗ</label>
                  <select
                    className="form-input"
                    value={formData.parking_type}
                    onChange={(e) => setFormData({ ...formData, parking_type: e.target.value })}
                  >
                    <option value="surface">Mặt đất ngoài trời</option>
                    <option value="underground">Hầm đỗ ngầm</option>
                    <option value="multi-storey">Nhà đỗ cao tầng</option>
                    <option value="street_side">Sát lề đường</option>
                    <option value="rooftop">Sân thượng / Mái</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Địa chỉ cụ thể *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Số nhà, tên đường, phố..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                />
              </div>

              <div className="form-grid-2col" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Quận / Huyện *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Quận / Huyện"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Sức chứa / số chỗ</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="Ví dụ: 100"
                    value={formData.capacity || ''}
                    onChange={(e) => setFormData({ ...formData, capacity: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>

              <div className="form-grid-2col" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Vĩ độ (Latitude) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: Number(e.target.value) })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Kinh độ (Longitude) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: Number(e.target.value) })}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-2col" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Biểu phí</label>
                  <select
                    className="form-input"
                    value={formData.fee}
                    onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                  >
                    <option value="Có phí">Có phí</option>
                    <option value="Miễn phí">Miễn phí</option>
                    <option value="Theo giờ">Theo giờ</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Giờ hoạt động</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="24/7 hoặc 06:00 - 22:00"
                    value={formData.opening_hours}
                    onChange={(e) => setFormData({ ...formData, opening_hours: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Đơn vị quản lý / vận hành</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Công ty / ban quản lý..."
                  value={formData.operator || ''}
                  onChange={(e) => setFormData({ ...formData, operator: e.target.value })}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsFormOpen(false)}
                  disabled={formBusy}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formBusy}
                >
                  {formBusy ? 'Đang lưu...' : editingItem ? 'Lưu thay đổi' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="modal-backdrop" onClick={() => !isDeleting && setDeleteConfirmItem(null)}>
          <div className="modal-card delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trash2 size={24} />
              </div>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              Xác nhận xóa bãi đỗ xe
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa bãi đỗ xe <strong>&ldquo;{deleteConfirmItem.name}&rdquo;</strong>? Hành động này sẽ xóa dữ liệu trên hệ thống đô thị OpenCity.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={isDeleting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={executeDelete}
                disabled={isDeleting}
                style={{ background: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
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

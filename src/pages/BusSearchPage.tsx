// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  ArrowRightLeft,
  BusFront,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Info,
  Layers,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Search,
  Ticket,
  Upload,
  X,
  Crosshair,
  Database,
  ChevronDown,
  ChevronUp,
  Footprints,
  Edit3,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import {
  request,
  type BusAuditReport,
  type BusRouteDetail,
  type BusRouteSummary,
  type BusStopSummary,
  type BusSyncResult,
  type RouteRecommendation,
  type RouteStopRef,
} from '../lib/api';

const POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function calcDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDist(distKm: number): string {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}

function slicePathBetweenStops(
  path: [number, number][],
  boardLat: number,
  boardLng: number,
  alightLat: number,
  alightLng: number
): [number, number][] {
  if (!path || path.length < 2) {
    return [[boardLng, boardLat], [alightLng, alightLat]];
  }

  let startIdx = 0;
  let minStartDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.pow(path[i][0] - boardLng, 2) + Math.pow(path[i][1] - boardLat, 2);
    if (d < minStartDist) {
      minStartDist = d;
      startIdx = i;
    }
  }

  let endIdx = path.length - 1;
  let minEndDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.pow(path[i][0] - alightLng, 2) + Math.pow(path[i][1] - alightLat, 2);
    if (d < minEndDist) {
      minEndDist = d;
      endIdx = i;
    }
  }

  let sliced: [number, number][] = [];
  if (startIdx <= endIdx) {
    sliced = path.slice(startIdx, endIdx + 1);
  } else {
    sliced = path.slice(endIdx, startIdx + 1).reverse();
  }

  const res: [number, number][] = [[boardLng, boardLat]];
  for (const pt of sliced) {
    const prev = res[res.length - 1];
    if (Math.pow(pt[0] - prev[0], 2) + Math.pow(pt[1] - prev[1], 2) > 1e-8) {
      res.push(pt);
    }
  }
  const last = res[res.length - 1];
  if (Math.pow(alightLng - last[0], 2) + Math.pow(alightLat - last[1], 2) > 1e-8) {
    res.push([alightLng, alightLat]);
  }

  return res;
}

function normalizeVietnamese(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim();
}

const POPULAR_DESTINATIONS = [
  { name: 'Đại học Bách Khoa', coords: { lat: 21.0067, lng: 105.8450 } },
  { name: 'Bến xe Mỹ Đình', coords: { lat: 21.0282, lng: 105.7782 } },
  { name: 'Hồ Hoàn Kiếm', coords: { lat: 21.0288, lng: 105.8524 } },
  { name: 'Đại học Mỏ (Chèm)', coords: { lat: 21.0715, lng: 105.7769 } },
  { name: 'Bệnh viện Bạch Mai', coords: { lat: 21.0006, lng: 105.8407 } },
  { name: 'Bến xe Giáp Bát', coords: { lat: 20.9785, lng: 105.8415 } },
  { name: 'Cầu Giấy', coords: { lat: 21.0335, lng: 105.7958 } },
  { name: 'Bến xe Yên Nghĩa', coords: { lat: 20.9497, lng: 105.7475 } },
];

export function BusSearchPage() {
  const { user, login } = useAuth();
  const token = user?.access_token || '';
  const isOperator = canManage(user ?? null, 'bus_search') || canManage(user ?? null, 'reports');

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'routes';

  // State
  const [routes, setRoutes] = useState<BusRouteSummary[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<BusRouteDetail | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [stops, setStops] = useState<BusStopSummary[]>([]);
  const [audit, setAudit] = useState<BusAuditReport | null>(null);
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([]);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; isDefault: boolean }>({
    lat: 21.0285,
    lng: 105.8542,
    isDefault: true,
  });
  const [nearbyStops, setNearbyStops] = useState<BusStopSummary[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);

  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [showRouteSuggestions, setShowRouteSuggestions] = useState(false);
  const routeSearchWrapperRef = useRef<HTMLDivElement | null>(null);
  const [routeTypeFilter, setRouteTypeFilter] = useState<'all' | 'standard' | 'brt' | 'electric'>('all');
  const [stopSearchQuery, setStopSearchQuery] = useState('');

  const [tripPlannerMode, setTripPlannerMode] = useState<'my_location' | 'custom'>('my_location');
  const [quickDestQuery, setQuickDestQuery] = useState('');
  const [showQuickDestSuggestions, setShowQuickDestSuggestions] = useState(false);
  const quickDestWrapperRef = useRef<HTMLDivElement | null>(null);

  const [fromQuery, setFromQuery] = useState('Vị trí hiện tại của tôi');
  const [toQuery, setToQuery] = useState('');
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [toCoords, setToCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const fromWrapperRef = useRef<HTMLDivElement | null>(null);
  const toWrapperRef = useRef<HTMLDivElement | null>(null);
  const [selectedRecIndex, setSelectedRecIndex] = useState<number>(0);
  const [expandedTripIndex, setExpandedTripIndex] = useState<number | null>(null);
  const [isSearchingTrip, setIsSearchingTrip] = useState(false);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importReplace, setImportReplace] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false);
  const [isEditRouteModalOpen, setIsEditRouteModalOpen] = useState(false);
  const [routeFormData, setRouteFormData] = useState({
    id: '',
    route_number: '',
    name: '',
    operator: 'Transerco (XN Xe buýt Hà Nội)',
    route_type: 'standard' as 'standard' | 'brt' | 'electric',
    from_terminal: '',
    to_terminal: '',
    operating_hours: '05:00 - 21:00',
    frequency: '10 - 15 phút/chuyến',
    fare: '10.000 đ/lượt',
    color: '#2563eb',
  });

  const [isAddStopModalOpen, setIsAddStopModalOpen] = useState(false);
  const [isEditStopModalOpen, setIsEditStopModalOpen] = useState(false);
  const [stopFormData, setStopFormData] = useState({
    id: '',
    name: '',
    address: '',
    latitude: 21.0285,
    longitude: 105.8542,
    has_shelter: true,
    routes: '',
  });
  const [isSubmittingEntity, setIsSubmittingEntity] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const hasInitializedHanoiOverviewRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const STOPS_PER_PAGE = 25;
  const rawStopPage = parseInt(searchParams.get('page') || '1', 10);
  const totalStopPages = Math.max(1, Math.ceil(stops.length / STOPS_PER_PAGE));
  const currentStopPage = Math.min(Math.max(1, isNaN(rawStopPage) ? 1 : rawStopPage), totalStopPages);

  const paginatedStops = useMemo(() => {
    const startIdx = (currentStopPage - 1) * STOPS_PER_PAGE;
    return stops.slice(startIdx, startIdx + STOPS_PER_PAGE);
  }, [stops, currentStopPage]);

  const [jumpPageInput, setJumpPageInput] = useState<string>('');

  const handleStopPageChange = (newPage: number) => {
    const targetPage = Math.min(Math.max(1, newPage), totalStopPages);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'stops');
    params.set('page', String(targetPage));
    setSearchParams(params);

    const leftPanel = document.querySelector('.bus-left-panel');
    if (leftPanel) {
      leftPanel.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    if (tab === 'stops' && !params.get('page')) {
      params.set('page', '1');
    }
    setSearchParams(params);
  };

  const fetchRoutes = useCallback(async () => {
    try {
      const data = await request<BusRouteSummary[]>('/api/opencity/bus/routes', token);
      setRoutes(data);
    } catch (err) {
      console.error('Failed to fetch bus routes:', err);
    }
  }, [token]);

  const fetchStops = useCallback(async (query?: string) => {
    try {
      const url = query
        ? `/api/opencity/bus/stops?keyword=${encodeURIComponent(query)}`
        : '/api/opencity/bus/stops';
      const data = await request<BusStopSummary[]>(url, token);
      setStops(data);
    } catch (err) {
      console.error('Failed to fetch bus stops:', err);
    }
  }, [token]);

  const fetchNearbyStops = useCallback(async (lat: number, lng: number) => {
    setNearbyLoading(true);
    try {
      const data = await request<BusStopSummary[]>(`/api/opencity/bus/stops?lat=${lat}&lng=${lng}&radius_km=1.5`, token);
      setNearbyStops(data);
    } catch (err) {
      console.error('Failed to fetch nearby stops:', err);
    } finally {
      setNearbyLoading(false);
    }
  }, [token]);

  const handleLocateMe = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation({ lat, lng, isDefault: false });
          void fetchNearbyStops(lat, lng);
          if (mapRef.current) {
            mapRef.current.flyTo({
              center: [lng, lat],
              zoom: 15.5,
              pitch: 50,
              duration: 900,
            });
          }
        },
        (err) => {
          alert('Không thể định vị vị trí của bạn: ' + (err.message || 'Trình duyệt từ chối quyền truy cập vị trí.'));
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      alert('Trình duyệt của bạn không hỗ trợ định vị Geolocation.');
    }
  }, [fetchNearbyStops]);

  const fetchAudit = useCallback(async () => {
    try {
      const data = await request<BusAuditReport>('/api/opencity/bus/audit', token);
      setAudit(data);
    } catch (err) {
      console.error('Failed to fetch bus audit:', err);
    }
  }, [token]);

  const selectRouteById = useCallback(async (routeId: string) => {
    try {
      const data = await request<BusRouteDetail>(`/api/opencity/bus/routes/${encodeURIComponent(routeId)}`, token);
      setSelectedRoute(data);
    } catch (err) {
      console.error('Failed to fetch route detail:', err);
    }
  }, [token]);

  const selectRouteByIdRef = useRef(selectRouteById);
  selectRouteByIdRef.current = selectRouteById;
  const setSelectedStopIdRef = useRef(setSelectedStopId);
  setSelectedStopIdRef.current = setSelectedStopId;

  const handleFindTrip = useCallback(async () => {
    const dest = toQuery.trim();
    if (!dest) return;
    setIsSearchingTrip(true);
    try {
      const params = new URLSearchParams();

      let origin = fromCoords;
      if (tripPlannerMode === 'my_location' || !origin) {
        origin = { lat: userLocation.lat, lng: userLocation.lng };
      }

      params.append('from_lat', String(origin.lat));
      params.append('from_lng', String(origin.lng));
      if (tripPlannerMode === 'custom' && fromQuery && !fromQuery.includes('Vị trí hiện tại')) {
        params.append('from_query', fromQuery.trim());
      }

      let destCoords = toCoords;
      if (!destCoords) {
        const normQ = normalizeVietnamese(dest);
        const match = stops.find(
          (s) =>
            normalizeVietnamese(s.name).includes(normQ) ||
            s.name.toLowerCase().includes(dest.toLowerCase())
        );
        if (match) {
          destCoords = { lat: match.latitude, lng: match.longitude };
          setToCoords(destCoords);
        }
      }

      if (destCoords) {
        params.append('to_lat', String(destCoords.lat));
        params.append('to_lng', String(destCoords.lng));
      }
      params.append('to_query', dest);

      const url = `/api/opencity/bus/find?${params.toString()}`;
      const data = await request<RouteRecommendation[]>(url, token);
      setRecommendations(data);
      setSelectedRecIndex(0);
      setSelectedRoute(null);
    } catch (err) {
      console.error('Failed to find trip:', err);
    } finally {
      setIsSearchingTrip(false);
    }
  }, [fromQuery, toQuery, fromCoords, toCoords, tripPlannerMode, userLocation, stops, token]);

  const handleQuickDestinationSearch = useCallback(
    async (destName: string, destCoords?: { lat: number; lng: number } | null) => {
      const cleanName = destName.trim();
      if (!cleanName) return;

      setToQuery(cleanName);
      let targetCoords = destCoords ?? null;

      if (!targetCoords) {
        const normQ = normalizeVietnamese(cleanName);
        const match = stops.find(
          (s) =>
            normalizeVietnamese(s.name).includes(normQ) ||
            s.name.toLowerCase().includes(cleanName.toLowerCase())
        );
        if (match) {
          targetCoords = { lat: match.latitude, lng: match.longitude };
        }
      }

      setToCoords(targetCoords);
      setFromQuery('Vị trí hiện tại của tôi');
      const origin = { lat: userLocation.lat, lng: userLocation.lng };
      setFromCoords(origin);
      setTripPlannerMode('my_location');
      setSelectedRoute(null);
      setTab('find');
      setIsSearchingTrip(true);

      try {
        const params = new URLSearchParams();
        params.append('from_lat', String(origin.lat));
        params.append('from_lng', String(origin.lng));
        if (targetCoords) {
          params.append('to_lat', String(targetCoords.lat));
          params.append('to_lng', String(targetCoords.lng));
        }
        params.append('to_query', cleanName);

        const url = `/api/opencity/bus/find?${params.toString()}`;
        const data = await request<RouteRecommendation[]>(url, token);
        setRecommendations(data);
        setSelectedRecIndex(0);
      } catch (err) {
        console.error('Failed to quick search destination:', err);
      } finally {
        setIsSearchingTrip(false);
      }
    },
    [stops, userLocation, token]
  );

  const handleSyncOverpass = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const result = await request<BusSyncResult>('/api/opencity/bus/sync', token, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSyncStatusMsg(result.message);
      await fetchRoutes();
      await fetchStops();
      await fetchAudit();
    } catch (err: any) {
      setSyncStatusMsg(err.message || 'Lỗi khi đồng bộ OpenStreetMap.');
    } finally {
      setIsSyncing(false);
    }
  }, [token, fetchRoutes, fetchStops, fetchAudit]);

  // Import JSON / GeoJSON
  const handleImportSubmit = useCallback(async () => {
    if (!importJsonText.trim()) return;
    setIsSyncing(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const isGeoJson = parsed.type === 'FeatureCollection' || Boolean(parsed.features);
      const result = await request<BusSyncResult>('/api/opencity/bus/import', token, {
        method: 'POST',
        body: JSON.stringify({
          source_name: 'Custom OSM Upload',
          data_format: isGeoJson ? 'geojson' : 'custom_json',
          payload: parsed,
          replace_existing: importReplace,
        }),
      });
      alert(result.message);
      setIsImportModalOpen(false);
      setImportJsonText('');
      await fetchRoutes();
      await fetchStops();
      await fetchAudit();
    } catch (err: any) {
      alert(`Lỗi nạp dữ liệu: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [importJsonText, importReplace, token, fetchRoutes, fetchStops, fetchAudit]);

  const resetRouteForm = () => {
    setRouteFormData({
      id: '',
      route_number: '',
      name: '',
      operator: 'Transerco (XN Xe buýt Hà Nội)',
      route_type: 'standard',
      from_terminal: '',
      to_terminal: '',
      operating_hours: '05:00 - 21:00',
      frequency: '10 - 15 phút/chuyến',
      fare: '10.000 đ/lượt',
      color: '#2563eb',
    });
  };

  const resetStopForm = () => {
    setStopFormData({
      id: '',
      name: '',
      address: '',
      latitude: userLocation.lat || 21.0285,
      longitude: userLocation.lng || 105.8542,
      has_shelter: true,
      routes: '',
    });
  };

  const handleOpenEditRoute = (route: BusRouteDetail) => {
    setRouteFormData({
      id: route.id,
      route_number: route.route_number,
      name: route.name,
      operator: route.operator,
      route_type: route.route_type,
      from_terminal: route.from_terminal,
      to_terminal: route.to_terminal,
      operating_hours: route.operating_hours,
      frequency: route.frequency,
      fare: route.fare,
      color: route.color || '#2563eb',
    });
    setIsEditRouteModalOpen(true);
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmittingEntity(true);
    try {
      const created = await request<BusRouteDetail>('/api/opencity/bus/routes', token, {
        method: 'POST',
        body: JSON.stringify({
          route_number: routeFormData.route_number.trim(),
          name: routeFormData.name.trim(),
          operator: routeFormData.operator.trim(),
          route_type: routeFormData.route_type,
          from_terminal: routeFormData.from_terminal.trim(),
          to_terminal: routeFormData.to_terminal.trim(),
          operating_hours: routeFormData.operating_hours.trim(),
          frequency: routeFormData.frequency.trim(),
          fare: routeFormData.fare.trim(),
          color: routeFormData.color,
        }),
      });
      await fetchRoutes();
      await fetchAudit();
      setIsAddRouteModalOpen(false);
      setSelectedRoute(created);
      alert(`Đã thêm thành công Tuyến ${created.route_number}!`);
    } catch (err: any) {
      alert(`Lỗi khi tạo tuyến: ${err.message}`);
    } finally {
      setIsSubmittingEntity(false);
    }
  };

  const handleUpdateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !routeFormData.id) return;
    setIsSubmittingEntity(true);
    try {
      const updated = await request<BusRouteDetail>(`/api/opencity/bus/routes/${encodeURIComponent(routeFormData.id)}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          name: routeFormData.name.trim(),
          operator: routeFormData.operator.trim(),
          route_type: routeFormData.route_type,
          from_terminal: routeFormData.from_terminal.trim(),
          to_terminal: routeFormData.to_terminal.trim(),
          operating_hours: routeFormData.operating_hours.trim(),
          frequency: routeFormData.frequency.trim(),
          fare: routeFormData.fare.trim(),
          color: routeFormData.color,
        }),
      });
      await fetchRoutes();
      await fetchAudit();
      setSelectedRoute(updated);
      setIsEditRouteModalOpen(false);
      alert(`Đã cập nhật thành công Tuyến ${updated.route_number}!`);
    } catch (err: any) {
      alert(`Lỗi khi cập nhật tuyến: ${err.message}`);
    } finally {
      setIsSubmittingEntity(false);
    }
  };

  const handleDeleteRoute = async (routeId: string, routeNumber: string) => {
    if (!token) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa Tuyến ${routeNumber} khỏi hệ thống?`)) return;
    try {
      await request(`/api/opencity/bus/routes/${encodeURIComponent(routeId)}`, token, {
        method: 'DELETE',
      });
      setSelectedRoute(null);
      await fetchRoutes();
      await fetchAudit();
      alert(`Đã xóa Tuyến ${routeNumber} thành công.`);
    } catch (err: any) {
      alert(`Lỗi khi xóa tuyến: ${err.message}`);
    }
  };

  const handleCreateStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setIsSubmittingEntity(true);
    try {
      const routesList = stopFormData.routes
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);
      const created = await request<BusStopSummary>('/api/opencity/bus/stops', token, {
        method: 'POST',
        body: JSON.stringify({
          name: stopFormData.name.trim(),
          address: stopFormData.address.trim(),
          latitude: Number(stopFormData.latitude),
          longitude: Number(stopFormData.longitude),
          has_shelter: stopFormData.has_shelter,
          routes: routesList,
        }),
      });
      await fetchStops();
      await fetchAudit();
      setIsAddStopModalOpen(false);
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [created.longitude, created.latitude],
          zoom: 16,
          pitch: 50,
          duration: 800,
        });
      }
      alert(`Đã thêm thành công điểm dừng "${created.name}"!`);
    } catch (err: any) {
      alert(`Lỗi khi tạo điểm dừng: ${err.message}`);
    } finally {
      setIsSubmittingEntity(false);
    }
  };

  const handleUpdateStop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !stopFormData.id) return;
    setIsSubmittingEntity(true);
    try {
      const routesList = stopFormData.routes
        .split(',')
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);
      const updated = await request<BusStopSummary>(`/api/opencity/bus/stops/${encodeURIComponent(stopFormData.id)}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          name: stopFormData.name.trim(),
          address: stopFormData.address.trim(),
          latitude: Number(stopFormData.latitude),
          longitude: Number(stopFormData.longitude),
          has_shelter: stopFormData.has_shelter,
          routes: routesList,
        }),
      });
      await fetchStops();
      await fetchAudit();
      setIsEditStopModalOpen(false);
      alert(`Đã cập nhật trạm dừng "${updated.name}" thành công!`);
    } catch (err: any) {
      alert(`Lỗi khi cập nhật trạm: ${err.message}`);
    } finally {
      setIsSubmittingEntity(false);
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (!token) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa trạm dừng "${stopName}"?`)) return;
    try {
      await request(`/api/opencity/bus/stops/${encodeURIComponent(stopId)}`, token, {
        method: 'DELETE',
      });
      if (selectedStopId === stopId) setSelectedStopId(null);
      await fetchStops();
      await fetchAudit();
      alert(`Đã xóa trạm dừng "${stopName}" thành công.`);
    } catch (err: any) {
      alert(`Lỗi khi xóa trạm: ${err.message}`);
    }
  };

  useEffect(() => {
    fetchRoutes();
    fetchStops();
    fetchAudit();
  }, [fetchRoutes, fetchStops, fetchAudit]);

  useEffect(() => {
    const explicitRoute = searchParams.get('route');
    if (explicitRoute && routes.length > 0 && !selectedRoute) {
      const found = routes.find(
        (r) => r.route_number.toLowerCase() === explicitRoute.toLowerCase()
      );
      if (found) {
        selectRouteById(found.id);
      }
    }
  }, [routes, selectedRoute, searchParams, selectRouteById]);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation({ lat, lng, isDefault: false });
          void fetchNearbyStops(lat, lng);
        },
        () => {
          void fetchNearbyStops(21.0285, 105.8542);
        },
        { timeout: 5000 }
      );
    } else {
      void fetchNearbyStops(21.0285, 105.8542);
    }
  }, [fetchNearbyStops]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    try {
      maplibregl.setWorkerUrl(workerUrl);
    } catch {
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: POSITRON_STYLE,
      center: [105.820, 21.015], // Hanoi center
      zoom: 12.2,
      pitch: 42,
      bearing: -12,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      map.addSource('route-path-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      map.addLayer({
        id: 'route-path-casing',
        type: 'line',
        source: 'route-path-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 9,
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'route-path-line',
        type: 'line',
        source: 'route-path-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5.5,
          'line-opacity': 0.95,
        },
      });

      map.addSource('walking-path-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'walking-path-casing',
        type: 'line',
        source: 'walking-path-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 7,
          'line-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'walking-path-line',
        type: 'line',
        source: 'walking-path-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0284c7',
          'line-width': 3.5,
          'line-dasharray': [2, 2.5],
          'line-opacity': 0.95,
        },
      });

      map.addSource('stops-cluster-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: 'stops-clusters',
        type: 'circle',
        source: 'stops-cluster-source',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#0284c7', // < 15: ocean blue
            15,
            '#2563eb', // 15 - 39: strong blue
            40,
            '#1d4ed8', // 40 - 99: dark blue
            100,
            '#7c3aed', // >= 100: purple
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            15,
            22,
            40,
            26,
            100,
            30,
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      map.addLayer({
        id: 'stops-cluster-count',
        type: 'symbol',
        source: 'stops-cluster-source',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'stops-unclustered-circle',
        type: 'circle',
        source: 'stops-cluster-source',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#0284c7',
          'circle-radius': 7.5,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      map.addLayer({
        id: 'stops-unclustered-label',
        type: 'symbol',
        source: 'stops-cluster-source',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11.5,
          'text-offset': [0, 1.25],
          'text-anchor': 'top',
          'text-max-width': 9,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      map.on('click', 'stops-clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['stops-clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource('stops-cluster-source') as maplibregl.GeoJSONSource;
        if (!source || clusterId == null) return;
        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: (features[0].geometry as any).coordinates,
            zoom: zoom + 0.5,
            duration: 500,
          });
        } catch (err) {
          console.error('Failed to get cluster expansion zoom:', err);
        }
      });

      map.on('mouseenter', 'stops-clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'stops-clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('click', 'stops-unclustered-circle', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coordinates = (f.geometry as any).coordinates.slice();
        const props = f.properties as any;
        let routesList: string[] = [];
        try {
          routesList = typeof props.routes === 'string' ? JSON.parse(props.routes) : (props.routes || []);
        } catch {
          routesList = [];
        }
        const passingCount = routesList.length;

        const routesBadgesHtml = routesList.map((rNum: string) => {
          return `<button type="button" class="popup-route-pill" data-route="${rNum}" style="background:#2563eb;color:#fff;border:none;padding:4px 9px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;margin:3px 2px;display:inline-flex;align-items:center;gap:4px;">
            <span>Tuyến ${rNum}</span>
            <span style="font-size:10px;opacity:0.85;">➔</span>
          </button>`;
        }).join(' ');

        const distText = props.distance_km != null
          ? (props.distance_km < 1 ? `${Math.round(props.distance_km * 1000)} m` : `${props.distance_km} km`)
          : '';

        const popupHtml = `
          <div style="font-family: inherit; padding: 6px; min-width: 210px;">
            <div style="font-weight: 800; font-size: 13.5px; color: #0f172a;">${props.name}</div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">${props.address || 'Hà Nội'} ${distText ? `• <strong style="color:#0284c7;">${distText}</strong>` : ''}</div>
            <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
              <small style="color: #0369a1; font-weight: 700; font-size: 11px;">CHỌN TUYẾN ĐỂ XEM LỘ TRÌNH (${passingCount}):</small>
              <div style="margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
                ${routesBadgesHtml || '<span style="color:#94a3b8;font-size:11px;">Chưa gắn tuyến OSM</span>'}
              </div>
            </div>
          </div>
        `;

        if (setSelectedStopIdRef.current) {
          setSelectedStopIdRef.current(props.id);
        }

        const popup = new maplibregl.Popup({ offset: 12, closeButton: true })
          .setLngLat(coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        popup.on('open', () => {
          const popupEl = popup.getElement();
          popupEl.querySelectorAll('.popup-route-pill').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const rNum = (btn as HTMLElement).getAttribute('data-route');
              if (rNum && selectRouteByIdRef.current) {
                selectRouteByIdRef.current(rNum);
                popup.remove();
              }
            });
          });
        });
      });

      map.on('mouseenter', 'stops-unclustered-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'stops-unclustered-circle', () => {
        map.getCanvas().style.cursor = '';
      });

      mapRef.current = map;
      setIsMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = routeSearchQuery.trim();
    const normQ = normalizeVietnamese(q);

    return routes.filter((r) => {
      const matchQuery =
        !normQ ||
        normalizeVietnamese(r.route_number).includes(normQ) ||
        normalizeVietnamese(r.name).includes(normQ) ||
        normalizeVietnamese(r.from_terminal).includes(normQ) ||
        normalizeVietnamese(r.to_terminal).includes(normQ);

      const matchType =
        routeTypeFilter === 'all' || r.route_type === routeTypeFilter;

      return matchQuery && matchType;
    });
  }, [routes, routeSearchQuery, routeTypeFilter]);

  const routeSearchSuggestions = useMemo(() => {
    const q = routeSearchQuery.trim();
    if (!q) {
      const popularStations = [
        'Bến xe Giáp Bát',
        'Bến xe Mỹ Đình',
        'Bến xe Gia Lâm',
        'Bến xe Yên Nghĩa',
        'Điểm trung chuyển Long Biên',
        'Điểm trung chuyển Cầu Giấy',
      ];
      return {
        isDefault: true,
        matchedRoutes: routes.slice(0, 4),
        popularStations,
        matchedStops: [],
      };
    }

    const normQ = normalizeVietnamese(q);

    // 1. trùng tuyến
    const matchedRoutes = routes
      .filter((r) => {
        const numNorm = normalizeVietnamese(r.route_number);
        const nameNorm = normalizeVietnamese(r.name);
        const fromNorm = normalizeVietnamese(r.from_terminal);
        const toNorm = normalizeVietnamese(r.to_terminal);
        return (
          numNorm.includes(normQ) ||
          nameNorm.includes(normQ) ||
          fromNorm.includes(normQ) ||
          toNorm.includes(normQ)
        );
      })
      .slice(0, 6);

    // 2. điểm dừng
    const matchedStops = stops
      .filter((st) => {
        const nameNorm = normalizeVietnamese(st.name);
        const addrNorm = normalizeVietnamese(st.address || '');
        return nameNorm.includes(normQ) || addrNorm.includes(normQ);
      })
      .slice(0, 6);

    return {
      isDefault: false,
      matchedRoutes,
      popularStations: [],
      matchedStops,
    };
  }, [routes, stops, routeSearchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (routeSearchWrapperRef.current && !routeSearchWrapperRef.current.contains(e.target as Node)) {
        setShowRouteSuggestions(false);
      }
      if (fromWrapperRef.current && !fromWrapperRef.current.contains(e.target as Node)) {
        setShowFromSuggestions(false);
      }
      if (toWrapperRef.current && !toWrapperRef.current.contains(e.target as Node)) {
        setShowToSuggestions(false);
      }
      if (quickDestWrapperRef.current && !quickDestWrapperRef.current.contains(e.target as Node)) {
        setShowQuickDestSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const nearestStopToUser = useMemo(() => {
    if (nearbyStops.length > 0) return nearbyStops[0];
    if (stops.length > 0) {
      let best = stops[0];
      let bestD = calcDistKm(userLocation.lat, userLocation.lng, best.latitude, best.longitude);
      for (let i = 1; i < Math.min(300, stops.length); i++) {
        const d = calcDistKm(userLocation.lat, userLocation.lng, stops[i].latitude, stops[i].longitude);
        if (d < bestD) {
          bestD = d;
          best = stops[i];
        }
      }
      return best;
    }
    return null;
  }, [nearbyStops, stops, userLocation]);

  const quickDestSuggestions = useMemo(() => {
    const q = quickDestQuery.trim();
    if (!q) {
      const withDist = stops.slice(0, 50).map((s) => ({
        ...s,
        distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
      }));
      withDist.sort((a, b) => a.distKm - b.distKm);
      return withDist.slice(0, 8);
    }
    const normQ = normalizeVietnamese(q);
    const lowerQ = q.toLowerCase();

    const matched = stops.filter((s) => {
      const nameNorm = normalizeVietnamese(s.name);
      const addrNorm = normalizeVietnamese(s.address || '');
      return (
        nameNorm.includes(normQ) ||
        addrNorm.includes(normQ) ||
        s.name.toLowerCase().includes(lowerQ) ||
        (s.routes && s.routes.some((r) => r.toLowerCase().includes(lowerQ)))
      );
    });

    const withDist = matched.map((s) => ({
      ...s,
      distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
    }));
    withDist.sort((a, b) => a.distKm - b.distKm);
    return withDist.slice(0, 12);
  }, [stops, quickDestQuery, userLocation]);

  const fromSuggestions = useMemo(() => {
    const q = fromQuery.trim();
    if (!q || q.includes('vị trí hiện tại')) {
      const withDist = stops.slice(0, 30).map((s) => ({
        ...s,
        distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
      }));
      withDist.sort((a, b) => a.distKm - b.distKm);
      return withDist.slice(0, 10);
    }
    const normQ = normalizeVietnamese(q);
    const lowerQ = q.toLowerCase();
    const filtered = stops.filter(
      (s) =>
        normalizeVietnamese(s.name).includes(normQ) ||
        normalizeVietnamese(s.address || '').includes(normQ) ||
        s.name.toLowerCase().includes(lowerQ) ||
        (s.routes && s.routes.some((r) => r.toLowerCase().includes(lowerQ)))
    );
    const withDist = filtered.map((s) => ({
      ...s,
      distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
    }));
    withDist.sort((a, b) => a.distKm - b.distKm);
    return withDist.slice(0, 15);
  }, [stops, fromQuery, userLocation]);

  const toSuggestions = useMemo(() => {
    const q = toQuery.trim();
    if (!q) {
      const withDist = stops.slice(0, 30).map((s) => ({
        ...s,
        distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
      }));
      withDist.sort((a, b) => a.distKm - b.distKm);
      return withDist.slice(0, 10);
    }
    const normQ = normalizeVietnamese(q);
    const lowerQ = q.toLowerCase();
    const filtered = stops.filter(
      (s) =>
        normalizeVietnamese(s.name).includes(normQ) ||
        normalizeVietnamese(s.address || '').includes(normQ) ||
        s.name.toLowerCase().includes(lowerQ) ||
        (s.routes && s.routes.some((r) => r.toLowerCase().includes(lowerQ)))
    );
    const withDist = filtered.map((s) => ({
      ...s,
      distKm: calcDistKm(userLocation.lat, userLocation.lng, s.latitude, s.longitude),
    }));
    withDist.sort((a, b) => a.distKm - b.distKm);
    return withDist.slice(0, 15);
  }, [stops, toQuery, userLocation]);

  const currentStops: RouteStopRef[] = useMemo(() => {
    if (!selectedRoute) return [];
    return direction === 'forward' ? selectedRoute.forward_stops : selectedRoute.backward_stops;
  }, [selectedRoute, direction]);

  const currentPath: [number, number][] = useMemo(() => {
    if (!selectedRoute) return [];
    return direction === 'forward' ? selectedRoute.forward_path : selectedRoute.backward_path;
  }, [selectedRoute, direction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapReady) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const routeSrc = map.getSource('route-path-source') as maplibregl.GeoJSONSource | undefined;
    const walkSrc = map.getSource('walking-path-source') as maplibregl.GeoJSONSource | undefined;

    const setWalkingLines = (lines: [number, number][][]) => {
      if (walkSrc) {
        walkSrc.setData({
          type: 'FeatureCollection',
          features: lines.map((lineCoords) => ({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: lineCoords,
            },
          })),
        });
      }
    };

    const clearWalkingLine = () => {
      if (walkSrc) {
        walkSrc.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    const userEl = document.createElement('div');
    userEl.className = 'user-current-location-marker';
    userEl.innerHTML = `
      <div class="user-pulse-ring"></div>
      <div class="user-center-dot"></div>
    `;
    userEl.title = userLocation.isDefault ? 'Tâm tìm kiếm (Hà Nội)' : 'Vị trí hiện tại của bạn';

    const userPopup = new maplibregl.Popup({ offset: 15, closeButton: false }).setHTML(`
      <div style="font-family: inherit; padding: 4px; text-align: center;">
        <strong style="color: #0284c7; font-size: 13px;">${userLocation.isDefault ? 'Tâm tìm kiếm (Hà Nội)' : 'Vị trí của bạn'}</strong>
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
          ${userLocation.isDefault ? 'Mặc định trung tâm Hà Nội' : 'Tọa độ GPS độ chính xác cao'}
        </div>
      </div>
    `);

    const userMarker = new maplibregl.Marker({ element: userEl })
      .setLngLat([userLocation.lng, userLocation.lat])
      .setPopup(userPopup)
      .addTo(map);
    markersRef.current.push(userMarker);

    if (activeTab === 'find' && recommendations.length > 0 && !selectedRoute) {
      const clusterSrc = map.getSource('stops-cluster-source') as maplibregl.GeoJSONSource | undefined;
      if (clusterSrc) {
        clusterSrc.setData({ type: 'FeatureCollection', features: [] });
      }
      const activeRec = recommendations[selectedRecIndex ?? 0];
      const originCoord: [number, number] = fromCoords
        ? [fromCoords.lng, fromCoords.lat]
        : [userLocation.lng, userLocation.lat];
      const boardCoord: [number, number] = [activeRec.board_stop.longitude, activeRec.board_stop.latitude];
      const alightCoord: [number, number] = [activeRec.alight_stop.longitude, activeRec.alight_stop.latitude];

      const walkLines: [number, number][][] = [[originCoord, boardCoord]];
      if (toCoords) {
        const destCoord: [number, number] = [toCoords.lng, toCoords.lat];
        const distFromAlight = calcDistKm(alightCoord[1], alightCoord[0], destCoord[1], destCoord[0]);
        if (distFromAlight > 0.03) {
          walkLines.push([alightCoord, destCoord]);
        }
      }
      setWalkingLines(walkLines);

      let tripCoords: [number, number][] = [];
      if (activeRec.path_segment && activeRec.path_segment.length > 0) {
        tripCoords = slicePathBetweenStops(
          activeRec.path_segment,
          activeRec.board_stop.latitude,
          activeRec.board_stop.longitude,
          activeRec.alight_stop.latitude,
          activeRec.alight_stop.longitude
        );
      } else {
        tripCoords = [boardCoord, alightCoord];
      }

      const segments: [number, number][][] = [];
      let currentSeg: [number, number][] = [];
      for (let i = 0; i < tripCoords.length; i++) {
        const pt = tripCoords[i];
        if (currentSeg.length > 0) {
          const prev = currentSeg[currentSeg.length - 1];
          const distSq = Math.pow(pt[0] - prev[0], 2) + Math.pow(pt[1] - prev[1], 2);
          if (distSq > 0.00015) {
            if (currentSeg.length > 1) segments.push(currentSeg);
            currentSeg = [];
          }
        }
        currentSeg.push(pt);
      }
      if (currentSeg.length > 1) segments.push(currentSeg);

      if (routeSrc) {
        routeSrc.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { color: activeRec.color || '#2563eb' },
              geometry: {
                type: 'MultiLineString',
                coordinates: segments.length > 0 ? segments : [tripCoords],
              },
            },
          ],
        });
      }

      const intermediateStops = (activeRec.trip_stops || []).filter(
        (st) =>
          st.stop_id !== activeRec.board_stop.stop_id &&
          st.stop_id !== activeRec.alight_stop.stop_id &&
          (!activeRec.transfer_stop || st.stop_id !== activeRec.transfer_stop.stop_id)
      );

      intermediateStops.forEach((st) => {
        const nodeEl = document.createElement('div');
        nodeEl.className = 'trip-intermediate-node';
        nodeEl.style.borderColor = activeRec.color || '#2563eb';
        nodeEl.title = `Trạm #${st.stop_order}: ${st.name}`;

        const nodePopup = new maplibregl.Popup({ offset: 12 }).setHTML(`
          <div style="font-family: inherit; padding: 5px 8px; min-width: 175px;">
            <div style="font-weight: 700; font-size: 12.5px; color: #0f172a;">${st.name}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${st.address || 'Hà Nội'}</div>
            <div style="font-size: 10.5px; color: #0284c7; margin-top: 4px; font-weight: 600;">Điểm dừng đón/trả #${st.stop_order} • Tuyến ${activeRec.route_number}</div>
          </div>
        `);

        const nodeMarker = new maplibregl.Marker({ element: nodeEl })
          .setLngLat([st.longitude, st.latitude])
          .setPopup(nodePopup)
          .addTo(map);
        markersRef.current.push(nodeMarker);
      });

      const boardEl = document.createElement('div');
      boardEl.className = 'bus-stop-map-marker transit-board-marker';
      boardEl.style.backgroundColor = '#16a34a';
      boardEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>
          <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
          <circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
        </svg>
      `;
      const boardPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
        <div style="font-family: inherit; padding: 5px 8px;">
          <div style="font-weight: 800; font-size: 13px; color: #16a34a;">Đón xe: ${activeRec.board_stop.name}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">${activeRec.board_stop.address || 'Hà Nội'}</div>
          <div style="font-size: 11px; color: #0284c7; margin-top: 4px; font-weight: 600;">Lên Tuyến ${activeRec.route_number} (Trạm #${activeRec.board_stop.stop_order})</div>
        </div>
      `);
      const boardMarker = new maplibregl.Marker({ element: boardEl })
        .setLngLat(boardCoord)
        .setPopup(boardPopup)
        .addTo(map);
      markersRef.current.push(boardMarker);

      if (activeRec.transfer_stop) {
        const transEl = document.createElement('div');
        transEl.className = 'bus-stop-map-marker transit-transfer-marker';
        transEl.style.backgroundColor = '#ea580c';
        transEl.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>
          </svg>
        `;
        const transPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
          <div style="font-family: inherit; padding: 5px 8px;">
            <div style="font-weight: 800; font-size: 13px; color: #ea580c;">Chuyển tuyến: ${activeRec.transfer_stop.name}</div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">Đổi sang Tuyến ${activeRec.second_route_number}</div>
          </div>
        `);
        const transMarker = new maplibregl.Marker({ element: transEl })
          .setLngLat([activeRec.transfer_stop.longitude, activeRec.transfer_stop.latitude])
          .setPopup(transPopup)
          .addTo(map);
        markersRef.current.push(transMarker);
      }

      const alightEl = document.createElement('div');
      alightEl.className = 'bus-stop-map-marker transit-alight-marker';
      alightEl.style.backgroundColor = '#dc2626';
      alightEl.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
        </svg>
      `;
      const alightPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
        <div style="font-family: inherit; padding: 5px 8px;">
          <div style="font-weight: 800; font-size: 13px; color: #dc2626;">Xuống xe: ${activeRec.alight_stop.name}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">${activeRec.alight_stop.address || 'Hà Nội'}</div>
          <div style="font-size: 11px; color: #0284c7; margin-top: 4px; font-weight: 600;">Trạm kết thúc #${activeRec.alight_stop.stop_order}</div>
        </div>
      `);
      const alightMarker = new maplibregl.Marker({ element: alightEl })
        .setLngLat(alightCoord)
        .setPopup(alightPopup)
        .addTo(map);
      markersRef.current.push(alightMarker);

      if (toCoords) {
        const destCoord: [number, number] = [toCoords.lng, toCoords.lat];
        const distFromAlight = calcDistKm(alightCoord[1], alightCoord[0], destCoord[1], destCoord[0]);
        if (distFromAlight > 0.03) {
          const destEl = document.createElement('div');
          destEl.className = 'bus-stop-map-marker destination-target-marker';
          destEl.style.backgroundColor = '#e11d48';
          destEl.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
            </svg>
          `;
          const destPopup = new maplibregl.Popup({ offset: 20 }).setHTML(`
            <div style="font-family: inherit; padding: 5px 8px;">
              <div style="font-weight: 800; font-size: 13px; color: #e11d48;">Điểm muốn đến: ${toQuery}</div>
              <div style="font-size: 11.5px; color: #475569; margin-top: 2px;">Đi bộ ~${Math.round(distFromAlight * 1000)}m từ trạm ${activeRec.alight_stop.name}</div>
            </div>
          `);
          const destMarker = new maplibregl.Marker({ element: destEl })
            .setLngLat(destCoord)
            .setPopup(destPopup)
            .addTo(map);
          markersRef.current.push(destMarker);
        }
      }

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend(originCoord);
      bounds.extend(boardCoord);
      bounds.extend(alightCoord);
      if (toCoords) {
        bounds.extend([toCoords.lng, toCoords.lat]);
      }
      tripCoords.forEach((pt) => bounds.extend(pt));
      intermediateStops.forEach((st) => bounds.extend([st.longitude, st.latitude]));
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 15,
        duration: 900,
      });
      return;
    }

    if (!selectedRoute) {
      clearWalkingLine();
      if (routeSrc) {
        routeSrc.setData({ type: 'FeatureCollection', features: [] });
      }

      const clusterSrc = map.getSource('stops-cluster-source') as maplibregl.GeoJSONSource | undefined;
      const displayStops = stops.length > 0 ? stops : nearbyStops;

      if (clusterSrc) {
        const features = displayStops.map((stop) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [stop.longitude, stop.latitude] as [number, number],
          },
          properties: {
            id: stop.id,
            name: stop.name,
            address: stop.address || 'Hà Nội',
            routes: JSON.stringify(stop.routes || []),
            distance_km: stop.distance_km,
          },
        }));

        clusterSrc.setData({
          type: 'FeatureCollection',
          features,
        });
      }

      if (!hasInitializedHanoiOverviewRef.current && displayStops.length > 0) {
        hasInitializedHanoiOverviewRef.current = true;
        map.flyTo({
          center: [105.820, 21.015],
          zoom: 11.8,
          pitch: 35,
          bearing: -10,
          duration: 900,
        });
      } else if (activeTab === 'stops' && stopSearchQuery.trim() && displayStops.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        displayStops.slice(0, 50).forEach((st) => bounds.extend([st.longitude, st.latitude]));
        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 60, right: 60 },
          maxZoom: 15,
          duration: 900,
        });
      }
      return;
    }

    clearWalkingLine();
    const clusterSrc = map.getSource('stops-cluster-source') as maplibregl.GeoJSONSource | undefined;
    if (clusterSrc) {
      clusterSrc.setData({ type: 'FeatureCollection', features: [] });
    }
    const routeColor = selectedRoute.color || '#2563eb';

    const pathCoords = currentPath;
    if (routeSrc && pathCoords.length > 0) {
      const segments: [number, number][][] = [];
      let currentSeg: [number, number][] = [];

      for (let i = 0; i < pathCoords.length; i++) {
        const pt = pathCoords[i];
        if (currentSeg.length > 0) {
          const prev = currentSeg[currentSeg.length - 1];
          const distSq = Math.pow(pt[0] - prev[0], 2) + Math.pow(pt[1] - prev[1], 2);
          if (distSq > 0.00015) {
            if (currentSeg.length > 1) {
              segments.push(currentSeg);
            }
            currentSeg = [];
          }
        }
        currentSeg.push(pt);
      }
      if (currentSeg.length > 1) {
        segments.push(currentSeg);
      }

      routeSrc.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { color: routeColor },
            geometry: {
              type: 'MultiLineString',
              coordinates: segments.length > 0 ? segments : [pathCoords],
            },
          },
        ],
      });
    }

    const bounds = new maplibregl.LngLatBounds();
    bounds.extend([userLocation.lng, userLocation.lat]);

    currentStops.forEach((stop) => {
      bounds.extend([stop.longitude, stop.latitude]);

      const el = document.createElement('div');
      el.className = 'bus-stop-map-marker';
      el.style.backgroundColor = routeColor;
      el.style.color = '#fff';
      el.innerHTML = `<span>${stop.stop_order}</span>`;

      if (stop.stop_id === selectedStopId) {
        el.classList.add('selected');
      }

      el.addEventListener('click', () => {
        setSelectedStopId(stop.stop_id);
        map.flyTo({
          center: [stop.longitude, stop.latitude],
          zoom: 15.5,
          pitch: 55,
          duration: 900,
        });
      });

      const distFromUser = calcDistKm(userLocation.lat, userLocation.lng, stop.latitude, stop.longitude);
      const walkInfoHtml = distFromUser <= 2.0
        ? `<div style="margin-top: 5px; padding: 4px 6px; background: #e0f2fe; border-radius: 6px; color: #0369a1; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.5-2 8.5V16c0 1.1-.9 2-2 2s-2-.9-2-2Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.5 2 8.5V20c0 1.1.9 2 2 2s2-.9 2-2Z"/></svg>
            <span>Cách vị trí của bạn: ~${Math.max(1, Math.round(distFromUser / 0.075))} phút đi bộ (${formatDist(distFromUser)})</span>
           </div>`
        : '';

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`
        <div style="font-family: inherit; padding: 4px;">
          <div style="font-weight: 800; font-size: 13px; color: ${routeColor}">Trạm #${stop.stop_order}: ${stop.name}</div>
          <div style="font-size: 12px; color: #475569; margin-top: 3px;">${stop.address || 'Hà Nội'}</div>
          ${walkInfoHtml}
          <div style="font-size: 11px; color: #0284c7; margin-top: 5px; font-weight: 600;">Tuyến ${selectedRoute.route_number} • OpenStreetMap</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    if (pathCoords.length > 0 && !bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 14.5,
        duration: 1000,
      });
    }
  }, [
    selectedRoute,
    direction,
    currentStops,
    currentPath,
    isMapReady,
    selectedStopId,
    nearbyStops,
    userLocation,
    routes,
    stops,
    selectRouteById,
    activeTab,
    recommendations,
    selectedRecIndex,
    fromCoords,
    stopSearchQuery,
  ]);

  const focusStop = (stop: RouteStopRef) => {
    setSelectedStopId(stop.stop_id);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [stop.longitude, stop.latitude],
        zoom: 16,
        pitch: 60,
        duration: 800,
      });
    }
  };

  return (
    <div className="bus-search-page">
      <div className="bus-hero page-width">
        <div className="bus-hero-content">
          <div className="bus-hero-eyebrow">
            <span className="badge-pill-light">
              <BusFront size={14} /> OpenCity Public Transport
            </span>
            <span className="badge-pill-light osm-badge">
              <Compass size={14} /> Dữ liệu mở OpenStreetMap (ODbL)
            </span>
          </div>
          <h1>Tìm buýt & Tra cứu tuyến xe</h1>
          <p>
            Mạng lưới giao thông công cộng đô thị thông minh: Tra cứu lộ trình, trạm dừng, sơ đồ tuyến buýt tiêu chuẩn, buýt nhanh BRT và xe buýt điện trên bản đồ 3D tương tác.
          </p>
        </div>

        <div className="bus-hero-actions">
          <button
            type="button"
            className="btn btn-outline-white"
            onClick={() => setTab('audit')}
            title="Dữ liệu mạng lưới giao thông OpenStreetMap"
          >
            <Database size={16} /> Dữ liệu OpenStreetMap
          </button>
          {isOperator && (
            <button
              type="button"
              className="btn btn-primary-contrast"
              onClick={() => setIsImportModalOpen(true)}
            >
              <Upload size={16} /> Nạp / Đồng bộ OSM
            </button>
          )}
        </div>
      </div>

      {!user && (
        <div className="bus-container page-width" style={{ paddingBottom: 0 }}>
          <div style={{
            background: 'linear-gradient(90deg, #eff6ff 0%, #f0fdf4 100%)',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: '10px 18px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1e40af', fontSize: '0.9rem' }}>
              <Info size={18} />
              <span>
                Bạn đang truy cập ở chế độ <strong>Công dân công cộng</strong> (Tra cứu trực tiếp hơn 5.000 điểm dừng và 184 tuyến buýt).
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => void login()}
              style={{ fontSize: '0.82rem', padding: '6px 14px', background: '#fff' }}
            >
              Đăng nhập tài khoản điều hành (dxos-bus-search)
            </button>
          </div>
        </div>
      )}

      <div className="bus-container page-width">
        <div className="bus-nav-tabs">
          <button
            type="button"
            className={`bus-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
            onClick={() => setTab('routes')}
          >
            <Route size={16} /> Tra cứu tuyến xe
          </button>
          <button
            type="button"
            className={`bus-tab-btn ${activeTab === 'find' ? 'active' : ''}`}
            onClick={() => setTab('find')}
          >
            <Navigation size={16} /> Tìm đường xe buýt
          </button>
          <button
            type="button"
            className={`bus-tab-btn ${activeTab === 'stops' ? 'active' : ''}`}
            onClick={() => setTab('stops')}
          >
            <MapPin size={16} /> Điểm dừng ({stops.length})
          </button>
          <button
            type="button"
            className={`bus-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setTab('audit')}
          >
            <Info size={16} /> Dữ liệu OpenStreetMap
          </button>
        </div>

        <div className="bus-layout-grid">
          <div className="bus-left-panel">
            {activeTab === 'routes' && (
              <div className="bus-routes-view">
                <div className="bus-filter-box">
                  <div className="bus-search-input-wrapper" ref={routeSearchWrapperRef}>
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="bus-search-input"
                      placeholder="Tìm số tuyến (01, 32, BRT...) hoặc bến xe..."
                      value={routeSearchQuery}
                      onFocus={() => setShowRouteSuggestions(true)}
                      onChange={(e) => {
                        setRouteSearchQuery(e.target.value);
                        setShowRouteSuggestions(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setShowRouteSuggestions(false);
                        }
                      }}
                    />
                    {routeSearchQuery && (
                      <button
                        type="button"
                        className="clear-search-btn"
                        onClick={() => {
                          setRouteSearchQuery('');
                          setShowRouteSuggestions(false);
                        }}
                      >
                        ✕
                      </button>
                    )}

                    {showRouteSuggestions && (
                      <div className="suggestions-dropdown route-search-dropdown" style={{ top: '100%', marginTop: 6, zIndex: 120 }}>
                        {routeSearchSuggestions.isDefault ? (
                          <>
                            <div className="suggestion-group-title">
                              <MapPin size={12} /> Bến xe & Điểm trung chuyển phổ biến
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
                              {routeSearchSuggestions.popularStations.map((stName) => (
                                <button
                                  key={stName}
                                  type="button"
                                  className="dest-chip"
                                  style={{ margin: 0 }}
                                  onClick={() => {
                                    setRouteSearchQuery(stName);
                                    setShowRouteSuggestions(false);
                                  }}
                                >
                                  {stName}
                                </button>
                              ))}
                            </div>

                            <div className="suggestion-group-title">
                              <Route size={12} /> Một số tuyến xe buýt tiêu biểu
                            </div>
                            {routeSearchSuggestions.matchedRoutes.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                className="suggestion-item route-suggestion-item"
                                onClick={() => {
                                  selectRouteById(r.id);
                                  setRouteSearchQuery(r.route_number);
                                  setShowRouteSuggestions(false);
                                }}
                              >
                                <div
                                  className="mini-route-badge"
                                  style={{ backgroundColor: r.color, width: 28, height: 28, fontSize: 11, borderRadius: 6 }}
                                >
                                  {r.route_number}
                                </div>
                                <div className="suggestion-main" style={{ marginLeft: 6 }}>
                                  <span className="suggestion-title">{r.name}</span>
                                  <span className="suggestion-sub">{r.operating_hours} • {r.total_stops_forward} trạm</span>
                                </div>
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            {routeSearchSuggestions.matchedRoutes.length > 0 && (
                              <>
                                <div className="suggestion-group-title">
                                  <Route size={12} /> Tuyến xe buýt phù hợp ({routeSearchSuggestions.matchedRoutes.length})
                                </div>
                                {routeSearchSuggestions.matchedRoutes.map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    className="suggestion-item route-suggestion-item"
                                    onClick={() => {
                                      selectRouteById(r.id);
                                      setRouteSearchQuery(r.name);
                                      setShowRouteSuggestions(false);
                                    }}
                                  >
                                    <div
                                      className="mini-route-badge"
                                      style={{ backgroundColor: r.color, width: 28, height: 28, fontSize: 11, borderRadius: 6 }}
                                    >
                                      {r.route_number}
                                    </div>
                                    <div className="suggestion-main" style={{ marginLeft: 6 }}>
                                      <span className="suggestion-title">{r.name}</span>
                                      <span className="suggestion-sub">
                                        {r.operator} • {r.operating_hours} • {r.total_stops_forward} điểm dừng
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}

                            {routeSearchSuggestions.matchedStops.length > 0 && (
                              <>
                                <div className="suggestion-group-title">
                                  <MapPin size={12} /> Bến xe & Điểm dừng ({routeSearchSuggestions.matchedStops.length})
                                </div>
                                {routeSearchSuggestions.matchedStops.map((st) => (
                                  <div
                                    key={st.id}
                                    className="suggestion-item"
                                    style={{ flexDirection: 'column', alignItems: 'flex-start', cursor: 'default' }}
                                  >
                                    <div
                                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
                                      onClick={() => {
                                        setRouteSearchQuery(st.name);
                                        setSelectedStopId(st.id);
                                        setShowRouteSuggestions(false);
                                        if (mapRef.current) {
                                          mapRef.current.flyTo({
                                            center: [st.longitude, st.latitude],
                                            zoom: 16,
                                            pitch: 45,
                                            duration: 600,
                                          });
                                        }
                                        if (st.routes && st.routes.length > 0) {
                                          selectRouteById(st.routes[0]);
                                        }
                                      }}
                                    >
                                      <div className="suggestion-main">
                                        <span className="suggestion-title flex items-center gap-1.5">
                                          <BusFront size={13} className="text-slate-500 shrink-0" />
                                          {st.name}
                                        </span>
                                        <span className="suggestion-sub">{st.address || 'Hà Nội'}</span>
                                      </div>
                                      <span className="suggestion-dist">
                                        {formatDist(calcDistKm(userLocation.lat, userLocation.lng, st.latitude, st.longitude))}
                                      </span>
                                    </div>

                                    {st.routes && st.routes.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, paddingLeft: 18 }}>
                                        <span style={{ fontSize: '10.5px', color: '#64748b', alignSelf: 'center' }}>Xem tuyến:</span>
                                        {st.routes.slice(0, 8).map((rNum) => {
                                          const targetRoute = routes.find(
                                            (r) => r.route_number.trim().toLowerCase() === rNum.trim().toLowerCase()
                                          );
                                          return (
                                            <button
                                              key={rNum}
                                              type="button"
                                              className="passing-chip"
                                              style={{
                                                fontSize: '10.5px',
                                                padding: '2px 7px',
                                                backgroundColor: targetRoute?.color || '#2563eb',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                              }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setShowRouteSuggestions(false);
                                                setSelectedStopId(st.id);
                                                selectRouteById(rNum);
                                              }}
                                              title={`Xem lộ trình Tuyến ${rNum}`}
                                            >
                                              Tuyến {rNum}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </>
                            )}

                            {routeSearchSuggestions.matchedRoutes.length === 0 &&
                              routeSearchSuggestions.matchedStops.length === 0 && (
                                <div style={{ padding: '14px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
                                  Không tìm thấy tuyến hoặc điểm dừng phù hợp với "<strong>{routeSearchQuery}</strong>"
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bus-type-pills">
                    <button
                      type="button"
                      className={`type-pill ${routeTypeFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setRouteTypeFilter('all')}
                    >
                      Tất cả ({routes.length})
                    </button>
                    <button
                      type="button"
                      className={`type-pill ${routeTypeFilter === 'standard' ? 'active' : ''}`}
                      onClick={() => setRouteTypeFilter('standard')}
                    >
                      Buýt thường
                    </button>
                    <button
                      type="button"
                      className={`type-pill ${routeTypeFilter === 'brt' ? 'active' : ''}`}
                      onClick={() => setRouteTypeFilter('brt')}
                    >
                      Buýt nhanh BRT
                    </button>
                    <button
                      type="button"
                      className={`type-pill ${routeTypeFilter === 'electric' ? 'active' : ''}`}
                      onClick={() => setRouteTypeFilter('electric')}
                    >
                      Buýt điện
                    </button>
                    {isOperator && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          resetRouteForm();
                          setIsAddRouteModalOpen(true);
                        }}
                        style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, borderRadius: 20 }}
                      >
                        <Plus size={13} /> Thêm tuyến
                      </button>
                    )}
                  </div>
                </div>

                {selectedRoute ? (
                  <div className="selected-route-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-clear-selection"
                        onClick={() => setSelectedRoute(null)}
                        title="Đóng chi tiết tuyến, quay lại bản đồ mạng lưới"
                      >
                        <ArrowRight size={13} style={{ transform: 'rotate(180deg)' }} /> Quay lại mạng lưới xe buýt
                      </button>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {isOperator && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => handleOpenEditRoute(selectedRoute)}
                              title="Chỉnh sửa thông tin tuyến này"
                              style={{ fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              <Edit3 size={13} /> Sửa tuyến
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => handleDeleteRoute(selectedRoute.id, selectedRoute.route_number)}
                              title="Xóa tuyến này khỏi hệ thống"
                              style={{ fontSize: '11.5px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', borderColor: '#fca5a5' }}
                            >
                              <Trash2 size={13} /> Xóa
                            </button>
                          </>
                        )}
                        {recommendations.length > 0 && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 8 }}
                            onClick={() => {
                              setSelectedRoute(null);
                              setTab('find');
                            }}
                          >
                            ← Quay lại tìm chuyến
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="route-header-row">
                      <div
                        className="route-badge"
                        style={{ backgroundColor: selectedRoute.color }}
                      >
                        {selectedRoute.route_number}
                      </div>
                      <div className="route-title-block">
                        <h3>Tuyến {selectedRoute.route_number}: {selectedRoute.name}</h3>
                        <span className="route-operator">{selectedRoute.operator} • Toàn bộ lộ trình ({currentStops.length} điểm dừng)</span>
                      </div>
                    </div>

                    <div className="route-meta-grid">
                      <div className="meta-item">
                        <Clock3 size={15} />
                        <div>
                          <small>Giờ hoạt động</small>
                          <strong>{selectedRoute.operating_hours}</strong>
                        </div>
                      </div>
                      <div className="meta-item">
                        <RefreshCw size={15} />
                        <div>
                          <small>Tần suất</small>
                          <strong>{selectedRoute.frequency}</strong>
                        </div>
                      </div>
                      <div className="meta-item">
                        <Ticket size={15} />
                        <div>
                          <small>Giá vé</small>
                          <strong>{selectedRoute.fare}</strong>
                        </div>
                      </div>
                      <div className="meta-item">
                        <Layers size={15} />
                        <div>
                          <small>OSM Relation</small>
                          <a
                            href={`https://www.openstreetmap.org/relation/${selectedRoute.osm_relation_id?.replace('osm-rel-', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="osm-link"
                          >
                            {selectedRoute.osm_relation_id || 'OSM v2'} <ExternalLink size={12} />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="direction-switcher" style={{ background: '#f8fafc', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
                        <button
                          type="button"
                          className={`btn-direction-tab ${direction === 'forward' ? 'active' : ''}`}
                          onClick={() => setDirection('forward')}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: direction === 'forward' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: direction === 'forward' ? '#eff6ff' : '#ffffff',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: direction === 'forward' ? '#1d4ed8' : '#475569' }}>
                              Chiều đi
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: direction === 'forward' ? '#dbeafe' : '#f1f5f9', color: direction === 'forward' ? '#1e40af' : '#64748b' }}>
                              {selectedRoute.forward_stops?.length || 0} trạm
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedRoute.from_terminal} ➔ {selectedRoute.to_terminal}
                          </div>
                        </button>

                        <button
                          type="button"
                          className={`btn-direction-tab ${direction === 'backward' ? 'active' : ''}`}
                          onClick={() => setDirection('backward')}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: direction === 'backward' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: direction === 'backward' ? '#eff6ff' : '#ffffff',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: direction === 'backward' ? '#1d4ed8' : '#475569' }}>
                              Chiều về
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: direction === 'backward' ? '#dbeafe' : '#f1f5f9', color: direction === 'backward' ? '#1e40af' : '#64748b' }}>
                              {selectedRoute.backward_stops?.length || 0} trạm
                            </span>
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedRoute.to_terminal} ➔ {selectedRoute.from_terminal}
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="route-stops-timeline">
                      <h4>Danh sách điểm dừng ({direction === 'forward' ? 'Chiều đi' : 'Chiều về'} • {currentStops.length} trạm)</h4>
                      <div className="stops-scroll-list">
                        {currentStops.map((stop) => {
                          const isSelected = stop.stop_id === selectedStopId;
                          return (
                            <div
                              key={stop.stop_id}
                              className={`stop-timeline-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => focusStop(stop)}
                            >
                              <div
                                className="stop-step-circle"
                                style={{
                                  backgroundColor: isSelected ? selectedRoute.color : '#f1f5f9',
                                  color: isSelected ? '#fff' : '#334155',
                                  borderColor: selectedRoute.color,
                                }}
                              >
                                {stop.stop_order}
                              </div>
                              <div className="stop-info-text">
                                <strong>{stop.name}</strong>
                                <small>{stop.address || 'Hà Nội'}</small>
                              </div>
                              <ChevronRight size={14} className="stop-arrow" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="quick-dest-banner">
                      <div className="quick-dest-top-row">
                        <div className="quick-dest-badge">
                          <Navigation size={15} className="text-emerald-600" />
                          <span>Bạn muốn đi đâu từ đây?</span>
                        </div>
                        {nearestStopToUser && (
                          <span className="quick-dest-near-badge">
                            <Crosshair size={12} /> Bến gần bạn: <strong>{nearestStopToUser.name}</strong>
                          </span>
                        )}
                      </div>

                      <div className="quick-dest-input-container" ref={quickDestWrapperRef}>
                        <div className="quick-dest-input-inner">
                          <MapPin size={17} className="text-rose-500 shrink-0" />
                          <input
                            type="text"
                            className="quick-dest-input"
                            placeholder="Nhập nơi bạn muốn đến (Bách Khoa, Mỹ Đình, Hồ Gươm, Đại học Mỏ...)"
                            value={quickDestQuery}
                            onChange={(e) => {
                              setQuickDestQuery(e.target.value);
                              setShowQuickDestSuggestions(true);
                            }}
                            onFocus={() => setShowQuickDestSuggestions(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                void handleQuickDestinationSearch(quickDestQuery);
                                setShowQuickDestSuggestions(false);
                              }
                            }}
                          />
                          {quickDestQuery && (
                            <button
                              type="button"
                              className="quick-dest-clear"
                              onClick={() => setQuickDestQuery('')}
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-primary btn-quick-dest-submit"
                            onClick={() => {
                              void handleQuickDestinationSearch(quickDestQuery);
                              setShowQuickDestSuggestions(false);
                            }}
                            disabled={!quickDestQuery.trim() || isSearchingTrip}
                          >
                            <Search size={14} /> Tìm tuyến gần nhất
                          </button>
                        </div>

                        {showQuickDestSuggestions && (
                          <div className="suggestions-dropdown quick-dest-dropdown" style={{ top: '100%', marginTop: 6, zIndex: 100 }}>
                            <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              Điểm đến đề xuất quanh Hà Nội
                            </div>
                            {quickDestSuggestions.map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                className="suggestion-item"
                                onClick={() => {
                                  setQuickDestQuery(st.name);
                                  setShowQuickDestSuggestions(false);
                                  void handleQuickDestinationSearch(st.name, { lat: st.latitude, lng: st.longitude });
                                }}
                              >
                                <div className="suggestion-main">
                                  <span className="suggestion-title flex items-center gap-1.5">
                                    <BusFront size={13} className="text-slate-500 shrink-0" />
                                    {st.name}
                                  </span>
                                  <span className="suggestion-sub">{st.address || 'Hà Nội'}</span>
                                </div>
                                <span className="suggestion-dist">{formatDist(st.distKm)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="quick-dest-chips">
                        <span className="chips-label">Gợi ý nhanh:</span>
                        {POPULAR_DESTINATIONS.map((pop) => (
                          <button
                            key={pop.name}
                            type="button"
                            className="dest-chip"
                            onClick={() => {
                              setQuickDestQuery(pop.name);
                              void handleQuickDestinationSearch(pop.name, pop.coords);
                            }}
                          >
                            {pop.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="nearby-stops-section">
                      <div className="nearby-header-row">
                        <div>
                          <h4>
                            <MapPin size={16} className="color-primary" /> Điểm dừng quanh bạn ({nearbyStops.length})
                          </h4>
                          <span className="subtext">
                            {userLocation.isDefault ? 'Khu vực trung tâm Hà Nội' : 'Theo định vị GPS của bạn'} • Bán kính 1.5 km
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-locate-me"
                          onClick={handleLocateMe}
                          title="Định vị lại vị trí hiện tại của bạn"
                        >
                          <Crosshair size={13} /> Định vị lại
                        </button>
                      </div>

                      {nearbyLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)' }}>
                          <RefreshCw className="spin" size={18} style={{ display: 'inline-block', marginRight: 6 }} />
                          <span>Đang tìm điểm dừng gần bạn…</span>
                        </div>
                      ) : nearbyStops.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                          Không có điểm dừng buýt nào trong bán kính 1.5 km quanh tọa độ này. Bạn có thể chọn trực tiếp tuyến trong danh sách bên dưới.
                        </div>
                      ) : (
                        <div className="nearby-stops-scroll">
                          {nearbyStops.map((st) => {
                            const hasRoutes = st.routes && st.routes.length > 0;
                            const isSelected = st.id === selectedStopId;

                            return (
                              <div
                                key={st.id}
                                id={`nearby-stop-card-${st.id}`}
                                className={`nearby-stop-card ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                  setSelectedStopId(st.id);
                                  if (mapRef.current) {
                                    mapRef.current.flyTo({
                                      center: [st.longitude, st.latitude],
                                      zoom: 16,
                                      pitch: 50,
                                      duration: 600,
                                    });
                                  }
                                  if (hasRoutes) {
                                    selectRouteById(st.routes[0]);
                                  }
                                }}
                                title={hasRoutes ? `Nhấn để xem lộ trình Tuyến ${st.routes[0]}` : undefined}
                              >
                                <div className="stop-card-top">
                                  <span className="stop-card-name">{st.name}</span>
                                  {st.distance_km != null && (
                                    <span className="stop-card-dist">
                                      {st.distance_km < 1 ? `${Math.round(st.distance_km * 1000)} m` : `${st.distance_km} km`}
                                    </span>
                                  )}
                                </div>
                                <p className="stop-card-address">{st.address || 'Hà Nội'}</p>
                                {hasRoutes && (
                                  <div className="stop-card-routes">
                                    <span className="passing-chip-label">Xem tuyến qua trạm:</span>
                                    {st.routes.slice(0, 10).map((rNum) => {
                                      const target = routes.find(
                                        (r) => r.route_number.trim().toLowerCase() === rNum.trim().toLowerCase()
                                      );
                                      return (
                                        <button
                                          key={rNum}
                                          type="button"
                                          className="passing-chip"
                                          style={{ backgroundColor: target?.color || '#2563eb' }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedStopId(st.id);
                                            selectRouteById(rNum);
                                          }}
                                          title={`Xem toàn bộ lộ trình Tuyến ${rNum} trên bản đồ`}
                                        >
                                          Tuyến {rNum}
                                        </button>
                                      );
                                    })}
                                    {st.routes.length > 10 && (
                                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                        +{st.routes.length - 10}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="routes-catalog-section">
                  <h4>Danh sách các tuyến buýt Hà Nội ({filteredRoutes.length})</h4>
                  <div className="routes-mini-grid">
                    {filteredRoutes.map((r) => {
                      const isCurrent = selectedRoute?.id === r.id;
                      return (
                        <div
                          key={r.id}
                          className={`route-mini-card ${isCurrent ? 'active' : ''}`}
                          onClick={() => selectRouteById(r.id)}
                        >
                          <div
                            className="mini-route-badge"
                            style={{ backgroundColor: r.color }}
                          >
                            {r.route_number}
                          </div>
                          <div className="mini-route-content">
                            <strong>{r.name}</strong>
                            <span>{r.operating_hours} • {r.total_stops_forward} điểm dừng</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'find' && (
              <div className="bus-find-view">
                <div className="trip-planner-box">
                  <h3>Tìm lộ trình di chuyển bằng xe buýt</h3>
                  <p className="subtext">
                    Chọn chế độ tìm kiếm: đi từ vị trí của bạn (tự tìm bến gần nhất) hoặc tùy chọn điểm đi.
                  </p>

                  <div className="planner-mode-selector">
                    <button
                      type="button"
                      className={`planner-mode-btn ${tripPlannerMode === 'my_location' ? 'active' : ''}`}
                      onClick={() => {
                        setTripPlannerMode('my_location');
                        setFromQuery('Vị trí hiện tại của tôi');
                        setFromCoords({ lat: userLocation.lat, lng: userLocation.lng });
                      }}
                    >
                      <Crosshair size={14} /> Đi từ vị trí của tôi (Tự tìm bến gần nhất)
                    </button>
                    <button
                      type="button"
                      className={`planner-mode-btn ${tripPlannerMode === 'custom' ? 'active' : ''}`}
                      onClick={() => setTripPlannerMode('custom')}
                    >
                      <ArrowRightLeft size={14} /> Tùy chọn điểm đi khác
                    </button>
                  </div>

                  <div className="planner-input-group">
                    {tripPlannerMode === 'my_location' ? (
                      <div className="auto-origin-card">
                        <div className="auto-origin-dot">
                          <span className="pulse-ping" />
                          <span className="dot-core" />
                        </div>
                        <div className="auto-origin-text">
                          <small>Điểm xuất phát (Tự động):</small>
                          <strong>
                            Vị trí của bạn {nearestStopToUser ? `• Bến đón gần nhất: ${nearestStopToUser.name}` : ''}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="btn-re-locate"
                          onClick={handleLocateMe}
                          title="Định vị lại tọa độ GPS của bạn"
                        >
                          <Crosshair size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="input-field">
                          <label>
                            <MapPin size={14} className="color-green" /> Điểm đi (Xuất phát)
                          </label>
                          <div className="autocomplete-wrapper" ref={fromWrapperRef}>
                            <input
                              type="text"
                              placeholder="Nhập tên trạm hoặc chọn vị trí của bạn..."
                              value={fromQuery}
                              onFocus={() => setShowFromSuggestions(true)}
                              onChange={(e) => {
                                setFromQuery(e.target.value);
                                setFromCoords(null);
                                setShowFromSuggestions(true);
                              }}
                            />
                            {showFromSuggestions && (
                              <div className="suggestions-dropdown">
                                <button
                                  type="button"
                                  className="suggestion-my-location"
                                  onClick={() => {
                                    setFromQuery('Vị trí hiện tại của tôi');
                                    setFromCoords({ lat: userLocation.lat, lng: userLocation.lng });
                                    setShowFromSuggestions(false);
                                  }}
                                >
                                  <Crosshair size={14} /> Vị trí hiện tại của tôi (Tọa độ GPS)
                                </button>
                                {fromSuggestions.map((st) => (
                                  <button
                                    key={st.id}
                                    type="button"
                                    className="suggestion-item"
                                    onClick={() => {
                                      setFromQuery(st.name);
                                      setFromCoords({ lat: st.latitude, lng: st.longitude });
                                      setShowFromSuggestions(false);
                                    }}
                                  >
                                    <div className="suggestion-main">
                                      <span className="suggestion-title flex items-center gap-1.5">
                                        <BusFront size={13} className="text-slate-500 shrink-0" />
                                        {st.name}
                                      </span>
                                      <span className="suggestion-sub">{st.address || 'Hà Nội'}</span>
                                    </div>
                                    <span className="suggestion-dist">{formatDist(st.distKm)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="swap-button-row">
                          <button
                            type="button"
                            className="btn-swap-locations"
                            onClick={() => {
                              const tmpQ = fromQuery;
                              const tmpC = fromCoords;
                              setFromQuery(toQuery);
                              setFromCoords(toCoords);
                              setToQuery(tmpQ);
                              setToCoords(tmpC);
                            }}
                            title="Đảo vị trí điểm đi và điểm đến"
                          >
                            <ArrowDownUp size={14} /> Đảo vị trí
                          </button>
                        </div>
                      </>
                    )}

                    <div className="input-field">
                      <label>
                        <MapPin size={14} className="color-red" /> Điểm muốn đến
                      </label>
                      <div className="autocomplete-wrapper" ref={toWrapperRef}>
                        <input
                          type="text"
                          placeholder="Nhập tên trạm, trường học, bệnh viện, khu đô thị..."
                          value={toQuery}
                          onFocus={() => setShowToSuggestions(true)}
                          onChange={(e) => {
                            setToQuery(e.target.value);
                            setToCoords(null);
                            setShowToSuggestions(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setShowToSuggestions(false);
                              void handleFindTrip();
                            }
                          }}
                        />
                        {showToSuggestions && (
                          <div className="suggestions-dropdown">
                            <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              Điểm đến gợi ý
                            </div>
                            {toSuggestions.map((st) => (
                              <button
                                key={st.id}
                                type="button"
                                className="suggestion-item"
                                onClick={() => {
                                  setToQuery(st.name);
                                  setToCoords({ lat: st.latitude, lng: st.longitude });
                                  setShowToSuggestions(false);
                                }}
                              >
                                <div className="suggestion-main">
                                  <span className="suggestion-title flex items-center gap-1.5">
                                    <BusFront size={13} className="text-slate-500 shrink-0" />
                                    {st.name}
                                  </span>
                                  <span className="suggestion-sub">{st.address || 'Hà Nội'}</span>
                                </div>
                                <span className="suggestion-dist">{formatDist(st.distKm)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="quick-dest-chips" style={{ marginBottom: 12 }}>
                      <span className="chips-label">Gợi ý nhanh:</span>
                      {POPULAR_DESTINATIONS.map((pop) => (
                        <button
                          key={pop.name}
                          type="button"
                          className="dest-chip"
                          onClick={() => {
                            setToQuery(pop.name);
                            setToCoords(pop.coords);
                            void handleQuickDestinationSearch(pop.name, pop.coords);
                          }}
                        >
                          {pop.name}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary btn-search-trip"
                      onClick={handleFindTrip}
                      disabled={isSearchingTrip || !toQuery.trim()}
                    >
                      {isSearchingTrip ? (
                        <>
                          <RefreshCw size={16} className="spin" /> Đang tìm tuyến...
                        </>
                      ) : (
                        <>
                          <Search size={16} /> Tìm tuyến xe buýt nhanh nhất
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="trip-results-section">
                  <h4>Kết quả tìm kiếm ({recommendations.length} phương án)</h4>

                  {recommendations.length === 0 ? (
                    <div className="trip-empty-state">
                      <Compass size={36} />
                      <p>Nhập điểm đi và điểm đến rồi nhấn "Tìm chuyến buýt phù hợp".</p>
                      <div className="quick-suggestions">
                        <small>Gợi ý nhanh:</small>
                        <button
                          type="button"
                          onClick={() => {
                            setFromQuery('Bến xe Gia Lâm');
                            setFromCoords(null);
                            setToQuery('Bến xe Yên Nghĩa');
                            setToCoords(null);
                          }}
                        >
                          Gia Lâm ➔ Yên Nghĩa (Tuyến 01)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFromQuery('Giáp Bát');
                            setFromCoords(null);
                            setToQuery('Nhổn');
                            setToCoords(null);
                          }}
                        >
                          Giáp Bát ➔ Nhổn (Tuyến 32)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFromQuery('Kim Mã');
                            setFromCoords(null);
                            setToQuery('Yên Nghĩa');
                            setToCoords(null);
                          }}
                        >
                          Kim Mã ➔ Yên Nghĩa (BRT 01)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="recommendations-list">
                      {recommendations.map((rec, idx) => {
                        const isSelected = (selectedRecIndex ?? 0) === idx;
                        const walkDist = calcDistKm(
                          userLocation.lat,
                          userLocation.lng,
                          rec.board_stop.latitude,
                          rec.board_stop.longitude
                        );
                        const walkMins = Math.max(1, Math.round(walkDist / 0.075));

                        return (
                          <div
                            key={idx}
                            className={`recommendation-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedRecIndex(idx)}
                          >
                            <div className="rec-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                  className="rec-badge"
                                  style={{ backgroundColor: rec.color }}
                                >
                                  Tuyến {rec.route_number}
                                </div>
                                {isSelected && (
                                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', padding: '3px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={13} /> Đang chọn trên bản đồ
                                  </span>
                                )}
                              </div>
                              <div className="rec-timing">
                                <strong>~{rec.estimated_minutes} phút</strong>
                                <span>({rec.stops_count} trạm dừng)</span>
                              </div>
                            </div>

                            <div className="rec-route-name">{rec.route_name}</div>
                            <div style={{ fontSize: '12px', color: '#0369a1', fontWeight: 700, marginBottom: 8, background: '#f8fafc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <MapPin size={13} className="text-sky-600 shrink-0" />
                              <span>Lộ trình chuyến: <strong style={{ color: '#0f172a' }}>{rec.board_stop.name} ➔ {rec.alight_stop.name}</strong></span>
                            </div>

                            {walkDist <= 3.5 && (
                              <div className="walking-info-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Footprints size={13} className="text-amber-600 shrink-0" />
                                <span>Đi bộ ~{walkMins} phút ({formatDist(walkDist)}) đến trạm đón (Đường nét đứt trên bản đồ)</span>
                              </div>
                            )}

                            {(() => {
                              const transitDistKm = calcDistKm(
                                rec.board_stop.latitude,
                                rec.board_stop.longitude,
                                rec.alight_stop.latitude,
                                rec.alight_stop.longitude
                              );
                              const co2SavedGrams = Math.max(80, Math.round(transitDistKm * 115));
                              const isElectric = rec.route_number.toUpperCase().startsWith('E');
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                  <div className="eco-saving-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '11.5px', fontWeight: 600 }}>
                                    <span>🌱 Tiết kiệm ~{co2SavedGrams}g CO₂ so với xe máy</span>
                                    {isElectric && (
                                      <span style={{ background: '#22c55e', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: '10px', fontWeight: 800 }}>⚡ Buýt điện Net Zero</span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 8px', fontSize: '11px', fontWeight: 600, color: '#334155', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const text = `🚌 Lộ trình xe buýt Hà Nội: Đi từ "${rec.board_stop.name}" đến "${rec.alight_stop.name}" bằng Tuyến ${rec.route_number}. Ước tính ${rec.estimated_minutes} phút (${rec.stops_count} trạm). Xuống tại ${rec.alight_stop.name}.`;
                                      navigator.clipboard?.writeText(text);
                                      alert('Đã sao chép hướng dẫn lộ trình vào bộ nhớ tạm!');
                                    }}
                                  >
                                    📋 Sao chép hành trình
                                  </button>
                                </div>
                              );
                            })()}

                            <div className="rec-steps" style={{ marginTop: 10 }}>
                              <div className="step-point board-point">
                                <div className="bullet-point" />
                                <div>
                                  <small>Đón xe tại trạm:</small>
                                  <strong>{rec.board_stop.name}</strong>
                                  <span>{rec.board_stop.address || 'Hà Nội'}</span>
                                </div>
                              </div>

                              {rec.transfer_stop && (
                                <div className="step-point transfer-point">
                                  <div className="bullet-point transfer" />
                                  <div>
                                    <small>Chuyển tuyến tại trạm:</small>
                                    <strong>{rec.transfer_stop.name}</strong>
                                    <span>Đổi sang Tuyến {rec.second_route_number}</span>
                                  </div>
                                </div>
                              )}

                              <div className="step-point alight-point">
                                <div className="bullet-point alight" />
                                <div>
                                  <small>Xuống xe tại trạm:</small>
                                  <strong>{rec.alight_stop.name}</strong>
                                  <span>{rec.alight_stop.address || 'Hà Nội'}</span>
                                </div>
                              </div>
                            </div>

                            {rec.trip_stops && rec.trip_stops.length > 0 && (
                              <div className="rec-trip-stops-accordion">
                                <button
                                  type="button"
                                  className="btn-toggle-trip-stops"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedTripIndex(expandedTripIndex === idx ? null : idx);
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <BusFront size={13} className="text-sky-600" />
                                    <span>Danh sách {rec.trip_stops.length} điểm đón/trả khách trên hành trình</span>
                                  </div>
                                  {expandedTripIndex === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>

                                {expandedTripIndex === idx && (
                                  <div className="trip-stops-timeline">
                                    {rec.trip_stops.map((stop, sIdx) => {
                                      const isFirst = sIdx === 0;
                                      const isLast = sIdx === rec.trip_stops!.length - 1;
                                      const isTransfer = rec.transfer_stop && stop.stop_id === rec.transfer_stop.stop_id;

                                      return (
                                        <div
                                          key={stop.stop_id || sIdx}
                                          className={`trip-timeline-item ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''} ${isTransfer ? 'is-transfer' : ''}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (mapRef.current) {
                                              mapRef.current.flyTo({
                                                center: [stop.longitude, stop.latitude],
                                                zoom: 16,
                                                duration: 600,
                                              });
                                            }
                                          }}
                                          title="Nhấn để phóng to trạm này trên bản đồ"
                                        >
                                          <div className="timeline-node-marker">
                                            <span className="node-order-num">{sIdx + 1}</span>
                                          </div>
                                          <div className="timeline-node-content">
                                            <div className="timeline-node-name">
                                              {stop.name}
                                              {isFirst && <span className="timeline-badge board">Đón xe</span>}
                                              {isTransfer && <span className="timeline-badge transfer">Đổi xe</span>}
                                              {isLast && <span className="timeline-badge alight">Xuống xe</span>}
                                            </div>
                                            {stop.address && <div className="timeline-node-sub">{stop.address}</div>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="rec-footer">
                              <button
                                type="button"
                                className="btn-rec-action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = routes.find((r) => r.route_number === rec.route_number);
                                  if (target) {
                                    selectRouteById(target.id);
                                    setTab('routes');
                                  }
                                }}
                              >
                                Xem chi tiết Tuyến {rec.route_number} (Toàn bộ lộ trình) <ArrowRight size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'stops' && (
              <div className="bus-stops-view">
                <div className="bus-filter-box" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="bus-search-input-wrapper" style={{ flex: 1 }}>
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="bus-search-input"
                      placeholder="Tìm điểm dừng theo tên đường hoặc khu vực..."
                      value={stopSearchQuery}
                      onChange={(e) => {
                        setStopSearchQuery(e.target.value);
                        fetchStops(e.target.value);
                      }}
                    />
                  </div>
                  {isOperator && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        resetStopForm();
                        setIsAddStopModalOpen(true);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '10px 14px', borderRadius: 10 }}
                    >
                      <Plus size={15} /> Thêm trạm
                    </button>
                  )}
                </div>

                <div className="stops-grid-list">
                  {paginatedStops.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 16px', color: '#64748b', fontSize: '13px' }}>
                      Không tìm thấy điểm dừng nào phù hợp với từ khóa "{stopSearchQuery}".
                    </div>
                  ) : (
                    paginatedStops.map((stop) => (
                      <div
                        key={stop.id}
                        className={`bus-stop-card ${stop.id === selectedStopId ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedStopId(stop.id);
                          if (mapRef.current) {
                            mapRef.current.flyTo({
                              center: [stop.longitude, stop.latitude],
                              zoom: 16,
                              pitch: 50,
                              duration: 800,
                            });
                          }
                        }}
                      >
                        <div className="stop-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <MapPin size={18} className="stop-pin-icon" />
                            <div>
                              <h4>{stop.name}</h4>
                              <p>{stop.address || 'Hà Nội'}</p>
                            </div>
                          </div>
                          {isOperator && (
                            <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn-icon-subtle"
                                title="Chỉnh sửa điểm dừng"
                                onClick={() => {
                                  setStopFormData({
                                    id: stop.id,
                                    name: stop.name,
                                    address: stop.address || '',
                                    latitude: stop.latitude,
                                    longitude: stop.longitude,
                                    has_shelter: stop.has_shelter,
                                    routes: stop.routes ? stop.routes.join(', ') : '',
                                  });
                                  setIsEditStopModalOpen(true);
                                }}
                                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7' }}
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon-subtle"
                                title="Xóa điểm dừng"
                                onClick={() => handleDeleteStop(stop.id, stop.name)}
                                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="stop-card-tags">
                          <span className="shelter-tag">
                            {stop.has_shelter ? ' Có nhà chờ' : ' Biển dừng'}
                          </span>
                          {stop.osm_node_id && (
                            <span className="osm-tag">OSM: {stop.osm_node_id}</span>
                          )}
                        </div>

                        <div className="stop-passing-routes">
                          <small>Các tuyến đi qua:</small>
                          <div className="routes-pills-row">
                            {stop.routes.map((rt) => (
                              <span
                                key={rt}
                                className="route-pill-badge"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rObj = routes.find((r) => r.route_number === rt);
                                  if (rObj) {
                                    selectRouteById(rObj.id);
                                    setTab('routes');
                                  }
                                }}
                              >
                                Tuyến {rt}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {totalStopPages > 1 && (
                  <div className="bus-pagination-wrapper">
                    <div className="pagination-summary">
                      Trang <strong>{currentStopPage}</strong> / <strong>{totalStopPages}</strong> (Hiển thị {(currentStopPage - 1) * STOPS_PER_PAGE + 1} - {Math.min(currentStopPage * STOPS_PER_PAGE, stops.length)} trong tổng số {stops.length.toLocaleString('vi-VN')} điểm dừng)
                    </div>

                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => handleStopPageChange(1)}
                        disabled={currentStopPage <= 1}
                        title="Về trang đầu tiên (Trang 1)"
                      >
                        «
                      </button>

                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => handleStopPageChange(currentStopPage - 1)}
                        disabled={currentStopPage <= 1}
                        title="Trang trước"
                      >
                        ‹
                      </button>

                      {(() => {
                        const pages: (number | string)[] = [];
                        const delta = 2;
                        const left = currentStopPage - delta;
                        const right = currentStopPage + delta;

                        for (let i = 1; i <= totalStopPages; i++) {
                          if (i === 1 || i === totalStopPages || (i >= left && i <= right)) {
                            pages.push(i);
                          } else if (pages[pages.length - 1] !== '...') {
                            pages.push('...');
                          }
                        }

                        return pages.map((p, idx) =>
                          p === '...' ? (
                            <span key={`dots-${idx}`} className="pagination-ellipsis">
                              …
                            </span>
                          ) : (
                            <button
                              key={`page-${p}`}
                              type="button"
                              className={`pagination-btn ${p === currentStopPage ? 'active' : ''}`}
                              onClick={() => handleStopPageChange(Number(p))}
                            >
                              {p}
                            </button>
                          )
                        );
                      })()}

                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => handleStopPageChange(currentStopPage + 1)}
                        disabled={currentStopPage >= totalStopPages}
                        title="Trang tiếp theo"
                      >
                        ›
                      </button>

                      <button
                        type="button"
                        className="pagination-btn"
                        onClick={() => handleStopPageChange(totalStopPages)}
                        disabled={currentStopPage >= totalStopPages}
                        title="Đến trang cuối cùng"
                      >
                        »
                      </button>
                    </div>

                    <form
                      className="pagination-jump-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const pNum = parseInt(jumpPageInput, 10);
                        if (!isNaN(pNum) && pNum >= 1 && pNum <= totalStopPages) {
                          handleStopPageChange(pNum);
                          setJumpPageInput('');
                        }
                      }}
                    >
                      <span>Đến trang:</span>
                      <input
                        type="number"
                        min={1}
                        max={totalStopPages}
                        className="pagination-jump-input"
                        placeholder={String(currentStopPage)}
                        value={jumpPageInput}
                        onChange={(e) => setJumpPageInput(e.target.value)}
                      />
                      <button type="submit" className="pagination-btn" style={{ height: 28, fontSize: 12 }}>
                        Đi
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="bus-audit-view">
                <div className="audit-highlight-banner">
                  <div className="banner-badge">
                    <Compass size={16} /> OpenStreetMap Public Transport Schema v2
                  </div>
                  <h3>Dữ liệu mạng lưới vận tải hành khách công cộng OpenStreetMap</h3>
                  <p>
                    Dữ liệu tuyến và điểm đón trả xe buýt tại Hà Nội được kết nối và chuẩn hóa từ cộng đồng bản đồ mở OpenStreetMap (ODbL 1.0). Hệ thống liên tục cập nhật và kiểm soát chất lượng dữ liệu để phục vụ nhu cầu đi lại của người dân.
                  </p>
                </div>

                {audit && (
                  <div className="audit-metrics-grid">
                    <div className="audit-metric-card">
                      <span>Tỷ lệ chuẩn hóa lộ trình</span>
                      <strong>{audit.completeness_percentage}%</strong>
                      <small>Tuyến có đủ dữ liệu lộ trình 2 chiều</small>
                    </div>
                    <div className="audit-metric-card">
                      <span>Tổng số tuyến khai thác</span>
                      <strong>{audit.total_routes}</strong>
                      <small>Standard: {audit.standard_routes_count} • BRT: {audit.brt_routes_count} • Electric: {audit.electric_routes_count}</small>
                    </div>
                    <div className="audit-metric-card">
                      <span>Điểm dừng được số hóa</span>
                      <strong>{audit.total_stops.toLocaleString('vi-VN')}</strong>
                      <small>Có tọa độ địa lý chính xác</small>
                    </div>
                  </div>
                )}

                {isOperator ? (
                  <div className="sync-action-box" style={{ background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                    <div className="sync-box-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <ShieldCheck size={18} color="#0284c7" />
                          <h4 style={{ margin: 0, color: '#0f172a' }}>Bảng điều khiển Quản trị Mạng lưới Xe buýt</h4>
                          <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                            dxos-bus-search
                          </span>
                        </div>
                        <p style={{ margin: 0 }}>
                          Thêm mới thủ công tuyến buýt và điểm đón/trả, hoặc đồng bộ trực tuyến với OpenStreetMap.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            resetRouteForm();
                            setIsAddRouteModalOpen(true);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Plus size={15} /> Thêm tuyến buýt
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => {
                            resetStopForm();
                            setIsAddStopModalOpen(true);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#059669', borderColor: '#059669' }}
                        >
                          <MapPin size={15} /> Thêm điểm dừng
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={handleSyncOverpass}
                          disabled={isSyncing}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          {isSyncing ? (
                            <>
                              <RefreshCw size={15} className="spin" /> Đang đồng bộ...
                            </>
                          ) : (
                            <>
                              <RefreshCw size={15} /> Đồng bộ OSM
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setIsImportModalOpen(true)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Upload size={15} /> Nạp GeoJSON
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            if (!audit) return;
                            const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `opencity-bus-audit-${new Date().toISOString().slice(0, 10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Database size={15} /> Xuất báo cáo (JSON)
                        </button>
                      </div>
                    </div>

                    {syncStatusMsg && (
                      <div className="sync-status-alert">
                        <Info size={16} />
                        <span>{syncStatusMsg}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: '#e0f2fe', color: '#0284c7', padding: 10, borderRadius: 10 }}>
                        <ShieldCheck size={22} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                          Khu vực Quản trị & Điều hành Mạng lưới
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>
                          Để thêm mới tuyến buýt, chỉnh sửa điểm dừng hoặc đồng bộ dữ liệu, vui lòng đăng nhập tài khoản điều hành.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void login()}
                      style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Lock size={14} /> Đăng nhập tài khoản điều hành
                    </button>
                  </div>
                )}

                <div className="audit-issues-section">
                  <h4>Kiểm soát chất lượng dữ liệu ({audit?.issues?.length ?? 0})</h4>
                  <div className="issues-list">
                    {audit?.issues && audit.issues.length > 0 ? (
                      audit.issues.map((issue, idx) => (
                        <div key={idx} className={`issue-item ${issue.level}`}>
                          <AlertTriangle size={16} className="issue-icon" />
                          <div>
                            <strong>{issue.title}</strong>
                            <p>{issue.description}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="issue-item success" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', padding: '14px 18px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircle2 size={18} color="#16a34a" />
                        <div>
                          <strong>Dữ liệu đạt chuẩn vận hành</strong>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#15803d' }}>
                            Toàn bộ dữ liệu tuyến và điểm dừng xe buýt đã được kiểm tra tính hợp lệ và không ghi nhận lỗi kỹ thuật.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bus-right-map-panel">
            <div className="map-view-header">
              <div className="map-title-badge">
                <Compass size={14} /> Bản đồ không gian 3D • MapLibre GL
              </div>
              {selectedRoute ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="dot"
                    style={{ backgroundColor: selectedRoute.color }}
                  />
                  <span>Tuyến {selectedRoute.route_number}: {direction === 'forward' ? 'Chiều đi' : 'Chiều về'} ({currentStops.length} trạm)</span>
                  <button
                    type="button"
                    className="btn-clear-selection"
                    style={{ marginLeft: 6, padding: '3px 10px', fontSize: '11px', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => {
                      setSelectedRoute(null);
                      if (recommendations.length > 0) {
                        setTab('find');
                      }
                    }}
                    title="Đóng xem toàn tuyến, quay lại tìm chuyến"
                  >
                    <X size={12} /> {recommendations.length > 0 ? 'Quay lại tìm chuyến' : 'Đóng tuyến'}
                  </button>
                </div>
              ) : activeTab === 'find' && recommendations.length > 0 ? (
                <div className="map-route-indicator" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    className="dot"
                    style={{ backgroundColor: recommendations[selectedRecIndex ?? 0]?.color || '#2563eb' }}
                  />
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>
                    Chỉ dẫn: Tuyến {recommendations[selectedRecIndex ?? 0]?.route_number} ({recommendations[selectedRecIndex ?? 0]?.board_stop.name} ➔ {recommendations[selectedRecIndex ?? 0]?.alight_stop.name})
                  </span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#0284c7', fontWeight: 600 }}>
                  <MapPin size={14} />
                  <span>
                    {activeTab === 'stops'
                      ? `Tất cả trạm dừng Hà Nội (${stops.length.toLocaleString('vi-VN')})`
                      : `Mạng lưới xe buýt toàn Hà Nội (${(stops.length || 5052).toLocaleString('vi-VN')} điểm dừng)`}
                  </span>
                </div>
              )}
            </div>

            <div className="map-canvas-container" ref={mapContainerRef}>
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
                  onClick={() => {
                    if (mapRef.current) {
                      mapRef.current.easeTo({ pitch: 65, bearing: -20, duration: 800 });
                    }
                  }}
                  title="Nghiêng góc nhìn 3D"
                >
                  Góc nhìn 3D
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={() => {
                    if (mapRef.current) {
                      mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 800 });
                    }
                  }}
                  title="Góc nhìn phẳng 2D"
                >
                  Góc nhìn 2D
                </button>
                <button
                  type="button"
                  className="map-float-btn"
                  onClick={() => {
                    if (mapRef.current) {
                      mapRef.current.flyTo({ center: [105.820, 21.015], zoom: 12, pitch: 42, duration: 800 });
                    }
                  }}
                  title="Căn giữa Hà Nội"
                >
                  Trung tâm Hà Nội
                </button>
              </div>
            </div>

            <div className="map-footer-attribution">
              <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL)</span>
              <span>• MapLibre GL 3D • OpenFreeMap Tiles</span>
            </div>
          </div>
        </div>
      </div>

      {(isAddRouteModalOpen || isEditRouteModalOpen) && (
        <div className="modal-backdrop" onClick={() => { setIsAddRouteModalOpen(false); setIsEditRouteModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Route size={18} /> {isAddRouteModalOpen ? 'Thêm tuyến xe buýt mới (Thủ công)' : `Chỉnh sửa Tuyến ${routeFormData.route_number}`}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => { setIsAddRouteModalOpen(false); setIsEditRouteModalOpen(false); }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={isAddRouteModalOpen ? handleCreateRoute : handleUpdateRoute}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Số hiệu tuyến (*):</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: 160, E10"
                      required
                      value={routeFormData.route_number}
                      disabled={isEditRouteModalOpen}
                      onChange={(e) => setRouteFormData({ ...routeFormData, route_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phân loại tuyến:</label>
                    <select
                      className="form-input"
                      value={routeFormData.route_type}
                      onChange={(e) => setRouteFormData({ ...routeFormData, route_type: e.target.value as any })}
                    >
                      <option value="standard">Buýt tiêu chuẩn (standard)</option>
                      <option value="brt">Buýt nhanh BRT</option>
                      <option value="electric">Buýt điện (VinBus)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Tên lộ trình đầy đủ (*):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: Bến xe Mỹ Đình ⇄ KĐT Smart City"
                    required
                    value={routeFormData.name}
                    onChange={(e) => setRouteFormData({ ...routeFormData, name: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Điểm đầu (Bến đầu):</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: Bến xe Mỹ Đình"
                      required
                      value={routeFormData.from_terminal}
                      onChange={(e) => setRouteFormData({ ...routeFormData, from_terminal: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Điểm cuối (Bến cuối):</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="VD: KĐT Smart City"
                      required
                      value={routeFormData.to_terminal}
                      onChange={(e) => setRouteFormData({ ...routeFormData, to_terminal: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Đơn vị vận hành:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: Tổng công ty Vận tải Hà Nội - Transerco"
                    value={routeFormData.operator}
                    onChange={(e) => setRouteFormData({ ...routeFormData, operator: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Giờ hoạt động:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="05:00 - 21:00"
                      value={routeFormData.operating_hours}
                      onChange={(e) => setRouteFormData({ ...routeFormData, operating_hours: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Tần suất chuyến:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="10 - 15 phút/chuyến"
                      value={routeFormData.frequency}
                      onChange={(e) => setRouteFormData({ ...routeFormData, frequency: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Giá vé niêm yết:</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="10.000 đ/lượt"
                      value={routeFormData.fare}
                      onChange={(e) => setRouteFormData({ ...routeFormData, fare: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Màu sắc nhận diện:</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="color"
                        value={routeFormData.color}
                        onChange={(e) => setRouteFormData({ ...routeFormData, color: e.target.value })}
                        style={{ width: 42, height: 38, padding: 2, borderRadius: 6, border: '1px solid #cbd5e1', cursor: 'pointer' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={routeFormData.color}
                        onChange={(e) => setRouteFormData({ ...routeFormData, color: e.target.value })}
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setIsAddRouteModalOpen(false); setIsEditRouteModalOpen(false); }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingEntity || !routeFormData.route_number.trim() || !routeFormData.name.trim()}
                >
                  {isSubmittingEntity ? 'Đang lưu...' : isAddRouteModalOpen ? 'Thêm tuyến mới' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(isAddStopModalOpen || isEditStopModalOpen) && (
        <div className="modal-backdrop" onClick={() => { setIsAddStopModalOpen(false); setIsEditStopModalOpen(false); }}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <MapPin size={18} /> {isAddStopModalOpen ? 'Thêm điểm đón/trả mới (Thủ công)' : `Chỉnh sửa điểm dừng: ${stopFormData.name}`}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => { setIsAddStopModalOpen(false); setIsEditStopModalOpen(false); }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={isAddStopModalOpen ? handleCreateStop : handleUpdateStop}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label>Tên điểm dừng (*):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: 45 Kim Mã (Trước ngõ 45)"
                    required
                    value={stopFormData.name}
                    onChange={(e) => setStopFormData({ ...stopFormData, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Địa chỉ / Khu vực:</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: Ba Đình, Hà Nội"
                    value={stopFormData.address}
                    onChange={(e) => setStopFormData({ ...stopFormData, address: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Vĩ độ (Latitude) (*):</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="21.0285"
                      required
                      value={stopFormData.latitude}
                      onChange={(e) => setStopFormData({ ...stopFormData, latitude: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Kinh độ (Longitude) (*):</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      placeholder="105.8542"
                      required
                      value={stopFormData.longitude}
                      onChange={(e) => setStopFormData({ ...stopFormData, longitude: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setStopFormData({
                        ...stopFormData,
                        latitude: userLocation.lat,
                        longitude: userLocation.lng,
                      });
                    }}
                    style={{ fontSize: '11.5px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <Crosshair size={13} /> Lấy tọa độ GPS hiện tại
                  </button>
                </div>

                <div className="form-group">
                  <label>Các tuyến buýt đi qua (phân cách bằng dấu phẩy):</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VD: 01, 32, E01, BRT 01"
                    value={stopFormData.routes}
                    onChange={(e) => setStopFormData({ ...stopFormData, routes: e.target.value })}
                  />
                  <small style={{ color: '#64748b', fontSize: '11.5px', marginTop: 4, display: 'block' }}>
                    Nhập số hiệu các tuyến sẽ đón/trả khách tại điểm dừng này.
                  </small>
                </div>

                <div className="form-group-checkbox">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={stopFormData.has_shelter}
                      onChange={(e) => setStopFormData({ ...stopFormData, has_shelter: e.target.checked })}
                    />
                    <span>Có nhà chờ / mái che kiên cố (Shelter)</span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setIsAddStopModalOpen(false); setIsEditStopModalOpen(false); }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingEntity || !stopFormData.name.trim()}
                >
                  {isSubmittingEntity ? 'Đang lưu...' : isAddStopModalOpen ? 'Thêm điểm dừng' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
          <div className="modal-card bus-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Upload size={18} /> Nạp dữ liệu OpenStreetMap (GeoJSON / JSON)
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setIsImportModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-desc">
                Dán nội dung GeoJSON (FeatureCollection) xuất từ <a href="https://overpass-turbo.eu" target="_blank" rel="noopener noreferrer">Overpass Turbo</a> hoặc tệp JSON tùy chỉnh của bạn. Không cần fix cứng trong mã nguồn!
              </p>

              <div className="form-group">
                <label>Nội dung JSON hoặc GeoJSON:</label>
                <textarea
                  className="form-textarea json-input"
                  rows={10}
                  placeholder='{"type": "FeatureCollection", "features": [...]}'
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                />
              </div>

              <div className="form-group-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={importReplace}
                    onChange={(e) => setImportReplace(e.target.checked)}
                  />
                  <span>Thay thế toàn bộ dữ liệu tuyến xe buýt hiện tại (Replace existing)</span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsImportModalOpen(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportSubmit}
                disabled={isSyncing || !importJsonText.trim()}
              >
                {isSyncing ? 'Đang nạp dữ liệu...' : 'Xác nhận nạp dữ liệu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

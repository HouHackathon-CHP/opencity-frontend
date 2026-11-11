// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Compass,
  Droplets,
  Eye,
  EyeOff,
  HeartPulse,
  LockKeyhole,
  MapPin,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Thermometer,
  Trash2,
  TriangleAlert,
  UserCheck,
  Wind,
  Wrench,
  X,
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { canManage } from '../lib/permissions';
import {
  request,
  type AirQualitySummary,
  type StationItem,
  type StationDetail,
} from '../lib/api';

const POSITRON_3D_STYLE = 'https://tiles.openfreemap.org/styles/positron';

function generateCirclePolygon(lng: number, lat: number, radiusKm = 1.8): [number, number][] {
  const points: [number, number][] = [];
  const numPoints = 32;
  const latRadius = radiusKm / 111;
  const lngRadius = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const x = Number((lng + lngRadius * Math.cos(angle)).toFixed(5));
    const y = Number((lat + latRadius * Math.sin(angle)).toFixed(5));
    points.push([x, y]);
  }
  return points;
}

function setup3DBuildings(map: MapLibreMap, isDark: boolean = false) {
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

  const colorExpr = isDark
    ? [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'render_height'], 14],
      0, '#1e293b',
      20, '#334155',
      60, '#475569',
      120, '#64748b',
      250, '#94a3b8',
    ]
    : [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'render_height'], 14],
      0, '#f8fafc',
      20, '#e2e8f0',
      50, '#cbd5e1',
      100, '#94a3b8',
      250, '#64748b',
    ];

  try {
    map.addLayer(
      {
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 12,
        paint: {
          'fill-extrusion-color': colorExpr as any,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 0,
            13.5, ['coalesce', ['get', 'render_height'], 14],
          ] as any,
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 0,
            13.5, ['coalesce', ['get', 'render_min_height'], 0],
          ] as any,
          'fill-extrusion-opacity': isDark ? 0.92 : 0.88,
        },
      },
      firstLabelId
    );

    map.setLight({
      anchor: 'viewport',
      color: isDark ? '#bfdbfe' : '#ffffff',
      intensity: isDark ? 0.35 : 0.48,
      position: [1.5, 115, 55],
    });
  } catch (err) {
    console.warn('Failed to add 3D building layer:', err);
  }
}

const formatTime = (value?: string | null) => {
  if (!value) return '---';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

function getVisualHealthGuidance(aqi: number) {
  if (aqi <= 50) {
    return {
      outdoor: { label: 'Thích hợp', tone: '#10b981', bg: '#ecfdf5', desc: 'Rất tốt cho thể dục ngoài trời' },
      mask: { label: 'Không cần', tone: '#10b981', bg: '#ecfdf5', desc: 'Không khí trong lành' },
      ventilation: { label: 'Mở cửa thoáng', tone: '#10b981', bg: '#ecfdf5', desc: 'Tận dụng đối lưu gió tự nhiên' },
      sensitive: { label: 'An toàn', tone: '#10b981', bg: '#ecfdf5', desc: 'Không có rủi ro sức khỏe' },
    };
  } else if (aqi <= 100) {
    return {
      outdoor: { label: 'Bình thường', tone: '#eab308', bg: '#fefce8', desc: 'Hoạt động thể lực bình thường' },
      mask: { label: 'Tùy chọn', tone: '#eab308', bg: '#fefce8', desc: 'Đeo khi đi lại tuyến đường đông' },
      ventilation: { label: 'Mở bình thường', tone: '#eab308', bg: '#fefce8', desc: 'Thông thoáng vào sáng sớm' },
      sensitive: { label: 'Lưu ý nhẹ', tone: '#eab308', bg: '#fefce8', desc: 'Theo dõi triệu chứng dị ứng' },
    };
  } else if (aqi <= 150) {
    return {
      outdoor: { label: 'Giảm bớt', tone: '#f97316', bg: '#fff7ed', desc: 'Giảm bài tập nặng ngoài trời' },
      mask: { label: 'Khuyên đeo', tone: '#f97316', bg: '#fff7ed', desc: 'Nên dùng khẩu trang lọc bụi' },
      ventilation: { label: 'Hạn chế', tone: '#f97316', bg: '#fff7ed', desc: 'Đóng cửa giờ cao điểm' },
      sensitive: { label: 'Chú ý', tone: '#f97316', bg: '#fff7ed', desc: 'Trẻ nhỏ & người già nên ở trong nhà' },
    };
  } else if (aqi <= 200) {
    return {
      outdoor: { label: 'Tránh xa', tone: '#ef4444', bg: '#fef2f2', desc: 'Chuyển sang tập luyện trong nhà' },
      mask: { label: 'Bắt buộc N95', tone: '#ef4444', bg: '#fef2f2', desc: 'Khẩu trang chuyên dụng lọc PM2.5' },
      ventilation: { label: 'Đóng kín', tone: '#ef4444', bg: '#fef2f2', desc: 'Bật máy lọc không khí' },
      sensitive: { label: 'Ở trong nhà', tone: '#ef4444', bg: '#fef2f2', desc: 'Nguy cơ khó thở, viêm đường hô hấp' },
    };
  } else {
    return {
      outdoor: { label: 'Tuyệt đối cấm', tone: '#8b5cf6', bg: '#f5f3ff', desc: 'Nguy cơ ngộ độc khói bụi cực cao' },
      mask: { label: 'N95 / FFP2', tone: '#8b5cf6', bg: '#f5f3ff', desc: 'Đeo khẩu trang kháng khuẩn cao cấp' },
      ventilation: { label: 'Đóng kín 100%', tone: '#8b5cf6', bg: '#f5f3ff', desc: 'Bật lọc khí công suất tối đa' },
      sensitive: { label: 'Cấp cứu y tế', tone: '#8b5cf6', bg: '#f5f3ff', desc: 'Cách ly môi trường ngoài tuyệt đối' },
    };
  }
}

export function AirQualityPage() {
  const { user, loading: authLoading, login } = useAuth();
  const token = user?.access_token || '';
  const operator = canManage(user, 'air_quality');

  const [summary, setSummary] = useState<AirQualitySummary | null>(null);
  const [stations, setStations] = useState<StationItem[]>([]);
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Modern
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [is3D, setIs3D] = useState(true);
  const [showQcvnDetails, setShowQcvnDetails] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newAreaType, setNewAreaType] = useState('Đô thị');
  const [newLat, setNewLat] = useState('21.0285');
  const [newLng, setNewLng] = useState('105.8542');

  const [alertTitle, setAlertTitle] = useState('');
  const [alertSummary, setAlertSummary] = useState('');
  const [activeAlerts, setActiveAlerts] = useState<
    Array<{ id: string; category: string; title: string; summary: string; published_at: string }>
  >([]);

  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const [sumData, stData, bulletinsData] = await Promise.all([
        request<AirQualitySummary>('/api/opencity/air-quality/summary', token),
        request<StationItem[]>('/api/opencity/air-quality/stations', token),
        request<Array<{ id: string; category: string; title: string; summary: string; published_at: string }>>(
          '/api/opencity/bulletins',
          token
        ).catch(() => []),
      ]);
      setSummary(sumData);
      setStations(stData);
      setActiveAlerts(bulletinsData.filter((b) => b.category === 'alert').slice(0, 3));
      if (stData.length > 0 && !selectedStationCode) {
        setSelectedStationCode(stData[0].code);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu quan trắc không khí.');
    } finally {
      setLoading(false);
    }
  }, [token, selectedStationCode]);

  const loadDetail = useCallback(
    async (code: string) => {
      if (!token || !code) return;
      setLoadingDetail(true);
      try {
        const detail = await request<StationDetail>(
          `/api/opencity/air-quality/stations/${encodeURIComponent(code)}`,
          token
        );
        setStationDetail(detail);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải chi tiết trạm quan trắc.');
      } finally {
        setLoadingDetail(false);
      }
    },
    [token]
  );

  type ConfirmModalConfig = {
    title: string;
    question: string;
    stationName?: string;
    stationCode?: string;
    details?: string;
    warningNote?: string;
    confirmLabel: string;
    confirmTone?: 'primary' | 'warning' | 'danger';
    icon: 'wrench' | 'eye' | 'eye-off' | 'megaphone' | 'plus' | 'alert' | 'trash';
    onConfirm: () => Promise<void>;
  };
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        if (confirmModal) {
          setConfirmModal(null);
        } else if (showAlertModal) {
          setShowAlertModal(false);
        } else if (showAddModal) {
          setShowAddModal(false);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, showAlertModal, showAddModal, busy]);

  useEffect(() => {
    const hasOpenModal = Boolean(showAddModal || showAlertModal || confirmModal);
    if (!hasOpenModal) return;

    const originalOverflow = document.body.style.overflow;
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = originalOverflow;
    };
  }, [showAddModal, showAlertModal, confirmModal]);

  async function executeToggleMaintenance(code: string, currentStatus?: string) {
    if (!token || !operator) return;
    const nextStatus = currentStatus === 'maintenance' ? 'active' : 'maintenance';
    setBusy(true);
    setError('');
    setActionNotice('');
    try {
      await request(`/api/opencity/air-quality/stations/${encodeURIComponent(code)}/status`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setActionNotice(
        nextStatus === 'maintenance'
          ? `Đã chuyển trạm ${code} sang chế độ bảo trì thiết bị.`
          : `Đã kích hoạt lại trạm ${code} vào mạng lưới hoạt động bình thường.`
      );
      await Promise.all([refresh(), loadDetail(code)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thay đổi được trạng thái trạm.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  function promptToggleMaintenance(station: StationDetail) {
    const isToMaintenance = station.status !== 'maintenance';
    setConfirmModal({
      title: isToMaintenance ? 'Chuyển sang chế độ bảo trì' : 'Kích hoạt lại trạm quan trắc',
      question: isToMaintenance
        ? 'Bạn có chắc chắn muốn chuyển trạm này sang chế độ bảo trì thiết bị không?'
        : 'Bạn có chắc chắn muốn kích hoạt lại trạm này vào mạng lưới hoạt động bình thường không?',
      stationName: station.name,
      stationCode: station.code,
      details: isToMaintenance
        ? 'Khi ở trạng thái bảo trì, dữ liệu từ cảm biến của trạm sẽ tạm ngừng tính vào chỉ số AQI chung của toàn đô thị.'
        : 'Trạm sẽ được đưa trở lại hoạt động bình thường và cập nhật chỉ số môi trường công khai cho toàn thể người dân.',
      warningNote: isToMaintenance
        ? 'Lưu ý: Chỉ thực hiện khi trạm đang được kỹ thuật viên vệ sinh cảm biến hoặc thay thế linh kiện.'
        : undefined,
      confirmLabel: isToMaintenance ? 'Chắc chắn, chuyển bảo trì' : 'Chắc chắn, kích hoạt',
      confirmTone: isToMaintenance ? 'warning' : 'primary',
      icon: 'wrench',
      onConfirm: () => executeToggleMaintenance(station.code, station.status),
    });
  }

  async function executeDeleteStation(code: string, name: string) {
    if (!token || !operator) return;
    setBusy(true);
    setError('');
    setActionNotice('');
    try {
      await request(`/api/opencity/air-quality/stations/${encodeURIComponent(code)}`, token, {
        method: 'DELETE',
      });
      setActionNotice(`Đã xóa thành công trạm quan trắc ${name} (${code}).`);
      setStationDetail(null);
      setSelectedStationCode(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không xóa được trạm quan trắc.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  function promptDeleteStation(station: StationDetail) {
    setConfirmModal({
      title: 'Xác nhận xóa trạm quan trắc',
      question: `Bạn có chắc chắn muốn xóa trạm quan trắc "${station.name}" (${station.code}) không?`,
      stationName: station.name,
      stationCode: station.code,
      details: 'Hành động này sẽ xóa vĩnh viễn trạm quan trắc này cùng toàn bộ lịch sử đo đạc liên quan khỏi cơ sở dữ liệu.',
      warningNote: 'Cảnh báo: Thao tác này không thể hoàn tác!',
      confirmLabel: 'Chắc chắn, xóa trạm',
      confirmTone: 'danger',
      icon: 'trash',
      onConfirm: () => executeDeleteStation(station.code, station.name),
    });
  }

  async function executeCreateStation() {
    if (!token || !operator) return;
    setBusy(true);
    setError('');
    setActionNotice('');
    try {
      const codeUpper = newCode.trim().toUpperCase();
      await request('/api/opencity/air-quality/stations', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeUpper,
          name: newName.trim(),
          address: newAddress.trim() || 'Hà Nội',
          area_type: newAreaType,
          latitude: Number(newLat),
          longitude: Number(newLng),
        }),
      });
      setActionNotice(`Đã khởi tạo thành công trạm quan trắc ${newName.trim()} (${codeUpper}).`);
      setShowAddModal(false);
      setNewCode('');
      setNewName('');
      setNewAddress('');
      setSelectedStationCode(codeUpper);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tạo được trạm quan trắc mới.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  function promptCreateStation(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operator || busy) return;
    if (!newCode.trim() || !newName.trim()) {
      setError('Vui lòng nhập đầy đủ mã trạm và tên trạm quan trắc.');
      return;
    }
    const codeUpper = newCode.trim().toUpperCase();
    setConfirmModal({
      title: 'Thêm trạm quan trắc mới',
      question: `Bạn có chắc chắn muốn khởi tạo và đưa trạm "${newName.trim()}" vào mạng lưới không?`,
      stationName: newName.trim(),
      stationCode: codeUpper,
      details: `Khu vực: ${newAreaType} · Địa chỉ: ${newAddress.trim() || 'Hà Nội'} (Tọa độ: ${newLat}, ${newLng})`,
      warningNote: 'Trạm đo mới sẽ được kích hoạt và xuất hiện trên bản đồ quan trắc đô thị.',
      confirmLabel: 'Chắc chắn, khởi tạo trạm',
      confirmTone: 'primary',
      icon: 'plus',
      onConfirm: () => executeCreateStation(),
    });
  }

  function openBroadcastModal(station: StationDetail) {
    const aqi = station.latest_reading?.aqi ?? 100;
    setAlertTitle(`Cảnh báo ô nhiễm không khí tại khu vực ${station.name}`);
    setAlertSummary(
      `Chỉ số VN-AQI tại trạm ${station.name} đạt mức ${aqi} (${station.classification.label}). Khuyến cáo người dân khu vực ${station.area_type} hạn chế hoạt động thể lực ngoài trời.`
    );
    setShowAlertModal(true);
  }

  async function executeBroadcastAlert() {
    if (!token || !operator || !stationDetail) return;
    setBusy(true);
    setError('');
    setActionNotice('');
    try {
      await request('/api/opencity/air-quality/broadcast-alert', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_code: stationDetail.code,
          title: alertTitle.trim(),
          summary: alertSummary.trim(),
        }),
      });
      setActionNotice('Đã phát lệnh cảnh báo ô nhiễm khẩn cấp lên phân hệ Tin tức & Cảnh báo đô thị.');
      setShowAlertModal(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không phát được cảnh báo ô nhiễm.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  function promptBroadcastAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operator || !stationDetail || busy) return;
    if (!alertTitle.trim() || !alertSummary.trim()) {
      setError('Vui lòng nhập đầy đủ tiêu đề và nội dung cảnh báo.');
      return;
    }
    setConfirmModal({
      title: 'Phát cảnh báo ô nhiễm đô thị khẩn cấp',
      question: 'Bạn có chắc chắn muốn phát lệnh cảnh báo ô nhiễm này tới toàn bộ cư dân không?',
      stationName: stationDetail.name,
      stationCode: stationDetail.code,
      details: `Tiêu đề phát thanh: "${alertTitle.trim()}"`,
      warningNote: 'Lưu ý: Lệnh cảnh báo khẩn cấp sẽ ngay lập tức được gửi tới Bảng tin đô thị OpenCity và thông báo tới toàn thể người dân.',
      confirmLabel: 'Chắc chắn, phát cảnh báo ngay',
      confirmTone: 'danger',
      icon: 'megaphone',
      onConfirm: () => executeBroadcastAlert(),
    });
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  const handleSelectStation = useCallback(
    (code: string) => {
      setSelectedStationCode(code);
      const target = stations.find((s) => s.code === code);
      if (target && mapRef.current) {
        mapRef.current.flyTo({
          center: [target.longitude, target.latitude],
          zoom: 13.8,
          pitch: is3D ? 52 : 0,
          bearing: is3D ? -12 : 0,
          duration: 800,
        });
      }
    },
    [stations, is3D]
  );

  const handleSelectStationRef = useRef(handleSelectStation);
  handleSelectStationRef.current = handleSelectStation;

  function toggle3D() {
    if (!mapRef.current) return;
    const next = !is3D;
    setIs3D(next);
    mapRef.current.easeTo({
      pitch: next ? 52 : 0,
      bearing: next ? -12 : 0,
      duration: 600,
    });
  }

  function recenterMap() {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [105.815, 21.025],
      zoom: 12.2,
      pitch: is3D ? 52 : 0,
      bearing: is3D ? -12 : 0,
      duration: 800,
    });
  }

  const filteredStations = useMemo(() => {
    if (areaFilter === 'all') return stations;
    return stations.filter((s) => s.area_type === areaFilter);
  }, [stations, areaFilter]);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    try {
      maplibregl.setWorkerUrl(workerUrl);

      const map = new maplibregl.Map({
        container: mapElement.current,
        style: POSITRON_3D_STYLE,
        center: [105.815, 21.025],
        zoom: 12.2,
        pitch: 52,
        bearing: -12,
        maxPitch: 85,
        maxZoom: 19,
      });

      map.on('load', () => {
        setup3DBuildings(map, false);

        map.addSource('aqi-zones', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        const beforeLayerId = map.getLayer('3d-buildings') ? '3d-buildings' : undefined;

        map.addLayer(
          {
            id: 'aqi-zones-fill',
            type: 'fill',
            source: 'aqi-zones',
            paint: {
              'fill-color': ['get', 'color'],
              'fill-opacity': ['case', ['get', 'isSelected'], 0.28, 0.12],
            },
          },
          beforeLayerId
        );

        map.addLayer(
          {
            id: 'aqi-zones-line',
            type: 'line',
            source: 'aqi-zones',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': ['case', ['get', 'isSelected'], 3, 1.8],
              'line-dasharray': [3, 2],
              'line-opacity': 0.85,
            },
          },
          beforeLayerId
        );

        map.on('click', 'aqi-zones-fill', (e) => {
          const feature = e.features?.[0];
          const code = feature?.properties?.code;
          if (typeof code === 'string') {
            handleSelectStationRef.current(code);
          }
        });

        map.on('mouseenter', 'aqi-zones-fill', () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'aqi-zones-fill', () => {
          map.getCanvas().style.cursor = '';
        });
      });

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showZoom: true,
          showCompass: true,
        }),
        'top-right'
      );

      mapRef.current = map;
    } catch {
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const zoneFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = filteredStations
      .filter((st) => typeof st.latitude === 'number' && typeof st.longitude === 'number')
      .map((st) => {
        const isSelected = selectedStationCode === st.code;
        const isMaint = st.status === 'maintenance';
        const isHidden = st.status === 'hidden';
        const color = isMaint ? '#64748b' : isHidden ? '#94a3b8' : (st.classification?.color || '#10b981');
        const aqi = st.latest_reading?.aqi ?? '--';
        const polygonRing = generateCirclePolygon(st.longitude, st.latitude, 1.8);

        return {
          type: 'Feature',
          properties: {
            code: st.code,
            name: st.name,
            area_type: st.area_type,
            aqi,
            color,
            status: st.status,
            isSelected,
            label: st.classification?.label || '',
          },
          geometry: {
            type: 'Polygon',
            coordinates: [polygonRing],
          },
        };
      });

    const updateSource = () => {
      const source = map.getSource('aqi-zones') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: zoneFeatures,
        });
      }
    };

    if (map.isStyleLoaded()) {
      updateSource();
    } else {
      map.once('load', updateSource);
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    filteredStations.forEach((st) => {
      if (typeof st.latitude !== 'number' || typeof st.longitude !== 'number') return;
      const reading = st.latest_reading;
      const aqi = reading?.aqi ?? '--';
      const isMaint = st.status === 'maintenance';
      const isHidden = st.status === 'hidden';
      const color = isMaint ? '#64748b' : isHidden ? '#94a3b8' : (st.classification?.color || '#10b981');
      const aqiText = isMaint ? 'Bảo trì' : isHidden ? 'Tạm ẩn' : `AQI ${aqi}`;
      const isSelected = selectedStationCode === st.code;
      const zoneDisplayName = st.name.replace(/^Trạm\s+/i, 'Vùng ');

      const el = document.createElement('div');
      el.className = `aqi-station-marker ${isSelected ? 'is-active' : ''} ${isHidden ? 'is-hidden' : ''}`;
      el.innerHTML = `
        <div class="aqi-marker-bubble" style="background-color: ${color}; opacity: ${isHidden ? '0.78' : '1'};">
          <span class="aqi-zone-name">${zoneDisplayName}</span>
          <span class="aqi-zone-sep">·</span>
          <span class="aqi-zone-aqi">${aqiText}</span>
        </div>
        <div class="aqi-marker-tip" style="color: ${color};"></div>
      `;
      el.title = isMaint
        ? `${st.name} - Đang bảo trì thiết bị`
        : isHidden
          ? `${st.name} - Đang tạm ẩn`
          : `${zoneDisplayName} (${st.area_type}) - AQI: ${aqi} (${st.classification?.label || ''})`;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSelectStation(st.code);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([st.longitude, st.latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [filteredStations, selectedStationCode, handleSelectStation]);

  useEffect(() => {
    if (selectedStationCode) {
      void loadDetail(selectedStationCode);
    }
  }, [selectedStationCode, loadDetail]);

  if (authLoading) {
    return (
      <div className="air-quality-page page-width text-center" style={{ padding: '60px 0', color: 'var(--color-text-muted)' }}>
        <RefreshCw className="spin" size={24} style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} />
        <span>Đang kiểm tra phiên làm việc…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="air-quality-page page-width">
        <div className="page-breadcrumb">
          <Link to="/" className="breadcrumb-link">
            Danh mục dịch vụ
          </Link>
          <ChevronRight size={14} />
          <span className="breadcrumb-current">Chất lượng không khí</span>
        </div>

        <section className="login-gate-card">
          <div className="gate-icon-box">
            <LockKeyhole size={36} />
          </div>
          <div className="gate-content">
            <h2 className="gate-title">Đăng nhập để theo dõi chất lượng không khí</h2>
            <p className="gate-desc">
              Dữ liệu quan trắc môi trường và khuyến cáo y tế kết nối trực tiếp với mạng lưới cảm biến đô thị số OpenCity.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void login()}
          >
            <span>Đăng nhập ngay</span>
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    );
  }

  const avgAqi = summary?.average_aqi ?? 0;
  const avgColor = avgAqi <= 50 ? '#10b981' : avgAqi <= 100 ? '#eab308' : avgAqi <= 150 ? '#f97316' : '#ef4444';
  const avgBg = avgAqi <= 50 ? '#ecfdf5' : avgAqi <= 100 ? '#fefce8' : avgAqi <= 150 ? '#fff7ed' : '#fef2f2';

  const currentStationAqi = stationDetail?.latest_reading?.aqi ?? 0;
  const visualHealth = getVisualHealthGuidance(currentStationAqi);

  return (
    <div className="air-quality-page page-width aqi-container-modern">
      <div className="page-breadcrumb">
        <Link to="/" className="breadcrumb-link">
          Danh mục dịch vụ
        </Link>
        <ChevronRight size={14} />
        <span className="breadcrumb-current">Chất lượng không khí</span>
      </div>

      {activeAlerts.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            border: '1.5px solid #f87171',
            borderRadius: '16px',
            padding: '14px 20px',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  letterSpacing: '0.4px',
                }}
              >
                <Megaphone size={12} /> CẢNH BÁO KHẨN CẤP
              </span>
              <strong style={{ fontSize: '14.5px', color: '#991b1b' }}>
                {activeAlerts[0].title}
              </strong>
            </div>
            <Link
              to="/bulletins"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#b91c1c',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #fca5a5',
              }}
            >
              Xem trên Bảng tin <ArrowRight size={13} />
            </Link>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#7f1d1d', lineHeight: 1.45 }}>
            {activeAlerts[0].summary}
          </p>
        </div>
      )}

      <div className="aqi-command-header">
        <div className="aqi-header-brand-group">
          <div className="aqi-header-icon-box">
            <Wind size={22} />
          </div>
          <div className="aqi-header-titles">
            <div className="aqi-header-eyebrow">
              <span className="aqi-live-beacon" />
              <span>MẠNG LƯỚI QUAN TRẮC MÔI TRƯỜNG ĐÔ THỊ</span>
            </div>
            <h1 className="aqi-header-h1">
              <span>Bản Đồ Quan Trắc Không Khí & Chỉ Số VN-AQI</span>
              <span className="aqi-qcvn-pill">QCVN 05:2023/BTNMT</span>
            </h1>
          </div>
        </div>

        <div className="aqi-header-actions">
          <span
            className="panel-role-tag"
            style={{
              padding: '5px 10px',
              fontSize: '11.5px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: operator ? '#eef2ff' : '#ecfdf5',
              color: operator ? '#4f46e5' : '#059669',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${operator ? '#c7d2fe' : '#a7f3d0'}`,
            }}
          >
            {operator ? <Shield size={12} /> : <UserCheck size={12} />}
            <span>{operator ? 'Cán bộ điều hành' : 'Công dân giám sát'}</span>
          </span>

          {summary?.updated_at && (
            <span className="aqi-time-tag">
              <Clock3 size={12} />
              <span>Cập nhật: {formatTime(summary.updated_at)}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="aqi-btn-refresh-modern"
            title="Làm mới số liệu tức thì"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Làm mới</span>
          </button>

          {operator && (
            <button
              type="button"
              className="aqi-btn-add-modern"
              onClick={() => {
                setError('');
                setActionNotice('');
                setShowAddModal(true);
              }}
            >
              <Plus size={14} />
              <span>Thêm trạm quan trắc</span>
            </button>
          )}
        </div>
      </div>

      {actionNotice && (
        <div className="alert-box alert-success" role="status" style={{ margin: 0 }}>
          <CheckCircle2 size={16} />
          <div className="alert-message">{actionNotice}</div>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setActionNotice('')}
            aria-label="Đóng"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="alert-box alert-error" role="alert" style={{ margin: 0 }}>
          <TriangleAlert size={16} />
          <div className="alert-message">{error}</div>
          <button
            type="button"
            className="alert-close-btn"
            onClick={() => setError('')}
            aria-label="Đóng"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {summary && (
        <section className="aqi-telemetry-ribbon" aria-label="Chỉ số quan trắc thành phố">
          <div className="aqi-ribbon-card">
            <div className="aqi-ribbon-label">
              <span>AQI TRUNG BÌNH ĐÔ THỊ</span>
              <Activity size={13} style={{ color: avgColor }} />
            </div>
            <div className="aqi-ribbon-value-row">
              <span className="aqi-ribbon-num" style={{ color: avgColor }}>
                {summary.average_aqi}
              </span>
              <span
                className="aqi-ribbon-tag"
                style={{ backgroundColor: avgBg, color: avgColor }}
              >
                {summary.classification.label}
              </span>
            </div>
            <span className="aqi-ribbon-sub">
              Toàn mạng lưới quan trắc tự động
            </span>
          </div>

          <div className="aqi-ribbon-card">
            <div className="aqi-ribbon-label">
              <span>MẠNG LƯỚI QUAN TRẮC</span>
              <MapPin size={13} style={{ color: '#2563eb' }} />
            </div>
            <div className="aqi-ribbon-value-row">
              <span className="aqi-ribbon-num" style={{ color: '#2563eb' }}>
                {summary.total_stations}
              </span>
              <span
                className="aqi-ribbon-tag"
                style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}
              >
                Trạm đo
              </span>
            </div>
            <span className="aqi-ribbon-sub">
              Hoạt động 24/7 toàn đô thị
            </span>
          </div>

          <div className="aqi-ribbon-card">
            <div className="aqi-ribbon-label">
              <span>KHU VỰC TỐT NHẤT</span>
              <CheckCircle2 size={13} style={{ color: '#10b981' }} />
            </div>
            <div className="aqi-ribbon-value-row">
              <span className="aqi-ribbon-num" style={{ color: '#10b981', fontSize: '17px' }}>
                {summary.best_station?.name?.replace(/^Trạm\s+/i, '') || '---'}
              </span>
              <span
                className="aqi-ribbon-tag"
                style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}
              >
                AQI {summary.best_station?.latest_reading?.aqi ?? '--'}
              </span>
            </div>
            <span className="aqi-ribbon-sub">
              PM2.5: {summary.best_station?.latest_reading?.pm25 ?? '--'} µg/m³
            </span>
          </div>

          <div className="aqi-ribbon-card">
            <div className="aqi-ribbon-label">
              <span>KHU VỰC CẦN LƯU Ý</span>
              <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
            </div>
            <div className="aqi-ribbon-value-row">
              <span className="aqi-ribbon-num" style={{ color: '#d97706', fontSize: '17px' }}>
                {summary.worst_station?.name?.replace(/^Trạm\s+/i, '') || '---'}
              </span>
              <span
                className="aqi-ribbon-tag"
                style={{ backgroundColor: '#fffbeb', color: '#b45309' }}
              >
                AQI {summary.worst_station?.latest_reading?.aqi ?? '--'}
              </span>
            </div>
            <span className="aqi-ribbon-sub">
              {summary.worst_station?.classification.label ?? 'Đang đo đạc'}
            </span>
          </div>
        </section>
      )}

      <div className="aqi-split-view">
        <section className="aqi-modern-map-pane">
          <div className="aqi-map-floating-filters">
            {[
              { id: 'all', label: `Tất cả (${stations.length})` },
              { id: 'Đô thị', label: 'Đô thị' },
              { id: 'Giao thông', label: 'Giao thông' },
              { id: 'Dân cư', label: 'Dân cư' },
              { id: 'Sinh thái', label: 'Sinh thái' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                className={`aqi-filter-chip ${areaFilter === f.id ? 'is-active' : ''}`}
                onClick={() => setAreaFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="aqi-map-floating-cam">
            <button
              type="button"
              className="aqi-cam-btn"
              onClick={toggle3D}
              title="Chuyển đổi góc nghiêng 3D / mặt phẳng 2D"
            >
              <Compass size={13} />
              <span>{is3D ? 'Góc nghiêng 3D' : 'Mặt phẳng 2D'}</span>
            </button>
            <button
              type="button"
              className="aqi-cam-btn"
              onClick={recenterMap}
              title="Căn giữa toàn cảnh Hà Nội"
            >
              <RotateCcw size={13} />
              <span>Toàn cảnh</span>
            </button>
          </div>

          <div ref={mapElement} className="aqi-modern-map-canvas" />

          <div className="aqi-map-floating-legend">
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>
              Quy chuẩn VN-AQI:
            </span>
            <div className="aqi-legend-scale">
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#10b981' }} />
                Tốt (0-50)
              </span>
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#eab308' }} />
                TB (51-100)
              </span>
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#f97316' }} />
                Kém (101-150)
              </span>
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#ef4444' }} />
                Xấu (151-200)
              </span>
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#8b5cf6' }} />
                Rất xấu (201-300)
              </span>
              <span className="aqi-scale-stop">
                <i className="aqi-scale-dot" style={{ backgroundColor: '#7f1d1d' }} />
                Nguy hại (&gt;300)
              </span>
            </div>
          </div>
        </section>

        <section className="aqi-inspector-pane">
          <div className="aqi-quick-tabs-row">
            {filteredStations.map((st) => {
              const isSelected = selectedStationCode === st.code;
              const isMaint = st.status === 'maintenance';
              const isHidden = st.status === 'hidden';
              const dotColor = isMaint ? '#64748b' : isHidden ? '#94a3b8' : (st.classification.color || '#10b981');
              return (
                <button
                  key={st.code}
                  type="button"
                  className={`aqi-quick-tab ${isSelected ? 'is-active' : ''}`}
                  onClick={() => handleSelectStation(st.code)}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: isSelected ? '#ffffff' : dotColor,
                    }}
                  />
                  <span>{st.name.replace(/^Trạm\s+/i, '')}</span>
                  <strong style={{ fontSize: '11px', opacity: isSelected ? 1 : 0.75 }}>
                    {isMaint ? 'Bảo trì' : (st.latest_reading?.aqi ?? '--')}
                  </strong>
                </button>
              );
            })}
          </div>

          {loadingDetail && !stationDetail ? (
            <div className="loading-state-card" style={{ padding: '60px 0' }}>
              <RefreshCw className="spin" size={24} />
              <span>Đang kết nối số liệu phân vùng trạm…</span>
            </div>
          ) : stationDetail ? (
            <>
              <div className="aqi-insp-header">
                <div className="aqi-insp-title-box">
                  <div className="aqi-insp-badges">
                    <span className="aqi-badge-code">{stationDetail.code}</span>
                    <span className="aqi-badge-area">Khu vực {stationDetail.area_type}</span>
                    {stationDetail.status === 'maintenance' ? (
                      <span className="status-badge-maintenance">
                        <Wrench size={11} />
                        <span>Bảo trì</span>
                      </span>
                    ) : stationDetail.status === 'hidden' ? (
                      <span className="status-badge-hidden">
                        <EyeOff size={11} />
                        <span>Tạm ẩn</span>
                      </span>
                    ) : (
                      <span className="status-badge-active">
                        <CheckCircle2 size={11} />
                        <span>Hoạt động</span>
                      </span>
                    )}
                  </div>
                  <h2 className="aqi-insp-name">
                    {stationDetail.name.replace(/^Trạm\s+/i, 'Vùng ')}
                  </h2>
                  <div className="aqi-insp-address">
                    <MapPin size={12} />
                    <span>{stationDetail.address}</span>
                  </div>
                </div>
              </div>

              {(() => {
                const isMaint = stationDetail.status === 'maintenance';
                const color = isMaint ? '#64748b' : stationDetail.classification.color;
                const bg = isMaint ? '#f1f5f9' : stationDetail.classification.bg_color;
                const reading = stationDetail.latest_reading;

                const pm25 = reading?.pm25 ?? 0;
                const pm25Pct = Math.min(100, Math.round((pm25 / 75) * 100));
                const pm25Color = pm25 <= 25 ? '#10b981' : pm25 <= 50 ? '#eab308' : '#ef4444';

                const pm10 = reading?.pm10 ?? 0;
                const pm10Pct = Math.min(100, Math.round((pm10 / 150) * 100));
                const pm10Color = pm10 <= 50 ? '#10b981' : pm10 <= 100 ? '#eab308' : '#ef4444';

                return (
                  <div className="aqi-bento-hero" style={{ borderColor: isMaint ? '#cbd5e1' : color }}>
                    <div className="aqi-bento-main-row">
                      <div className="aqi-gauge-col">
                        <span className="aqi-gauge-lbl">CHỈ SỐ VN-AQI</span>
                        <div className="aqi-gauge-score" style={{ color }}>
                          {isMaint ? '--' : (reading?.aqi ?? '--')}
                        </div>
                        <span className="aqi-gauge-pill" style={{ backgroundColor: bg, color }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
                          <span>{isMaint ? 'Đang hiệu chuẩn' : stationDetail.classification.label}</span>
                        </span>
                      </div>

                      <div className="aqi-measurements-quad">
                        <div className="aqi-quad-cell">
                          <div className="aqi-quad-head">
                            <span className="aqi-quad-title">Bụi PM2.5</span>
                            <span className="aqi-qcvn-chip">QCVN ≤50</span>
                          </div>
                          <div className="aqi-quad-val">
                            {reading?.pm25 != null ? `${reading.pm25} µg/m³` : '---'}
                          </div>
                          <div className="aqi-level-track">
                            <div
                              className="aqi-level-fill"
                              style={{ width: `${pm25Pct}%`, backgroundColor: pm25Color }}
                            />
                          </div>
                        </div>

                        <div className="aqi-quad-cell">
                          <div className="aqi-quad-head">
                            <span className="aqi-quad-title">Bụi PM10</span>
                            <span className="aqi-qcvn-chip">QCVN ≤100</span>
                          </div>
                          <div className="aqi-quad-val">
                            {reading?.pm10 != null ? `${reading.pm10} µg/m³` : '---'}
                          </div>
                          <div className="aqi-level-track">
                            <div
                              className="aqi-level-fill"
                              style={{ width: `${pm10Pct}%`, backgroundColor: pm10Color }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="aqi-hero-footer-bar">
                      <div className="aqi-foot-metric">
                        <Thermometer size={13} style={{ color: '#0284c7' }} />
                        <span>Nhiệt độ:</span>
                        <strong>{reading?.temperature != null ? `${reading.temperature} °C` : '---'}</strong>
                      </div>
                      <div className="aqi-foot-divider" />
                      <div className="aqi-foot-metric">
                        <Droplets size={13} style={{ color: '#0284c7' }} />
                        <span>Độ ẩm:</span>
                        <strong>{reading?.humidity != null ? `${reading.humidity} %` : '---'}</strong>
                      </div>
                      <div className="aqi-foot-divider" />
                      <div className="aqi-foot-metric">
                        <Activity size={13} style={{ color: '#10b981' }} />
                        <span>Cảm biến:</span>
                        <strong style={{ color: '#059669' }}>Trực tiếp</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {operator && (
                <div className="aqi-op-toolbar-modern">
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>
                    Tác nghiệp:
                  </span>
                  <div className="aqi-op-group">
                    <button
                      type="button"
                      className="aqi-pill-btn btn-tone-primary"
                      onClick={() => promptToggleMaintenance(stationDetail)}
                      disabled={busy}
                    >
                      <Wrench size={13} />
                      <span>{stationDetail.status === 'maintenance' ? 'Kích hoạt lại' : 'Bảo trì'}</span>
                    </button>

                    <button
                      type="button"
                      className="aqi-pill-btn btn-tone-danger"
                      onClick={() => promptDeleteStation(stationDetail)}
                      disabled={busy}
                    >
                      <Trash2 size={13} />
                      <span>Xóa trạm</span>
                    </button>

                    <button
                      type="button"
                      className="aqi-pill-btn btn-tone-danger"
                      style={{ backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#b91c1c' }}
                      onClick={() => openBroadcastModal(stationDetail)}
                      disabled={busy}
                    >
                      <Megaphone size={13} />
                      <span>Phát cảnh báo</span>
                    </button>
                  </div>
                </div>
              )}

              {stationDetail.status === 'maintenance' && (
                <div className="aqi-maint-alert">
                  <Wrench size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Trạm đang bảo trì:</strong> Thiết bị cảm biến đang được kỹ thuật viên vệ sinh và hiệu chuẩn định kỳ.
                  </div>
                </div>
              )}

              <div className="aqi-health-matrix-modern">
                <div className="aqi-matrix-title-row">
                  <span className="aqi-matrix-heading">
                    <HeartPulse size={14} style={{ color: stationDetail.classification.color }} />
                    <span>Khuyến nghị sức khỏe & sinh hoạt</span>
                  </span>
                  <button
                    type="button"
                    className="aqi-qcvn-toggle"
                    onClick={() => setShowQcvnDetails(!showQcvnDetails)}
                  >
                    <span>Văn bản QCVN</span>
                    {showQcvnDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>

                <div className="aqi-matrix-grid">
                  <div className="aqi-matrix-card">
                    <div className="aqi-matrix-card-head">
                      <span>Thể thao ngoài trời</span>
                      <span
                        className="aqi-matrix-card-status"
                        style={{ color: visualHealth.outdoor.tone }}
                      >
                        {visualHealth.outdoor.label}
                      </span>
                    </div>
                    <span className="aqi-matrix-card-desc">{visualHealth.outdoor.desc}</span>
                  </div>

                  <div className="aqi-matrix-card">
                    <div className="aqi-matrix-card-head">
                      <span>Khẩu trang bảo vệ</span>
                      <span
                        className="aqi-matrix-card-status"
                        style={{ color: visualHealth.mask.tone }}
                      >
                        {visualHealth.mask.label}
                      </span>
                    </div>
                    <span className="aqi-matrix-card-desc">{visualHealth.mask.desc}</span>
                  </div>

                  <div className="aqi-matrix-card">
                    <div className="aqi-matrix-card-head">
                      <span>Thông khí trong nhà</span>
                      <span
                        className="aqi-matrix-card-status"
                        style={{ color: visualHealth.ventilation.tone }}
                      >
                        {visualHealth.ventilation.label}
                      </span>
                    </div>
                    <span className="aqi-matrix-card-desc">{visualHealth.ventilation.desc}</span>
                  </div>

                  <div className="aqi-matrix-card">
                    <div className="aqi-matrix-card-head">
                      <span>Nhóm nhạy cảm</span>
                      <span
                        className="aqi-matrix-card-status"
                        style={{ color: visualHealth.sensitive.tone }}
                      >
                        {visualHealth.sensitive.label}
                      </span>
                    </div>
                    <span className="aqi-matrix-card-desc">{visualHealth.sensitive.desc}</span>
                  </div>
                </div>

                {showQcvnDetails && (
                  <div className="aqi-qcvn-full-drawer">
                    <div>
                      <strong>Tác động môi trường:</strong> {stationDetail.classification.health_effect}
                    </div>
                    <div>
                      <strong>Khuyến nghị người dân:</strong> {stationDetail.classification.advice_general}
                    </div>
                    <div>
                      <strong>Khuyến cáo nhóm nhạy cảm:</strong> {stationDetail.classification.advice_sensitive}
                    </div>
                  </div>
                )}
              </div>

              <div className="aqi-history-block">
                <div className="aqi-history-title-row">
                  <Clock3 size={13} />
                  <span>Lịch sử đo đạc gần nhất</span>
                </div>
                {stationDetail.history && stationDetail.history.length > 0 ? (
                  <div className="aqi-history-list">
                    {stationDetail.history.slice(0, 3).map((reading) => (
                      <div key={reading.id} className="aqi-timeline-item-modern">
                        <div className="aqi-hist-left">
                          <span
                            className="aqi-hist-dot"
                            style={{ backgroundColor: reading.classification.color }}
                          />
                          <span className="aqi-hist-time">{formatTime(reading.recorded_at)}</span>
                        </div>
                        <div className="aqi-hist-right">
                          <strong
                            className="aqi-hist-val"
                            style={{ color: reading.classification.color }}
                          >
                            AQI {reading.aqi} · {reading.classification.label}
                          </strong>
                          <span className="aqi-hist-meta">
                            PM2.5: {reading.pm25} µg/m³
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="aqi-empty-note">Chưa có lịch sử đo đạc cho trạm này.</p>
                )}
              </div>

              <div className="aqi-detail-footer">
                <span>Tọa độ GPS: {stationDetail.latitude.toFixed(4)}, {stationDetail.longitude.toFixed(4)}</span>
                <span className="dot-divider">·</span>
                <span>{stationDetail.latest_reading?.note || 'Dữ liệu cảm biến tự động WAQI'}</span>
              </div>
            </>
          ) : (
            <div className="empty-list-card" style={{ padding: '40px 0' }}>
              <Wind size={32} />
              <h4>Chọn một phân vùng trạm trên bản đồ</h4>
              <p>Nhấp vào bất kỳ điểm đo nào trên bản đồ để xem chi tiết thông số môi trường.</p>
            </div>
          )}
        </section>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(540px, 100%)' }}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowAddModal(false)}
              aria-label="Đóng"
            >
              <X size={16} />
            </button>
            <div className="modal-header">
              <div className="modal-icon-badge tone-blue">
                <Wind size={28} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px' }}>Thêm Trạm Quan Trắc Mới</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0 }}>
                Khai báo điểm đo cảm biến môi trường mới vào mạng lưới quan trắc đô thị số OpenCity.
              </p>
            </div>
            <form onSubmit={promptCreateStation} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                    Mã trạm (Code) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: HN-TAYMO"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                    Loại khu vực *
                  </label>
                  <select
                    value={newAreaType}
                    onChange={(e) => setNewAreaType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                  >
                    <option value="Đô thị">Đô thị</option>
                    <option value="Dân cư">Dân cư</option>
                    <option value="Giao thông">Giao thông</option>
                    <option value="Sinh thái">Sinh thái</option>
                    <option value="Công nghiệp">Công nghiệp</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Tên trạm quan trắc *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Trạm Quan Trắc Tây Mỗ"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Địa chỉ lắp đặt
                </label>
                <input
                  type="text"
                  placeholder="VD: Đại lộ Thăng Long, Nam Từ Liêm, Hà Nội"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                    Vĩ độ (Latitude) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newLat}
                    onChange={(e) => setNewLat(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                    Kinh độ (Longitude) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={newLng}
                    onChange={(e) => setNewLng(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={busy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy}
                >
                  <Plus size={15} />
                  <span>{busy ? 'Đang tạo…' : 'Lưu & Đưa vào vận hành'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAlertModal && stationDetail && (
        <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(540px, 100%)' }}>
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => setShowAlertModal(false)}
              aria-label="Đóng"
            >
              <X size={16} />
            </button>
            <div className="modal-header">
              <div className="modal-icon-badge tone-red">
                <Megaphone size={28} />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: '#b91c1c' }}>
                Phát Cảnh Báo Ô Nhiễm Đô Thị
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0 }}>
                Thông báo cảnh báo này sẽ được phát hành chính thức lên phân hệ <strong>Bản Tin & Cảnh Báo</strong> của OpenCity để gửi tới toàn bộ cư dân.
              </p>
            </div>
            <form onSubmit={promptBroadcastAlert} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Trạm phát sinh cảnh báo
                </label>
                <div style={{ padding: '8px 12px', background: 'var(--color-bg-muted)', borderRadius: 'var(--radius-md)', fontSize: '13px', fontWeight: 700 }}>
                  {stationDetail.name} ({stationDetail.code}) · AQI hiện tại: {stationDetail.latest_reading?.aqi ?? '--'} ({stationDetail.classification.label})
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Tiêu đề cảnh báo khẩn cấp *
                </label>
                <input
                  type="text"
                  required
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Nội dung tóm tắt khuyến cáo người dân *
                </label>
                <textarea
                  rows={3}
                  required
                  value={alertSummary}
                  onChange={(e) => setAlertSummary(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setShowAlertModal(false)}
                  disabled={busy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                  disabled={busy}
                >
                  <Megaphone size={15} />
                  <span>{busy ? 'Đang phát lệnh…' : 'Phát Lệnh Cảnh Báo Ngay'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmModal && (
        <div
          className="modal-overlay aqi-confirm-overlay"
          onClick={() => !busy && setConfirmModal(null)}
        >
          <div
            className="modal-card aqi-confirm-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aqi-confirm-title"
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={() => !busy && setConfirmModal(null)}
              disabled={busy}
              aria-label="Đóng"
            >
              <X size={16} />
            </button>

            <div className={`aqi-confirm-icon-wrap tone-${confirmModal.confirmTone || 'primary'}`}>
              {confirmModal.icon === 'wrench' && <Wrench size={28} />}
              {confirmModal.icon === 'eye' && <Eye size={28} />}
              {confirmModal.icon === 'eye-off' && <EyeOff size={28} />}
              {confirmModal.icon === 'megaphone' && <Megaphone size={28} />}
              {confirmModal.icon === 'plus' && <Plus size={28} />}
              {confirmModal.icon === 'alert' && <AlertTriangle size={28} />}
              {confirmModal.icon === 'trash' && <Trash2 size={28} />}
            </div>

            <div className="aqi-confirm-tag">XÁC NHẬN THAO TÁC</div>
            <h3 id="aqi-confirm-title" className="aqi-confirm-title">
              {confirmModal.title}
            </h3>

            {confirmModal.stationName && (
              <div className="aqi-confirm-station-chip">
                <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                <span>{confirmModal.stationName}</span>
                {confirmModal.stationCode && (
                  <span className="aqi-code-tag">{confirmModal.stationCode}</span>
                )}
              </div>
            )}

            <p className="aqi-confirm-question">
              {confirmModal.question}
            </p>

            {confirmModal.details && (
              <p className="aqi-confirm-details">
                {confirmModal.details}
              </p>
            )}

            {confirmModal.warningNote && (
              <div className={`aqi-confirm-note tone-${confirmModal.confirmTone || 'warning'}`}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>{confirmModal.warningNote}</span>
              </div>
            )}

            <div className="aqi-confirm-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setConfirmModal(null)}
                disabled={busy}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-primary"
                style={
                  confirmModal.confirmTone === 'danger'
                    ? { backgroundColor: '#dc2626', borderColor: '#b91c1c', color: 'white' }
                    : confirmModal.confirmTone === 'warning'
                      ? { backgroundColor: '#d97706', borderColor: '#b45309', color: 'white' }
                      : {}
                }
                onClick={async () => {
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } catch {
                  }
                }}
                disabled={busy}
              >
                {busy ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Đang thực hiện…</span>
                  </>
                ) : (
                  <span>{confirmModal.confirmLabel}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

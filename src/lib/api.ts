// SPDX-License-Identifier: Apache-2.0
import { apiBase } from './auth';

export type Report = {
  id: string;
  title: string;
  description: string;
  category: string;
  unit_id: string;
  assigned_unit: string | null;
  due_at: string | null;
  accepted_at: string | null;
  pending_unit: string | null;
  pending_reason: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  attachment_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  workflow_id: string | null;
  state: string | null;
  history: {
    action: string; from_state: string | null; to_state: string | null;
    actor: string; created_at: string; from_unit?: string | null; to_unit?: string | null; note?: string | null
  }[];
  warnings?: string[];
};

export type ReportsDashboard = {
  generated_at: string;
  counts: {
    total: number; new: number; triaged: number; in_progress: number; resolved: number;
    unassigned: number; due_soon: number; overdue: number
  };
  units: {
    unit_id: string; total: number; active: number; resolved: number;
    due_soon: number; overdue: number
  }[];
  urgent: {
    id: string; title: string; category: string; address: string;
    state: string | null; assigned_unit: string | null; due_at: string | null;
    priority: 'overdue' | 'due_soon' | 'unassigned'
  }[];
};

export type AdminOverview = {
  generated_at: string;
  reports: ReportsDashboard['counts'];
  appointments: { total: number; breakdown: Record<string, number> };
  administrative_feedback: { total: number; breakdown: Record<string, number> };
  business_feedback: { total: number; breakdown: Record<string, number> };
  bulletins: { total: number; breakdown: Record<string, number> };
  surveys: { total: number; breakdown: Record<string, number> };
  hotlines: { total: number; breakdown: Record<string, number> };
  community_groups: { total: number; breakdown: Record<string, number> };
  social_feedback: { total: number; breakdown: Record<string, number> };
  digital_ward: { total: number; breakdown: Record<string, number> };
};

export type DigitalWard = {
  id: string; code: string; name: string; address: string; phone: string;
  office_hours: string; description: string; latitude: number | null;
  longitude: number | null; active: boolean; updated_at: string;
};

export type ConsultationTopic = {
  id: string; title: string; description: string; area: string | null;
  status: 'open' | 'closed'; created_at: string; closed_at: string | null;
  opinion_count: number; my_opinion: { body: string; updated_at: string } | null;
};
export type ConsultationOpinion = {
  id: string; topic_id: string; user_id: string; body: string; created_at: string; updated_at: string;
};

export type CommunityGroup = {
  id: string; tenant: string; title: string; description: string; area: string | null;
  created_by: string; created_at: string; member_count: number; joined: boolean;
};
export type CommunityPost = { id: string; group_id: string; user_id: string; body: string; created_at: string };

export type Hotline = {
  id: string; name: string; unit: string; phone: string;
  area: string; hours: string; description: string; active: boolean;
  updated_at: string;
};

export type TriageSuggestion = {
  id: string; report_id: string; suggested_unit: string; model_version: string;
  source_updated_at: string; created_at: string; stale?: boolean;
  ranked_labels: { label: string; score: number }[];
  urgency: 'high' | 'normal' | 'low';
  urgency_ranked: { label: string; score: number }[];
  signals: string[]; similar: { id: string; similarity: number }[];
  reviewed_unit: string | null; matched: boolean | null;
};

export type TriageMetrics = {
  generated: number; reviewed: number; accepted: number; overridden: number;
};

export type Notification = {
  id: string;
  report_id: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export type SurveySummary = {
  id: string; title: string; description: string; status: 'open' | 'closed';
  created_at: string; closed_at: string | null; my_option_id: string | null;
};
export type SurveyDetail = SurveySummary & {
  options: { id: string; label: string; votes: number | null }[];
  total_responses: number | null;
};
export type Bulletin = {
  id: string; category: 'news' | 'alert' | 'campaign'; title: string; summary: string; body: string;
  area: string | null; latitude: number | null; longitude: number | null; published_at: string;
};

export type AppointmentSlot = {
  id: string; starts_at: string; ends_at: string; location: string;
  capacity: number; confirmed_count: number; remaining_capacity: number;
};
export type Appointment = {
  id: string; slot_id: string; user_id: string; reason: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  starts_at: string; ends_at: string; location: string;
  created_at: string; reviewed_at: string | null; reviewed_by: string | null;
  review_note: string | null; cancelled_at: string | null;
};

export type AdministrativeFeedback = {
  id: string; tenant: string; user_id: string; title: string; procedure: string;
  agency: string; issue_type: 'delay' | 'instructions' | 'conduct' | 'other';
  description: string; status: 'submitted' | 'in_review' | 'answered' | 'closed';
  response: string | null; created_at: string; updated_at: string;
  history: { action: string; actor: string; note: string | null; created_at: string }[];
};

export type BusinessPetition = {
  id: string; tenant: string; user_id: string; company_name: string;
  tax_code: string; representative: string;
  sector: 'investment' | 'tax' | 'land' | 'labor' | 'other';
  title: string; description: string; requested_resolution: string;
  status: 'submitted' | 'in_review' | 'needs_info' | 'resolved' | 'closed';
  response: string | null; created_at: string; updated_at: string;
  history: { action: string; actor: string; note: string | null; created_at: string }[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token}`;
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.sub) headers['X-Dxos-User'] = claims.sub;
      if (claims.tenant_id) headers['X-Dxos-Tenant'] = claims.tenant_id;
      if (claims.realm_access?.roles) {
        headers['X-Dxos-Roles'] = claims.realm_access.roles.join(',');
      }
      if (claims.unit_id) headers['X-Dxos-Unit'] = claims.unit_id;
    } catch { }
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    let detail = `Yêu cầu thất bại (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((err: any) => {
            const field = err.loc ? err.loc[err.loc.length - 1] : '';
            return field ? `Trường "${field}": ${err.msg}` : err.msg;
          })
          .join(', ');
      }
    } catch { }
    if (response.status === 401 || detail === 'Bearer token required') {
      detail = 'Vui lòng đăng nhập tài khoản cán bộ để thực hiện thao tác này.';
    } else if (response.status === 403) {
      detail = 'Tài khoản của bạn không có quyền thực hiện thao tác này.';
    }
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

export async function downloadAttachment(reportId: string, objectId: string, token: string): Promise<Blob> {
  const response = await fetch(`${apiBase}/api/opencity/reports/${encodeURIComponent(reportId)}/attachments/${encodeURIComponent(objectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(response.status, `Không tải được ảnh (${response.status})`);
  return response.blob();
}

export const reportStates: Record<string, string> = {
  submitted: 'Mới gửi', triaged: 'Đã tiếp nhận', assigned: 'Đang xử lý', resolved: 'Đã hoàn tất',
};

export type AQIClassification = {
  level: 'good' | 'moderate' | 'unhealthy_sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
  label: string;
  color: string;
  bg_color: string;
  health_effect: string;
  advice_general: string;
  advice_sensitive: string;
  recommendations: { icon: string; text: string }[];
};

export type AirStation = {
  code: string;
  name: string;
  address: string;
  area_type: string;
  latitude: number;
  longitude: number;
  created_at: string;
};

export type AirReading = {
  id: string;
  tenant: string;
  station_code: string;
  aqi: number;
  pm25: number | null;
  pm10: number | null;
  temperature: number | null;
  humidity: number | null;
  co: number | null;
  no2: number | null;
  o3: number | null;
  so2: number | null;
  note: string | null;
  recorded_at: string;
};

export type StationItem = {
  code: string;
  name: string;
  address: string;
  area_type: string;
  latitude: number;
  longitude: number;
  status: 'active' | 'maintenance' | 'hidden';
  created_at: string;
  latest_reading: AirReading | null;
  classification: AQIClassification;
};

export type StationInput = {
  code: string;
  name: string;
  address: string;
  area_type: string;
  latitude: number;
  longitude: number;
};

export type BroadcastAlertInput = {
  station_code: string;
  title: string;
  summary: string;
};

export type StationDetail = StationItem & {
  history: (AirReading & { classification: AQIClassification })[];
};

export type AirQualitySummary = {
  tenant: string;
  total_stations: number;
  average_aqi: number;
  classification: AQIClassification;
  updated_at: string;
  best_station: StationItem | null;
  worst_station: StationItem | null;
  distribution: Record<string, number>;
};

export type WaqiStatus = {
  has_token: boolean;
  token_preview: string;
  source: string;
  api_endpoint: string;
  configured_via: string;
  message: string;
};

export type RouteStopRef = {
  stop_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  stop_order: number;
};

export type BusRouteSummary = {
  id: string;
  route_number: string;
  name: string;
  operator: string;
  route_type: 'standard' | 'brt' | 'electric';
  from_terminal: string;
  to_terminal: string;
  operating_hours: string;
  frequency: string;
  fare: string;
  color: string;
  osm_relation_id: string | null;
  total_stops_forward: number;
  total_stops_backward: number;
  active: boolean;
  updated_at: string | null;
};

export type BusRouteDetail = {
  id: string;
  route_number: string;
  name: string;
  operator: string;
  route_type: 'standard' | 'brt' | 'electric';
  from_terminal: string;
  to_terminal: string;
  operating_hours: string;
  frequency: string;
  fare: string;
  color: string;
  osm_relation_id: string | null;
  forward_stops: RouteStopRef[];
  backward_stops: RouteStopRef[];
  forward_path: [number, number][];
  backward_path: [number, number][];
  active: boolean;
  updated_at: string;
};

export type BusStopSummary = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  osm_node_id: string | null;
  has_shelter: boolean;
  routes: string[];
  active: boolean;
  distance_km?: number | null;
};

export type RouteRecommendation = {
  type: 'direct' | 'transfer';
  route_number: string;
  route_name: string;
  operator: string;
  color: string;
  board_stop: RouteStopRef;
  alight_stop: RouteStopRef;
  stops_count: number;
  estimated_minutes: number;
  direction: 'forward' | 'backward';
  path_segment: [number, number][];
  trip_stops?: RouteStopRef[];
  transfer_stop?: RouteStopRef | null;
  second_route_number?: string | null;
  second_board_stop?: RouteStopRef | null;
  second_alight_stop?: RouteStopRef | null;
};

export type BusAuditIssue = {
  level: 'warning' | 'info';
  category: 'route' | 'stop' | 'geometry';
  item_id: string;
  title: string;
  description: string;
};

export type BusAuditReport = {
  total_routes: number;
  total_stops: number;
  standard_routes_count: number;
  brt_routes_count: number;
  electric_routes_count: number;
  completeness_percentage: number;
  osm_data_source: string;
  license: string;
  last_synced_at: string | null;
  issues: BusAuditIssue[];
  overpass_query_sample: string;
};

export type BusSyncResult = {
  success: boolean;
  routes_synced: number;
  stops_synced: number;
  message: string;
  synced_at: string;
};

export type BusRouteCreateInput = {
  route_number: string;
  name: string;
  operator?: string;
  route_type?: 'standard' | 'brt' | 'electric';
  from_terminal: string;
  to_terminal: string;
  operating_hours?: string;
  frequency?: string;
  fare?: string;
  color?: string;
};

export type BusStopCreateInput = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  has_shelter?: boolean;
  routes?: string[];
};

export type TourismDestination = {
  id: string;
  name: string;
  category: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  heritage_level: string;
  description?: string;
  opening_hours: string;
  admission_fee: string;
  connecting_bus_routes?: string[];
  osm_id?: string | null;
  tags?: string[];
  audio_guide: boolean;
  active?: boolean;
  distance_km?: number | null;
};

export type TourismCategory = {
  key: string;
  label: string;
  count: number;
  icon: string;
};

export async function listTourismDestinations(
  token: string,
  params: {
    keyword?: string;
    category?: string;
    district?: string;
    heritage_level?: string;
    lat?: number;
    lon?: number;
    radius_km?: number;
    audio_guide_only?: boolean;
  } = {}
): Promise<TourismDestination[]> {
  const q = new URLSearchParams();
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.category && params.category !== 'all') q.set('category', params.category);
  if (params.district && params.district !== 'all') q.set('district', params.district);
  if (params.heritage_level) q.set('heritage_level', params.heritage_level);
  if (params.lat !== undefined) q.set('lat', params.lat.toString());
  if (params.lon !== undefined) q.set('lon', params.lon.toString());
  if (params.radius_km !== undefined) q.set('radius_km', params.radius_km.toString());
  if (params.audio_guide_only) q.set('audio_guide_only', 'true');
  const qs = q.toString();
  return request<TourismDestination[]>(`/api/opencity/tourism/destinations${qs ? `?${qs}` : ''}`, token);
}

export async function getTourismDestination(id: string, token: string): Promise<TourismDestination> {
  return request<TourismDestination>(`/api/opencity/tourism/destinations/${id}`, token);
}

export async function getTourismCategories(token: string): Promise<TourismCategory[]> {
  return request<TourismCategory[]>('/api/opencity/tourism/categories', token);
}

export async function getTourismDistricts(token: string): Promise<string[]> {
  return request<string[]>('/api/opencity/tourism/districts', token);
}

export type TourismDestinationInput = {
  name: string;
  category: string;
  address?: string;
  district?: string;
  latitude: number;
  longitude: number;
  description?: string;
  opening_hours?: string;
  admission_fee?: string;
  heritage_level?: string;
  connecting_bus_routes?: string[];
  tags?: string[];
  audio_guide?: boolean;
  active?: boolean;
};

export async function createTourismDestination(token: string, body: TourismDestinationInput): Promise<TourismDestination> {
  return request<TourismDestination>('/api/opencity/tourism/destinations', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateTourismDestination(token: string, id: string, body: TourismDestinationInput): Promise<TourismDestination> {
  return request<TourismDestination>(`/api/opencity/tourism/destinations/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteTourismDestination(token: string, id: string): Promise<{ message: string; id: string }> {
  return request<{ message: string; id: string }>(`/api/opencity/tourism/destinations/${id}`, token, {
    method: 'DELETE',
  });
}

export type FacilitySummary = {
  id: string;
  name: string;
  category: string;
  facility_type: 'healthcare' | 'education';
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  operator_type: string;
  opening_hours: string;
  phone?: string | null;
  emergency_phone?: string | null;
  level?: string | null;
  distance_km?: number | null;
  tags?: string[];
};

export type FacilityDetail = {
  id: string;
  name: string;
  category: string;
  facility_type: 'healthcare' | 'education';
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  operator_type: string;
  opening_hours: string;
  phone?: string | null;
  emergency_phone?: string | null;
  level?: string | null;
  description: string;
  website?: string | null;
  connecting_bus_routes?: string[];
  tags?: string[];
  distance_km?: number | null;
  active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FacilityCategorySummary = {
  key: string;
  label: string;
  count: number;
  icon: string;
  facility_type: string;
};

export type FacilityInput = {
  name: string;
  category: string;
  facility_type: 'healthcare' | 'education';
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  operator_type?: string;
  opening_hours?: string;
  phone?: string | null;
  emergency_phone?: string | null;
  level?: string | null;
  description?: string;
  website?: string | null;
  connecting_bus_routes?: string[];
  tags?: string[];
  active?: boolean;
};

export async function listFacilities(
  token: string,
  params: {
    keyword?: string;
    category?: string;
    facility_type?: string;
    district?: string;
    lat?: number;
    lon?: number;
    radius_km?: number;
    emergency_only?: boolean;
  } = {}
): Promise<FacilitySummary[]> {
  const q = new URLSearchParams();
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.category && params.category !== 'all') q.set('category', params.category);
  if (params.facility_type && params.facility_type !== 'all') q.set('facility_type', params.facility_type);
  if (params.district && params.district !== 'all') q.set('district', params.district);
  if (params.lat !== undefined) q.set('lat', params.lat.toString());
  if (params.lon !== undefined) q.set('lon', params.lon.toString());
  if (params.radius_km !== undefined) q.set('radius_km', params.radius_km.toString());
  if (params.emergency_only) q.set('emergency_only', 'true');
  const qs = q.toString();
  return request<FacilitySummary[]>(`/api/opencity/facilities${qs ? `?${qs}` : ''}`, token);
}

export async function getFacilityDetail(id: string, token: string, lat?: number, lon?: number): Promise<FacilityDetail> {
  const q = new URLSearchParams();
  if (lat !== undefined) q.set('lat', lat.toString());
  if (lon !== undefined) q.set('lon', lon.toString());
  const qs = q.toString();
  return request<FacilityDetail>(`/api/opencity/facilities/${id}${qs ? `?${qs}` : ''}`, token);
}

export async function getFacilityCategories(token: string): Promise<FacilityCategorySummary[]> {
  return request<FacilityCategorySummary[]>('/api/opencity/facilities/categories', token);
}

export async function getFacilityDistricts(token: string, facilityType?: string): Promise<string[]> {
  const qs = facilityType ? `?facility_type=${facilityType}` : '';
  return request<string[]>(`/api/opencity/facilities/districts${qs}`, token);
}

export async function createFacility(token: string, body: FacilityInput): Promise<FacilityDetail> {
  return request<FacilityDetail>('/api/opencity/facilities', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateFacility(token: string, id: string, body: FacilityInput): Promise<FacilityDetail> {
  return request<FacilityDetail>(`/api/opencity/facilities/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteFacility(token: string, id: string): Promise<{ message: string; id: string }> {
  return request<{ message: string; id: string }>(`/api/opencity/facilities/${id}`, token, {
    method: 'DELETE',
  });
}

export type ParkingSummary = {
  id: string;
  name: string;
  category: 'car_parking' | 'motorcycle_parking' | 'mixed_parking' | 'street_parking' | string;
  parking_type: 'surface' | 'underground' | 'multi-storey' | 'street_side' | 'rooftop' | string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  fee: string;
  fee_details?: string | null;
  capacity?: number | null;
  access: string;
  supervised: boolean;
  opening_hours: string;
  operator?: string | null;
  distance_km?: number | null;
  tags?: string[];
};

export type ParkingDetail = {
  id: string;
  name: string;
  category: string;
  parking_type: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  fee: string;
  fee_details?: string | null;
  capacity?: number | null;
  access: string;
  supervised: boolean;
  opening_hours: string;
  operator?: string | null;
  description: string;
  contact?: string | null;
  distance_km?: number | null;
  tags?: string[];
  active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ParkingCategorySummary = {
  key: string;
  label: string;
  count: number;
  icon: string;
};

export type ParkingInput = {
  name: string;
  category: string;
  parking_type: string;
  address: string;
  district: string;
  latitude: number;
  longitude: number;
  fee?: string;
  fee_details?: string | null;
  capacity?: number | null;
  access?: string;
  supervised?: boolean;
  opening_hours?: string;
  operator?: string | null;
  description?: string;
  contact?: string | null;
  tags?: string[];
  active?: boolean;
};

export async function listParking(
  token: string,
  params: {
    keyword?: string;
    category?: string;
    parking_type?: string;
    district?: string;
    fee_type?: string;
    is_24_7?: boolean;
    lat?: number;
    lon?: number;
    radius_km?: number;
  } = {}
): Promise<ParkingSummary[]> {
  const q = new URLSearchParams();
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.category && params.category !== 'all') q.set('category', params.category);
  if (params.parking_type && params.parking_type !== 'all') q.set('parking_type', params.parking_type);
  if (params.district && params.district !== 'all') q.set('district', params.district);
  if (params.fee_type && params.fee_type !== 'all') q.set('fee_type', params.fee_type);
  if (params.is_24_7) q.set('is_24_7', 'true');
  if (params.lat !== undefined) q.set('lat', params.lat.toString());
  if (params.lon !== undefined) q.set('lon', params.lon.toString());
  if (params.radius_km !== undefined) q.set('radius_km', params.radius_km.toString());
  const qs = q.toString();
  return request<ParkingSummary[]>(`/api/opencity/parking${qs ? `?${qs}` : ''}`, token);
}

export async function getParkingDetail(id: string, token: string, lat?: number, lon?: number): Promise<ParkingDetail> {
  const q = new URLSearchParams();
  if (lat !== undefined) q.set('lat', lat.toString());
  if (lon !== undefined) q.set('lon', lon.toString());
  const qs = q.toString();
  return request<ParkingDetail>(`/api/opencity/parking/${id}${qs ? `?${qs}` : ''}`, token);
}

export async function getParkingCategories(token: string): Promise<ParkingCategorySummary[]> {
  return request<ParkingCategorySummary[]>('/api/opencity/parking/categories', token);
}

export async function getParkingDistricts(token: string): Promise<string[]> {
  return request<string[]>('/api/opencity/parking/districts', token);
}

export async function createParking(token: string, body: ParkingInput): Promise<ParkingDetail> {
  return request<ParkingDetail>('/api/opencity/parking', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateParking(token: string, id: string, body: ParkingInput): Promise<ParkingDetail> {
  return request<ParkingDetail>(`/api/opencity/parking/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteParking(token: string, id: string): Promise<{ message: string; id: string }> {
  return request<{ message: string; id: string }>(`/api/opencity/parking/${id}`, token, {
    method: 'DELETE',
  });
}

// Ward / Commune Administrative Map API
export type WardSummary = {
  id: string;
  code: string;
  name: string;
  full_name: string;
  district: string;
  type: 'Phường' | 'Xã' | 'Thị trấn' | string;
  area_km2: number;
  postal_code: string;
  center_lat: number;
  center_lon: number;
  office_address: string;
  phone: string;
  office_hours: string;
  population: number;
  distance_km?: number | null;
};

export type WardDetail = WardSummary & {
  bbox: number[];
  services_list: string[];
  hotlines: { label: string; phone: string }[];
  active: boolean;
};

export type DistrictSummary = {
  district: string;
  ward_count: number;
  total_area_km2: number;
  total_population: number;
  types_count: Record<string, number>;
};

export type WardLocateResult = {
  ward: WardDetail;
  distance_km: number;
  located_inside: boolean;
};

export async function listWards(
  token: string,
  params: {
    keyword?: string;
    district?: string;
    ward_type?: string;
    lat?: number;
    lon?: number;
    limit?: number;
    offset?: number;
  } = {}
): Promise<WardSummary[]> {
  const q = new URLSearchParams();
  if (params.keyword) q.set('keyword', params.keyword);
  if (params.district && params.district !== 'all') q.set('district', params.district);
  if (params.ward_type && params.ward_type !== 'all') q.set('ward_type', params.ward_type);
  if (params.lat !== undefined) q.set('lat', params.lat.toString());
  if (params.lon !== undefined) q.set('lon', params.lon.toString());
  if (params.limit !== undefined) q.set('limit', params.limit.toString());
  if (params.offset !== undefined) q.set('offset', params.offset.toString());
  const qs = q.toString();
  return request<WardSummary[]>(`/api/opencity/wards${qs ? `?${qs}` : ''}`, token);
}

export async function listWardDistricts(token: string): Promise<DistrictSummary[]> {
  return request<DistrictSummary[]>('/api/opencity/wards/districts', token);
}

export async function getWardDetail(id: string, token: string): Promise<WardDetail> {
  return request<WardDetail>(`/api/opencity/wards/${id}`, token);
}

export async function locateWard(lat: number, lon: number, token: string): Promise<WardLocateResult> {
  return request<WardLocateResult>(`/api/opencity/wards/locate?lat=${lat}&lon=${lon}`, token);
}

export async function updateWard(
  id: string,
  data: {
    office_address?: string;
    phone?: string;
    office_hours?: string;
    population?: number;
    services_list?: string[];
  },
  token: string
): Promise<WardDetail> {
  return request<WardDetail>(`/api/opencity/wards/${id}`, token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}






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
  history: { action: string; from_state: string | null; to_state: string | null;
    actor: string; created_at: string; from_unit?: string | null; to_unit?: string | null; note?: string | null }[];
  warnings?: string[];
  urgency?: 'high' | 'normal' | 'low' | null;
  suggested_unit?: string | null;
  has_duplicate?: boolean;
  top_similarity?: number;
  similar_count?: number;
  duplicate_confirmed?: boolean;
  duplicate_reviews?: Record<string, boolean>;
};

export type DuplicateReview = {
  id: string;
  report_id: string;
  similar_report_id: string;
  is_duplicate: boolean;
  reviewed_by: string;
  reviewed_at: string;
};

export type ReportsDashboard = {
  generated_at: string;
  counts: { total: number; new: number; triaged: number; in_progress: number; resolved: number;
    unassigned: number; due_soon: number; overdue: number };
  units: { unit_id: string; total: number; active: number; resolved: number;
    due_soon: number; overdue: number }[];
  urgent: { id: string; title: string; category: string; address: string;
    state: string | null; assigned_unit: string | null; due_at: string | null;
    priority: 'overdue' | 'due_soon' | 'unassigned' }[];
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
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) {
    let detail = `Yêu cầu thất bại (${response.status})`;
    try {
      const body = await response.json();
      detail = typeof body.detail === 'string' ? body.detail : detail;
    } catch { /* Server may return an empty response. */ }
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

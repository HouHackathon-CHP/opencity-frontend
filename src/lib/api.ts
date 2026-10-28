// SPDX-License-Identifier: Apache-2.0
import { apiBase } from './auth';

export type Report = {
  id: string;
  title: string;
  description: string;
  category: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  attachment_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  workflow_id: string | null;
  state: string | null;
  history: { action: string; from_state: string | null; to_state: string; actor: string; created_at: string }[];
  warnings?: string[];
};

export type SurveySummary = {
  id: string; title: string; description: string; status: 'open' | 'closed';
  created_at: string; closed_at: string | null; my_option_id: string | null;
};
export type SurveyDetail = SurveySummary & {
  options: { id: string; label: string; votes: number | null }[];
  total_responses: number | null;
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

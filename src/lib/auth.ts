// SPDX-License-Identifier: Apache-2.0
import { UserManager, type User } from 'oidc-client-ts';

export const authority = import.meta.env.VITE_DXOS_AUTHORITY || 'http://localhost:8081/realms/dxos';
export const apiBase = import.meta.env.VITE_DXOS_API_URL || 'http://localhost:8000';
export const userManager = new UserManager({
  authority,
  client_id: import.meta.env.VITE_DXOS_CLIENT_ID || 'dxos-web',
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  loadUserInfo: false,
  automaticSilentRenew: false,
});

export function rolesOf(user: User | null): string[] {
  if (!user?.access_token) return [];
  try {
    const payload = JSON.parse(atob(user.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Array.isArray(payload.realm_access?.roles) ? payload.realm_access.roles : [];
  } catch { return []; }
}

export function displayName(user: User | null): string {
  return String(user?.profile.name || user?.profile.preferred_username || 'Người dùng');
}

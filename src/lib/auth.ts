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

function accessClaims(user: User | null): Record<string, unknown> | null {
  if (!user?.access_token) return null;
  try {
    return JSON.parse(atob(user.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

export function rolesOf(user: User | null): string[] {
  const access = accessClaims(user)?.realm_access;
  const roles = access && typeof access === 'object' && 'roles' in access ? access.roles : null;
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
}

export function unitOf(user: User | null): string | null {
  const unit = accessClaims(user)?.unit_id;
  return typeof unit === 'string' ? unit : null;
}

export function displayName(user: User | null): string {
  return String(user?.profile.name || user?.profile.preferred_username || 'Người dùng');
}

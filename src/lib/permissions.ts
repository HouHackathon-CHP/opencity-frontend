// SPDX-License-Identifier: Apache-2.0
import type { User } from 'oidc-client-ts';
import { rolesOf } from './auth';

export type Feature = 'reports' | 'bulletins' | 'surveys';
const featureRoles: Record<Feature, string> = {
  reports: 'reports_operator',
  bulletins: 'bulletins_operator',
  surveys: 'surveys_operator',
};

export function canManage(user: User | null, feature: Feature): boolean {
  const roles = rolesOf(user);
  return roles.includes('admin') || roles.includes(featureRoles[feature]);
}

export function managementOf(user: User | null): Feature[] {
  return (Object.keys(featureRoles) as Feature[]).filter((feature) => canManage(user, feature));
}

export function canOpenFeature(user: User | null, feature: Feature): boolean {
  const management = managementOf(user);
  return management.length === 0 || management.includes(feature);
}

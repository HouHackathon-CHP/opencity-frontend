// SPDX-License-Identifier: Apache-2.0
import type { User } from 'oidc-client-ts';
import { rolesOf, unitOf } from './auth';

export type Feature = 'reports' | 'administrative_feedback' | 'business_feedback' | 'bulletins' | 'surveys' | 'appointments' | 'air_quality' | 'hotlines' | 'communications' | 'community_groups' | 'social_feedback' | 'digital_ward' | 'bus_search';
const featureRoles: Record<Feature, string> = {
  reports: 'reports_operator',
  administrative_feedback: 'administrative_feedback_operator',
  business_feedback: 'business_feedback_operator',
  bulletins: 'bulletins_operator',
  surveys: 'surveys_operator',
  appointments: 'appointments_operator',
  air_quality: 'air_quality_operator',
  hotlines: 'hotlines_operator',
  communications: 'communications_operator',
  community_groups: 'community_groups_operator',
  social_feedback: 'social_feedback_operator',
  digital_ward: 'digital_ward_operator',
  bus_search: 'bus_search_operator',
};
const reportUnits = new Set(['infrastructure', 'environment', 'transport', 'intake']);

export function canManage(user: User | null, feature: Feature): boolean {
  const roles = rolesOf(user);
  return roles.includes('admin') || (feature === 'reports' && roles.includes('reports_dispatcher')) ||
    (roles.includes(featureRoles[feature]) &&
    (feature !== 'reports' || reportUnits.has(unitOf(user) || '')));
}

export function canDispatch(user: User | null): boolean {
  const roles = rolesOf(user);
  return roles.includes('admin') || roles.includes('reports_dispatcher');
}

export function managementOf(user: User | null): Feature[] {
  return (Object.keys(featureRoles) as Feature[]).filter((feature) => canManage(user, feature));
}

const publicFeatures = new Set<Feature>(['bulletins', 'air_quality', 'hotlines', 'bus_search']);

export function canOpenFeature(user: User | null, feature: Feature): boolean {
  if (publicFeatures.has(feature)) return true;
  const management = managementOf(user);
  return management.length === 0 || management.includes(feature);
}

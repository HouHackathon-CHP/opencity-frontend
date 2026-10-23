// SPDX-License-Identifier: Apache-2.0
import raw from '../../services/catalog.json';

export type ServiceKind = 'native' | 'connector' | 'link';
export type ServiceStatus = 'available' | 'planned' | 'needs-integration';
export type Category = { id: string; name: string; icon: string };
export type Service = {
  id: string;
  category: string;
  name: string;
  description: string;
  icon: string;
  kind: ServiceKind;
  status: ServiceStatus;
  route?: string;
  externalUrl?: string;
};

export const categories = raw.categories as Category[];
export const services = raw.services as Service[];
export const featured = ['field-reports', 'report-map', 'service-booking', 'warnings', 'air-quality', 'find-bus'];

export function serviceHref(service: Service): string | undefined {
  if (service.status !== 'available') return undefined;
  return service.kind === 'native' ? service.route : service.externalUrl;
}

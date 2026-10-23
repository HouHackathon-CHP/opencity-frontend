// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../services/catalog.json', import.meta.url), 'utf8'));
const allowedKinds = new Set(['native', 'connector', 'link']);
const allowedStatuses = new Set(['available', 'planned', 'needs-integration']);
const ids = new Set();
const categoryIds = new Set(catalog.categories.map((category) => category.id));

for (const service of catalog.services) {
  if (!service.id || ids.has(service.id)) throw new Error(`Invalid or duplicate service ID: ${service.id}`);
  ids.add(service.id);
  if (!categoryIds.has(service.category)) throw new Error(`Unknown category: ${service.id}`);
  if (!allowedKinds.has(service.kind) || !allowedStatuses.has(service.status)) {
    throw new Error(`Invalid kind or status: ${service.id}`);
  }
  if (!service.name || !service.description || !service.icon) throw new Error(`Missing metadata: ${service.id}`);
  if (service.status === 'available' && service.kind === 'native' && !service.route) {
    throw new Error(`Available native service needs a route: ${service.id}`);
  }
  if (service.status === 'available' && service.kind !== 'native' && !service.externalUrl) {
    throw new Error(`Available external service needs a URL: ${service.id}`);
  }
  if (service.externalUrl && !/^https:\/\//.test(service.externalUrl)) {
    throw new Error(`External URL must use HTTPS: ${service.id}`);
  }
}

console.log(`Catalog valid: ${catalog.categories.length} categories, ${ids.size} services.`);

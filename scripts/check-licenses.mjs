// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const approved = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '(MIT OR Apache-2.0)']);
const failures = [];
let count = 0;
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/')) continue;
  count++;
  if (!approved.has(pkg.license)) failures.push(`${path}: ${pkg.license || 'UNKNOWN'}`);
}
if (failures.length) {
  console.error('Dependencies requiring manual OSI review:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`License metadata checked: ${count} dependency entries use MIT, ISC, Apache-2.0, BSD or (MIT OR Apache-2.0).`);
}

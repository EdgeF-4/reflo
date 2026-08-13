#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const manifests = [
  'package.json',
  'apps/api/package.json',
  'apps/mcp/package.json',
  'apps/web/package.json',
  'packages/domain/package.json',
  'packages/widget/package.json',
];
const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const failures = [];

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(
      `could not read dependency manifest ${file}: ${error.message}. Next: restore valid JSON in that file, then rerun npm run test:dependencies.`,
    );
    process.exit(1);
  }
}

for (const file of manifests) {
  const manifest = readJson(file);
  for (const section of ['dependencies', 'devDependencies', 'overrides']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (typeof version !== 'string' || !exact.test(version)) {
        failures.push(`${file} ${section}.${name} is not exact-pinned: ${String(version)}`);
      }
    }
  }
}

const lock = readJson('package-lock.json');
const cron = Object.entries(lock.packages ?? {}).find(
  ([path]) => path === 'node_modules/cron-parser' || path.endsWith('/node_modules/cron-parser'),
)?.[1];
if (!cron || !/^5\./.test(cron.version) || cron.deprecated) {
  failures.push(
    `cron-parser must resolve to a supported 5.x release, got ${cron?.version ?? 'missing'}`,
  );
}

const expectedHolds = new Map([
  ['apps/api/package.json:typescript', '5.9.3'],
  ['apps/mcp/package.json:zod', '3.25.76'],
  ['apps/web/package.json:tailwindcss', '3.4.19'],
  ['apps/api/package.json:@types/node', '20.19.43'],
]);
for (const [key, expected] of expectedHolds) {
  const [file, name] = key.split(':');
  const manifest = readJson(file);
  const actual = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
  if (actual !== expected) failures.push(`${key} expected ${expected}, got ${actual}`);
}

if (failures.length) {
  console.error(
    `dependency contract failed:\n${failures.map((line) => `- ${line}`).join('\n')}\nNext: pin the dependency exactly, update DEPENDENCIES.md, regenerate the lockfile, and retry.`,
  );
  process.exit(1);
}

console.log(
  `dependency contract passed for ${manifests.length} manifests; direct versions are exact and cron-parser ${cron.version} is supported.`,
);

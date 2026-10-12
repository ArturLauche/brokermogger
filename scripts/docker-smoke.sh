#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
# Check the actual shipped publication settings without resolving any secrets.
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
for (const file of ['docker-compose.prod.yml', 'docker-compose.yml', 'docker/compose.smoke.yml']) {
  const config = JSON.parse(execFileSync('docker', ['compose', '--profile', 'app', '-f', file, 'config', '--no-interpolate', '--format', 'json'], { encoding: 'utf8' }));
  const ports = config.services.app.ports;
  assert.ok(ports.length > 0 && ports.every(port => ['127.0.0.1', '::1'].includes(port.host_ip)), `${file} must publish app ports only on loopback.`);
}
process.stdout.write('Shipped Compose app port boundaries passed.\n');
JS
mkdir -p .tmp
smoke_directory=$(mktemp -d .tmp/docker-smoke.XXXXXX)
smoke_environment="$smoke_directory/runtime.env"
smoke_project="brokermogger-smoke-$(date +%s)-$RANDOM"

node - "$smoke_environment" <<'JS'
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const values = {
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  AUTH_SECRET: randomBytes(48).toString('base64url'),
  ENCRYPTION_KEYS: `smoke:${randomBytes(32).toString('base64')}`,
  BLIND_INDEX_KEY: randomBytes(32).toString('base64'),
};
writeFileSync(process.argv[2], Object.entries(values).map(([k,v]) => `${k}=${v}`).join('\n')+'\n', { mode: 0o600 });
JS

smoke_compose=(docker compose --project-name "$smoke_project" --env-file "$smoke_environment" -f docker/compose.smoke.yml)
cleanup_smoke() {
  "${smoke_compose[@]}" down --volumes --remove-orphans > "$smoke_directory/cleanup.log" 2>&1 || true
  rm -f "$smoke_environment"
}
trap cleanup_smoke EXIT

"${smoke_compose[@]}" build
"${smoke_compose[@]}" up -d --wait app worker
"${smoke_compose[@]}" exec -T worker node --import tsx scripts/docker-smoke.ts prepare
"${smoke_compose[@]}" exec -T worker node --import tsx scripts/docker-smoke.ts wait
verify_app_downloads() {
"${smoke_compose[@]}" exec -T app node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const info = JSON.parse(await readFile('/data/objects/.docker-smoke-info', 'utf8'));
for (const dependency of ['typescript', 'eslint', 'vitest', '@playwright/test', 'prisma']) {
  try { require.resolve(dependency); throw new Error(`Development dependency remains: ${dependency}`); }
  catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
for (const [path, expectedStatus] of [['/', 200], ['/smoke-missing-route', 404]]) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, { signal: AbortSignal.timeout(15000) });
  const html = await response.text();
  if (response.status !== expectedStatus) throw new Error(`Unexpected public status ${response.status}.`);
  if (!html.includes('http://127.0.0.1:3099/opengraph-image')) throw new Error('Runtime Open Graph origin is incorrect.');
  if (path === '/' && !html.includes('rel="canonical" href="http://127.0.0.1:3099"')) throw new Error('Runtime canonical origin is incorrect.');
  const csp = response.headers.get('content-security-policy');
  if (!csp?.includes("'nonce-") || /script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) throw new Error('Production script policy is not strict.');
  if ([...html.matchAll(/<script\b[^>]*>/g)].some(([tag]) => !tag.includes('nonce="'))) throw new Error('A production script lacks a nonce.');
}
for (const [path, kind] of [
  [`/api/evidence/${info.evidenceId}/download`, 'evidence'],
  [`/api/reports/${info.reportId}/download`, 'report'],
  [`/api/account/exports/${info.exportId}/download`, 'export'],
  [`/api/account/exports/${info.sensitiveExportId}/download`, 'sensitive-export'],
]) {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    headers: { cookie: `authjs.session-token=${info.sessionToken}` },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Authenticated ${kind} download failed (${response.status}).`);
  if (!response.headers.get('content-disposition')?.includes('attachment')) throw new Error(`Missing ${kind} download header.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (kind.endsWith('export')) {
    const data = JSON.parse(bytes.toString('utf8'));
    if (!data) throw new Error('Empty account export.');
    if (bytes.includes(Buffer.from('Alex Smoke')) !== (kind === 'sensitive-export')) throw new Error('Export masking or profile decryption failed.');
  } else if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`Invalid ${kind} PDF.`);
}
process.stdout.write('Docker authenticated downloads and app runtime checks passed.\n');
JS
}
verify_app_downloads
"${smoke_compose[@]}" exec -T worker node --import tsx scripts/docker-smoke.ts verify

# Stop both writers and restore to a second disposable database with the same keys.
"${smoke_compose[@]}" stop app worker
"${smoke_compose[@]}" run --rm -T --no-deps worker node --import tsx scripts/docker-smoke.ts prepare-recovery
"${smoke_compose[@]}" exec -T postgres pg_dump -U brokermogger -d brokermogger_smoke_test --format=custom --no-owner --no-privileges > "$smoke_directory/database.dump"
"${smoke_compose[@]}" run --rm -T --no-deps worker tar -C /data/objects -cf - . > "$smoke_directory/objects.tar"
"${smoke_compose[@]}" exec -T postgres createdb -U brokermogger brokermogger_smoke_restore_test
"${smoke_compose[@]}" exec -T postgres pg_restore -U brokermogger -d brokermogger_smoke_restore_test --exit-on-error --no-owner --no-privileges < "$smoke_directory/database.dump"
# These are this script's private synthetic volumes, never operator storage.
"${smoke_compose[@]}" run --rm -T --no-deps worker find /data/objects -type f -delete
"${smoke_compose[@]}" run --rm -T --no-deps worker tar -C /data/objects -xf - < "$smoke_directory/objects.tar"
printf 'SMOKE_DATABASE=brokermogger_smoke_restore_test\n' >> "$smoke_environment"
"${smoke_compose[@]}" run --rm -T --no-deps migrate
"${smoke_compose[@]}" up -d --no-deps --force-recreate --wait app worker
verify_app_downloads
"${smoke_compose[@]}" exec -T worker node --import tsx scripts/docker-smoke.ts wait-recovery
"${smoke_compose[@]}" exec -T worker node --import tsx scripts/docker-smoke.ts verify
printf 'Docker database/object restore and repeated migration rehearsal passed.\n'

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root, files, metadata, downloadPath } from './validate-site.mjs';

const origin = 'https://director-orchestr.pages.dev/';
const expectedCommit = process.env.GITHUB_SHA;
assert(/^[a-f0-9]{40}$/.test(expectedCommit ?? ''), 'Missing GitHub commit SHA.');
const sha = data => createHash('sha256').update(data).digest('hex');
async function get(path, options = {}) {
  const url = new URL(path, origin);
  url.searchParams.set('deploy', expectedCommit);
  return fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000), ...options });
}
const publishedFiles = files.filter(path => !relative(root, path).startsWith('_') && !path.endsWith('.apk'));
const filename = downloadPath.split('/').at(-1);
function downloadHeaders(response) {
  assert.equal(response.status, 200, 'Direct download must return the file without redirects.');
  assert.equal(response.headers.get('content-type')?.split(';')[0], 'application/vnd.android.package-archive');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="' + filename + '"');
  assert.equal(Number(response.headers.get('content-length')), metadata.sizeBytes, 'Direct Content-Length differs.');
}
async function verifyApk(url, direct = false) {
  const response = await fetch(url, {
    redirect: direct ? 'manual' : 'follow',
    headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(60000)
  });
  assert(response.ok, 'APK download failed: HTTP ' + response.status);
  if (direct) downloadHeaders(response);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    assert(size <= metadata.sizeBytes, 'APK is larger than declared in latest.json.');
    hash.update(chunk);
  }
  assert.equal(size, metadata.sizeBytes, 'Downloaded APK size differs.');
  assert.equal(hash.digest('hex'), metadata.sha256, 'Downloaded APK checksum differs.');
}
let lastError;
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const marker = await get('deploy-info.json');
    assert(marker.ok, 'Deployment marker is not available yet.');
    assert.equal((await marker.json()).commit, expectedCommit, 'The live site still serves a different commit.');
    for (const path of publishedFiles) {
      const name = relative(root, path).split('\\').join('/');
      const response = await get(name === 'index.html' ? '' : name);
      assert(response.ok, name + ': HTTP ' + response.status);
      assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(readFileSync(path)), 'Live file differs: ' + name);
    }
    const redirect = await fetch(new URL('/downloads/Director-Orchestrator-0.2.0-core-preview.apk', origin), {
      redirect: 'manual', signal: AbortSignal.timeout(20000)
    });
    assert.equal(redirect.status, 302, 'The old APK URL must redirect to GitHub.');
    const expectedOldUrl = readFileSync(root + '/_redirects', 'utf8').split('\n').find(line => line.startsWith('/downloads/Director-Orchestrator-0.2.0-core-preview.apk ')).trim().split(/\s+/)[1];
    assert.equal(redirect.headers.get('location'), expectedOldUrl);
    // Use the exact customer-facing URL, not just the deploy-marker URL.
    const head = await fetch(metadata.downloadUrl, { method: 'HEAD', redirect: 'manual',
      headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(20000) });
    downloadHeaders(head);
    await verifyApk(metadata.downloadUrl, true);
    const end = Math.min(1023, metadata.sizeBytes - 1);
    const range = await fetch(metadata.downloadUrl, { redirect: 'manual',
      headers: { Range: 'bytes=0-' + end, 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(20000) });
    assert.equal(range.status, 206, 'Direct download must support resuming with HTTP Range.');
    assert.equal(range.headers.get('content-range'), 'bytes 0-' + end + '/' + metadata.sizeBytes);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), readFileSync(root + downloadPath).subarray(0, end + 1));
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    console.log('Live verification attempt ' + attempt + '/6: ' + error.message);
    if (attempt < 6) await delay(10000);
  }
}
if (lastError) throw lastError;
await verifyApk(metadata.apkUrl);
console.log('PASS: live site matches commit ' + expectedCommit + '; old URL redirects; Cloudflare and GitHub APK size and SHA-256 match; direct HEAD, attachment headers and HTTP Range verified.');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '## Publication verified\n\nSite: ' + origin + '\n\nCommit: `' + expectedCommit + '`\n\nWebsite files, old redirect, Cloudflare and GitHub APK bytes verified. Direct download headers, HEAD and HTTP Range verified. Android/browser completion and installation remain phone tests.\n');


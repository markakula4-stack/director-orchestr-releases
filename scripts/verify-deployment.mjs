import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root, files, metadata } from './validate-site.mjs';

const origin = 'https://director-orchestr.pages.dev/';
const expectedCommit = process.env.GITHUB_SHA;
assert(/^[a-f0-9]{40}$/.test(expectedCommit ?? ''), 'Missing GitHub commit SHA.');
const sha = data => createHash('sha256').update(data).digest('hex');
async function get(path, options = {}) {
  const url = new URL(path, origin);
  url.searchParams.set('deploy', expectedCommit);
  return fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000), ...options });
}
const publishedFiles = files.filter(path => !relative(root, path).startsWith('_'));
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
    lastError = null;
    break;
  } catch (error) {
    lastError = error;
    console.log('Live verification attempt ' + attempt + '/6: ' + error.message);
    if (attempt < 6) await delay(10000);
  }
}
if (lastError) throw lastError;
const response = await fetch(metadata.apkUrl, { signal: AbortSignal.timeout(60000) });
assert(response.ok, 'APK download failed: HTTP ' + response.status);
const hash = createHash('sha256');
let size = 0;
for await (const chunk of response.body) {
  size += chunk.byteLength;
  assert(size <= metadata.sizeBytes, 'APK is larger than declared in latest.json.');
  hash.update(chunk);
}
assert.equal(size, metadata.sizeBytes, 'Downloaded APK size differs.');
assert.equal(hash.digest('hex'), metadata.sha256, 'Downloaded APK checksum differs.');
console.log('PASS: live site matches commit ' + expectedCommit + '; old URL redirects; GitHub APK size and SHA-256 match.');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '## Publication verified\n\nSite: ' + origin + '\n\nCommit: `' + expectedCommit + '`\n\nWebsite files, old download redirect, APK size and SHA-256 verified. Android installation is a separate phone test.\n');


import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publishRelease } from './publish-release.mjs';

const repo = 'markakula4-stack/director-orchestr-releases';
const artifact = Buffer.from('isolated release test fixture');
const sha256 = createHash('sha256').update(artifact).digest('hex');
const tag = 'v0.3.1-preview';
const filename = 'Director-Orchestrator-0.3.1-core-preview.apk';
const apkUrl = `https://github.com/${repo}/releases/download/${tag}/${filename}`;
const asset = { name: filename, state: 'uploaded', size: artifact.length, digest: 'sha256:' + sha256, browser_download_url: apkUrl };
const release = { id: 1, tag_name: tag, prerelease: true, draft: false, assets: [asset] };
const metadata = { channel: 'preview', variant: 'core', versionName: '0.3.1-preview', apkUrl, sizeBytes: artifact.length, sha256 };
const base = { metadata, artifact, notes: 'Test release notes', repo, commit: 'a'.repeat(40), token: 'fixture-token' };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('new release stays draft until a matching APK is uploaded', async () => {
  const calls = [];
  await publishRelease({ ...base, request: async (url, options) => {
    calls.push([url, options]);
    if (calls.length === 1) return response({}, 404);
    if (calls.length === 2) return response([]);
    if (calls.length === 3) { assert.equal(JSON.parse(options.body).draft, true); return response({ ...release, draft: true, assets: [] }, 201); }
    if (calls.length === 4) { assert(url.startsWith('https://uploads.github.com/')); assert.equal(options.body, artifact); return response({ ...asset, browser_download_url: apkUrl.replace(tag, 'untagged-temporary') }, 201); }
    if (calls.length === 5) { assert.equal(options.method, 'PATCH'); assert.equal(JSON.parse(options.body).draft, false); }
    else assert.equal(options.method, undefined);
    return response(release);
  } });
  assert.equal(calls.length, 6);
});

test('an uploaded draft with a temporary URL is resumed without duplicate upload', async () => {
  const methods = [];
  const draft = { ...release, draft: true, assets: [{ ...asset, browser_download_url: apkUrl.replace(tag, 'untagged-temporary') }] };
  await publishRelease({ ...base, request: async (_url, options) => {
    methods.push(options.method ?? 'GET');
    if (methods.length === 1) return response({}, 404);
    if (methods.length === 2) return response([draft]);
    return response(release);
  } });
  assert.deepEqual(methods, ['GET', 'GET', 'PATCH', 'GET']);
});

test('retry verifies an existing asset without any write', async () => {
  let calls = 0;
  await publishRelease({ ...base, request: async (_url, options) => { calls++; assert.equal(options.method, undefined); return response(release); } });
  assert.equal(calls, 1);
});

test('wrong local APK is rejected before any network request', async () => {
  await assert.rejects(publishRelease({ ...base, artifact: Buffer.from('wrong'), request: async () => { throw new Error('Network must not be used'); } }), /Local APK size differs/);
});

test('different remote checksum is never overwritten', async () => {
  let calls = 0;
  await assert.rejects(publishRelease({ ...base, request: async () => { calls++; return response({ ...release, assets: [{ ...asset, digest: 'sha256:' + '0'.repeat(64) }] }); } }), /refusing to overwrite/);
  assert.equal(calls, 1);
});

test('upload failure leaves the draft unpublished', async () => {
  const methods = [];
  await assert.rejects(publishRelease({ ...base, request: async (_url, options) => {
    methods.push(options.method ?? 'GET');
    return methods.length === 1 ? response({ ...release, draft: true, assets: [] }) : response({}, 502);
  } }), /HTTP 502/);
  assert.deepEqual(methods, ['GET', 'POST']);
});

test('an existing stable release is not changed into a preview', async () => {
  let calls = 0;
  await assert.rejects(publishRelease({ ...base, request: async () => { calls++; return response({ ...release, prerelease: false }); } }), /different channel/);
  assert.equal(calls, 1);
});

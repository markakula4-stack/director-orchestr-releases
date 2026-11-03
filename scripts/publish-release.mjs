import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const expectedRepo = 'markakula4-stack/director-orchestr-releases';
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

export async function publishRelease({ metadata, artifact, notes, repo, commit, token, request = fetch }) {
  assert.equal(repo, expectedRepo, 'Unexpected repository.');
  assert.match(commit ?? '', /^[a-f0-9]{40}$/);
  assert(token, 'Missing GITHUB_TOKEN.');
  assert.equal(metadata.channel, 'preview');
  assert.equal(metadata.variant, 'core');
  const version = /^([0-9]+\.[0-9]+\.[0-9]+)-preview$/.exec(metadata.versionName);
  assert(version, 'Only explicit core preview releases are supported.');
  const tag = 'v' + metadata.versionName;
  const filename = 'Director-Orchestrator-' + version[1] + '-core-preview.apk';
  const expectedUrl = `https://github.com/${repo}/releases/download/${tag}/${filename}`;
  assert.equal(metadata.apkUrl, expectedUrl);
  assert.equal(artifact.length, metadata.sizeBytes, 'Local APK size differs.');
  assert.equal(digest(artifact), 'sha256:' + metadata.sha256, 'Local APK checksum differs.');
  assert(notes.trim(), 'Release notes are required.');
  const api = `https://api.github.com/repos/${repo}/releases`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' };
  async function json(url, options = {}, allowMissing = false) {
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(60000), ...options,
      headers: { ...headers, ...options.headers } });
    if (allowMissing && response.status === 404) return null;
    assert(response.ok, `GitHub release request failed: HTTP ${response.status}`);
    return response.json();
  }
  const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let release = await json(api + '/tags/' + encodeURIComponent(tag), {}, true);
  if (!release) release = await json(api, post({ tag_name: tag, target_commitish: commit,
    name: 'Директор-оркестратор ' + metadata.versionName, body: notes,
    draft: true, prerelease: true, make_latest: 'false' }));
  assert.equal(release.tag_name, tag);
  assert.equal(release.prerelease, true, 'An existing release has a different channel.');
  assert(Number.isSafeInteger(release.id) && release.id > 0);
  let asset = (release.assets ?? []).find(item => item.name === filename);
  if (!asset) {
    const url = `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(filename)}`;
    asset = await json(url, { method: 'POST', headers: { 'Content-Type': 'application/vnd.android.package-archive' }, body: artifact });
  }
  // Never replace an existing asset, even when a run is retried.
  assert.equal(asset.state, 'uploaded');
  assert.equal(asset.size, metadata.sizeBytes, 'Published APK size differs.');
  assert.equal(asset.digest, digest(artifact), 'Published APK checksum differs; refusing to overwrite.');
  assert.equal(asset.browser_download_url, expectedUrl);
  if (release.draft) release = await json(api + '/' + release.id, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft: false, prerelease: true, make_latest: 'false' })
  });
  assert.equal(release.draft, false);
  assert.equal(release.tag_name, tag);
  return { tag, apkUrl: expectedUrl, sha256: metadata.sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadata = JSON.parse(readFileSync('site/latest.json', 'utf8'));
  const filename = new URL(metadata.apkUrl).pathname.split('/').at(-1);
  const directory = 'releases/v' + metadata.versionName;
  const result = await publishRelease({ metadata, artifact: readFileSync(directory + '/' + filename),
    notes: readFileSync(directory + '/NOTES.md', 'utf8'), repo: process.env.GITHUB_REPOSITORY,
    commit: process.env.GITHUB_SHA, token: process.env.GITHUB_TOKEN });
  console.log('APK release is published and verified: ' + result.apkUrl);
}

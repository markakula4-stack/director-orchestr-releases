import assert from 'node:assert/strict';

// Owner-requested withdrawal of this one faulty preview. Never a general deletion tool.
export async function withdraw046({ repo, token, request = fetch }) {
  assert.equal(repo, 'markakula4-stack/director-orchestr-releases');
  assert(token, 'Missing GITHUB_TOKEN.');
  const api = `https://api.github.com/repos/${repo}`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' };
  async function get(path) {
    const r = await request(api + path, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (r.status === 404) return null;
    assert(r.ok, `Withdrawal lookup failed: HTTP ${r.status}`);
    return r.json();
  }
  async function remove(path) {
    const r = await request(api + path, { method: 'DELETE', headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
    assert(r.status === 204 || r.status === 404, `Withdrawal failed: HTTP ${r.status}`);
  }
  const release = await get('/releases/tags/v0.4.6-preview');
  const ref = await get('/git/ref/tags/v0.4.6-preview');
  // Verify both identities before making any change.
  if (release) {
    assert.equal(release.id, 433213929, 'Release identity changed; refusing deletion.');
    assert.equal(release.tag_name, 'v0.4.6-preview');
    assert.equal(release.prerelease, true);
    assert((release.assets ?? []).every(a => a.name === 'Director-Orchestrator-0.4.6-preview.apk'));
  }
  if (ref) {
    assert.equal(ref.ref, 'refs/tags/v0.4.6-preview');
    assert.equal(ref.object?.sha, 'c4896c3cadc67e286a91838ada6f3fc8531752dd', 'Withdrawn tag moved; refusing deletion.');
    assert.equal(ref.object?.type, 'commit');
  }
  if (release) await remove('/releases/' + release.id);
  if (ref) await remove('/git/refs/tags/v0.4.6-preview');
  assert.equal(await get('/releases/tags/v0.4.6-preview'), null, 'Release remains available.');
  assert.equal(await get('/git/ref/tags/v0.4.6-preview'), null, 'Tag remains available.');
  return '0.4.6 release, attached APK and tag withdrawn; absence verified.';
}

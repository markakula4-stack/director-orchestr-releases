import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const root = resolve('site');
export const repo = 'https://github.com/markakula4-stack/director-orchestr-releases';
export const read = path => readFileSync(resolve(root, path));
export const metadata = JSON.parse(read('latest.json'));
const html = read('index.html').toString();

assert.equal(metadata.schemaVersion, 1);
assert.equal(metadata.applicationId, 'app.hashqueue');
assert.equal(metadata.channel, 'preview');
assert(['core', 'director'].includes(metadata.variant), 'Unsupported preview variant');
assert(!/APK_(?:SHA256|SIZE_BYTES|SIZE_KIB)/.test(html), 'Unresolved APK metadata placeholder');
assert.match(metadata.sha256, /^[0-9a-f]{64}$/);
assert(Number.isSafeInteger(metadata.sizeBytes) && metadata.sizeBytes > 0);
assert(Number.isSafeInteger(metadata.versionCode) && metadata.versionCode > 0);
assert.match(metadata.versionName, /^[0-9A-Za-z.+-]+$/);
assert(html.includes(metadata.versionName), 'Displayed version differs from latest.json');
assert(html.includes(metadata.sha256), 'Displayed SHA-256 differs from latest.json');
const apk = new URL(metadata.apkUrl);
assert.equal(apk.origin, 'https://github.com');
assert.equal(apk.search + apk.hash + apk.username + apk.password, '');
const prefix = repo + '/releases/download/';
assert(metadata.apkUrl.startsWith(prefix));
const parts = metadata.apkUrl.slice(prefix.length).split('/');
assert.equal(parts.length, 2);
assert.equal(parts[0], 'v' + metadata.versionName);
const version = /^([0-9]+\.[0-9]+\.[0-9]+(?:-restore)?)-preview$/.exec(metadata.versionName);
assert(version, 'Expected explicit preview version');
assert.equal(parts[1], 'Director-Orchestrator-' + version[1] + (metadata.variant === 'core' ? '-core-preview.apk' : '-preview.apk'));
assert.equal(metadata.releaseUrl, repo + '/releases/tag/' + parts[0]);
export const downloadPath = '/downloads/' + parts[1];
assert.equal(metadata.downloadUrl, 'https://director-orchestr.pages.dev' + downloadPath);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const mirror = read('.' + downloadPath);
assert.equal(mirror.length, metadata.sizeBytes, 'Direct APK size differs.');
assert.equal(digest(mirror), metadata.sha256, 'Direct APK checksum differs.');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
const anchors = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g)];
const downloads = anchors.filter(m => m[1].endsWith('.apk'));
const direct = downloads.filter(a => a[1] === downloadPath);
const backup = downloads.filter(a => a[1] === metadata.apkUrl);
assert.equal(direct.length, 5, 'Expected five direct APK download buttons');
assert.equal(backup.length, 1, 'Expected one GitHub fallback download');
assert.equal(downloads.length, direct.length + backup.length, 'Unexpected APK link');
for (const a of direct) assert(a[0].includes('download="' + parts[1] + '"'), 'Direct download filename is missing');
assert(!/\sdownload(?:\s|=|>)/.test(backup[0][0]), 'Cross-origin backup relies on attachment headers');
assert(anchors.some(a => a[1] === metadata.releaseUrl));
for (const a of anchors) {
  if (a[1].startsWith('#') && a[1] !== '#') assert(ids.includes(a[1].slice(1)), 'Missing anchor: ' + a[1]);
}
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  assert(statSync(resolve(root, '.' + match[1])).isFile(), 'Missing asset: ' + match[1]);
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    assert(!entry.isSymbolicLink(), 'Symlinks are not allowed in the published site');
    return entry.isDirectory() ? walk(path) : [path];
  });
}
export const files = walk(root);
for (const path of files) {
  assert(!/\.(pem|key|env)$/i.test(path), 'Unexpected file in the website');
  if (path.endsWith('.apk')) {
    const name = relative(root, path).split('\\').join('/');
    const match = /^downloads\/(Director-Orchestrator-(\d+\.\d+\.\d+(?:-restore)?)(?:-core)?-preview\.apk)$/.exec(name);
    assert(match, 'APK is outside the approved download directory');
    const original = readFileSync(resolve('releases', 'v' + match[2] + '-preview', match[1]));
    assert.equal(digest(readFileSync(path)), digest(original), 'Mirror differs from original APK: ' + name);
  }
  if (path.endsWith('.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
}
const oldPath = '/downloads/Director-Orchestrator-0.2.0-core-preview.apk';
assert(read('_redirects').toString().split('\n').some(line => line.startsWith(oldPath + ' https://github.com/markakula4-stack/director-orchestr-releases/releases/download/v0.2.0-preview/')));
assert(read('_headers').toString().includes('Content-Security-Policy:'));
assert(read('_headers').toString().includes('/downloads/:filename\n  Content-Type: application/vnd.android.package-archive\n  Content-Disposition: attachment; filename=":filename"'));
console.log('Validated ' + files.length + ' site files, five direct APK links, GitHub fallback and byte-identical mirror.');


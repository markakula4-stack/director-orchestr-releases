import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';

const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
assert(account, 'Add the repository secret CLOUDFLARE_ACCOUNT_ID first.');
assert(token, 'Add the repository secret CLOUDFLARE_API_TOKEN first.');
assert(/^[a-f0-9]{32}$/i.test(account), 'CLOUDFLARE_ACCOUNT_ID must be the 32-character account ID.');
assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? ''), 'Missing GitHub commit SHA.');
assert(process.env.GITHUB_OUTPUT, 'Run this script inside GitHub Actions.');
const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + '/pages/projects/director-orchestr', {
  headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000)
});
assert(response.ok, 'Cannot read existing Cloudflare project; HTTP ' + response.status + '. Check the account ID and token permissions.');
const data = await response.json();
assert(data.success && data.result, 'Cloudflare did not return the project.');
assert.equal(data.result.name, 'director-orchestr');
assert.equal(data.result.subdomain, 'director-orchestr.pages.dev', 'Unexpected project address; deployment stopped.');
const branch = data.result.production_branch;
assert(typeof branch === 'string' && branch.length > 0 && !/[\r\n]/.test(branch), 'Cloudflare did not return a valid production branch.');
appendFileSync(process.env.GITHUB_OUTPUT, 'production_branch=' + branch + '\n');
writeFileSync('site/deploy-info.json', JSON.stringify({
  schemaVersion: 1, commit: process.env.GITHUB_SHA, publishedBy: 'GitHub Actions'
}, null, 2) + '\n');
console.log('Existing Cloudflare project and production branch confirmed.');


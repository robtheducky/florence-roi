import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampedPage } from '../scripts/stamp-versions.js';

for (const page of ['index.html', 'build.html', 'ma-opportunities.html']) {
  test(`${page} script versions match the current files (run: node scripts/stamp-versions.js)`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.equal(html, stampedPage(html));
  });
}

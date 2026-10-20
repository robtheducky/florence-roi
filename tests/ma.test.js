import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { tierFor, nearMeasures, membersToMove, dollarsAtStake, measureLabel } from '../js/model/ma.js';

const { contracts } = JSON.parse(readFileSync(new URL('./fixtures/ma_fixture.json', import.meta.url)));
const byId = Object.fromEntries(contracts.map((c) => [c.id, c]));
const shares = { shareDm: 0.25, shareRas: 0.4, shareStatin: 0.45, shareCbp: 0.5, shareSpc: 0.12, shareSupd: 0.2 };
const money = { benchmarkPMPM: 1200, qbpPct: 0.05 };

test('tier boundaries: a gap equal to the threshold counts, just above does not', () => {
  assert.equal(tierFor(byId.H0001, 2), 1); // dm gap 2.0 <= 2.0
  assert.equal(tierFor(byId.H0001, 1.5), null); // gaps 2 and 3 > 1.5; overall 3.5 so not tier 2
  assert.equal(tierFor(byId.H0002, 1), 1);
  assert.equal(tierFor(byId.H0002, 0.5), null);
});

test('tier 2 uses the cushion above the current cut, tier 3 catches the rest', () => {
  assert.equal(tierFor(byId.H0003, 2), 2); // 5-star measures, cushion 0 and 2
  assert.equal(tierFor(byId.H0004, 2), null); // cushion 3 > 2, no gaps (all 5 stars)
  assert.equal(tierFor(byId.H0004, 3), 2);
  assert.equal(tierFor(byId.H0005, 1), 3); // overall 3.0, ras gap 1
});

test('gap and cushion lists', () => {
  assert.deepEqual(nearMeasures(byId.H0001, 2), { up: ['dm'], down: ['dm', 'ras'] });
  assert.deepEqual(nearMeasures(byId.H0001, 3).up, ['dm', 'ras']);
});

test('5-star measures and null rates do not break anything', () => {
  assert.equal(measureLabel(byId.H0003.measures.dm).note, 'top star');
  assert.equal(measureLabel(byId.H0005.measures.dm), null);
  assert.equal(tierFor(byId.H0006, 5), null); // no measures at all
  assert.equal(membersToMove(byId.H0005, 1, shares), null); // no enrollment
  assert.equal(dollarsAtStake(byId.H0005, 1, money), null); // tier 3 and no enrollment
});

test('members to move and dollars at stake', () => {
  // tier 1: dm only within 2 pp: 100,000 x 25% x 2 / 100
  assert.equal(membersToMove(byId.H0001, 2, shares), 500);
  // 100,000 x $1,200 x 12 x 5%
  assert.equal(dollarsAtStake(byId.H0001, 2, money), 72_000_000);
  // tier 2 counts the cushion, with a 0.5 point floor: 80,000 x (25% x 0.5 + 40% x 2) / 100
  assert.equal(Math.round(membersToMove(byId.H0003, 2, shares)), 740);
  assert.equal(dollarsAtStake(byId.H0004, 2, money), null);
});

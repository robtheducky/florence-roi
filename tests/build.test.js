import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildCase, interventionStatus, schedule } from '../js/model/build.js';
import { acoDefaults } from '../js/model/aco.js';
import { STEPS, INTERVENTIONS } from '../js/build/data.js';

const data = JSON.parse(readFileSync(new URL('../data/acos.json', import.meta.url)));
const aco = data.acos.find((a) => a.id === 'A1001');
const values = { ...acoDefaults(aco, data.medians).values, prevCOPD: 11, engFte: 1, engRate: 100, rnRate: 58, vendorWeeks: 8 };
const run = new Set(['meds', 'hf', 'toc']);
const opts = { medians: data.medians };
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `expected ~${b}, got ${a}`);

test('every step skip names a valid effect', () => {
  const ids = new Set(INTERVENTIONS.map((i) => i.id));
  for (const s of STEPS) {
    const { blocks, weakens } = s.skip;
    assert.ok(blocks || weakens, s.id);
    if (Array.isArray(blocks)) blocks.forEach((id) => assert.ok(ids.has(id), `${s.id} -> ${id}`));
    if (weakens && weakens.applies !== 'all') weakens.applies.forEach((id) => assert.ok(ids.has(id)));
    for (const d of s.after) assert.ok(STEPS.findIndex((x) => x.id === d) < STEPS.indexOf(s), `${s.id} listed after ${d}`);
  }
});

test('nothing skipped: everything running runs fully', () => {
  const st = interventionStatus(new Set(), run);
  for (const id of run) assert.equal(st[id].status, 'full');
  assert.equal(st.bp.status, 'off');
});

test('skipping a blocks-all step blocks everything and launch never happens', () => {
  const r = buildCase(values, [aco], new Set(['hipaa']), run, opts);
  assert.equal(r.launchWeek, null);
  assert.equal(r.value.builtYear1, 0);
  assert.equal(r.volume.outbound, 0);
});

test('weakening multiplies reach', () => {
  const st = interventionStatus(new Set(['monitoring', 'reputation']), run);
  near(st.meds.reach, 0.9 * 0.85, 1e-12);
  assert.equal(st.meds.status, 'weakened');
});

test('skipping the bot launches sooner but blocks two-way programs and loses value', () => {
  const full = buildCase(values, [aco], new Set(), run, opts);
  const noBot = buildCase(values, [aco], new Set(['bot']), run, opts);
  assert.ok(noBot.launchWeek < full.launchWeek);
  assert.equal(noBot.status.hf.status, 'blocked');
  assert.equal(noBot.status.toc.status, 'blocked');
  assert.ok(noBot.value.builtPerYear < full.value.builtPerYear);
});

test('more engineers shorten the build', () => {
  const one = schedule(new Set(), run, 1).launchWeek;
  const two = schedule(new Set(), run, 2).launchWeek;
  assert.ok(two < one);
  assert.ok(two >= 8, 'clinical sign-off and HIPAA floor still apply');
});

test('AWS texting cost matches the cost model rates', () => {
  const r = buildCase(values, [aco], new Set(), run, opts);
  const segOut = r.volume.outbound * 1.3;
  const segIn = r.volume.inbound * 1.3;
  const other = (0.000002 + 0.0000006 + 0.00001) * (segOut + segIn);
  near(r.cost.messagingMonthly, segOut * 0.00917 + segIn * 0.0058 + other, 1e-6);
});

test('ADT feed only matters for post-discharge follow-up', () => {
  const noToc = new Set(['meds', 'hf']);
  const a = schedule(new Set(), noToc, 1);
  assert.ok(!a.rows.some((r) => r.id === 'adt'));
});

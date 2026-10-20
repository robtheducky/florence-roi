import test from 'node:test';
import assert from 'node:assert/strict';

import { orToProbability, estimate, safeDivide } from '../js/model/core.js';
import { SCENARIOS } from '../js/assumptions.js';
import population from '../js/modules/population.js';

const near = (actual, expected, tol = 1e-3) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

const defaults = () => Object.fromEntries(population.inputs.map((i) => [i.id, i.default]));

// Walk any object and collect every number that is NaN or +/-Infinity.
function badNumbers(obj, path = '$', out = []) {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(`${path}=${obj}`);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) badNumbers(v, `${path}.${k}`, out);
  }
  return out;
}

test('odds ratio to probability matches hand calculation', () => {
  // 2.11 * 0.6 / (0.4 + 2.11 * 0.6) = 1.266 / 1.666
  near(orToProbability(0.6, 2.11), 0.760);
  // 1.68 * 0.6 / (0.4 + 1.68 * 0.6) = 1.008 / 1.408
  near(orToProbability(0.6, 1.68), 0.716);
  // 2 * 0.5 / (0.5 + 1) = 0.667
  near(orToProbability(0.5, 2), 0.667);
  // OR of 1 changes nothing
  near(orToProbability(0.42, 1), 0.42, 1e-12);
});

test('odds ratio conversion handles edges', () => {
  assert.equal(orToProbability(0, 2.11), 0);
  assert.equal(orToProbability(1, 2.11), 1);
  assert.equal(orToProbability(1.5, 2.11), 1);
  assert.equal(orToProbability(-0.2, 2.11), 0);
  assert.equal(orToProbability(0.6, 0), 0);
});

test('safeDivide returns null for zero denominators', () => {
  assert.equal(safeDivide(5, 0), null);
  assert.equal(safeDivide(5, 2), 2.5);
});

test('estimate reproduces a hand-worked base case', () => {
  const r = estimate(
    {
      enrolled: { htn: 1000, dm: 0, hf: 0 },
      baselineAdherence: 0.6,
      discharges: 100,
      baselineReadmitRate: 0.2,
      pmpm: 10,
      episodeFee: 50,
    },
    {
      engagement: 0.5,
      adherenceOR: 2,
      realization: 1,
      tocCompletion: 0.5,
      readmitReduction: 0.1,
      savingsPerAdherent: { htn: 1000, dm: 0, hf: 0 },
      readmitCost: 10000,
    },
  );
  // p1 = 1.2 / 1.6 = 0.75, lift 0.15, newly adherent = 1000 * 0.5 * 0.15 = 75
  near(r.newlyAdherentTotal, 75, 1e-9);
  near(r.adherenceSavings, 75000, 1e-6);
  // 100 * 0.5 * 0.2 * 0.1 = 1 readmission avoided
  near(r.readmitsAvoided, 1, 1e-9);
  near(r.readmitSavings, 10000, 1e-6);
  // 1000 * 10 * 12 + 100 * 50
  near(r.programCost, 125000, 1e-6);
  near(r.net, 85000 - 125000, 1e-6);
  near(r.roi, 85000 / 125000, 1e-9);
  // (85000 - 5000) / 12000
  near(r.breakEvenPMPM, 80000 / 12000, 1e-9);
});

test('break-even PMPM zeroes out net savings', () => {
  const values = defaults();
  for (const s of SCENARIOS) {
    const be = population.compute(values, s.id).result.breakEvenPMPM;
    const atBreakEven = population.compute({ ...values, pmpm: be }, s.id).result;
    near(atBreakEven.net, 0, 1e-6);
  }
});

test('gross savings are monotonic: conservative <= base <= vendor-reported', () => {
  const values = defaults();
  const [c, b, v] = ['conservative', 'base', 'vendor'].map((s) => population.compute(values, s).result);
  assert.ok(c.gross <= b.gross, `conservative ${c.gross} > base ${b.gross}`);
  assert.ok(b.gross <= v.gross, `base ${b.gross} > vendor ${v.gross}`);
  assert.ok(c.adherenceSavings <= b.adherenceSavings && b.adherenceSavings <= v.adherenceSavings);
  assert.ok(c.readmitSavings <= b.readmitSavings && b.readmitSavings <= v.readmitSavings);
});

test('zero enrollment produces no NaN or Infinity', () => {
  const values = { ...defaults(), enrolledHTN: 0, enrolledDM: 0, enrolledHF: 0, discharges: 0 };
  for (const s of SCENARIOS) {
    const out = population.compute(values, s.id);
    assert.deepEqual(badNumbers(out), [], s.id);
    assert.equal(out.result.roi, null);
    assert.equal(out.result.breakEvenPMPM, null);
  }
});

test('zero price produces no NaN or Infinity', () => {
  const values = { ...defaults(), pmpm: 0, episodeFee: 0 };
  for (const s of SCENARIOS) {
    const out = population.compute(values, s.id);
    assert.deepEqual(badNumbers(out), [], s.id);
    assert.equal(out.result.roi, null);
    assert.ok(out.result.net > 0);
  }
});

test('blank and garbage inputs degrade to zero, not NaN', () => {
  const values = Object.fromEntries(population.inputs.map((i) => [i.id, i.id === 'pmpm' ? 'abc' : '']));
  for (const s of SCENARIOS) {
    assert.deepEqual(badNumbers(population.compute(values, s.id)), [], s.id);
  }
});

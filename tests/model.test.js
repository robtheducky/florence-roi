import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { orToProbability, estimate, safeDivide, msspSettlement, msspIncremental, sampleSizePerArm, solveIncreasing } from '../js/model/core.js';
import { SCENARIOS } from '../js/assumptions.js';
import { INPUTS, acoDefaults, compute } from '../js/model/aco.js';

const data = JSON.parse(readFileSync(new URL('../data/acos.json', import.meta.url)));

const near = (actual, expected, tol = 1e-3) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

const medianDefaults = () => acoDefaults(null, data.medians).values;

function badNumbers(obj, path = '$', out = []) {
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(`${path}=${obj}`);
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) badNumbers(v, `${path}.${k}`, out);
  }
  return out;
}

// ---------- core ----------

test('odds ratio to probability matches hand calculation', () => {
  near(orToProbability(0.6, 2.11), 0.760);
  near(orToProbability(0.6, 1.68), 0.716);
  near(orToProbability(0.5, 2), 0.667);
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

test('estimate reproduces a hand-worked case', () => {
  const r = estimate(
    { enrolled: { htn: 1000, dm: 0, hf: 0 }, baselineAdherence: 0.6, discharges: 100, baselineReadmitRate: 0.2, pmpm: 10, episodeFee: 50 },
    { engagement: 0.5, adherenceOR: 2, realization: 1, tocCompletion: 0.5, readmitReduction: 0.1, savingsPerAdherent: { htn: 1000, dm: 0, hf: 0 }, readmitCost: 10000 },
  );
  near(r.newlyAdherentTotal, 75, 1e-9); // 1000 * 0.5 * (0.75 - 0.6)
  near(r.readmitsAvoided, 1, 1e-9); // 100 * 0.5 * 0.2 * 0.1
  near(r.programCost, 125000, 1e-6);
  near(r.net, 85000 - 125000, 1e-6);
  near(r.breakEvenPMPM, 80000 / 12000, 1e-9);
});

test('effect multiplier scales gross savings linearly', () => {
  const inputs = { enrolled: { htn: 1000, dm: 500, hf: 100 }, baselineAdherence: 0.6, discharges: 500, baselineReadmitRate: 0.17, pmpm: 8, episodeFee: 50 };
  const params = { engagement: 0.7, adherenceOR: 2.11, realization: 0.75, tocCompletion: 0.65, readmitReduction: 0.15, savingsPerAdherent: { htn: 3908, dm: 3756, hf: 7823 }, readmitCost: 12000 };
  const one = estimate(inputs, params).gross;
  near(estimate(inputs, { ...params, effectMultiplier: 0.5 }).gross, one / 2, 1e-6);
  assert.equal(estimate(inputs, { ...params, effectMultiplier: 0 }).gross, 0);
});

// ---------- MSSP ----------

const terms = { benchmark: 100_000_000, msr: 0.02, shareRate: 0.5, lossRate: 0 };

test('settlement shares from the first dollar once the MSR is met', () => {
  assert.equal(msspSettlement(1_999_999, terms), 0);
  assert.equal(msspSettlement(2_000_000, terms), 1_000_000);
  assert.equal(msspSettlement(5_000_000, terms), 2_500_000);
  assert.equal(msspSettlement(-5_000_000, terms), 0); // one-sided
});

test('two-sided ACOs owe shared losses beyond the MLR', () => {
  const two = { ...terms, lossRate: 0.4 };
  assert.equal(msspSettlement(-1_000_000, two), 0); // inside the corridor
  assert.equal(msspSettlement(-5_000_000, two), -2_000_000);
});

test('incremental pass-through: above MSR shares at rate, crossing MSR unlocks all savings', () => {
  near(msspIncremental(5_000_000, 1_000_000, terms), 500_000, 1e-6);
  // Baseline 1.5M is below the 2M MSR; adding 1M crosses it, so 2.5M is shared.
  near(msspIncremental(1_500_000, 1_000_000, terms), 1_250_000, 1e-6);
  // Not enough to cross.
  assert.equal(msspIncremental(0, 1_000_000, terms), 0);
});

// ---------- statistics and solver ----------

test('sample size matches a textbook two-proportion calculation', () => {
  // 0.60 vs 0.72: (1.96 + 0.8416)^2 * (0.24 + 0.2016) / 0.0144 = 7.8489 * 0.4416 / 0.0144 = 240.7 -> 241
  assert.equal(sampleSizePerArm(0.6, 0.72), 241);
  assert.equal(sampleSizePerArm(0.3, 0.3), null);
});

test('solveIncreasing finds the root and reports unreachable targets', () => {
  near(solveIncreasing((x) => x - 0.37), 0.37, 1e-3);
  assert.equal(solveIncreasing((x) => x - 20), null);
  assert.equal(solveIncreasing(() => 1), 0);
});

// ---------- ACO dashboard ----------

test('real ACO loads CMS values as defaults', () => {
  const aco = data.acos.find((a) => a.id === 'A1001');
  const { values, origin } = acoDefaults(aco, data.medians);
  assert.equal(values.lum, aco.lum);
  assert.equal(origin.lum, 'cms');
  near(values.baselineReadmit, aco.readmitRate * 100, 1e-9);
  assert.equal(values.shareRate, aco.shareRate);
});

test('ACO without PY2024 results falls back to MSSP medians', () => {
  const aco = data.acos.find((a) => !a.hasResults);
  const { values, origin } = acoDefaults(aco, data.medians);
  assert.equal(origin.lum, 'median');
  assert.equal(values.lum, data.medians.lum);
  assert.equal(values.lossRate, 0);
});

test('gross and ACO net are monotonic: conservative <= base <= vendor-reported', () => {
  for (const aco of [null, ...data.acos.filter((a) => a.hasResults).slice(0, 50)]) {
    const values = acoDefaults(aco, data.medians).values;
    const [c, b, v] = ['conservative', 'base', 'vendor'].map((s) => compute(values, s).result);
    assert.ok(c.scale.gross <= b.scale.gross && b.scale.gross <= v.scale.gross, aco?.id);
    assert.ok(c.acoNet <= b.acoNet && b.acoNet <= v.acoNet, aco?.id);
    assert.ok(c.pilot.gross <= b.pilot.gross && b.pilot.gross <= v.pilot.gross, aco?.id);
  }
});

test('break-even multiplier zeroes ACO net', () => {
  const values = medianDefaults();
  const r = compute(values, 'base').result;
  assert.ok(r.breakEven.aco > 0 && r.breakEven.aco < 1);
});

test('every ACO in the data computes without NaN or Infinity', () => {
  for (const aco of data.acos) {
    const values = acoDefaults(aco, data.medians).values;
    for (const s of SCENARIOS) assert.deepEqual(badNumbers(compute(values, s.id)), [], `${aco.id} ${s.id}`);
  }
});

test('zero enrollment and zero price produce no NaN or Infinity', () => {
  const zeroed = { ...medianDefaults(), lum: 0, pilotHTN: 0, pilotDM: 0, pilotHF: 0, pilotDischarges: 0, benchmarkTotal: 0 };
  const free = { ...medianDefaults(), pmpm: 0, episodeFee: 0 };
  for (const values of [zeroed, free]) {
    for (const s of SCENARIOS) assert.deepEqual(badNumbers(compute(values, s.id)), [], s.id);
  }
});

test('blank and garbage inputs degrade to zero, not NaN', () => {
  const values = Object.fromEntries(INPUTS.map((i) => [i.id, i.id === 'pmpm' ? 'abc' : '']));
  for (const s of SCENARIOS) assert.deepEqual(badNumbers(compute(values, s.id)), [], s.id);
});

test('pilot readmission metric flags when the pilot is underpowered', () => {
  const r = compute(medianDefaults(), 'base').result;
  const readmit = r.scorecard.find((x) => x.metric.startsWith('30-day'));
  assert.equal(readmit.detectable, false);
  const big = compute({ ...medianDefaults(), pilotDischarges: 50000 }, 'base').result;
  assert.equal(big.scorecard.find((x) => x.metric.startsWith('30-day')).detectable, true);
});

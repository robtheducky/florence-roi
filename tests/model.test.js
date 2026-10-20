import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { orToProbability, estimate, safeDivide, msspSettlement, msspIncremental, sampleSizePerArm, solveIncreasing, rng, drawParam, percentile, summarize } from '../js/model/core.js';
import { INPUTS, acoDefaults, compute, settlementUnits } from '../js/model/aco.js';

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

// ---------- Monte Carlo ----------

test('seeded draws are reproducible and respect truncation', () => {
  const spec = { dist: 'normal', mean: 0.77, sd: 0.07, min: 0, max: 1 };
  const a = Array.from({ length: 5 }, ((r) => () => drawParam(spec, r))(rng(3)));
  const b = Array.from({ length: 5 }, ((r) => () => drawParam(spec, r))(rng(3)));
  assert.deepEqual(a, b);
  const r = rng(1);
  const wide = Array.from({ length: 5000 }, () => drawParam({ dist: 'normal', mean: 0.95, sd: 0.2, min: 0, max: 1 }, r));
  assert.ok(wide.every((x) => x >= 0 && x <= 1));
});

test('draws match their distributions', () => {
  const r = rng(11);
  const n = Array.from({ length: 20000 }, () => drawParam({ dist: 'normal', mean: 0.5, sd: 0.1, min: 0, max: 1 }, r)).sort((x, y) => x - y);
  near(percentile(n, 0.5), 0.5, 0.005);
  near(percentile(n, 0.9) - percentile(n, 0.1), 2 * 1.2816 * 0.1, 0.01);
  const l = Array.from({ length: 20000 }, () => drawParam({ dist: 'lognormal', median: 1.68, sdLog: 0.167 }, r)).sort((x, y) => x - y);
  near(percentile(l, 0.5), 1.68, 0.02);
  near(percentile(l, 0.975), 1.68 * Math.exp(1.96 * 0.167), 0.05);
});

test('summarize: percentiles, share above zero, and a bin edge at zero', () => {
  const xs = Array.from({ length: 1000 }, (_, i) => i - 300); // -300..699
  const s = summarize(xs);
  near(s.probPositive, 699 / 1000, 1e-9);
  near(s.p50, 199.5, 1e-9);
  assert.ok(s.hist.some((b) => b.lo === 0 || b.hi === 0), 'zero is a bin edge');
  near(s.hist.reduce((t, b) => t + b.share, 0), 1, 1e-9);
});

// ---------- ACO dashboard ----------

const med = { medians: data.medians, draws: 400 };

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

test('higher effect assumptions raise every outcome', () => {
  const values = medianDefaults();
  const low = compute({ ...values, engagementCenter: 50, readmitReductionCenter: 5 }, [], med).result;
  const high = compute({ ...values, engagementCenter: 90, readmitReductionCenter: 25 }, [], med).result;
  for (const k of ['pilotGross', 'gross', 'acoShare', 'acoNet']) assert.ok(low.dist[k].p50 < high.dist[k].p50, k);
  assert.ok(low.dist.acoNet.probPositive <= high.dist.acoNet.probPositive);
});

test('percentiles are ordered and the central case sits inside them', () => {
  const r = compute(medianDefaults(), [], med).result;
  for (const k of ['pilotNet', 'gross', 'acoNet']) {
    const d = r.dist[k];
    assert.ok(d.p10 <= d.p50 && d.p50 <= d.p90, k);
  }
  assert.ok(r.scale.gross >= r.dist.gross.p10 && r.scale.gross <= r.dist.gross.p90);
});

test('multiple ACOs settle separately and sum', () => {
  const two = data.acos.filter((a) => a.hasResults).slice(0, 2);
  const values = medianDefaults();
  const units = settlementUnits(values, two, data.medians);
  assert.equal(units.length, 2);
  const both = compute(values, two, med).result.scale;
  const each = two.map((a) => compute(acoDefaults(a, data.medians).values, [a], med).result.scale);
  // Single-ACO mode rounds the adherence input to 0.1 point, so allow 0.5% relative error.
  const rel = (a, b) => near(a, b, Math.abs(b) * 0.005);
  rel(both.gross, each[0].gross + each[1].gross);
  rel(both.acoShare, each[0].acoShare + each[1].acoShare);
});

test('ACOs without results are left out of a multi-ACO selection', () => {
  const withRes = data.acos.filter((a) => a.hasResults).slice(0, 2);
  const without = data.acos.find((a) => !a.hasResults);
  assert.equal(settlementUnits(medianDefaults(), [...withRes, without], data.medians).length, 2);
});

test('every ACO in the data computes without NaN or Infinity', () => {
  for (const aco of data.acos) {
    const values = acoDefaults(aco, data.medians).values;
    assert.deepEqual(badNumbers(compute(values, [aco], { ...med, draws: 20 })), [], aco.id);
  }
});

test('zero enrollment and zero price produce no NaN or Infinity', () => {
  const zeroed = { ...medianDefaults(), lum: 0, pilotHTN: 0, pilotDM: 0, pilotHF: 0, pilotDischarges: 0, benchmarkTotal: 0 };
  const free = { ...medianDefaults(), pmpm: 0, episodeFee: 0 };
  for (const values of [zeroed, free]) assert.deepEqual(badNumbers(compute(values, [], med)), []);
});

test('blank and garbage inputs degrade to zero, not NaN', () => {
  const values = Object.fromEntries(INPUTS.map((i) => [i.id, i.id === 'pmpm' ? 'abc' : '']));
  assert.deepEqual(badNumbers(compute(values, [], med)), []);
});

test('pilot readmission metric flags when the pilot is underpowered', () => {
  const r = compute(medianDefaults(), [], med).result;
  assert.equal(r.scorecard.find((x) => x.id === 'readmit').provable, false);
  // Starting near 89% adherence, 900 patients cannot show the lift; targeting non-adherent patients can.
  assert.equal(r.scorecard.find((x) => x.id === 'adherence').provable, false);
  const targeted = compute({ ...medianDefaults(), targeting: 'gap' }, [], med).result;
  assert.equal(targeted.scorecard.find((x) => x.id === 'adherence').provable, true);
  const big = compute({ ...medianDefaults(), pilotDischarges: 50000 }, [], med).result;
  assert.equal(big.scorecard.find((x) => x.id === 'readmit').provable, true);
});

test('CMS Part D adherence sets the baseline for every ACO', () => {
  for (const a of data.acos) {
    assert.ok(a.partD && a.partD.ras > 0.8 && a.partD.ras < 1, a.id);
    const { values, origin } = acoDefaults(a, data.medians);
    assert.equal(origin.baselineAdherence, 'cms');
    assert.ok(values.baselineAdherence > 80 && values.baselineAdherence < 100);
  }
});

test('targeting non-adherent patients shrinks the pool and widens the gap', () => {
  const all = compute(medianDefaults(), [], med).result;
  const gap = compute({ ...medianDefaults(), targeting: 'gap' }, [], med).result;
  assert.ok(gap.scale.enrolled < all.scale.enrolled * 0.2);
  assert.ok(gap.pilotAnnual.p0 < all.pilotAnnual.p0);
  assert.ok(gap.scale.cost < all.scale.cost);
});

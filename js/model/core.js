// Pure model functions. No DOM access, no imports, safe to run in Node.
//
// Every function sanitizes its inputs so that empty, negative, or non-numeric
// values degrade to zero instead of producing NaN or Infinity.

export const CONDITIONS = ['htn', 'dm', 'hf'];

// Non-negative finite number, else 0.
export function nonNeg(x) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Probability clamped to [0, 1].
export function prob(x) {
  return Math.min(1, nonNeg(x));
}

// a / b, or null when the denominator is zero (callers render null as "n/a").
export function safeDivide(a, b) {
  return b === 0 || !Number.isFinite(b) ? null : a / b;
}

// Convert an odds ratio into the treated-group probability.
//   p1 = OR * p0 / (1 - p0 + OR * p0)
export function orToProbability(p0, oddsRatio) {
  const p = prob(p0);
  const or = nonNeg(oddsRatio);
  if (p === 0 || p === 1) return p;
  return (or * p) / (1 - p + or * p);
}

/**
 * Core population estimate.
 *
 * @param {object} inputs
 *   enrolled: { htn, dm, hf }   patients enrolled per condition
 *   baselineAdherence           share with PDC >= 80% (0-1)
 *   discharges                  annual discharges enrolled in TOC
 *   baselineReadmitRate         30-day all-cause readmission rate (0-1)
 *   pmpm                        chronic care price, $ per member per month
 *   episodeFee                  TOC price, $ per discharge episode
 * @param {object} params
 *   engagement, adherenceOR, realization, tocCompletion, readmitReduction
 *   savingsPerAdherent: { htn, dm, hf }   $ per newly adherent patient-year
 *   readmitCost                           $ per readmission
 */
export function estimate(inputs, params) {
  // effectMultiplier scales the program effect (adherence lift and readmission
  // reduction) relative to the scenario's bet. 1 = the bet as stated.
  const k = params.effectMultiplier === undefined ? 1 : nonNeg(params.effectMultiplier);
  const p0 = prob(inputs.baselineAdherence);
  const p1 = orToProbability(p0, params.adherenceOR);
  const adherenceLift = Math.min(1 - p0, Math.max(0, p1 - p0) * k);
  const engagement = prob(params.engagement);
  const realization = nonNeg(params.realization);

  const conditions = {};
  let newlyAdherentTotal = 0;
  let grossLiteratureSavings = 0;
  let enrolledTotal = 0;
  for (const c of CONDITIONS) {
    const enrolled = nonNeg(inputs.enrolled?.[c]);
    const newlyAdherent = enrolled * engagement * adherenceLift;
    const savingsPerPatient = nonNeg(params.savingsPerAdherent?.[c]);
    const savings = newlyAdherent * savingsPerPatient * realization;
    conditions[c] = { enrolled, newlyAdherent, savingsPerPatient, savings };
    enrolledTotal += enrolled;
    newlyAdherentTotal += newlyAdherent;
    grossLiteratureSavings += newlyAdherent * savingsPerPatient;
  }
  const adherenceSavings = grossLiteratureSavings * realization;

  const discharges = nonNeg(inputs.discharges);
  const baselineReadmitRate = prob(inputs.baselineReadmitRate);
  const completion = prob(params.tocCompletion);
  const relativeReduction = prob(prob(params.readmitReduction) * k);
  const readmitCost = nonNeg(params.readmitCost);
  const readmitsAvoided = discharges * completion * baselineReadmitRate * relativeReduction;
  const readmitSavings = readmitsAvoided * readmitCost;

  const pmpm = nonNeg(inputs.pmpm);
  const episodeFee = nonNeg(inputs.episodeFee);
  const memberMonths = enrolledTotal * 12;
  const chronicCost = memberMonths * pmpm;
  const tocCost = discharges * episodeFee;
  const programCost = chronicCost + tocCost;

  const gross = adherenceSavings + readmitSavings;
  const net = gross - programCost;
  const roi = safeDivide(gross, programCost);

  // PMPM at which net = 0, holding the TOC fee constant. May be negative when
  // the TOC fee alone exceeds gross savings.
  const breakEvenPMPM = safeDivide(gross - tocCost, memberMonths);

  return {
    p0,
    p1,
    adherenceLift,
    engagement,
    realization,
    conditions,
    enrolledTotal,
    newlyAdherentTotal,
    adherenceSavings,
    discharges,
    baselineReadmitRate,
    completion,
    relativeReduction,
    readmitCost,
    readmitsAvoided,
    readmitSavings,
    pmpm,
    episodeFee,
    memberMonths,
    chronicCost,
    tocCost,
    programCost,
    gross,
    net,
    roi,
    breakEvenPMPM,
  };
}

// ---------- Shared Savings Program pass-through ----------

/**
 * Shared savings (positive) or shared losses (negative) for a given total
 * savings amount, simplified from MSSP reconciliation:
 *  - savings at or above the MSR are shared from the first dollar at shareRate
 *  - for two-sided ACOs (lossRate > 0), losses at or beyond the minimum loss
 *    rate are owed at lossRate; the MLR is assumed equal to the MSR
 *  - performance payment and loss caps are not applied
 *
 * @param {number} savings      benchmark minus expenditures, $
 * @param {object} terms        { benchmark, msr, shareRate, lossRate } (rates 0-1)
 */
export function msspSettlement(savings, terms) {
  const benchmark = nonNeg(terms.benchmark);
  if (benchmark === 0) return 0;
  const threshold = nonNeg(terms.msr) * benchmark;
  const s = Number.isFinite(savings) ? savings : 0;
  if (s >= threshold && s > 0) return s * prob(terms.shareRate);
  const lossRate = prob(terms.lossRate);
  if (lossRate > 0 && s < 0 && -s >= threshold) return s * lossRate;
  return 0;
}

// Change in the ACO's settlement when program savings are added to its
// baseline savings. This is what the ACO actually keeps from the program.
export function msspIncremental(baselineSavings, programSavings, terms) {
  const base = Number.isFinite(baselineSavings) ? baselineSavings : 0;
  return msspSettlement(base + nonNeg(programSavings), terms) - msspSettlement(base, terms);
}

// ---------- pilot statistics ----------

const Z_ALPHA = 1.959964; // two-sided alpha 0.05
const Z_POWER = 0.841621; // power 0.80

// Patients per arm needed to detect p1 vs p2 with a two-proportion z-test.
// Returns null when the difference is zero.
export function sampleSizePerArm(p1, p2) {
  const a = prob(p1);
  const b = prob(p2);
  const d = Math.abs(a - b);
  if (d === 0) return null;
  return Math.ceil(((Z_ALPHA + Z_POWER) ** 2 * (a * (1 - a) + b * (1 - b))) / d ** 2);
}

// ---------- break-even ----------

// Smallest x in [0, hi] with f(x) >= 0 for an increasing f, by bisection.
// Returns null if f(hi) < 0.
export function solveIncreasing(f, hi = 10, tol = 1e-4) {
  if (f(0) >= 0) return 0;
  if (f(hi) < 0) return null;
  let lo = 0;
  while (hi - lo > tol) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ---------- Monte Carlo ----------

// Seeded PRNG (mulberry32) so a shared link always shows the same distribution.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal draw (Box-Muller).
export function standardNormal(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// Draw from a parameter spec. Normal draws are truncated to [min, max] by
// resampling, falling back to clamping after 50 tries.
export function drawParam(spec, rand) {
  if (spec.dist === 'lognormal') return nonNeg(spec.median) * Math.exp(nonNeg(spec.sdLog) * standardNormal(rand));
  if (spec.dist === 'normal') {
    const lo = spec.min ?? -Infinity;
    const hi = spec.max ?? Infinity;
    const sd = nonNeg(spec.sd);
    for (let i = 0; i < 50; i++) {
      const x = spec.mean + sd * standardNormal(rand);
      if (x >= lo && x <= hi) return x;
    }
    return Math.min(hi, Math.max(lo, spec.mean));
  }
  return spec.value;
}

// Percentile of a sorted array (linear interpolation), q in [0, 1].
export function percentile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Summary of a sample: percentiles, mean, share above zero, and histogram
// bins whose edges include zero so gains and losses never share a bin.
export function summarize(sample, bins = 28) {
  const s = Float64Array.from(sample).sort();
  const n = s.length;
  if (!n) return null;
  const p = (q) => percentile(s, q);
  const lo = p(0.01);
  const hi = p(0.99);
  const raw = (hi - lo) / bins || Math.max(1, Math.abs(hi)) / bins;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const width = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((w) => w >= raw);
  const start = Math.floor(lo / width) * width;
  const count = Math.max(1, Math.ceil((hi - start) / width));
  const hist = Array.from({ length: count }, (_, i) => ({ lo: start + i * width, hi: start + (i + 1) * width, n: 0 }));
  for (const x of s) {
    const i = Math.min(count - 1, Math.max(0, Math.floor((x - start) / width)));
    hist[i].n += 1;
  }
  let above = 0;
  let sum = 0;
  for (const x of s) {
    if (x > 0) above += 1;
    sum += x;
  }
  return { n, p10: p(0.1), p50: p(0.5), p90: p(0.9), mean: sum / n, probPositive: above / n, hist: hist.map((b) => ({ ...b, share: b.n / n })) };
}

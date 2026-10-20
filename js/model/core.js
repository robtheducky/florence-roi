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
  const p0 = prob(inputs.baselineAdherence);
  const p1 = orToProbability(p0, params.adherenceOR);
  const adherenceLift = Math.max(0, p1 - p0);
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
  const relativeReduction = prob(params.readmitReduction);
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

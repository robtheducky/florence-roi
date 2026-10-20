// Medicare ACO dashboard model: pilot, scale projection, MSSP pass-through, and
// a Monte Carlo over the uncertain effect assumptions. Pure functions, no DOM.
//
// `values` are raw input values keyed by input id, in display units (percent
// inputs as 0-100). One or zero ACOs: the ACO baseline comes from `values`
// (prefilled from CMS data, editable). Two or more ACOs: each ACO's own CMS
// row is used and every ACO settles with CMS separately.

import { ASSUMPTIONS, UNCERTAIN_IDS } from '../assumptions.js';
import { estimate, msspIncremental, sampleSizePerArm, safeDivide, nonNeg, rng, drawParam, summarize } from './core.js';
import { fmt } from '../format.js';

const fixed = (id) => ASSUMPTIONS[id].value;
const pctOf = (x) => +(x * 100).toFixed(2);

export const GROUPS = [
  { id: 'aco', label: 'ACO baseline (CMS data)', collapsible: true },
  { id: 'pilot', label: 'Pilot' },
  { id: 'scale', label: 'At scale' },
  { id: 'pricing', label: 'Price' },
  { id: 'clinical', label: 'Patient assumptions', collapsible: true },
  { id: 'uncertainty', label: 'Effect assumptions (distributions)', collapsible: true },
  { id: 'advanced', label: 'Savings per adherent patient', collapsible: true },
];

// `data` names the field in data/acos.json; `fromAco` converts it to the input's units.
const BASELINE_INPUTS = [
  { id: 'lum', label: 'Assigned beneficiaries', kind: 'count', data: 'lum', column: 'N_AB' },
  { id: 'admitsPer1000', label: 'Short-term admissions per 1,000', kind: 'count', data: 'stAdmitsPer1000', column: 'ADM_S_Trm' },
  { id: 'baselineReadmit', label: '30-day readmission rate', kind: 'percent', step: 0.1, data: 'readmitRate', fromAco: (v) => +(v * 100).toFixed(2), column: 'Measure_479' },
  { id: 'costPerAdmit', label: 'Cost per admission', kind: 'currency', data: 'costPerAdmit', column: 'CapAnn_INP_S_trm ÷ ADM_S_Trm', assumptionId: 'costPerAdmit' },
  { id: 'benchmarkTotal', label: 'Total benchmark', kind: 'currency', step: 100000, data: 'benchmarkTotal', column: 'ABtotBnchmk' },
  { id: 'baselineSavingsRate', label: 'Savings rate before program', kind: 'percent', step: 0.1, data: 'savingsRate', column: 'Sav_rate' },
  { id: 'msr', label: 'Minimum savings rate (MSR)', kind: 'percent', step: 0.1, data: 'msr', column: 'MinSavPerc' },
  { id: 'shareRate', label: 'Sharing rate', kind: 'percent', data: 'shareRate', column: 'FinalShareRate' },
  { id: 'lossRate', label: 'Shared loss rate (0 = one-sided)', kind: 'percent', step: 0.1, data: 'lossRate', column: 'FinalLossRate' },
].map((i) => ({ ...i, group: 'aco' }));

// Center and spread inputs for each uncertain assumption.
const UNCERTAINTY_INPUTS = UNCERTAIN_IDS.flatMap((id) => {
  const a = ASSUMPTIONS[id];
  if (a.dist === 'lognormal') {
    return [
      { id: `${id}Center`, group: 'uncertainty', label: `${a.label}: median`, kind: 'ratio', step: 0.01, default: a.median, assumptionId: id },
      { id: `${id}Sd`, group: 'uncertainty', label: `${a.label}: spread (log SD)`, kind: 'ratio', step: 0.01, default: a.sdLog, assumptionId: id },
    ];
  }
  return [
    { id: `${id}Center`, group: 'uncertainty', label: `${a.label}: mean`, kind: 'percent', step: 0.5, default: pctOf(a.mean), assumptionId: id },
    { id: `${id}Sd`, group: 'uncertainty', label: `${a.label}: spread (SD)`, kind: 'percent', step: 0.5, default: pctOf(a.sd), assumptionId: id },
  ];
});

export const INPUTS = [
  ...BASELINE_INPUTS,

  { id: 'pilotMonths', group: 'pilot', label: 'Length', kind: 'count', suffix: 'months', default: 6, max: 24 },
  { id: 'pilotHTN', group: 'pilot', label: 'Patients with hypertension', kind: 'count', default: 500 },
  { id: 'pilotDM', group: 'pilot', label: 'Patients with diabetes', kind: 'count', default: 300 },
  { id: 'pilotHF', group: 'pilot', label: 'Patients with heart failure', kind: 'count', default: 100 },
  { id: 'pilotDischarges', group: 'pilot', label: 'Hospital discharges', kind: 'count', suffix: 'over pilot', default: 250 },

  { id: 'scaleEnroll', group: 'scale', label: 'Eligible chronic patients enrolled', kind: 'percent', default: pctOf(fixed('scaleEnroll')), assumptionId: 'scaleEnroll' },
  { id: 'tocScale', group: 'scale', label: 'Hospital discharges enrolled', kind: 'percent', default: pctOf(fixed('tocScale')), assumptionId: 'tocScale' },

  { id: 'pmpm', group: 'pricing', label: 'Chronic care, per patient per month', kind: 'currency', step: 0.5, default: fixed('pmpm'), assumptionId: 'pmpm', placeholder: true },
  { id: 'episodeFee', group: 'pricing', label: 'Transitions of care, per discharge', kind: 'currency', default: fixed('episodeFee'), assumptionId: 'episodeFee', placeholder: true },

  { id: 'baselineAdherence', group: 'clinical', label: 'Adherence before program (PDC ≥ 80%)', kind: 'percent', default: 60, tip: 'Medicare Part D adherence is often 80–90% population-wide. 60% assumes the ACO enrolls patients with a known adherence gap.' },
  { id: 'prevHTN', group: 'clinical', label: 'Have hypertension', kind: 'percent', default: pctOf(fixed('prevHTN')), assumptionId: 'prevHTN' },
  { id: 'prevDM', group: 'clinical', label: 'Have diabetes', kind: 'percent', default: pctOf(fixed('prevDM')), assumptionId: 'prevDM' },
  { id: 'prevHF', group: 'clinical', label: 'Have heart failure', kind: 'percent', default: pctOf(fixed('prevHF')), assumptionId: 'prevHF' },

  ...UNCERTAINTY_INPUTS,

  { id: 'savingsHTN', group: 'advanced', label: 'Hypertension', kind: 'currency', suffix: 'per year', default: fixed('savingsHTN'), assumptionId: 'savingsHTN' },
  { id: 'savingsDM', group: 'advanced', label: 'Diabetes', kind: 'currency', suffix: 'per year', default: fixed('savingsDM'), assumptionId: 'savingsDM' },
  { id: 'savingsCHF', group: 'advanced', label: 'Heart failure', kind: 'currency', suffix: 'per year', default: fixed('savingsCHF'), assumptionId: 'savingsCHF' },
];

export const ASSUMPTION_IDS = [
  ...UNCERTAIN_IDS,
  'savingsHTN', 'savingsDM', 'savingsCHF', 'costPerAdmit', 'prevHTN', 'prevDM', 'prevHF',
  'scaleEnroll', 'tocScale', 'pmpm', 'episodeFee',
];

export const DRAWS = 2000;

/**
 * Default value for every input. ACO-baseline inputs come from the ACO's PUF
 * row when present, else from MSSP medians. Returns { values, origin } where
 * origin[id] is 'cms' | 'median' | 'assumption'.
 */
export function acoDefaults(aco, medians) {
  const values = {};
  const origin = {};
  for (const input of INPUTS) {
    if (!input.data) {
      values[input.id] = input.default;
      origin[input.id] = 'assumption';
      continue;
    }
    let raw = aco?.hasResults ? aco[input.data] : null;
    if (input.id === 'lossRate' && aco?.hasResults && aco.riskModel === 'One-Sided') raw = 0;
    if (raw !== null && raw !== undefined) {
      values[input.id] = input.fromAco ? input.fromAco(raw) : raw;
      origin[input.id] = 'cms';
    } else {
      let m = medians[input.data];
      if (input.id === 'benchmarkTotal') m = Math.round((values.lum ?? medians.lum) * medians.benchmarkPC);
      if (input.id === 'lossRate') m = 0;
      values[input.id] = input.fromAco ? input.fromAco(m) : m;
      origin[input.id] = 'median';
    }
  }
  return { values, origin };
}

// One settlement unit per ACO: rates as 0-1, dollars as dollars.
function unitFromValues(values) {
  const n = (id) => nonNeg(values[id]);
  return {
    id: null,
    lum: n('lum'),
    admitsPer1000: n('admitsPer1000'),
    readmit: n('baselineReadmit') / 100,
    costPerAdmit: n('costPerAdmit'),
    benchmark: n('benchmarkTotal'),
    savingsRate: (Number(values.baselineSavingsRate) || 0) / 100,
    msr: n('msr') / 100,
    shareRate: n('shareRate') / 100,
    lossRate: n('lossRate') / 100,
  };
}

function unitFromAco(a, medians) {
  return {
    id: a.id,
    lum: a.lum ?? 0,
    admitsPer1000: a.stAdmitsPer1000 ?? medians.stAdmitsPer1000,
    readmit: a.readmitRate ?? medians.readmitRate,
    costPerAdmit: a.costPerAdmit ?? medians.costPerAdmit,
    benchmark: a.benchmarkTotal ?? 0,
    savingsRate: (a.savingsRate ?? 0) / 100,
    msr: (a.msr ?? 0) / 100,
    shareRate: (a.shareRate ?? 0) / 100,
    lossRate: a.riskModel === 'One-Sided' ? 0 : (a.lossRate ?? 0) / 100,
  };
}

export function settlementUnits(values, acos = [], medians = {}) {
  const withResults = acos.filter((a) => a.hasResults);
  return withResults.length >= 2 ? withResults.map((a) => unitFromAco(a, medians)) : [unitFromValues(values)];
}

// Distribution specs for the uncertain parameters, from the inputs.
export function paramSpecs(values) {
  const specs = {};
  for (const id of UNCERTAIN_IDS) {
    const a = ASSUMPTIONS[id];
    const c = Number(values[`${id}Center`]);
    const sd = Number(values[`${id}Sd`]);
    specs[id] = a.dist === 'lognormal'
      ? { dist: 'lognormal', median: Number.isFinite(c) ? c : a.median, sdLog: Number.isFinite(sd) ? sd : a.sdLog }
      : { dist: 'normal', mean: Number.isFinite(c) ? c / 100 : a.mean, sd: Number.isFinite(sd) ? sd / 100 : a.sd, min: a.min, max: a.max };
  }
  return specs;
}

const centralOf = (spec) => (spec.dist === 'lognormal' ? spec.median : Math.min(spec.max, Math.max(spec.min, spec.mean)));

function run(effect, units, values, detail) {
  const n = (id) => nonNeg(values[id]);
  const pct = (id) => n(id) / 100;
  const params = {
    ...effect,
    savingsPerAdherent: { htn: n('savingsHTN'), dm: n('savingsDM'), hf: n('savingsCHF') },
  };

  // Pilot: one cohort; readmission rate and cost weighted by admissions.
  let admits = 0;
  let wReadmit = 0;
  let wCost = 0;
  for (const u of units) {
    const a = (u.lum * u.admitsPer1000) / 1000;
    admits += a;
    wReadmit += a * u.readmit;
    wCost += a * u.costPerAdmit;
  }
  const pilotReadmit = admits > 0 ? wReadmit / admits : units[0].readmit;
  const pilotCost = admits > 0 ? wCost / admits : units[0].costPerAdmit;
  const months = Math.min(24, n('pilotMonths'));
  const f = months / 12;
  const pa = estimate(
    {
      enrolled: { htn: n('pilotHTN'), dm: n('pilotDM'), hf: n('pilotHF') },
      baselineAdherence: pct('baselineAdherence'),
      discharges: n('pilotDischarges'),
      baselineReadmitRate: pilotReadmit,
      pmpm: n('pmpm'),
      episodeFee: n('episodeFee'),
    },
    { ...params, readmitCost: pilotCost },
  );
  // Chronic care savings and fees accrue monthly; TOC savings land within 30 days.
  const pilot = {
    months,
    cohort: pa.enrolledTotal,
    discharges: pa.discharges,
    newlyAdherent: pa.newlyAdherentTotal,
    readmitsAvoided: pa.readmitsAvoided,
    adherenceSavings: pa.adherenceSavings * f,
    readmitSavings: pa.readmitSavings,
    cost: pa.chronicCost * f + pa.tocCost,
  };
  pilot.gross = pilot.adherenceSavings + pilot.readmitSavings;
  pilot.net = pilot.gross - pilot.cost;

  // Scale: every ACO settles with CMS on its own benchmark.
  const scale = { enrolled: 0, enrolledByCondition: { htn: 0, dm: 0, hf: 0 }, discharges: 0, newlyAdherent: 0, readmitsAvoided: 0, adherenceSavings: 0, readmitSavings: 0, gross: 0, cost: 0, acoShare: 0, benchmark: 0, perAco: [] };
  for (const u of units) {
    const share = pct('scaleEnroll');
    const r = estimate(
      {
        enrolled: { htn: u.lum * pct('prevHTN') * share, dm: u.lum * pct('prevDM') * share, hf: u.lum * pct('prevHF') * share },
        baselineAdherence: pct('baselineAdherence'),
        discharges: ((u.lum * u.admitsPer1000) / 1000) * pct('tocScale'),
        baselineReadmitRate: u.readmit,
        pmpm: n('pmpm'),
        episodeFee: n('episodeFee'),
      },
      { ...params, readmitCost: u.costPerAdmit },
    );
    const terms = { benchmark: u.benchmark, msr: u.msr, shareRate: u.shareRate, lossRate: u.lossRate };
    const acoShare = msspIncremental(u.benchmark * u.savingsRate, r.gross, terms);
    scale.enrolled += r.enrolledTotal;
    for (const c of ['htn', 'dm', 'hf']) scale.enrolledByCondition[c] += r.conditions[c].enrolled;
    scale.discharges += r.discharges;
    scale.newlyAdherent += r.newlyAdherentTotal;
    scale.readmitsAvoided += r.readmitsAvoided;
    scale.adherenceSavings += r.adherenceSavings;
    scale.readmitSavings += r.readmitSavings;
    scale.gross += r.gross;
    scale.cost += r.programCost;
    scale.acoShare += acoShare;
    scale.benchmark += u.benchmark;
    if (detail) scale.perAco.push({ id: u.id, gross: r.gross, cost: r.programCost, acoShare, belowMsr: u.savingsRate < u.msr, closesGap: u.savingsRate < u.msr && u.savingsRate * u.benchmark + r.gross >= u.msr * u.benchmark });
  }
  scale.acoNet = scale.acoShare - scale.cost;

  return { params, pilot, pilotAnnual: detail ? pa : null, pilotReadmit, pilotCost, scale };
}

export function compute(values, acos = [], { medians = {}, draws = DRAWS, seed = 7 } = {}) {
  const units = settlementUnits(values, acos, medians);
  const specs = paramSpecs(values);
  const central = Object.fromEntries(Object.entries(specs).map(([id, s]) => [id, centralOf(s)]));
  const c = run(central, units, values, true);

  // Pilot scorecard at the central case: what the pilot can prove.
  const pa = c.pilotAnnual;
  const adherenceTarget = pa.p0 + pa.engagement * pa.adherenceLift;
  const readmitTarget = pa.baselineReadmitRate * (1 - pa.completion * pa.relativeReduction);
  const nAdh = sampleSizePerArm(pa.p0, adherenceTarget);
  const nReadmit = sampleSizePerArm(pa.baselineReadmitRate, readmitTarget);
  const scorecard = [
    { id: 'engagement', metric: 'Patients who respond', baseline: null, target: central.engagement, format: 'percent0', required: null, have: c.pilot.cohort, measure: 'Message logs' },
    { id: 'adherence', metric: 'Patients adherent (PDC ≥ 80%)', baseline: pa.p0, target: adherenceTarget, format: 'percent1', required: nAdh, have: c.pilot.cohort, measure: 'Pharmacy claims vs. comparison group' },
    { id: 'completion', metric: 'Discharges completing follow-up', baseline: null, target: central.tocCompletion, format: 'percent0', required: null, have: c.pilot.discharges, measure: 'Program logs' },
    { id: 'readmit', metric: '30-day readmission rate', baseline: pa.baselineReadmitRate, target: readmitTarget, format: 'percent1', required: nReadmit, have: c.pilot.discharges, measure: 'ACO claims (CCLF) vs. comparison group' },
  ].map((row) => ({ ...row, provable: row.required === null ? null : row.have >= row.required }));

  // Monte Carlo over the effect assumptions.
  const rand = rng(seed);
  const sims = { pilotNet: [], pilotGross: [], gross: [], acoShare: [], acoNet: [] };
  for (let i = 0; i < draws; i++) {
    const effect = Object.fromEntries(Object.entries(specs).map(([id, s]) => [id, drawParam(s, rand)]));
    const r = run(effect, units, values, false);
    sims.pilotNet.push(r.pilot.net);
    sims.pilotGross.push(r.pilot.gross);
    sims.gross.push(r.scale.gross);
    sims.acoShare.push(r.scale.acoShare);
    sims.acoNet.push(r.scale.acoNet);
  }
  const dist = Object.fromEntries(Object.entries(sims).map(([k, v]) => [k, summarize(v)]));

  const result = {
    units, specs, central, pilot: c.pilot, pilotAnnual: pa, pilotReadmit: c.pilotReadmit, pilotCost: c.pilotCost,
    scale: c.scale, scorecard, dist, draws,
    savingsPctOfBenchmark: safeDivide(c.scale.gross, c.scale.benchmark),
  };
  return { result, math: buildMath(result, values) };
}

// ---------- show the math ----------

function buildMath(r, values) {
  const $ = (v) => fmt(v, 'currency0');
  const pc = (v) => fmt(v, 'percent0');
  const p1 = (v) => fmt(v, 'percent1');
  const n0 = (v) => fmt(v, 'number0');
  const n1 = (v) => fmt(v, 'number1');
  const s = r.scale;
  const pa = r.pilotAnnual;
  const or = fmt(r.central.adherenceOR, 'odds');
  const p0 = fmt(pa.p0, 'prob3');
  const multi = r.units.length > 1;
  return [
    {
      title: '1. Adherence effect (central case)',
      steps: [
        { formula: 'p₁ = OR · p₀ / (1 − p₀ + OR · p₀)', live: `${or} × ${p0} / (1 − ${p0} + ${or} × ${p0}) = ${fmt(pa.p1, 'prob3')}`, refs: ['adherenceOR', 'input:baselineAdherence'] },
        { formula: 'Newly adherent per enrolled patient = engagement × (p₁ − p₀)', live: `${pc(pa.engagement)} × ${fmt(pa.adherenceLift, 'prob3')} = ${fmt(pa.engagement * pa.adherenceLift, 'prob3')}`, refs: ['engagement'] },
      ],
    },
    {
      title: '2. Pilot (central case)',
      steps: [
        { formula: 'Adherence savings = newly adherent × savings per patient × realization × months / 12', live: `${n1(pa.newlyAdherentTotal)} patients → ${$(pa.adherenceSavings)} per year × ${r.pilot.months} / 12 = ${$(r.pilot.adherenceSavings)}`, refs: ['savingsHTN', 'savingsDM', 'savingsCHF', 'realization'] },
        { formula: 'Readmissions avoided = discharges × completion × readmission rate × reduction', live: `${n0(pa.discharges)} × ${pc(pa.completion)} × ${p1(pa.baselineReadmitRate)} × ${pc(pa.relativeReduction)} = ${n1(pa.readmitsAvoided)} × ${$(pa.readmitCost)} = ${$(r.pilot.readmitSavings)}`, refs: ['tocCompletion', 'readmitReduction', 'input:baselineReadmit', 'costPerAdmit'] },
        { formula: 'Pilot cost = patients × monthly price × months + discharges × per-discharge price', live: `${n0(r.pilot.cohort)} × ${fmt(pa.pmpm, 'currency2')} × ${r.pilot.months} + ${n0(pa.discharges)} × ${$(pa.episodeFee)} = ${$(r.pilot.cost)}`, refs: ['pmpm', 'episodeFee'] },
        ...r.scorecard.filter((x) => x.required !== null).map((x) => ({
          formula: `${x.metric}: patients per arm = (zα + zβ)² · [p₁(1−p₁) + p₂(1−p₂)] / (p₁ − p₂)²`,
          live: `${p1(x.baseline)} vs ${p1(x.target)} → ${n0(x.required)} needed; pilot has ${n0(x.have)}`,
          refs: ['stats'],
        })),
      ],
    },
    {
      title: `3. At scale (central case${multi ? `, summed over ${r.units.length} ACOs` : ''})`,
      steps: [
        { formula: 'Enrolled = assigned beneficiaries × prevalence × enrollment share', live: `${multi ? 'per ACO, summed' : n0(values.lum)} → ${n0(s.enrolled)} enrolled`, refs: ['input:lum', 'prevHTN', 'prevDM', 'prevHF', 'scaleEnroll'] },
        { formula: 'Discharges enrolled = assigned × admissions per 1,000 / 1,000 × share', live: `${n0(s.discharges)} discharges`, refs: ['input:admitsPer1000', 'tocScale'] },
        { formula: 'Medicare spending avoided = adherence savings + readmission savings', live: `${$(s.adherenceSavings)} + ${$(s.readmitSavings)} = ${$(s.gross)} (${p1(r.savingsPctOfBenchmark)} of benchmark)`, refs: [] },
        { formula: 'ACO shared savings = CMS settlement with program − settlement without', live: `${$(s.acoShare)}${multi ? ', each ACO settled on its own benchmark, MSR, and sharing rate' : ''}`, refs: ['mssp', 'input:benchmarkTotal', 'input:msr', 'input:shareRate'] },
        { formula: 'ACO net gain = ACO shared savings − program cost', live: `${$(s.acoShare)} − ${$(s.cost)} = ${$(s.acoNet)}`, refs: ['pmpm', 'episodeFee'] },
      ],
    },
    {
      title: '4. Distribution',
      steps: [
        { formula: `Repeat steps 1–3 ${n0(r.draws)} times, drawing each effect assumption from its distribution`, live: `ACO net gain: 10th percentile ${$(r.dist.acoNet.p10)}, median ${$(r.dist.acoNet.p50)}, 90th percentile ${$(r.dist.acoNet.p90)}; ${pc(r.dist.acoNet.probPositive)} of draws above zero`, refs: ['engagement', 'adherenceOR', 'realization', 'tocCompletion', 'readmitReduction'] },
      ],
    },
  ];
}

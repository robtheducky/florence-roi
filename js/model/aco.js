// Medicare ACO dashboard model: pilot bet, scale projection, and MSSP
// pass-through. Pure functions, no DOM.
//
// `values` are raw input values keyed by input id, in display units (percent
// inputs as 0-100). `acoDefaults(aco, medians)` supplies the data-grounded
// defaults for one ACO, or MSSP medians when no ACO is selected.

import { ASSUMPTIONS, scenarioValue } from '../assumptions.js';
import { estimate, msspIncremental, sampleSizePerArm, solveIncreasing, safeDivide, nonNeg } from './core.js';
import { fmt } from '../format.js';

const fixed = (id) => ASSUMPTIONS[id].value;
const pctOf = (id) => +(fixed(id) * 100).toFixed(2);

export const GROUPS = [
  { id: 'aco', label: 'ACO baseline', note: 'From CMS data when an ACO is selected. Edit to use your own numbers.' },
  { id: 'pilot', label: 'Pilot design' },
  { id: 'scale', label: 'At scale' },
  { id: 'pricing', label: 'Program pricing' },
  { id: 'clinical', label: 'Clinical assumptions', collapsible: true },
  { id: 'advanced', label: 'Literature savings', collapsible: true },
];

// `data` names the field in data/acos.json; `fromAco` converts it to the input's units.
export const INPUTS = [
  { id: 'lum', group: 'aco', label: 'Assigned beneficiaries (LUM)', kind: 'count', data: 'lum', column: 'N_AB' },
  { id: 'admitsPer1000', group: 'aco', label: 'Short-term admissions per 1,000', kind: 'count', data: 'stAdmitsPer1000', column: 'ADM_S_Trm' },
  { id: 'baselineReadmit', group: 'aco', label: '30-day all-cause readmission rate', kind: 'percent', step: 0.1, data: 'readmitRate', fromAco: (v) => +(v * 100).toFixed(2), column: 'Measure_479' },
  { id: 'costPerAdmit', group: 'aco', label: 'Cost per short-term admission', kind: 'currency', data: 'costPerAdmit', column: 'CapAnn_INP_S_trm ÷ ADM_S_Trm', assumptionId: 'costPerAdmit' },
  { id: 'benchmarkTotal', group: 'aco', label: 'Total benchmark', kind: 'currency', step: 100000, data: 'benchmarkTotal', column: 'ABtotBnchmk' },
  { id: 'baselineSavingsRate', group: 'aco', label: 'Savings rate before the program', kind: 'percent', step: 0.1, data: 'savingsRate', column: 'Sav_rate' },
  { id: 'msr', group: 'aco', label: 'Minimum savings rate (MSR)', kind: 'percent', step: 0.1, data: 'msr', column: 'MinSavPerc' },
  { id: 'shareRate', group: 'aco', label: 'Final sharing rate', kind: 'percent', data: 'shareRate', column: 'FinalShareRate' },
  { id: 'lossRate', group: 'aco', label: 'Shared loss rate (0 = one-sided)', kind: 'percent', step: 0.1, data: 'lossRate', column: 'FinalLossRate' },

  { id: 'pilotMonths', group: 'pilot', label: 'Pilot length', kind: 'count', suffix: 'months', default: 6, max: 24 },
  { id: 'pilotHTN', group: 'pilot', label: 'Pilot patients, hypertension', kind: 'count', default: 500 },
  { id: 'pilotDM', group: 'pilot', label: 'Pilot patients, diabetes', kind: 'count', default: 300 },
  { id: 'pilotHF', group: 'pilot', label: 'Pilot patients, heart failure', kind: 'count', default: 100 },
  { id: 'pilotDischarges', group: 'pilot', label: 'Pilot discharges in transitions of care', kind: 'count', suffix: 'over pilot', default: 250 },

  { id: 'scaleEnroll', group: 'scale', label: 'Eligible chronic patients enrolled', kind: 'percent', default: pctOf('scaleEnroll'), assumptionId: 'scaleEnroll' },
  { id: 'tocScale', group: 'scale', label: 'Admissions enrolled in transitions of care', kind: 'percent', default: pctOf('tocScale'), assumptionId: 'tocScale' },

  { id: 'pmpm', group: 'pricing', label: 'Chronic care price', kind: 'currency', suffix: 'PMPM', step: 0.5, default: fixed('pmpm'), assumptionId: 'pmpm', placeholder: true },
  { id: 'episodeFee', group: 'pricing', label: 'Transitions-of-care price', kind: 'currency', suffix: 'per episode', default: fixed('episodeFee'), assumptionId: 'episodeFee', placeholder: true },

  {
    id: 'baselineAdherence', group: 'clinical', label: 'Baseline adherence in enrolled patients (PDC ≥ 80%)', kind: 'percent', default: 60,
    help: 'Medicare Part D adherence is often 80–90% population-wide. 60% assumes the ACO enrolls patients with a known adherence gap.',
  },
  { id: 'prevHTN', group: 'clinical', label: 'Prevalence, hypertension', kind: 'percent', default: pctOf('prevHTN'), assumptionId: 'prevHTN' },
  { id: 'prevDM', group: 'clinical', label: 'Prevalence, diabetes', kind: 'percent', default: pctOf('prevDM'), assumptionId: 'prevDM' },
  { id: 'prevHF', group: 'clinical', label: 'Prevalence, heart failure', kind: 'percent', default: pctOf('prevHF'), assumptionId: 'prevHF' },

  { id: 'savingsHTN', group: 'advanced', label: 'Savings per newly adherent patient, hypertension', kind: 'currency', suffix: '/ yr', default: fixed('savingsHTN'), assumptionId: 'savingsHTN' },
  { id: 'savingsDM', group: 'advanced', label: 'Savings per newly adherent patient, diabetes', kind: 'currency', suffix: '/ yr', default: fixed('savingsDM'), assumptionId: 'savingsDM' },
  { id: 'savingsCHF', group: 'advanced', label: 'Savings per newly adherent patient, heart failure', kind: 'currency', suffix: '/ yr', default: fixed('savingsCHF'), assumptionId: 'savingsCHF' },
];

export const ASSUMPTION_IDS = [
  'engagement', 'adherenceOR', 'realization', 'tocCompletion', 'readmitReduction',
  'savingsHTN', 'savingsDM', 'savingsCHF', 'costPerAdmit', 'prevHTN', 'prevDM', 'prevHF',
  'scaleEnroll', 'tocScale', 'pmpm', 'episodeFee',
];

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

function scenarioParams(scenarioId, n) {
  const s = (id) => scenarioValue(id, scenarioId);
  return {
    engagement: s('engagement'),
    adherenceOR: s('adherenceOR'),
    realization: s('realization'),
    tocCompletion: s('tocCompletion'),
    readmitReduction: s('readmitReduction'),
    savingsPerAdherent: { htn: n('savingsHTN'), dm: n('savingsDM'), hf: n('savingsCHF') },
    readmitCost: n('costPerAdmit'),
  };
}

export function compute(values, scenarioId) {
  const n = (id) => nonNeg(values[id]);
  const pct = (id) => n(id) / 100;
  const params = scenarioParams(scenarioId, n);
  const common = { baselineAdherence: pct('baselineAdherence'), baselineReadmitRate: pct('baselineReadmit'), pmpm: n('pmpm'), episodeFee: n('episodeFee') };

  // ---- pilot ----
  // Chronic care savings and fees accrue monthly; TOC savings land within 30
  // days of each discharge, so TOC is not prorated.
  const months = Math.min(24, n('pilotMonths'));
  const f = months / 12;
  const pilotAnnual = estimate(
    { ...common, enrolled: { htn: n('pilotHTN'), dm: n('pilotDM'), hf: n('pilotHF') }, discharges: n('pilotDischarges') },
    params,
  );
  const pilot = {
    months,
    cohort: pilotAnnual.enrolledTotal,
    discharges: pilotAnnual.discharges,
    newlyAdherent: pilotAnnual.newlyAdherentTotal,
    adherenceSavings: pilotAnnual.adherenceSavings * f,
    readmitsAvoided: pilotAnnual.readmitsAvoided,
    readmitSavings: pilotAnnual.readmitSavings,
    chronicCost: pilotAnnual.chronicCost * f,
    tocCost: pilotAnnual.tocCost,
  };
  pilot.gross = pilot.adherenceSavings + pilot.readmitSavings;
  pilot.cost = pilot.chronicCost + pilot.tocCost;
  pilot.net = pilot.gross - pilot.cost;
  pilot.roi = safeDivide(pilot.gross, pilot.cost);

  // ---- scorecard: what the pilot can and cannot prove ----
  const p0 = pilotAnnual.p0;
  const adherenceTarget = p0 + pilotAnnual.engagement * pilotAnnual.adherenceLift;
  const r0 = pilotAnnual.baselineReadmitRate;
  const readmitTarget = r0 * (1 - pilotAnnual.completion * pilotAnnual.relativeReduction);
  const nAdh = sampleSizePerArm(p0, adherenceTarget);
  const nReadmit = sampleSizePerArm(r0, readmitTarget);
  const scorecard = [
    { metric: 'Engagement (share of enrolled who respond)', baseline: null, target: params.engagement, format: 'percent0', required: null, have: pilot.cohort, measure: 'Counted directly from message logs' },
    { metric: 'PDC ≥ 80% among enrolled (intent to treat)', baseline: p0, target: adherenceTarget, format: 'percent1', required: nAdh, have: pilot.cohort, measure: 'Pharmacy claims or PDC from Part D plan data' },
    { metric: 'Transitions-of-care completion', baseline: null, target: params.tocCompletion, format: 'percent0', required: null, have: pilot.discharges, measure: 'Counted directly from program logs' },
    { metric: '30-day readmission rate, TOC cohort (intent to treat)', baseline: r0, target: readmitTarget, format: 'percent1', required: nReadmit, have: pilot.discharges, measure: 'ACO CCLF claims vs. a matched comparison group' },
  ].map((row) => ({ ...row, detectable: row.required === null ? null : row.have >= row.required }));

  // ---- scale ----
  const lum = n('lum');
  const scaleShare = pct('scaleEnroll');
  const eligible = { htn: lum * pct('prevHTN'), dm: lum * pct('prevDM'), hf: lum * pct('prevHF') };
  const annualAdmits = (lum * n('admitsPer1000')) / 1000;
  const scaleInputs = {
    ...common,
    enrolled: { htn: eligible.htn * scaleShare, dm: eligible.dm * scaleShare, hf: eligible.hf * scaleShare },
    discharges: annualAdmits * pct('tocScale'),
  };
  const scale = estimate(scaleInputs, params);

  // ---- MSSP pass-through ----
  const benchmark = n('benchmarkTotal');
  const terms = { benchmark, msr: pct('msr'), shareRate: pct('shareRate'), lossRate: pct('lossRate') };
  const baselineSavings = (benchmark * (Number(values.baselineSavingsRate) || 0)) / 100;
  const acoShare = msspIncremental(baselineSavings, scale.gross, terms);
  const acoNet = acoShare - scale.programCost;
  const medicareKeeps = scale.gross - acoShare;
  const savingsPctOfBenchmark = safeDivide(scale.gross, benchmark);
  const msrGap = Math.max(0, pct('msr') * benchmark - baselineSavings);

  const acoNetAt = (k) => msspIncremental(baselineSavings, estimate(scaleInputs, { ...params, effectMultiplier: k }).gross, terms) - scale.programCost;
  const grossNetAt = (k) => estimate(scaleInputs, { ...params, effectMultiplier: k }).gross - scale.programCost;
  const breakEven = { aco: solveIncreasing(acoNetAt), total: solveIncreasing(grossNetAt) };

  const result = {
    scenarioId, params, pilot, pilotAnnual, scorecard, eligible, annualAdmits, scale,
    benchmark, baselineSavings, terms, acoShare, acoNet, medicareKeeps, savingsPctOfBenchmark, msrGap, breakEven,
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
  const or = fmt(r.params.adherenceOR, 'odds');
  const p0 = fmt(pa.p0, 'prob3');
  return [
    {
      title: '1. Adherence effect per enrolled patient',
      steps: [
        { formula: 'p₁ = OR · p₀ / (1 − p₀ + OR · p₀)', live: `${or} × ${p0} / (1 − ${p0} + ${or} × ${p0}) = ${fmt(pa.p1, 'prob3')}`, refs: ['adherenceOR', 'input:baselineAdherence'] },
        { formula: 'Newly adherent = enrolled × engagement × (p₁ − p₀)', live: `per enrolled patient: ${pc(pa.engagement)} × ${fmt(pa.adherenceLift, 'prob3')} = ${fmt(pa.engagement * pa.adherenceLift, 'prob3')}`, refs: ['engagement'] },
      ],
    },
    {
      title: '2. Pilot',
      steps: [
        { formula: 'Adherence savings = Σ newly adherent × savings per patient × realization × months / 12', live: `${n1(pa.newlyAdherentTotal)} newly adherent → ${$(pa.adherenceSavings)} per year × ${r.pilot.months} / 12 = ${$(r.pilot.adherenceSavings)}`, refs: ['savingsHTN', 'savingsDM', 'savingsCHF', 'realization'] },
        { formula: 'Readmissions avoided = discharges × completion × baseline rate × relative reduction', live: `${n0(pa.discharges)} × ${pc(pa.completion)} × ${p1(pa.baselineReadmitRate)} × ${pc(pa.relativeReduction)} = ${n1(pa.readmitsAvoided)} × ${$(pa.readmitCost)} = ${$(r.pilot.readmitSavings)}`, refs: ['tocCompletion', 'readmitReduction', 'input:baselineReadmit', 'costPerAdmit'] },
        { formula: 'Pilot cost = cohort × PMPM × months + discharges × episode fee', live: `${n0(r.pilot.cohort)} × ${fmt(pa.pmpm, 'currency2')} × ${r.pilot.months} + ${n0(pa.discharges)} × ${$(pa.episodeFee)} = ${$(r.pilot.cost)}`, refs: ['pmpm', 'episodeFee'] },
      ],
    },
    {
      title: '3. Pilot sample size (can the pilot prove it?)',
      steps: r.scorecard.filter((x) => x.required !== null).map((x) => ({
        formula: `${x.metric}: n per arm = (zα + zβ)² · [p₁(1−p₁) + p₂(1−p₂)] / (p₁ − p₂)²`,
        live: `${p1(x.baseline)} vs ${p1(x.target)} → ${n0(x.required)} per arm needed; pilot has ${n0(x.have)}`,
        refs: ['stats'],
      })),
    },
    {
      title: '4. At scale',
      steps: [
        { formula: 'Eligible = LUM × prevalence; enrolled = eligible × enrollment share', live: `${n0(values.lum)} × (${pc(Number(values.prevHTN) / 100)} / ${pc(Number(values.prevDM) / 100)} / ${pc(Number(values.prevHF) / 100)}) × ${pc(Number(values.scaleEnroll) / 100)} = ${n0(s.enrolledTotal)} enrolled`, refs: ['input:lum', 'prevHTN', 'prevDM', 'prevHF', 'scaleEnroll'] },
        { formula: 'TOC discharges = LUM × admissions per 1,000 / 1,000 × TOC share', live: `${n0(r.annualAdmits)} admissions × ${pc(Number(values.tocScale) / 100)} = ${n0(s.discharges)}`, refs: ['input:admitsPer1000', 'tocScale'] },
        { formula: 'Gross Part A/B savings = adherence savings + readmission savings', live: `${$(s.adherenceSavings)} + ${$(s.readmitSavings)} = ${$(s.gross)} (${fmt(r.savingsPctOfBenchmark, 'percent1')} of benchmark)`, refs: [] },
        { formula: 'Program cost = enrolled × PMPM × 12 + discharges × episode fee', live: `${$(s.chronicCost)} + ${$(s.tocCost)} = ${$(s.programCost)}`, refs: ['pmpm', 'episodeFee'] },
      ],
    },
    {
      title: '5. What the ACO keeps (MSSP pass-through)',
      steps: [
        { formula: 'Baseline savings = benchmark × savings rate before the program', live: `${$(r.benchmark)} × ${p1(Number(values.baselineSavingsRate) / 100)} = ${$(r.baselineSavings)}; MSR threshold ${$(r.terms.msr * r.benchmark)}`, refs: ['input:benchmarkTotal', 'input:baselineSavingsRate', 'input:msr'] },
        { formula: 'ACO share = settlement(baseline + program savings) − settlement(baseline)', live: `${$(r.acoShare)} at a ${pc(r.terms.shareRate)} sharing rate${r.terms.lossRate > 0 ? `, ${pc(r.terms.lossRate)} loss rate` : ''}`, refs: ['mssp'] },
        { formula: 'ACO net = ACO share − program cost', live: `${$(r.acoShare)} − ${$(s.programCost)} = ${$(r.acoNet)}`, refs: [] },
        { formula: 'Break-even = smallest share of the bet at which ACO net ≥ 0', live: `${r.breakEven.aco === null ? 'not reached at 10× the bet' : pc(r.breakEven.aco)} of the ${r.scenarioId === 'base' ? 'base-case' : 'scenario'} effect`, refs: [] },
      ],
    },
  ];
}

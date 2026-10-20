// Phase 1 module: core population (chronic-condition adherence + transitions of care).
//
// Module contract (every buyer module exports this shape):
//   id, label, assumptionIds[], inputs[], compute(values, scenarioId)
// `values` are raw input values keyed by input id, in display units
// (percent inputs as 0-100). compute() returns { result, headline, breakdown,
// math, caveats, comparison } and never touches the DOM.

import { ASSUMPTIONS, scenarioValue } from '../assumptions.js';
import { estimate } from '../model/core.js';
import { fmt } from '../format.js';

const CONDITION_LABELS = { htn: 'Hypertension', dm: 'Diabetes', hf: 'Heart failure' };

const fixed = (id) => ASSUMPTIONS[id].value;

const inputs = [
  { id: 'enrolledHTN', group: 'population', label: 'Enrolled patients, hypertension', kind: 'count', default: 1000 },
  { id: 'enrolledDM', group: 'population', label: 'Enrolled patients, diabetes', kind: 'count', default: 600 },
  { id: 'enrolledHF', group: 'population', label: 'Enrolled patients, heart failure', kind: 'count', default: 150 },
  {
    id: 'baselineAdherence', group: 'population', label: 'Baseline medication adherence (PDC ≥ 80%)',
    kind: 'percent', default: 60,
    help: 'MA Part D adherence rates are often 80–90%, which shrinks the gap.',
  },
  { id: 'discharges', group: 'toc', label: 'Annual discharges enrolled in transitions of care', kind: 'count', default: 500 },
  { id: 'baselineReadmit', group: 'toc', label: 'Baseline 30-day all-cause readmission rate', kind: 'percent', default: 17 },
  {
    id: 'pmpm', group: 'pricing', label: 'Program price, chronic care', kind: 'currency', suffix: 'PMPM',
    step: 0.5, default: fixed('pmpm'), assumptionId: 'pmpm', placeholder: true,
    help: 'Placeholder, not Generated Health pricing.',
  },
  {
    id: 'episodeFee', group: 'pricing', label: 'Program price, transitions of care', kind: 'currency', suffix: 'per episode',
    default: fixed('episodeFee'), assumptionId: 'episodeFee', placeholder: true,
    help: 'Placeholder, not Generated Health pricing.',
  },
  { id: 'savingsHTN', group: 'advanced', label: 'Net savings per newly adherent patient, hypertension', kind: 'currency', suffix: '/ yr', default: fixed('savingsHTN'), assumptionId: 'savingsHTN' },
  { id: 'savingsDM', group: 'advanced', label: 'Net savings per newly adherent patient, diabetes', kind: 'currency', suffix: '/ yr', default: fixed('savingsDM'), assumptionId: 'savingsDM' },
  { id: 'savingsCHF', group: 'advanced', label: 'Net savings per newly adherent patient, heart failure', kind: 'currency', suffix: '/ yr', default: fixed('savingsCHF'), assumptionId: 'savingsCHF' },
  { id: 'readmitCost', group: 'advanced', label: 'Average cost of a readmission', kind: 'currency', default: fixed('readmitCost'), assumptionId: 'readmitCost' },
];

const groups = [
  { id: 'population', label: 'Chronic care population' },
  { id: 'toc', label: 'Transitions of care' },
  { id: 'pricing', label: 'Program pricing' },
  { id: 'advanced', label: 'Advanced: fixed literature assumptions', collapsible: true },
];

function compute(values, scenarioId) {
  const n = (id) => Number(values[id]) || 0;
  const s = (id) => scenarioValue(id, scenarioId);

  const params = {
    engagement: s('engagement'),
    adherenceOR: s('adherenceOR'),
    realization: s('realization'),
    tocCompletion: s('tocCompletion'),
    readmitReduction: s('readmitReduction'),
    savingsPerAdherent: { htn: n('savingsHTN'), dm: n('savingsDM'), hf: n('savingsCHF') },
    readmitCost: n('readmitCost'),
  };
  const r = estimate(
    {
      enrolled: { htn: n('enrolledHTN'), dm: n('enrolledDM'), hf: n('enrolledHF') },
      baselineAdherence: n('baselineAdherence') / 100,
      discharges: n('discharges'),
      baselineReadmitRate: n('baselineReadmit') / 100,
      pmpm: n('pmpm'),
      episodeFee: n('episodeFee'),
    },
    params,
  );

  const $ = (v) => fmt(v, 'currency0');
  const pct = (v) => fmt(v, 'percent0');
  const num1 = (v) => fmt(v, 'number1');
  const or = fmt(params.adherenceOR, 'odds');
  const p0 = fmt(r.p0, 'prob3');
  const savingsRefs = { htn: 'savingsHTN', dm: 'savingsDM', hf: 'savingsCHF' };

  const headline = [
    { id: 'net', label: 'Net annual savings', value: r.net, format: 'currency0', primary: true },
    { id: 'roi', label: 'ROI multiple (gross savings / program cost)', value: r.roi, format: 'multiple', primary: true },
    { id: 'gross', label: 'Gross annual savings', value: r.gross, format: 'currency0' },
    { id: 'cost', label: 'Annual program cost', value: r.programCost, format: 'currency0' },
  ];

  const breakdown = [
    { section: 'Medication adherence' },
    ...Object.entries(CONDITION_LABELS).map(([c, label]) => ({
      label: `Newly adherent patients, ${label.toLowerCase()}`,
      value: r.conditions[c].newlyAdherent,
      format: 'number1',
      indent: true,
    })),
    { label: 'Adherence savings', value: r.adherenceSavings, format: 'currency0', total: true },
    { section: 'Transitions of care' },
    { label: 'Readmissions avoided', value: r.readmitsAvoided, format: 'number1', indent: true },
    { label: 'Readmission savings', value: r.readmitSavings, format: 'currency0', total: true },
    { section: 'Cost and return' },
    { label: 'Chronic care program cost', value: r.chronicCost, format: 'currency0', indent: true },
    { label: 'Transitions-of-care program cost', value: r.tocCost, format: 'currency0', indent: true },
    { label: 'Total program cost', value: r.programCost, format: 'currency0', total: true },
    { label: 'Net annual savings', value: r.net, format: 'currency0', total: true },
    { label: 'Break-even chronic care PMPM (TOC fee held constant)', value: r.breakEvenPMPM, format: 'currency2', total: true },
  ];

  const math = [
    {
      title: '1. Adherence probability with SMS',
      steps: [
        {
          formula: 'p₁ = OR · p₀ / (1 − p₀ + OR · p₀)',
          live: `${or} × ${p0} / (1 − ${p0} + ${or} × ${p0}) = ${fmt(r.p1, 'prob3')}`,
          refs: ['adherenceOR', 'input:baselineAdherence'],
        },
        {
          formula: 'Adherence lift = p₁ − p₀',
          live: `${fmt(r.p1, 'prob3')} − ${p0} = ${fmt(r.adherenceLift, 'prob3')} (${fmt(r.adherenceLift, 'percent1')} points)`,
          refs: [],
        },
      ],
    },
    {
      title: '2. Newly adherent patients and adherence savings',
      steps: [
        ...Object.entries(CONDITION_LABELS).map(([c, label]) => {
          const k = r.conditions[c];
          return {
            formula: `${label}: N × engagement × lift × savings × realization`,
            live: `${fmt(k.enrolled, 'number0')} × ${pct(r.engagement)} × ${fmt(r.adherenceLift, 'prob3')} = ${num1(k.newlyAdherent)} patients × ${$(k.savingsPerPatient)} × ${pct(r.realization)} = ${$(k.savings)}`,
            refs: ['engagement', savingsRefs[c], 'realization'],
          };
        }),
        {
          formula: 'Adherence savings = sum across conditions',
          live: `${$(r.conditions.htn.savings)} + ${$(r.conditions.dm.savings)} + ${$(r.conditions.hf.savings)} = ${$(r.adherenceSavings)}`,
          refs: [],
        },
      ],
    },
    {
      title: '3. Readmissions avoided',
      steps: [
        {
          formula: 'Avoided = discharges × completion × baseline rate × relative reduction',
          live: `${fmt(r.discharges, 'number0')} × ${pct(r.completion)} × ${fmt(r.baselineReadmitRate, 'percent1')} × ${pct(r.relativeReduction)} = ${num1(r.readmitsAvoided)}`,
          refs: ['tocCompletion', 'input:baselineReadmit', 'readmitReduction'],
        },
        {
          formula: 'Readmission savings = avoided × cost per readmission',
          live: `${num1(r.readmitsAvoided)} × ${$(r.readmitCost)} = ${$(r.readmitSavings)}`,
          refs: ['readmitCost'],
        },
      ],
    },
    {
      title: '4. Program cost, net, and ROI',
      steps: [
        {
          formula: 'Program cost = total enrolled × PMPM × 12 + discharges × episode fee',
          live: `${fmt(r.enrolledTotal, 'number0')} × ${fmt(r.pmpm, 'currency2')} × 12 + ${fmt(r.discharges, 'number0')} × ${$(r.episodeFee)} = ${$(r.programCost)}`,
          refs: ['pmpm', 'episodeFee'],
        },
        {
          formula: 'Net = adherence savings + readmission savings − program cost',
          live: `${$(r.adherenceSavings)} + ${$(r.readmitSavings)} − ${$(r.programCost)} = ${$(r.net)}`,
          refs: [],
        },
        {
          formula: 'ROI multiple = gross savings / program cost',
          live: `${$(r.gross)} / ${$(r.programCost)} = ${fmt(r.roi, 'multiple')}`,
          refs: [],
        },
        {
          formula: 'Break-even PMPM = (gross − TOC cost) / (total enrolled × 12)',
          live: `(${$(r.gross)} − ${$(r.tocCost)}) / ${fmt(r.memberMonths, 'number0')} member-months = ${fmt(r.breakEvenPMPM, 'currency2')}`,
          refs: [],
        },
      ],
    },
  ];

  const caveats = [
    'Patients with heart failure may appear in both the chronic and TOC populations; estimates may double-count if they overlap.',
    'Adherence savings use 2011-dollar literature values from an observational study and are not inflation-adjusted.',
  ];

  return {
    result: r,
    headline,
    breakdown,
    math,
    caveats,
    comparison: { label: 'Net annual savings', value: r.net, format: 'currency0', sub: { value: r.roi, format: 'multiple' } },
  };
}

export default {
  id: 'population',
  label: 'Core population',
  assumptionIds: ['engagement', 'adherenceOR', 'realization', 'tocCompletion', 'readmitReduction', 'savingsHTN', 'savingsDM', 'savingsCHF', 'readmitCost', 'pmpm', 'episodeFee'],
  groups,
  inputs,
  compute,
};

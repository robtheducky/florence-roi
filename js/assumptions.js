// Single source of truth for every model parameter.
//
// Scenario-dependent parameters carry low / base / high values that map to the
// Conservative / Base / Vendor-reported scenarios. Fixed parameters carry one
// `value` and are editable in the Advanced drawer. `verify: true` renders a
// "needs validation" badge wherever the parameter appears.

export const SCENARIOS = [
  { id: 'conservative', label: 'Conservative', key: 'low' },
  { id: 'base', label: 'Base', key: 'base' },
  { id: 'vendor', label: 'Vendor-reported', key: 'high' },
];

export const DEFAULT_SCENARIO = 'base';

export const SOURCES = {
  thakkar: {
    short: 'Thakkar et al., JAMA Intern Med 2016',
    full: 'Thakkar J, et al. Mobile telephone text messaging for medication adherence in chronic disease: a meta-analysis. JAMA Intern Med. 2016;176(3):340-349.',
    url: 'https://doi.org/10.1001/jamainternmed.2015.7667',
  },
  roebuck: {
    short: 'Roebuck et al., Health Affairs 2011',
    full: 'Roebuck MC, et al. Medication adherence leads to lower health care use and costs despite increased drug spending. Health Aff. 2011;30(1):91-99.',
    url: 'https://doi.org/10.1377/hlthaff.2010.0421',
  },
  cmsResults: {
    short: 'CMS MSSP PY2024 results PUF',
    full: 'Shared Savings Program Performance Year Financial and Quality Results, PY2024 (revised 2026-07-17). ACO-level public use file.',
    url: 'https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results',
  },
  mssp: {
    short: 'MSSP financial methodology',
    full: 'Shared Savings Program financial reconciliation rules (MSR, sharing rate, loss rate). Simplified here; verify against the current year\u2019s CMS documentation.',
    url: 'https://www.cms.gov/medicare/payment/fee-for-service-providers/shared-savings-program-ssp-acos/guidance-regulations',
  },
  ccw: {
    short: 'CMS Chronic Conditions Data Warehouse',
    full: 'Approximate national Medicare fee-for-service prevalence from CMS chronic condition reporting. Confirm against the current CCW tables, or replace with the ACO\u2019s own registry counts.',
    url: 'https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts',
  },
  stats: {
    short: 'Two-proportion sample size',
    full: 'Standard two-sided two-proportion z-test, alpha 0.05, power 0.80, equal arms. Assumes a comparable comparison group.',
    url: null,
  },
  vendor: {
    short: 'Vendor-reported (public website)',
    full: 'Figures reported on the vendor’s public website. Not peer reviewed. Capture the exact page and date before relying on them.',
    url: null,
  },
  author: {
    short: 'Author assumption',
    full: 'Assumption chosen by the author of this prototype. Replace with client data or a cited source.',
    url: null,
  },
};

export const ASSUMPTIONS = {
  engagement: {
    label: 'Engagement (share of enrolled who actively respond)',
    unit: 'share',
    format: 'percent0',
    low: 0.5,
    base: 0.7,
    high: 0.8,
    sources: ['vendor', 'author'],
    note: 'Vendor site reports 77–88% response rates. Conservative and Base values are author assumptions.',
    verify: true,
  },
  adherenceOR: {
    label: 'Adherence odds ratio from SMS',
    unit: 'odds ratio',
    format: 'odds',
    low: 1.68,
    base: 2.11,
    high: 2.11,
    sources: ['thakkar'],
    note: 'Meta-analysis of 16 RCTs, n=2,742. OR 2.11 (95% CI 1.52–2.93); 1.68 after adjusting for publication bias.',
    verify: false,
  },
  realization: {
    label: 'Realization of literature savings',
    unit: 'share',
    format: 'percent0',
    low: 0.5,
    base: 0.75,
    high: 1.0,
    sources: ['author'],
    note: 'Haircut because Roebuck is observational and reported in 2011 dollars.',
    verify: false,
  },
  tocCompletion: {
    label: 'Transitions-of-care program completion',
    unit: 'share',
    format: 'percent0',
    low: 0.5,
    base: 0.65,
    high: 0.73,
    sources: ['vendor', 'author'],
    note: 'Vendor reports 73% post-discharge completion. Conservative and Base values are author assumptions.',
    verify: true,
  },
  readmitReduction: {
    label: 'Relative reduction in 30-day readmissions among completers',
    unit: 'share',
    format: 'percent0',
    low: 0.1,
    base: 0.15,
    high: 0.29,
    sources: ['vendor', 'author'],
    note: '29% is vendor-reported (single hospital, n not disclosed). 10% and 15% are author placeholders.',
    verify: true,
  },
  savingsHTN: {
    label: 'Net annual savings per newly adherent patient, hypertension',
    unit: 'USD per patient-year',
    format: 'currency0',
    value: 3908,
    sources: ['roebuck'],
    note: 'Net of added drug spend. 2011 dollars. About 135k patients, observational. ACO benchmarks cover Parts A and B only, so the added Part D drug spend does not hit the ACO; using the net figure is conservative for an ACO.',
    verify: false,
  },
  savingsDM: {
    label: 'Net annual savings per newly adherent patient, diabetes',
    unit: 'USD per patient-year',
    format: 'currency0',
    value: 3756,
    sources: ['roebuck'],
    note: 'Net of added drug spend. 2011 dollars.',
    verify: false,
  },
  savingsCHF: {
    label: 'Net annual savings per newly adherent patient, heart failure',
    unit: 'USD per patient-year',
    format: 'currency0',
    value: 7823,
    sources: ['roebuck'],
    note: 'Net of added drug spend. 2011 dollars.',
    verify: false,
  },
  costPerAdmit: {
    label: 'Cost per short-term inpatient admission',
    unit: 'USD per admission',
    format: 'currency0',
    value: 12354,
    sources: ['cmsResults'],
    note: 'Derived per ACO: short-term inpatient spend per capita \u00f7 short-term admissions per capita (CapAnn_INP_S_trm \u00f7 ADM_S_Trm). Default is the MSSP median. A readmission may cost more or less than the average admission.',
    verify: false,
  },
  prevHTN: {
    label: 'Prevalence among assigned beneficiaries, hypertension',
    unit: 'share',
    format: 'percent0',
    value: 0.57,
    sources: ['ccw'],
    note: 'Approximate national Medicare FFS prevalence. Replace with the ACO\u2019s registry count when available.',
    verify: true,
  },
  prevDM: {
    label: 'Prevalence among assigned beneficiaries, diabetes',
    unit: 'share',
    format: 'percent0',
    value: 0.27,
    sources: ['ccw'],
    note: 'Approximate national Medicare FFS prevalence.',
    verify: true,
  },
  prevHF: {
    label: 'Prevalence among assigned beneficiaries, heart failure',
    unit: 'share',
    format: 'percent0',
    value: 0.14,
    sources: ['ccw'],
    note: 'Approximate national Medicare FFS prevalence.',
    verify: true,
  },
  scaleEnroll: {
    label: 'Share of eligible patients enrolled at scale',
    unit: 'share',
    format: 'percent0',
    value: 0.3,
    sources: ['author'],
    note: 'An ACO decision, not a fact. Most ACOs would target patients with an adherence gap rather than everyone with the condition.',
    verify: false,
  },
  tocScale: {
    label: 'Share of short-term admissions enrolled in transitions of care at scale',
    unit: 'share',
    format: 'percent0',
    value: 0.5,
    sources: ['author'],
    note: 'Depends on ADT feed coverage across the ACO\u2019s hospitals.',
    verify: false,
  },
  pmpm: {
    label: 'Program price, chronic care',
    unit: 'USD PMPM',
    format: 'currency2',
    value: 8,
    sources: ['author'],
    note: 'Placeholder. Not Generated Health pricing.',
    verify: false,
    placeholder: true,
  },
  episodeFee: {
    label: 'Program price, transitions of care',
    unit: 'USD per discharge episode',
    format: 'currency0',
    value: 50,
    sources: ['author'],
    note: 'Placeholder. Not Generated Health pricing.',
    verify: false,
    placeholder: true,
  },
};

export function isScenarioDependent(assumption) {
  return assumption.value === undefined;
}

// Value of an assumption under a scenario id. Fixed assumptions ignore the scenario.
export function scenarioValue(id, scenarioId) {
  const a = ASSUMPTIONS[id];
  if (!a) throw new Error(`Unknown assumption: ${id}`);
  if (!isScenarioDependent(a)) return a.value;
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  return a[scenario.key];
}

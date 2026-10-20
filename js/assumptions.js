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
  hcup: {
    short: 'AHRQ HCUP Statistical Brief #278',
    full: 'AHRQ Healthcare Cost and Utilization Project (HCUP) Statistical Brief #278. 2018 data, all payers.',
    url: 'https://hcup-us.ahrq.gov/reports/statbriefs/statbriefs.jsp',
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
    note: 'Net of added drug spend. 2011 dollars. About 135k patients, observational.',
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
  readmitCost: {
    label: 'Average cost of a readmission',
    unit: 'USD per readmission',
    format: 'currency0',
    value: 15200,
    sources: ['hcup'],
    note: 'All payers, 2018. Confirm the brief number before external use: the $15,200 all-payer figure may come from HCUP Statistical Brief #248.',
    verify: true,
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

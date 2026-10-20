// "What if you build it yourself?" inputs: build steps, interventions, and rates.
//
// Build steps come from the Flo SMS cost model (Rob Martin, October 2026):
// one-time cost, monthly cost, per-segment usage, and year-1 hours are copied
// from its Build-buy tab. The HIPAA program row is left out: most aggregators
// selling into ACOs already run one. Calendar weeks, dependencies, and "if skipped"
// effects are author assumptions; the cost model does not include them.
// Steps marked `added: true` are not in the cost model.

export const COST_MODEL = {
  short: 'Flo SMS cost model (Oct 2026)',
  full: 'Flo_SMS_Cost_Model.xlsx: Build-buy, Scenario, and Per-Message Rates tabs. AWS End User Messaging pricing, 10DLC fees, carrier pass-through fees, and AWS list prices as cited in the workbook.',
};

// US per-segment rates (Per-Message Rates tab).
export const RATES = {
  outboundPerSegment: 0.00917, // blended 10DLC: AWS base $0.0058 + share-weighted carrier fee
  inboundPerSegment: 0.0058,
  otherUsagePerSegment: 0.0000126, // logs + Lambda + supporting services (Build-buy F6:F10)
  segmentsPerMessage: 1.3, // assumption: most messages fit in 160 GSM-7 characters; some run to two
};

export const LABOR = {
  engRate: 100, // $/hr blended engineering (Scenario!B9)
  rnRate: 58, // $/hr loaded RN (Scenario!B8)
  clinicalRate: 120, // $/hr physician/NP protocol review (assumption)
  minutesPerEscalation: 4, // Scenario!B7
  engHoursPerWeek: 32, // productive hours per engineer-week (assumption)
  hoursPerFte: 2000,
};

// Effects when a step is skipped.
//   blocks: 'all' or a list of intervention ids that cannot run
//   weakens: { factor, applies: 'all' | [ids] } multiplies the share of
//            patients the intervention actually reaches
export const STEPS = [
  {
    id: 'protocols', added: true, label: 'Clinical protocols written and signed off',
    owner: 'Clinical', oneTime: 0, monthly: 0, perSegment: 0, engHours: 0, clinicalHours: 160, runHours: 40, weeks: 8, after: [],
    skip: { blocks: 'all', why: 'No approved message content or escalation rules to send.' },
    detail: 'Decision trees, message copy, escalation thresholds, and clinical sign-off for each intervention. Flo ships these from its clinical team.',
  },
  {
    id: 'aws', label: 'AWS End User Messaging (SMS outbound + inbound)',
    owner: 'Engineering', oneTime: 0, monthly: 0, perSegment: 0, engHours: 80, buildHours: 40, runHours: 80, weeks: 0, after: [],
    skip: { blocks: 'all', why: 'Nothing sends or receives texts.' },
    detail: 'Pay per segment, no minimum; BAA free via AWS Artifact. 40 hrs setup + 40 hrs ops in year 1.',
  },
  {
    id: 'supporting', label: 'Supporting AWS services (API Gateway, DynamoDB, KMS, WAF)',
    owner: 'Engineering', oneTime: 0, monthly: 35, perSegment: 0.000002, engHours: 0, runHours: 0, weeks: 0, after: ['aws'],
    skip: { blocks: 'all', why: 'No encrypted store for patient data, so PHI cannot be handled.' },
    detail: 'KMS $1/key; WAF $5/ACL + $1/rule; DynamoDB on demand; HTTP API $1/1M. Labor is in the bot and inbox rows.',
  },
  {
    id: 'number', label: 'Originating phone number (10DLC)',
    owner: 'Vendor', oneTime: 0, monthly: 1, perSegment: 0, engHours: 8, runHours: 8, weeks: 1, after: ['aws'],
    skip: { blocks: 'all', why: 'No number to send from.' },
    detail: '10DLC $1/number/mo; toll-free $2/number/mo with 2-4 week verification.',
  },
  {
    id: 'brand', label: '10DLC brand registration',
    owner: 'Vendor', oneTime: 46, monthly: 0, perSegment: 0, engHours: 8, runHours: 8, weeks: 2, after: ['aws'],
    skip: { blocks: 'all', why: 'Carriers block unregistered application-to-person traffic.' },
    detail: '$4.50 registration + $41.50 standard vet. Add $12.50 if publicly traded.',
  },
  {
    id: 'consent', added: true, label: 'Patient consent, opt-in, and STOP/HELP handling',
    owner: 'Engineering', oneTime: 0, monthly: 0, perSegment: 0, engHours: 80, runHours: 20, weeks: 0, after: ['aws'],
    skip: { blocks: 'all', why: 'Texting patients without documented consent violates the TCPA; carriers also require the opt-in flow for campaign approval.' },
    detail: 'Consent capture and records, opt-out handling, quiet hours. Assumption: 80 engineering hours plus legal review.',
  },
  {
    id: 'campaign', label: '10DLC campaign vetting and registration',
    owner: 'Vendor', oneTime: 15, monthly: 10, perSegment: 0, engHours: 24, runHours: 24, weeks: 4, after: ['brand', 'consent', 'protocols'],
    skip: { blocks: 'all', why: 'Carriers filter or block traffic without an approved campaign.' },
    detail: '~$15 vetting; $10/mo standard campaign (3-month minimum). Needs sample messages and the opt-in flow. Weeks assume one rejection and resubmission.',
  },
  {
    id: 'bot', label: 'Two-way bot logic and workflow routing (AWS Lambda)',
    owner: 'Engineering', oneTime: 0, monthly: 0, perSegment: 0.0000006, engHours: 600, buildHours: 400, runHours: 200, weeks: 0, after: ['protocols', 'supporting'],
    skip: { blocks: ['bp', 'hf', 'copd', 'toc'], weakens: { factor: 0.6, applies: ['meds'] }, why: 'Texts go out but replies are never read or acted on. Reading-based programs stop working; reminders become one-way.' },
    detail: '400 build + 200 run hours in year 1; ~200/yr after. Within the Lambda free tier at this volume.',
  },
  {
    id: 'inbox', label: 'Secure nurse inbox for messages the bot cannot answer (Cognito + S3)',
    owner: 'Engineering', oneTime: 0, monthly: 0, perSegment: 0, engHours: 400, buildHours: 300, runHours: 100, weeks: 0, after: ['supporting'],
    skip: { blocks: ['bp', 'hf', 'copd', 'toc'], weakens: { factor: 0.9, applies: ['meds'] }, why: 'Symptom and reading alerts have nowhere to go. Collecting them with no one watching is a patient-safety risk.' },
    detail: '300 build + 100 hardening hours; ~100/yr after. Cognito free to 10k monthly users.',
  },
  {
    id: 'nurses', label: 'Nurse triage staffing',
    owner: 'Clinical', oneTime: 1500, monthly: 0, perSegment: 0, engHours: 0, runHours: 0, weeks: 8, after: [], laborFromVolume: true,
    skip: { blocks: ['bp', 'hf', 'copd', 'toc'], weakens: { factor: 0.9, applies: ['meds'] }, why: 'Escalations pile up unanswered.' },
    detail: 'Hours scale with replies x escalation rate x 4 minutes. Weeks assume hiring or reassigning RNs plus training. $1,500 training.',
  },
  {
    id: 'monitoring', label: 'Traffic monitoring and compliance audit logs (CloudWatch, CloudTrail)',
    owner: 'Engineering', oneTime: 0, monthly: 55, perSegment: 0.00001, engHours: 120, buildHours: 40, runHours: 120, weeks: 0, after: ['aws'],
    skip: { weakens: { factor: 0.9, applies: 'all' }, why: 'Delivery failures go unnoticed, and there is no HIPAA audit trail.' },
    detail: 'Midpoint of $30-$80/mo. Glacier archive for 6-year HIPAA retention.',
  },
  {
    id: 'reputation', label: 'Number reputation monitoring (third-party)',
    owner: 'Vendor', oneTime: 0, monthly: 416.7, perSegment: 0, engHours: 52, runHours: 52, weeks: 1, after: ['number'],
    skip: { weakens: { factor: 0.85, applies: 'all' }, why: 'Carrier spam filtering silently drops messages.' },
    detail: '$416.70/mo (~$5,000/yr). 1 hr/week review.',
  },
];

// Interventions, based on programs Generated Health describes for Florence.
// Messages per enrolled patient per month (per discharge episode for TOC) and
// escalation rates are author assumptions.
export const INTERVENTIONS = [
  {
    id: 'meds', label: 'Medication reminders', on: true, conditions: ['htn', 'dm', 'hf', 'copd'],
    what: 'Texts to pick up refills and take daily medication; patient replies to confirm.',
    outbound: 13, inbound: 6, escalation: 0.02, savings: 'adherence',
    basis: 'Flo medication-reminder protocols evaluated in NHS primary care (BMJ Open 2015, 3,381 patients across 10 protocols). Generated Health lists medication support.',
    sourceUrl: 'https://bmjopen.bmj.com/content/5/3/e007270',
  },
  {
    id: 'bp', label: 'Home blood pressure readings', on: false, conditions: ['htn'],
    what: 'Twice-weekly prompts to text a reading; Flo replies with feedback and flags high readings.',
    outbound: 18, inbound: 7, escalation: 0.05, savings: null,
    basis: 'Flo’s original NHS hypertension protocol (service evaluation in general practice, PMC4504444). Generated Health reports an 80% response rate at Lackey Clinic.',
    sourceUrl: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4504444/',
  },
  {
    id: 'hf', label: 'Heart failure daily weight', on: true, conditions: ['hf'],
    what: 'Daily prompt for weight and blood pressure; rapid weight gain goes to the heart failure nurse.',
    outbound: 60, inbound: 26, escalation: 0.04, savings: null,
    basis: 'Generated Health case study: patients text daily blood pressure and weight to the heart failure team; 87% of CHF patients engaged over 6 months.',
    sourceUrl: 'https://us.generatedhealth.com/case-studies/reduce-post-hospital-syndrome-readmissions',
  },
  {
    id: 'copd', label: 'COPD symptom check-ins', on: false, conditions: ['copd'],
    what: 'Three check-ins a week on breathlessness, sputum, and inhaler use; worsening symptoms go to a nurse.',
    outbound: 26, inbound: 10, escalation: 0.06, savings: null,
    basis: 'Generated Health lists COPD among Florence chronic-condition programs; early NHS Flo pilots included COPD. No COPD outcome data found.',
    sourceUrl: 'https://us.generatedhealth.com/',
  },
  {
    id: 'toc', label: 'Post-discharge follow-up (30 days)', on: true, conditions: [], perDischarge: true,
    what: 'Starts within 48 hours of discharge: symptom checks, medication questions, follow-up visit reminder.',
    outbound: 20, inbound: 12, escalation: 0.15, savings: 'readmissions',
    basis: 'Generated Health reports 73% post-discharge protocol completion and a 29% reduction in 30-day readmissions (Roxborough Memorial Hospital).',
    sourceUrl: 'https://us.generatedhealth.com/case-studies/reduce-post-hospital-syndrome-readmissions',
  },
];

// COPD prevalence is not in the ROI model; same caveat as the other prevalence values.
export const PREV_COPD = 0.11;

export const VENDOR_WEEKS = 8; // assumption: vendor go-live for a new ACO customer; ask Generated Health

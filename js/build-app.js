// "What if you build it yourself?" page.

import { INPUTS, acoDefaults } from './model/aco.js';
import { buildCase, relevantSteps } from './model/build.js';
import { STUDY, STUDY_NOTES } from './model/study.js';
import { STEPS, INTERVENTIONS, RATES, LABOR, COST_MODEL, PREV_COPD, VENDOR_WEEKS } from './build/data.js';
import { fmt } from './format.js';
import { AUTHOR } from './config.js';
import { $, esc, info, tag, statCard } from './ui.js';

const BUILD_INPUTS = [
  { id: 'engFte', label: 'Engineers on the build', suffix: 'FTE', step: 0.5, default: 1, tip: 'Full-time engineers. Build steps that need engineering run one after another on this team.' },
  { id: 'vendorWeeks', label: 'Vendor go-live, for comparison', suffix: 'weeks', default: VENDOR_WEEKS, tip: 'Assumption. Ask Generated Health for its actual implementation timeline.', assumption: true },
  { id: 'engRate', label: 'Engineering rate', prefix: '$', suffix: '/hr', default: LABOR.engRate, tip: 'Blended loaded rate (cost model, Scenario tab).' },
  { id: 'rnRate', label: 'Nurse rate', prefix: '$', suffix: '/hr', default: LABOR.rnRate, tip: 'About $45/hr median RN wage × 1.3 benefits (cost model, Scenario tab).' },
  { id: 'prevCOPD', label: 'Assigned beneficiaries with COPD', suffix: '%', default: PREV_COPD * 100, tip: 'Approximate national Medicare FFS prevalence. Needs validation; replace with the ACO’s registry count.', assumption: true },
];

const DEFAULT_RUN = INTERVENTIONS.filter((i) => i.on).map((i) => i.id);
const STEP = Object.fromEntries(STEPS.map((s) => [s.id, s]));
const IV = Object.fromEntries(INTERVENTIONS.map((i) => [i.id, i]));

const state = { data: null, acos: [], values: {}, skipped: new Set(), running: new Set(DEFAULT_RUN), passthrough: new URLSearchParams() };

// ---------- URL ----------

function readUrl() {
  const q = new URLSearchParams(location.search);
  const byId = new Map(state.data.acos.map((a) => [a.id, a]));
  state.acos = (q.get('aco') ?? '').split(',').map((id) => byId.get(id)).filter(Boolean);
  const single = state.acos.length === 1 ? state.acos[0] : null;
  state.values = { ...acoDefaults(single, state.data.medians).values };
  // ROI-page edits ride along unchanged so "Back" restores them.
  state.passthrough = new URLSearchParams();
  for (const input of INPUTS) {
    const raw = q.get(input.id);
    const ok = raw !== null && (input.kind === 'choice' ? input.options.some(([v]) => v === raw) : Number.isFinite(Number(raw)));
    if (ok) {
      state.values[input.id] = raw;
      state.passthrough.set(input.id, raw);
    }
  }
  for (const b of BUILD_INPUTS) {
    const raw = q.get(b.id);
    state.values[b.id] = raw !== null && Number.isFinite(Number(raw)) ? raw : String(b.default);
  }
  state.skipped = new Set((q.get('skip') ?? '').split(',').filter((id) => STEP[id]));
  if (q.has('run')) state.running = new Set(q.get('run').split(',').filter((id) => IV[id]));
}

function writeUrl() {
  const q = new URLSearchParams();
  if (state.acos.length) q.set('aco', state.acos.map((a) => a.id).join(','));
  for (const [k, v] of state.passthrough) q.set(k, v);
  for (const b of BUILD_INPUTS) if (Number(state.values[b.id]) !== b.default) q.set(b.id, state.values[b.id]);
  if (state.skipped.size) q.set('skip', [...state.skipped].join(','));
  const run = [...state.running].sort().join(',');
  if (run !== [...DEFAULT_RUN].sort().join(',')) q.set('run', run);
  const qs = q.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);

  const back = new URLSearchParams();
  if (state.acos.length) back.set('aco', state.acos.map((a) => a.id).join(','));
  for (const [k, v] of state.passthrough) back.set(k, v);
  const bqs = back.toString().replace(/%2C/g, ',');
  $('back-link').href = `index.html${bqs ? `?${bqs}` : ''}`;
}

// ---------- helpers ----------

const weeksText = (w) => (w === null ? 'Never' : `Week ${Math.ceil(w)}`);
const monthsText = (w) => `${fmt(w / (52 / 12), 'number1')} months`;
const stepName = (id) => STEP[id].label;

function statusPill(st) {
  if (st.status === 'off') return '<span class="pill pill-direct">Not running</span>';
  if (st.status === 'blocked') return '<span class="pill pill-no">Blocked</span>';
  if (st.status === 'weakened') return `<span class="pill pill-weak">Weakened: reaches ${esc(fmt(st.reach, 'percent0'))}</span>`;
  return '<span class="pill pill-yes">Runs fully</span>';
}

function skipImpact(s) {
  const { blocks, weakens } = s.skip;
  if (blocks === 'all') return '<span class="impact impact-block">Blocks everything</span>';
  const parts = [];
  if (blocks?.length) parts.push(`<span class="impact impact-block">Blocks ${esc(blocks.map((id) => IV[id].label).join(', '))}</span>`);
  if (weakens) {
    const who = weakens.applies === 'all' ? 'all programs' : weakens.applies.map((id) => IV[id].label).join(', ');
    parts.push(`<span class="impact impact-weak">Weakens ${esc(who)} (−${esc(fmt(1 - weakens.factor, 'percent0'))} reach)</span>`);
  }
  return parts.join(' ');
}

// ---------- render ----------

function renderForLine() {
  const n = state.acos.length;
  const withRes = state.acos.filter((a) => a.hasResults);
  const who = !n ? 'the median MSSP ACO' : n === 1 ? esc(state.acos[0].name) : `${n} ACOs (${withRes.length} with CMS results)`;
  $('for-line').innerHTML = `Sized for ${who}. ${tag('cms')} beneficiaries and admissions from CMS PY2024 · ${tag('costModel')} costs from the ${esc(COST_MODEL.short)} ${info(esc(COST_MODEL.full), 'About the cost model')}`;
}

function renderHeadline(r) {
  const c = r.cost;
  const crit = [...r.schedule.critical].reverse().map(stepName);
  const vendor = r.vendorWeeks;
  $('headline').innerHTML = [
    statCard({
      label: 'First text to a patient',
      value: esc(weeksText(r.launchWeek)),
      sub: r.launchWeek === null ? 'A skipped step blocks every program' : `${monthsText(r.launchWeek)}. Vendor: week ${esc(fmt(vendor, 'number0'))} (assumption)`,
      tags: ['estimate'], primary: true,
      tip: r.launchWeek === null ? 'Nothing can launch. See the blocked programs below.' : `<strong>Longest chain:</strong> ${crit.map(esc).join(' → ')}`,
    }),
    statCard({
      label: 'Year-1 cost to build and run',
      value: c.year1.total,
      sub: `Then ${esc(fmt(c.steady.total, 'currencyCompact'))} a year`,
      tags: ['costModel', 'estimate'],
      tip: `One-time ${esc(fmt(c.year1.oneTime, 'currency0'))}, engineering ${esc(fmt(c.year1.engineering, 'currency0'))}, nurses ${esc(fmt(c.year1.nurses, 'currency0'))}, AWS texting ${esc(fmt(c.year1.messaging, 'currency0'))}, platform ${esc(fmt(c.year1.platform, 'currency0'))}. Run costs start at launch.`,
    }),
    statCard({
      label: 'People you need',
      value: `${esc(fmt(c.engFteY1, 'number1'))} <span class="tile-of">engineers</span> + ${esc(fmt(c.nurseFte, 'number1'))} <span class="tile-of">nurses</span>`,
      sub: `${esc(fmt(c.engHoursY1, 'number0'))} engineering hours in year 1`,
      tags: ['costModel', 'estimate'],
      tip: `Nurses: escalated replies × ${LABOR.minutesPerEscalation} minutes, at full volume. Engineering: year-1 hours from the cost model for the steps you keep.`,
    }),
    statCard({
      label: 'Shared savings revenue lost in year 1',
      value: r.value.lostYear1,
      sub: `vs. a vendor live at week ${esc(fmt(vendor, 'number0'))}`,
      tags: ['estimate'],
      tip: `From the estimator’s central case: ${esc(fmt(r.value.fullPerYear, 'currencyCompact'))} a year to the ACO when programs run fully. Lost value = later launch plus weakened or blocked programs. Only medication reminders and post-discharge follow-up carry modeled savings.`,
    }),
  ].join('');
}

function renderInterventions(r) {
  const vol = Object.fromEntries(r.volume.rows.map((x) => [x.id, x]));
  $('interventions').innerHTML = INTERVENTIONS.map((iv) => {
    const st = r.status[iv.id];
    const on = state.running.has(iv.id);
    const v = vol[iv.id];
    const reasons = [
      ...st.blockedBy.map((id) => `<strong>Blocked:</strong> ${esc(stepName(id))} skipped. ${esc(STEP[id].skip.why)}`),
      ...st.weakenedBy.map((id) => `<strong>Weakened:</strong> ${esc(stepName(id))} skipped. ${esc(STEP[id].skip.why)}`),
    ];
    const savings = iv.savings === 'adherence' ? 'Savings modeled (adherence)' : iv.savings === 'readmissions' ? 'Savings modeled (readmissions)' : 'Savings not modeled';
    return `<div class="iv ${on ? '' : 'is-off'} iv-${st.status}">
      <label class="switch"><input type="checkbox" data-iv="${iv.id}" ${on ? 'checked' : ''}><span>${esc(iv.label)}</span></label>
      <div class="iv-status">${statusPill(st)}${reasons.length ? info(reasons.join('<br>'), `Why ${iv.label} is ${st.status}`) : ''}</div>
      <p class="iv-what">${esc(iv.what)}</p>
      <div class="iv-nums">${on && v ? `${esc(fmt(v.enrolled, 'number0'))} ${iv.perDischarge ? 'discharges' : 'patients'}/mo · ${esc(fmt(v.outbound, 'number0'))} texts/mo` : on ? 'Sends nothing' : '&nbsp;'}</div>
      <div class="iv-foot"><span class="muted">${savings}</span>${info(`${esc(iv.basis)}<br><a href="${esc(iv.sourceUrl)}" target="_blank" rel="noopener">Source</a><br><strong>Assumed per ${iv.perDischarge ? 'discharge' : 'patient per month'}:</strong> ${iv.outbound} texts out, ${iv.inbound} replies, ${fmt(iv.escalation, 'percent0')} of replies to a nurse.`, `Basis for ${iv.label}`)}</div>
    </div>`;
  }).join('');
}

function renderControls() {
  $('controls').innerHTML = BUILD_INPUTS.map((b) => `<div class="field field-inline">
      <div class="field-head"><label for="b-${b.id}">${esc(b.label)}</label>${info(esc(b.tip), `About ${b.label}`)}</div>
      <div class="control">${b.prefix ? `<span class="affix">${esc(b.prefix)}</span>` : ''}
        <input id="b-${b.id}" name="${b.id}" type="number" min="0" step="${b.step ?? 1}" value="${esc(state.values[b.id])}">
        <span class="affix">${esc(b.suffix)}</span></div>
      ${b.assumption ? `<div class="field-tags">${tag('assumption')}</div>` : ''}
    </div>`).join('');
}

function renderSteps(r) {
  const relevant = new Set(relevantSteps(state.running).map((s) => s.id));
  const rows = new Map(r.schedule.rows.map((x) => [x.id, x]));
  $('steps').innerHTML = STEPS.map((s) => {
    const done = !state.skipped.has(s.id);
    const row = rows.get(s.id);
    const when = !relevant.has(s.id) ? 'Not needed for the programs you run' : row ? `Weeks ${fmt(row.start, 'number0')}–${fmt(Math.ceil(row.end), 'number0')}` : 'Skipped';
    const money = [s.oneTime ? `${fmt(s.oneTime, 'currency0')} once` : '', s.monthly ? `${fmt(s.monthly, 'currency0')}/mo` : '', s.engHours ? `${fmt(s.engHours, 'number0')} eng hrs` : '', s.clinicalHours ? `${s.clinicalHours} clinician hrs` : '', s.laborFromVolume ? 'nurse time scales with replies' : ''].filter(Boolean).join(' · ');
    return `<li class="step ${done ? '' : 'is-skipped'} ${relevant.has(s.id) ? '' : 'is-irrelevant'} ${r.schedule.critical.has(s.id) ? 'is-critical' : ''}">
      <label class="switch"><input type="checkbox" data-step="${s.id}" ${done ? 'checked' : ''}><span>${esc(s.label)}</span></label>
      ${info(`${esc(s.detail)}<br><strong>If skipped:</strong> ${esc(s.skip.why)}${s.added ? '<br><em>Added by the author; not in the cost model.</em>' : ''}`, `About ${s.label}`)}
      <div class="step-meta">${s.added ? tag('assumption') : tag('costModel')} ${esc(s.owner)} · ${esc(when)}${money ? ` · ${esc(money)}` : ''}</div>
      <div class="step-impact">${done ? '' : 'Skipped: '}${skipImpact(s)}</div>
    </li>`;
  }).join('');
}

function renderTimeline(r) {
  const rows = r.schedule.rows.filter((x) => x.end > x.start || x.end > 0);
  const vendor = r.vendorWeeks;
  const max = Math.max(52, Math.ceil((r.launchWeek ?? 0) / 4) * 4 + 4);
  const pct = (w) => `${((w / max) * 100).toFixed(2)}%`;
  const ticks = [];
  for (let w = 0; w <= max; w += max > 60 ? 12 : 8) ticks.push(w);
  $('timeline').innerHTML = `<div class="gantt" role="table" aria-label="Build schedule in weeks">
      ${rows.map((x) => `<div class="g-row ${r.schedule.critical.has(x.id) ? 'is-critical' : ''}" role="row">
        <span class="g-label" role="rowheader">${esc(STEP[x.id].label)}</span>
        <span class="g-track" role="cell"><span class="g-bar" style="left:${pct(x.start)};width:${pct(Math.max(0.4, x.end - x.start))}" title="Weeks ${fmt(x.start, 'number1')} to ${fmt(x.end, 'number1')}"></span></span>
      </div>`).join('')}
      <div class="g-row g-axis" aria-hidden="true"><span class="g-label"></span><span class="g-track">
        ${ticks.map((w) => `<span class="g-tick" style="left:${pct(w)}">${w}</span>`).join('')}
        ${r.launchWeek !== null ? `<span class="g-line g-launch" style="left:${pct(r.launchWeek)}"><b>Build: week ${Math.ceil(r.launchWeek)}</b></span>` : ''}
        <span class="g-line g-vendor" style="left:${pct(vendor)}"><b>Vendor: week ${fmt(vendor, 'number0')}</b></span>
      </span></div>
    </div>
    <div class="legend"><span><i class="lg-crit"></i>Longest chain (sets the launch date)</span><span><i class="lg-other"></i>Other steps</span>${info('Engineering build steps share one team and run in sequence. Registration, hiring, clinical review, and compliance run on their own calendars. Week counts are author assumptions; the cost model gives hours, not calendar time.', 'About the timeline')}</div>`;
}

function renderMoney(r) {
  const y = r.cost.year1;
  const items = [
    ['Engineering', y.engineering, `${fmt(r.cost.engHoursY1, 'number0')} hrs × ${fmt(Number(state.values.engRate), 'currency0')}`],
    ['Nurse triage', y.nurses, `${fmt(r.cost.nurseFte, 'number1')} FTE once live`],
    ['One-time (registration fees, nurse training, protocol review)', y.oneTime, ''],
    ['Platform and monitoring', y.platform, `${fmt(r.cost.platformMonthly, 'currency0')}/mo once live`],
    ['AWS texting', y.messaging, `${fmt(r.cost.messagingMonthly, 'currency0')}/mo once live`],
  ].sort((a, b) => b[1] - a[1]);
  const max = Math.max(...items.map((i) => i[1]), 1);
  $('money').innerHTML = `<div class="hbars">${items.map(([k, v, note]) => `<div class="hbar">
      <span class="hbar-label">${esc(k)}${note ? `<span class="muted"> · ${esc(note)}</span>` : ''}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${((v / max) * 100).toFixed(1)}%"></span></span>
      <span class="hbar-value">${esc(fmt(v, 'currency0'))}</span></div>`).join('')}</div>`;

  const c = r.cost;
  const rows = r.volume.rows;
  $('volume').innerHTML = `<thead><tr><th scope="col">Program</th><th scope="col" class="num">Enrolled / mo ${info('Assigned beneficiaries (CMS) × prevalence × enrollment share from the estimator. A patient with two conditions counts twice in medication reminders. Post-discharge counts discharges per month.', 'About enrolled')}</th><th scope="col" class="num">Texts out / mo</th><th scope="col" class="num">Replies / mo</th><th scope="col" class="num">To a nurse / mo</th></tr></thead>
    <tbody>${rows.map((x) => `<tr><th scope="row">${esc(IV[x.id].label)}</th><td class="num">${esc(fmt(x.enrolled, 'number0'))}</td><td class="num">${esc(fmt(x.outbound, 'number0'))}</td><td class="num">${esc(fmt(x.inbound, 'number0'))}</td><td class="num">${esc(fmt(x.escalations, 'number0'))}</td></tr>`).join('')
      || '<tr><td colspan="5" class="muted">No program can run.</td></tr>'}
      <tr class="total"><th scope="row">AWS cost per month ${info(`${fmt(c.segOut, 'number0')} outbound segments × $${RATES.outboundPerSegment} (blended 10DLC) + ${fmt(c.segIn, 'number0')} inbound × $${RATES.inboundPerSegment}, plus logging and compute. Assumes ${RATES.segmentsPerMessage} segments per text (160 GSM-7 characters each).`, 'About AWS cost')}</th>
        <td class="num" colspan="4"><strong>${esc(fmt(c.messagingMonthly, 'currency0'))}</strong> <span class="muted">for ${esc(fmt(c.segOut + c.segIn, 'number0'))} segments</span></td></tr>
    </tbody>`;
}

const WPM = 52 / 12;
const monthsOrNever = (m) => (m === null ? 'Never' : `${fmt(m, 'number1')} mo`);

function renderStudy(r) {
  const vendorRows = Object.fromEntries(r.study.vendor.map((x) => [x.id, x]));
  const answerAt = (startWeeks, row) => (startWeeks === null || row.totalMonths === null ? 'Never' : `Month ${fmt(startWeeks / WPM + row.totalMonths, 'number0')}`);
  const tipNeeded = 'Patients per group (program and comparison) to detect the targeted change with 95% confidence and 80% power. Weakened delivery shrinks the effect, so more patients are needed.';
  const tipEnroll = `Chronic patients: the enrolled panel at scale, brought on over ${STUDY.rampMonths} months. Discharges: enrolled discharges per month. Both scale with how many patients your build actually reaches.`;
  const tipConc = 'Patients who must be in active, uninterrupted intervention at the same time. A gap in service or patients going quiet dilutes the effect and resets the clock.';
  $('study').innerHTML = `<thead><tr>
      <th scope="col">Outcome</th>
      <th scope="col" class="num">Per group ${info(tipNeeded, 'About patients per group')}</th>
      <th scope="col" class="num">Enrolled / mo ${info(tipEnroll, 'About enrolled per month')}</th>
      <th scope="col" class="num">Months enrolling</th>
      <th scope="col" class="num">Active at once ${info(tipConc, 'About patients active at once')}</th>
      <th scope="col" class="num">Measure + lag ${info(`${esc(STUDY_NOTES.pdcWindowMonths)}<br>${esc(STUDY_NOTES.readmitWindowMonths)}<br>${esc(STUDY_NOTES.claimsLagMonths)}`, 'About measurement and lag')}</th>
      <th scope="col" class="num">First answer: build / vendor</th></tr></thead>
    <tbody>${r.study.built.map((x) => {
      const v = vendorRows[x.id];
      const can = x.totalMonths !== null;
      return `<tr class="${can ? '' : 'is-never'}">
        <th scope="row">${esc(x.label)}<div class="row-sub">${esc(x.measure)}</div></th>
        <td class="num">${x.perGroup === null ? '<span class="muted">n/a</span>' : esc(fmt(x.perGroup, 'number0'))}</td>
        <td class="num">${esc(fmt(x.perMonth, 'number0'))}</td>
        <td class="num strong">${esc(monthsOrNever(x.accrualMonths))}</td>
        <td class="num">${x.concurrent === null ? '<span class="muted">n/a</span>' : esc(fmt(x.concurrent, 'number0'))}</td>
        <td class="num">${esc(fmt(x.windowMonths + x.lagMonths, 'number0'))} mo</td>
        <td class="num strong">${esc(answerAt(r.launchWeek, x))} <span class="muted">/ ${esc(answerAt(r.vendorWeeks, v))}</span></td></tr>`;
    }).join('')}</tbody>`;
}

function renderAll() {
  const r = buildCase(state.values, state.acos, state.skipped, state.running, { medians: state.data.medians });
  renderForLine();
  renderHeadline(r);
  renderInterventions(r);
  renderStudy(r);
  renderSteps(r);
  renderTimeline(r);
  renderMoney(r);
}

// ---------- wiring ----------

function bind() {
  document.body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.step) {
      if (t.checked) state.skipped.delete(t.dataset.step);
      else state.skipped.add(t.dataset.step);
    } else if (t.dataset.iv) {
      if (t.checked) state.running.add(t.dataset.iv);
      else state.running.delete(t.dataset.iv);
    } else return;
    writeUrl();
    renderAll();
  });
  $('controls').addEventListener('input', (e) => {
    if (!e.target.name) return;
    state.values[e.target.name] = e.target.value;
    writeUrl();
    renderAll();
  });
  $('reset').addEventListener('click', () => {
    state.skipped = new Set();
    state.running = new Set(DEFAULT_RUN);
    for (const b of BUILD_INPUTS) state.values[b.id] = String(b.default);
    renderControls();
    writeUrl();
    renderAll();
  });
  $('print').addEventListener('click', () => window.print());
  $('copy-link').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = 'Link copied';
    } catch {
      btn.textContent = 'Copy from address bar';
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 1800);
  });
}

async function main() {
  $('footer').innerHTML = `<p>Independent prototype by ${esc(AUTHOR)}. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.</p>`;
  const res = await fetch('data/acos.json').catch(() => null);
  if (!res?.ok) {
    document.querySelector('main').innerHTML = '<p class="notice">Could not load CMS data. Serve this folder over HTTP, for example <code>python3 -m http.server</code>.</p>';
    return;
  }
  state.data = await res.json();
  readUrl();
  renderControls();
  writeUrl();
  renderAll();
  bind();
}

main();

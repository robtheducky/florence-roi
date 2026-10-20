// Single-screen ACO dashboard: CMS baseline, pilot bet, and scale projection.

import { ASSUMPTIONS, SCENARIOS, SOURCES, DEFAULT_SCENARIO, isScenarioDependent } from './assumptions.js';
import { INPUTS, GROUPS, ASSUMPTION_IDS, acoDefaults, compute } from './model/aco.js';
import { fmt } from './format.js';
import { AUTHOR, ROADMAP_URL } from './config.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_FORMAT = { count: 'number0', percent: 'percent1', currency: 'currency0' };

const state = { data: null, participants: null, aco: null, scenario: DEFAULT_SCENARIO, values: {}, defaults: {}, origin: {} };

// ---------- data ----------

async function loadData() {
  const res = await fetch('data/acos.json');
  if (!res.ok) throw new Error(`data/acos.json: HTTP ${res.status}`);
  state.data = await res.json();
}

async function loadParticipants() {
  if (state.participants) return state.participants;
  const res = await fetch('data/participants.json');
  state.participants = res.ok ? await res.json() : {};
  return state.participants;
}

const acoLabel = (a) => `${a.name} (${a.id}${a.state ? `, ${a.state}` : ''})`;

function setAco(id) {
  state.aco = state.data.acos.find((a) => a.id === id) ?? null;
  const { values, origin } = acoDefaults(state.aco, state.data.medians);
  state.defaults = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
  state.origin = origin;
  state.values = { ...state.defaults };
}

// ---------- URL ----------

function readUrl() {
  const q = new URLSearchParams(location.search);
  setAco(q.get('aco'));
  state.scenario = SCENARIOS.some((s) => s.id === q.get('scenario')) ? q.get('scenario') : DEFAULT_SCENARIO;
  for (const input of INPUTS) {
    const raw = q.get(input.id);
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw))) state.values[input.id] = raw;
  }
}

function writeUrl() {
  const q = new URLSearchParams();
  if (state.aco) q.set('aco', state.aco.id);
  if (state.scenario !== DEFAULT_SCENARIO) q.set('scenario', state.scenario);
  for (const input of INPUTS) {
    const v = state.values[input.id];
    if (v !== '' && Number(v) !== Number(state.defaults[input.id])) q.set(input.id, v);
  }
  const qs = q.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ---------- badges and citations ----------

const badge = (cls, text, title = '') => `<span class="badge ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
const verifyBadge = () => badge('badge-verify', 'Needs validation', 'Keep the value, but validate before relying on it');
const placeholderBadge = () => badge('badge-placeholder', 'Placeholder', 'Not vendor pricing');

function citation(sourceId) {
  const s = SOURCES[sourceId];
  return s.url
    ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.full)}">${esc(s.short)}</a>`
    : `<span class="cite cite-plain" title="${esc(s.full)}">${esc(s.short)}</span>`;
}

function originBadge(input) {
  const edited = Number(state.values[input.id]) !== Number(state.defaults[input.id]);
  if (edited) return badge('badge-edited', 'Edited');
  if (state.origin[input.id] === 'cms') return badge('badge-cms', `CMS PY2024 · ${input.column}`);
  if (state.origin[input.id] === 'median') return badge('badge-median', 'MSSP median');
  return '';
}

function refChips(refs) {
  return refs
    .map((ref) => {
      if (ref.startsWith('input:')) {
        const input = INPUTS.find((i) => i.id === ref.slice(6));
        const o = state.origin[input.id];
        const src = o === 'cms' && Number(state.values[input.id]) === Number(state.defaults[input.id])
          ? `CMS PY2024 PUF (${input.column})` : o === 'median' ? 'MSSP median' : 'Your input';
        return `<span class="cite cite-plain">${esc(input.label)}: ${esc(src)}</span>`;
      }
      if (SOURCES[ref]) return citation(ref);
      const a = ASSUMPTIONS[ref];
      return a.sources.map(citation).join(' ') + (a.verify ? ` ${verifyBadge()}` : '') + (a.placeholder ? ` ${placeholderBadge()}` : '');
    })
    .join(' ');
}

// ---------- picker ----------

function renderPicker() {
  $('aco-list').innerHTML = state.data.acos
    .map((a) => `<option value="${esc(acoLabel(a))}">${a.hasResults ? '' : 'No PY2024 results yet'}</option>`)
    .join('');
  $('aco-search').value = state.aco ? acoLabel(state.aco) : '';
}

// ---------- observed (CMS) ----------

function vsMedian(value, median, format, lowerIsBetter = false) {
  if (value === null || value === undefined || median === null) return '';
  const diff = value - median;
  if (Math.abs(diff) < 1e-9) return `MSSP median ${fmt(median, format)}`;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return `<span class="${better ? 'good' : 'warn'}">${diff > 0 ? 'Above' : 'Below'}</span> MSSP median ${fmt(median, format)}`;
}

function tile(label, value, sub, source) {
  return `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value">${value}</div>
    ${sub ? `<div class="tile-sub">${sub}</div>` : ''}<div class="tile-src">${esc(source)}</div></div>`;
}

function renderObserved() {
  const a = state.aco;
  const m = state.data.medians;
  const src = state.data.meta.sources;
  const counts = state.data.meta.counts;
  $('observed-sub').innerHTML = `${esc(src.results.name)}, released ${esc(src.results.released)}. ${counts.withResults} ACOs with results; ${counts.active2026} in the 2026 program. <a href="${esc(src.results.page)}" target="_blank" rel="noopener">Source</a>`;

  if (!a) {
    $('observed-notice').innerHTML = `<p class="notice">No ACO selected. The baseline uses MSSP PY2024 medians across ${counts.withResults} ACOs. Search above to load a specific ACO.</p>`;
  } else if (!a.hasResults) {
    $('observed-notice').innerHTML = `<p class="notice"><strong>${esc(a.name)}</strong> (${esc(a.id)}) is in the 2026 program${a.track2026 ? ` on ${esc(a.track2026)}` : ''} but joined after PY2024, so CMS has not published results. The baseline uses MSSP medians. Enter the ACO's own numbers in the inputs.</p>`;
  } else {
    $('observed-notice').innerHTML = a.active2026 ? '' : `<p class="notice notice-warn"><strong>${esc(a.name)}</strong> is not in the 2026 ACO list. These are its PY2024 results.</p>`;
  }

  const h = a?.hasResults ? a : null;
  const v = (k) => (h ? h[k] : m[k]);
  const label = h ? '' : ' (median)';
  const gap = v('savingsRate') - v('msr');
  const pos = Math.max(0, Math.min(100, (v('savingsRate') / Math.max(v('msr') * 3, v('savingsRate'), 1)) * 100));
  const msrPos = Math.max(0, Math.min(100, (v('msr') / Math.max(v('msr') * 3, v('savingsRate'), 1)) * 100));
  const tiles = [
    tile(`Assigned beneficiaries (LUM)${label}`, fmt(v('lum'), 'number0'), h ? vsMedian(h.lum, m.lum, 'number0') : '', 'N_AB'),
    tile('Track', esc(a?.track2026 ?? (a ? 'Not in 2026 program' : 'n/a')), h ? `PY2024: ${esc(h.trackPY)}, ${esc(h.riskModel.toLowerCase())}, ${esc(h.assignment.toLowerCase())} assignment` : '', '2026 ACO list; Current_Track'),
    tile(`Benchmark vs. spending per capita${label}`, `${fmt(v('benchmarkPC'), 'currency0')} <span class="tile-vs">vs</span> ${fmt(v('expenditurePC'), 'currency0')}`, h ? `Total benchmark ${fmt(h.benchmarkTotal, 'currency0')}` : '', 'UpdatedBnchmk; Per_Capita_Exp_TOTAL_PY'),
    tile(`Savings rate vs. MSR${label}`, `${fmt(v('savingsRate') / 100, 'percent1')} <span class="tile-vs">vs</span> ${fmt(v('msr') / 100, 'percent1')}`,
      `<span class="meter" aria-hidden="true"><span class="meter-fill ${gap >= 0 ? '' : 'is-below'}" style="width:${pos.toFixed(1)}%"></span><span class="meter-mark" style="left:${msrPos.toFixed(1)}%"></span></span>${gap >= 0 ? `Cleared the MSR by ${fmt(gap / 100, 'percent1')}` : `<span class="warn">Short of the MSR by ${fmt(-gap / 100, 'percent1')}</span>`}`,
      'Sav_rate; MinSavPerc'),
    tile(`Earned shared savings${label}`, h ? fmt(h.earned, 'currency0') : 'n/a', h ? `Quality score ${fmt(h.qualityScore, 'number1')}; sharing rate ${fmt(h.shareRate / 100, 'percent0')}` : `Median quality score ${fmt(m.qualityScore, 'number1')}`, 'EarnSaveLoss; QualScore; FinalShareRate'),
    tile(`30-day readmission rate${label}`, fmt(v('readmitRate'), 'percent1'), h ? vsMedian(h.readmitRate, m.readmitRate, 'percent1', true) : '', 'Measure_479 (hospital-wide, risk-standardized)'),
    tile(`Short-term admissions per 1,000${label}`, fmt(v('stAdmitsPer1000'), 'number0'), h ? vsMedian(h.stAdmitsPer1000, m.stAdmitsPer1000, 'number0', true) : '', 'ADM_S_Trm'),
    tile(`Cost per short-term admission${label}`, fmt(v('costPerAdmit'), 'currency0'), h ? vsMedian(h.costPerAdmit, m.costPerAdmit, 'currency0', true) : '', 'Derived: CapAnn_INP_S_trm ÷ ADM_S_Trm'),
    tile(`ED visits per 1,000${label}`, fmt(v('edPer1000'), 'number0'), h ? vsMedian(h.edPer1000, m.edPer1000, 'number0', true) : '', 'P_EDV_Vis'),
    tile('Controlling BP / HbA1c poor control', h?.controllingBP ? `${fmt(h.controllingBP.value / 100, 'percent1')} <span class="tile-vs">/</span> ${h.hba1cPoor ? fmt(h.hba1cPoor.value / 100, 'percent1') : 'n/a'}` : 'n/a', h?.controllingBP ? `Reported via ${esc(h.controllingBP.collection)}. Lower is better for HbA1c.` : '', 'QualityID_236; QualityID_001'),
    tile(`Dual-eligible share${label}`, fmt(v('percDual') / 100, 'percent1'), h ? vsMedian(h.percDual, m.percDual, 'number1') : '', 'Perc_Dual'),
    tile('Clinicians', h ? `${fmt(h.nPCP, 'number0')} <span class="tile-vs">PCPs</span>` : 'n/a', h ? `${fmt(h.nSpec, 'number0')} specialists; ${fmt(h.nNPPA, 'number0')} NPs/PAs; ${fmt(h.nHosp, 'number0')} hospitals` : '', 'N_PCP; N_Spec; N_NP; N_PA; N_Hosp'),
  ];
  $('tiles').innerHTML = tiles.join('');

  const det = $('participants');
  det.hidden = !a;
  if (a) {
    $('participants-summary').textContent = `Participants in 2026: ${a.nParticipants === null ? 'not listed' : fmt(a.nParticipants, 'number0')}`;
    $('participants-body').innerHTML = '<p class="hint">Loading...</p>';
    if (det.open) renderParticipants();
  }
}

async function renderParticipants() {
  const a = state.aco;
  if (!a) return;
  const list = (await loadParticipants())[a.id] ?? [];
  $('participants-body').innerHTML = `<p class="hint">Legal business names from the ${esc(state.data.meta.sources.participants.name)}. CMS does not publish participant TINs or assignment by TIN, so lives under management are shown for the whole ACO only.</p>
    <ul class="participant-list">${list.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
}

// ---------- inputs ----------

function inputField(input) {
  const a = input.assumptionId ? ASSUMPTIONS[input.assumptionId] : null;
  const badges = [input.placeholder && placeholderBadge(), a?.verify && verifyBadge()].filter(Boolean).join(' ');
  const prefix = input.kind === 'currency' ? '<span class="affix">$</span>' : '';
  const suffix = input.kind === 'percent' ? '%' : input.suffix ?? '';
  const max = input.kind === 'percent' ? ' max="100"' : input.max ? ` max="${input.max}"` : '';
  const step = input.step ?? 1;
  return `<div class="field">
      <label for="in-${input.id}">${esc(input.label)} ${badges}</label>
      <div class="control">
        ${prefix}
        <input id="in-${input.id}" name="${input.id}" type="number" inputmode="decimal" min="0"${max} step="${step}"
          value="${esc(state.values[input.id])}" aria-describedby="hint-${input.id}">
        ${suffix ? `<span class="affix">${esc(suffix)}</span>` : ''}
      </div>
      <p class="hint" id="hint-${input.id}"><span class="origin" id="origin-${input.id}">${originBadge(input)}</span>${input.help ? ` ${esc(input.help)}` : ''}${a ? ` ${a.sources.map(citation).join(' ')}` : ''}</p>
    </div>`;
}

function renderInputs() {
  $('inputs').innerHTML = GROUPS.map((g) => {
    const fields = INPUTS.filter((i) => i.group === g.id).map(inputField).join('');
    const note = g.note ? `<p class="group-note">${esc(g.note)}</p>` : '';
    return g.collapsible
      ? `<details class="group group-collapsible"><summary>${esc(g.label)}</summary><div class="group-body">${note}${fields}</div></details>`
      : `<fieldset class="group"><legend>${esc(g.label)}</legend>${note}${fields}</fieldset>`;
  }).join('');
}

function renderScenario() {
  $('scenario').innerHTML = '<legend class="sr-only">Scenario</legend>' + SCENARIOS.map(
    (s) => `<label class="seg"><input type="radio" name="scenario" value="${s.id}"${s.id === state.scenario ? ' checked' : ''}><span>${esc(s.label)}</span></label>`,
  ).join('');
}

// ---------- results ----------

const stat = (label, value, format, opts = {}) => {
  const neg = Number.isFinite(value) && value < 0;
  return `<div class="stat ${opts.primary ? 'stat-primary' : ''} ${neg ? 'is-negative' : ''}">
    <div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(fmt(value, format))}</div>
    ${opts.sub ? `<div class="stat-sub">${opts.sub}</div>` : ''}</div>`;
};

function renderPilot(r) {
  const p = r.pilot;
  $('pilot-title').textContent = `Pilot: ${fmt(p.cohort, 'number0')} chronic patients and ${fmt(p.discharges, 'number0')} discharges over ${p.months} months`;
  $('pilot-stats').innerHTML = [
    stat('Expected savings during pilot', p.gross, 'currency0', { primary: true }),
    stat('Pilot cost', p.cost, 'currency0'),
    stat('Net during pilot', p.net, 'currency0'),
    stat('Newly adherent patients', p.newlyAdherent, 'number0', { sub: `${fmt(p.readmitsAvoided, 'number1')} readmissions avoided` }),
  ].join('');

  const cell = (v, f) => (v === null ? '<span class="muted">n/a</span>' : esc(fmt(v, f)));
  $('scorecard').innerHTML = `<thead><tr><th scope="col">Pilot success metric</th><th scope="col" class="num">Baseline</th><th scope="col" class="num">Our target</th>
      <th scope="col" class="num">Needed per arm</th><th scope="col" class="num">Pilot has</th><th scope="col">Provable in pilot?</th></tr></thead>
    <tbody>${r.scorecard.map((row) => `<tr>
      <th scope="row">${esc(row.metric)}<div class="note">${esc(row.measure)}</div></th>
      <td class="num">${cell(row.baseline, row.format)}</td>
      <td class="num strong">${cell(row.target, row.format)}</td>
      <td class="num">${row.required === null ? '<span class="muted">n/a</span>' : esc(fmt(row.required, 'number0'))}</td>
      <td class="num">${esc(fmt(row.have, 'number0'))}</td>
      <td>${row.detectable === null ? badge('badge-direct', 'Measured directly') : row.detectable ? badge('badge-yes', 'Yes') : badge('badge-no', 'Directional only')}</td>
    </tr>`).join('')}</tbody>`;

  const notProvable = r.scorecard.filter((x) => x.detectable === false);
  $('pilot-callout').innerHTML = notProvable.length
    ? `At this size the pilot can confirm ${r.scorecard[1].detectable ? 'engagement, completion, and the adherence lift' : 'engagement and completion'}. ${notProvable.map((x) => `<strong>${esc(x.metric.split(',')[0])}</strong> needs about ${fmt(x.required, 'number0')} per arm`).join('; ')}, so treat it as directional in the pilot and confirm it in the first scaled year against a comparison group.`
    : 'At this size every metric with a statistical test is powered to detect the targeted effect (alpha 0.05, power 0.80), assuming a comparable comparison group.';
}

function renderScale(r, all) {
  const s = r.scale;
  $('scale-stats').innerHTML = [
    stat('ACO net per year', r.acoNet, 'currency0', { primary: true, sub: 'ACO shared savings minus program cost' }),
    stat('ACO shared savings from program', r.acoShare, 'currency0', { sub: `${fmt(r.terms.shareRate, 'percent0')} sharing rate` }),
    stat('Program cost per year', s.programCost, 'currency0', { sub: `${fmt(s.enrolledTotal, 'number0')} enrolled; ${fmt(s.discharges, 'number0')} discharges` }),
    stat('Gross Medicare A/B savings', s.gross, 'currency0', { sub: `${fmt(r.savingsPctOfBenchmark, 'percent1')} of benchmark` }),
  ].join('');

  const scen = SCENARIOS.find((x) => x.id === state.scenario).label.toLowerCase();
  $('breakeven').innerHTML = r.breakEven.aco === null
    ? `Under the ${esc(scen)} scenario the ACO does not break even even at 10× the targeted effect. Lower the price or narrow enrollment.`
    : `<strong>The ACO breaks even if the program delivers ${fmt(r.breakEven.aco, 'percent0')} of the ${esc(scen)} effect.</strong> Total Medicare spending breaks even at ${fmt(r.breakEven.total, 'percent0')}. Use the ACO figure as the scale-up threshold for the pilot.`;

  const below = r.baselineSavings < r.terms.msr * r.benchmark;
  $('msr-note').innerHTML = !below
    ? `Before the program this ACO cleared its MSR, so each program dollar is shared at ${fmt(r.terms.shareRate, 'percent0')}. Medicare keeps ${fmt(r.medicareKeeps, 'currency0')}.`
    : s.gross >= r.msrGap
      ? `<strong>Before the program this ACO was ${fmt(r.msrGap, 'currency0')} short of its MSR.</strong> Program savings close that gap, so the ACO shares in all of its savings from the first dollar. That is why the ACO share can exceed program savings.`
      : `<strong>Before the program this ACO was ${fmt(r.msrGap, 'currency0')} short of its MSR.</strong> Program savings of ${fmt(s.gross, 'currency0')} do not close the gap, so the ACO keeps nothing from the program unless other savings close it.`;

  const values = SCENARIOS.map((x) => all[x.id].result.acoNet);
  const max = Math.max(...values.map(Math.abs), 1);
  $('comparison').innerHTML = `<h4 class="mini-title">ACO net per year by scenario</h4><div class="bars">${SCENARIOS.map((x) => {
    const res = all[x.id].result;
    const cls = [x.id === state.scenario ? 'is-active' : '', res.acoNet < 0 ? 'is-negative' : ''].join(' ');
    return `<div class="bar-row ${cls}"><span class="bar-label">${esc(x.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${((Math.abs(res.acoNet) / max) * 100).toFixed(1)}%"></span></span>
      <span class="bar-value">${esc(fmt(res.acoNet, 'currency0'))} <span class="bar-sub">break-even ${res.breakEven.aco === null ? 'n/a' : fmt(res.breakEven.aco, 'percent0')}</span></span></div>`;
  }).join('')}</div>`;

  const rows = [
    ['Enrolled: hypertension / diabetes / heart failure', `${fmt(s.conditions.htn.enrolled, 'number0')} / ${fmt(s.conditions.dm.enrolled, 'number0')} / ${fmt(s.conditions.hf.enrolled, 'number0')}`],
    ['Newly adherent patients', fmt(s.newlyAdherentTotal, 'number0')],
    ['Adherence savings', fmt(s.adherenceSavings, 'currency0')],
    ['Readmissions avoided', fmt(s.readmitsAvoided, 'number0')],
    ['Readmission savings', fmt(s.readmitSavings, 'currency0')],
    ['Break-even chronic care PMPM for the ACO (TOC fee held)', fmt(safeBreakEvenPMPM(r), 'currency2')],
  ];
  $('breakdown').innerHTML = `<tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>`;
}

// PMPM at which the ACO's share covers program cost, holding the TOC fee.
function safeBreakEvenPMPM(r) {
  const mm = r.scale.memberMonths;
  return mm > 0 ? (r.acoShare - r.scale.tocCost) / mm : null;
}

function renderMath(out) {
  $('math').innerHTML = out.math.map((block) => `<section class="math-block"><h4>${esc(block.title)}</h4>
    ${block.steps.map((s) => `<div class="math-step"><div class="formula">${esc(s.formula)}</div><div class="live">= ${esc(s.live)}</div>
      ${s.refs.length ? `<div class="refs">${refChips(s.refs)}</div>` : ''}</div>`).join('')}</section>`).join('');
}

function renderAssumptions() {
  const activeKey = SCENARIOS.find((s) => s.id === state.scenario).key;
  const head = `<thead><tr><th scope="col">Parameter</th>${SCENARIOS.map((s) => `<th scope="col" class="num ${s.key === activeKey ? 'is-active' : ''}">${esc(s.label)}</th>`).join('')}<th scope="col">Source and notes</th></tr></thead>`;
  const overrides = Object.fromEntries(INPUTS.filter((i) => i.assumptionId).map((i) => [i.assumptionId, i]));
  const rows = ASSUMPTION_IDS.map((id) => {
    const a = ASSUMPTIONS[id];
    const badges = [a.verify && verifyBadge(), a.placeholder && placeholderBadge()].filter(Boolean).join(' ');
    let cells;
    if (isScenarioDependent(a)) {
      cells = SCENARIOS.map((s) => `<td class="num ${s.key === activeKey ? 'is-active' : ''}">${esc(fmt(a[s.key], a.format))}</td>`).join('');
    } else {
      const input = overrides[id];
      const current = input ? Number(state.values[input.id]) / (input.kind === 'percent' ? 100 : 1) : a.value;
      const differs = input && Math.abs(current - a.value) > 1e-9;
      cells = `<td class="num fixed" colspan="3">${esc(fmt(a.value, a.format))}${differs ? ` <span class="override">now ${esc(fmt(current, a.format))}</span>` : ''}</td>`;
    }
    return `<tr><th scope="row">${esc(a.label)} ${badges}</th>${cells}<td class="source">${a.sources.map(citation).join(' ')}<div class="note">${esc(a.note)}</div></td></tr>`;
  }).join('');
  $('assumptions').innerHTML = head + `<tbody>${rows}</tbody>`;

  const prov = INPUTS.filter((i) => i.data).map((i) => {
    const v = Number(state.values[i.id]);
    const shown = i.kind === 'percent' ? fmt(v / 100, 'percent1') : fmt(v, KIND_FORMAT[i.kind]);
    return `<tr><th scope="row">${esc(i.label)}</th><td class="num">${esc(shown)}</td><td><code>${esc(i.column)}</code></td><td>${originBadge(i)}</td></tr>`;
  }).join('');
  $('provenance').innerHTML = `<thead><tr><th scope="col">Input</th><th scope="col" class="num">Value used</th><th scope="col">PUF column</th><th scope="col">Origin</th></tr></thead><tbody>${prov}</tbody>`;
}

function renderCaveats() {
  const items = [
    'Patients with more than one condition are counted once per condition at scale, which inflates both program cost and savings. Use registry counts of unique patients when available.',
    'Patients with heart failure may appear in both the chronic and TOC populations; estimates may double-count if they overlap.',
    'Adherence savings use 2011-dollar observational estimates (Roebuck 2011), not inflation-adjusted. The pilot prorates them by month and assumes no ramp-up.',
    'MSSP pass-through is simplified: no performance payment or loss caps, MLR assumed equal to MSR, PY2024 terms applied to a future year, and no benchmark rebasing. Verify against the current year’s CMS documentation.',
  ];
  $('caveats').innerHTML = items.map((c) => `<li>${esc(c)}</li>`).join('');
}

function renderMeta() {
  const scen = SCENARIOS.find((s) => s.id === state.scenario).label;
  $('print-scenario').textContent = `Scenario: ${scen}`;
  const who = state.aco ? acoLabel(state.aco) : 'MSSP median ACO';
  $('print-meta').textContent = `${who} · Prepared ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} · Scenario: ${scen}`;
}

function renderResults() {
  const all = Object.fromEntries(SCENARIOS.map((s) => [s.id, compute(state.values, s.id)]));
  const out = all[state.scenario];
  renderPilot(out.result);
  renderScale(out.result, all);
  renderMath(out);
  renderAssumptions();
  renderMeta();
}

function renderAll() {
  renderPicker();
  renderObserved();
  renderInputs();
  renderScenario();
  renderCaveats();
  renderResults();
}

// ---------- wiring ----------

function bind() {
  $('aco-search').addEventListener('change', (e) => {
    const text = e.target.value.trim().toLowerCase();
    if (!text) return;
    const match = state.data.acos.find((a) => acoLabel(a).toLowerCase() === text)
      ?? state.data.acos.find((a) => a.id.toLowerCase() === text)
      ?? state.data.acos.find((a) => a.name.toLowerCase().includes(text));
    if (!match) return;
    setAco(match.id);
    writeUrl();
    renderAll();
  });

  $('aco-clear').addEventListener('click', () => {
    setAco(null);
    writeUrl();
    renderAll();
  });

  $('participants').addEventListener('toggle', (e) => e.target.open && renderParticipants());

  $('inputs').addEventListener('input', (e) => {
    const input = INPUTS.find((i) => i.id === e.target.name);
    if (!input) return;
    state.values[input.id] = e.target.value;
    $(`origin-${input.id}`).innerHTML = originBadge(input);
    writeUrl();
    renderResults();
  });
  $('inputs').addEventListener('submit', (e) => e.preventDefault());

  $('scenario').addEventListener('change', (e) => {
    state.scenario = e.target.value;
    writeUrl();
    renderResults();
  });

  $('reset').addEventListener('click', () => {
    setAco(state.aco?.id ?? null);
    state.scenario = DEFAULT_SCENARIO;
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

function renderFooter() {
  $('footer').innerHTML = `<p>Independent prototype by ${esc(AUTHOR)}. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.
    <span class="no-print"> <a href="${esc(ROADMAP_URL)}" target="_blank" rel="noopener">Roadmap</a></span></p>`;
}

async function main() {
  renderFooter();
  try {
    await loadData();
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="notice notice-warn">Could not load CMS data (${esc(err.message)}). Serve this folder over HTTP, for example <code>python3 -m http.server</code>.</p>`;
    return;
  }
  readUrl();
  renderAll();
  bind();
}

main();

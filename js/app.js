// Single-screen ACO dashboard: CMS baseline, pilot, and distribution at scale.

import { ASSUMPTIONS, SOURCES } from './assumptions.js';
import { INPUTS, GROUPS, ASSUMPTION_IDS, DRAWS, acoDefaults, compute } from './model/aco.js';
import { fmt } from './format.js';
import { AUTHOR, ROADMAP_URL } from './config.js';
import { $, esc, info, tag, verifyTag, citation, statCard, range } from './ui.js';
import { studyPlan, STUDY } from './model/study.js';

const BASELINE_IDS = new Set(INPUTS.filter((i) => i.group === 'aco').map((i) => i.id));
const MAX_OPTIONS = 80;

const state = {
  data: null,
  selected: [], // ACO ids, in selection order
  values: {},
  defaults: {},
  origin: {},
  query: '',
  options: [], // rendered option rows
  active: -1,
};

const acosById = () => new Map(state.data.acos.map((a) => [a.id, a]));
const selectedAcos = () => {
  const m = acosById();
  return state.selected.map((id) => m.get(id)).filter(Boolean);
};
const isMulti = () => selectedAcos().filter((a) => a.hasResults).length >= 2;

// ---------- data ----------

async function loadData() {
  const res = await fetch('data/acos.json');
  if (!res.ok) throw new Error(`data/acos.json: HTTP ${res.status}`);
  state.data = await res.json();
}

// Baseline inputs follow the selection; everything else keeps the user's edits.
function applySelection(ids, { keepEdits = true } = {}) {
  state.selected = [...new Set(ids)].filter((id) => acosById().has(id));
  const single = state.selected.length === 1 ? acosById().get(state.selected[0]) : null;
  const { values, origin } = acoDefaults(single, state.data.medians);
  const prev = state.values;
  state.defaults = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
  state.origin = origin;
  state.values = { ...state.defaults };
  if (keepEdits) for (const [k, v] of Object.entries(prev)) if (!BASELINE_IDS.has(k)) state.values[k] = v;
}

// ---------- URL ----------

function readUrl() {
  const q = new URLSearchParams(location.search);
  applySelection((q.get('aco') ?? '').split(',').filter(Boolean), { keepEdits: false });
  for (const input of INPUTS) {
    const raw = q.get(input.id);
    if (raw !== null && validValue(input, raw)) state.values[input.id] = raw;
  }
}

const validValue = (input, raw) => (input.kind === 'choice' ? input.options.some(([v]) => v === raw) : raw.trim() !== '' && Number.isFinite(Number(raw)));
const sameValue = (input, a, b) => (input.kind === 'choice' ? String(a) === String(b) : Number(a) === Number(b));

function writeUrl() {
  const q = new URLSearchParams();
  if (state.selected.length) q.set('aco', state.selected.join(','));
  for (const input of INPUTS) {
    const v = state.values[input.id];
    if (v !== '' && !sameValue(input, v, state.defaults[input.id])) q.set(input.id, v);
  }
  const qs = q.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  $('build-link').href = `build.html${qs ? `?${qs}` : ''}`;
}

// ---------- ACO search (multi-select combobox) ----------

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ');

// Tier 2: every typed word appears. Tier 1: letters appear in order (typos, gaps).
function matchAcos(query) {
  const q = norm(query).trim();
  if (!q) return { tier: 0, list: state.data.acos };
  const words = q.split(/\s+/);
  const compact = q.replace(/\s+/g, '');
  const contains = [];
  const fuzzy = [];
  for (const a of state.data.acos) {
    const hay = norm(`${a.name} ${a.id} ${a.state ?? ''}`);
    if (words.every((w) => hay.includes(w))) contains.push(a);
    else if (compact.length >= 3 && isSubsequence(compact, hay.replace(/\s+/g, ''))) fuzzy.push(a);
  }
  return contains.length ? { tier: 2, list: contains } : { tier: 1, list: fuzzy };
}

function isSubsequence(needle, hay) {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return false;
}

function renderOptions() {
  const list = $('aco-options');
  const { tier, list: matches } = matchAcos(state.query);
  const chosen = new Set(state.selected);
  const rows = [];
  if (state.query.trim().length >= 2 && matches.length >= 2) {
    const all = matches.every((a) => chosen.has(a.id));
    rows.push({ kind: 'all', ids: matches.map((a) => a.id), all, tier });
  }
  for (const a of matches.slice(0, MAX_OPTIONS)) rows.push({ kind: 'aco', aco: a });
  state.options = rows;
  if (state.active >= rows.length) state.active = rows.length - 1;

  list.innerHTML = rows.length
    ? rows.map((r, i) => {
      const activeCls = i === state.active ? ' is-active' : '';
      if (r.kind === 'all') {
        const verb = r.all ? 'Remove all' : 'Select all';
        const how = r.tier === 2 ? 'containing' : 'close to';
        return `<li role="option" id="opt-${i}" class="combo-opt combo-all${activeCls}" aria-selected="${r.all}" data-i="${i}">
          <span class="check" aria-hidden="true">${r.all ? '✓' : '+'}</span>${verb} ${r.ids.length} ACOs ${how} “${esc(state.query.trim())}”</li>`;
      }
      const a = r.aco;
      const sel = chosen.has(a.id);
      return `<li role="option" id="opt-${i}" class="combo-opt${activeCls}" aria-selected="${sel}" data-i="${i}">
        <span class="check" aria-hidden="true">${sel ? '✓' : ''}</span>
        <span class="opt-name">${esc(a.name)}</span>
        <span class="opt-meta">${esc(a.id)}${a.state ? ` · ${esc(a.state)}` : ''}${a.hasResults ? '' : ' · no PY2024 results'}</span></li>`;
    }).join('') + (matches.length > MAX_OPTIONS ? `<li class="combo-more" aria-hidden="true">${matches.length - MAX_OPTIONS} more. Keep typing to narrow.</li>` : '')
    : '<li class="combo-more">No ACOs match.</li>';
  $('aco-search').setAttribute('aria-activedescendant', state.active >= 0 ? `opt-${state.active}` : '');
  list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}

function openOptions() {
  $('aco-options').hidden = false;
  $('aco-search').setAttribute('aria-expanded', 'true');
  renderOptions();
}

function closeOptions() {
  $('aco-options').hidden = true;
  $('aco-search').setAttribute('aria-expanded', 'false');
  state.active = -1;
}

function chooseOption(i) {
  const r = state.options[i];
  if (!r) return;
  const chosen = new Set(state.selected);
  if (r.kind === 'all') {
    if (r.all) r.ids.forEach((id) => chosen.delete(id));
    else r.ids.forEach((id) => chosen.add(id));
  } else if (chosen.has(r.aco.id)) chosen.delete(r.aco.id);
  else chosen.add(r.aco.id);
  selectionChanged([...chosen]);
  renderOptions();
}

function selectionChanged(ids) {
  applySelection(ids);
  writeUrl();
  renderAll({ keepPicker: true });
}

function renderChips() {
  const acos = selectedAcos();
  const shown = acos.slice(0, 8);
  $('chips').innerHTML = acos.length
    ? shown.map((a) => `<span class="chip">${esc(a.name)} <button type="button" class="chip-x" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">×</button></span>`).join('')
      + (acos.length > shown.length ? `<span class="chip chip-more">+${acos.length - shown.length} more</span>` : '')
      + '<button type="button" class="link-btn" id="clear-acos">Clear</button>'
    : '<span class="muted">None selected. Showing the median MSSP ACO.</span>';
}

// ---------- CMS data ----------

const sum = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0);
function weighted(acos, value, weight) {
  let w = 0;
  let t = 0;
  for (const a of acos) {
    const v = value(a);
    const k = weight(a);
    if (v === null || v === undefined || !k) continue;
    w += k;
    t += v * k;
  }
  return w ? t / w : null;
}

function tile(label, value, sub, column) {
  return `<div class="tile">
    <div class="tile-head"><span class="tile-label">${esc(label)}</span>${info(`<strong>Source:</strong> ${esc(state.data.meta.sources.results.short)}<br><code>${esc(column)}</code>`, `Source for ${label}`)}</div>
    <div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
}

function dualTile(acos) {
  const m = state.data.medians;
  const gap = state.data.meta.lisGap;
  const withRes = acos.filter((a) => a.hasResults);
  const py = withRes.reduce((t, a) => t + (a.dualPersonYears ?? 0), 0);
  const share = withRes.length ? weighted(withRes, (a) => a.dualShare, (a) => a.lum) : m.dualShare;
  const sd = withRes.length ? weighted(withRes, (a) => a.spendDual, (a) => a.dualPersonYears) : m.spendDual;
  const snd = withRes.length ? weighted(withRes, (a) => a.spendNonDual, (a) => a.lum) : m.spendNonDual;
  return `<div class="tile">
    <div class="tile-head"><span class="tile-label">Dual-eligible beneficiaries</span>${info(`<strong>Source:</strong> ${esc(state.data.meta.sources.results.short)}<br><code>N_AB_Year_Dual_PY; Per_Capita_Exp_ALL_AGDU_PY vs AGND_PY</code><br>Spending compares aged duals with aged non-duals.<br><strong>Adherence gap:</strong> duals and low-income members are ${esc(fmt(-gap.ras, 'percent1'))} points lower on blood pressure meds and ${esc(fmt(-gap.dm, 'percent1'))} on diabetes meds within the same drug plan (<a href="${esc(gap.url)}" target="_blank" rel="noopener">CMS CAI supplement</a>).`, 'Source for duals')}</div>
    <div class="tile-value">${withRes.length ? `${esc(fmt(py, 'number0'))} <span class="tile-of">(${esc(fmt(share, 'percent1'))})</span>` : `${esc(fmt(share, 'percent1'))} <span class="tile-of">median ACO</span>`}</div>
    <div class="tile-sub">${esc(fmt(sd, 'currencyCompact'))} vs ${esc(fmt(snd, 'currencyCompact'))} spending per person (${esc(fmt(sd / snd, 'number1'))}\u00d7)</div></div>`;
}

function partDTile(ras, dm, sub) {
  const src = state.data.meta.sources.stars;
  return `<div class="tile">
    <div class="tile-head"><span class="tile-label">Taking meds as prescribed (PDC \u2265 80%)</span>${info(`<strong>Source:</strong> ${esc(src.name)}, released ${esc(src.released)}. Standalone Part D plans, weighted by plan enrollment in each county and the ACO\u2019s beneficiaries in each county.<br><code>D09 RAS antagonists; D08 diabetes medications</code>`, 'Source for adherence')}</div>
    <div class="tile-value">${esc(fmt(ras, 'percent1'))} <span class="tile-of">blood pressure</span> \u00b7 ${esc(fmt(dm, 'percent1'))} <span class="tile-of">diabetes</span></div>
    <div class="tile-sub">${esc(sub)}. 2025, from 2027 Star Ratings</div></div>`;
}

const vsMedian = (key, format) => `Median ACO: ${esc(fmt(state.data.medians[key], format))}`;

function renderObserved() {
  const src = state.data.meta.sources.results;
  $('observed-source').innerHTML = `${tag('cms')} <a class="cite" href="${esc(src.page)}" target="_blank" rel="noopener">MSSP PY2024 results, released ${esc(src.released)}</a>`;

  const acos = selectedAcos();
  const withRes = acos.filter((a) => a.hasResults);
  const m = state.data.medians;
  let notice = '';
  let tiles;

  if (withRes.length >= 2) {
    const missing = acos.length - withRes.length;
    if (missing) notice = `<p class="notice">${missing} of ${acos.length} selected ACOs joined after PY2024 and have no CMS results. They are left out of every number below.</p>`;
    const admits = (a) => (a.lum * a.stAdmitsPer1000) / 1000;
    const cleared = withRes.filter((a) => a.savingsRate >= a.msr).length;
    const savings = sum(withRes.map((a) => a.savingsTotal));
    const bench = sum(withRes.map((a) => a.benchmarkTotal));
    tiles = [
      tile('ACOs with CMS results', `${fmt(withRes.length, 'number0')}`, `of ${fmt(acos.length, 'number0')} selected`, 'ACO_ID'),
      tile('Assigned beneficiaries', fmt(sum(withRes.map((a) => a.lum)), 'number0'), 'Total', 'N_AB'),
      tile('Cleared their MSR', `${cleared} <span class="tile-of">of ${withRes.length}</span>`, `Combined savings rate ${fmt(savings / bench, 'percent1')}`, 'Sav_rate vs MinSavPerc'),
      tile('Shared savings earned', fmt(sum(withRes.map((a) => a.earned)), 'currencyCompact'), 'Total, PY2024', 'EarnSaveLoss'),
      tile('30-day readmission rate', fmt(weighted(withRes, (a) => a.readmitRate, admits), 'percent1'), `Weighted by admissions. ${vsMedian('readmitRate', 'percent1')}`, 'Measure_479'),
      tile('Admissions per 1,000', fmt(weighted(withRes, (a) => a.stAdmitsPer1000, (a) => a.lum), 'number0'), vsMedian('stAdmitsPer1000', 'number0'), 'ADM_S_Trm'),
      tile('Cost per admission', fmt(weighted(withRes, (a) => a.costPerAdmit, admits), 'currency0'), vsMedian('costPerAdmit', 'currency0'), 'CapAnn_INP_S_trm ÷ ADM_S_Trm'),
      tile('Quality score', fmt(weighted(withRes, (a) => a.qualityScore, (a) => a.lum), 'number1'), `Weighted by beneficiaries. ${vsMedian('qualityScore', 'number1')}`, 'QualScore'),
      partDTile(weighted(withRes, (a) => a.partD?.ras, (a) => a.lum), weighted(withRes, (a) => a.partD?.dm, (a) => a.lum), 'Weighted by beneficiaries'),
      dualTile(withRes),
    ];
  } else {
    const a = withRes[0] ?? null;
    const named = acos[0];
    if (!acos.length) notice = `<p class="notice">No ACO selected. Showing the median of ${fmt(state.data.meta.counts.withResults, 'number0')} MSSP ACOs.</p>`;
    else if (!a) notice = `<p class="notice">${esc(named.name)} joined after PY2024. CMS has no results yet, so MSSP medians fill in. Edit them under ACO baseline.</p>`;
    else if (acos.length > 1) notice = `<p class="notice">Only ${esc(a.name)} of the ${acos.length} selected ACOs has PY2024 results.</p>`;
    else if (!a.active2026) notice = `<p class="notice">${esc(a.name)} is not in the 2026 program. Showing its PY2024 results.</p>`;
    const v = (k) => (a ? a[k] : m[k]);
    const gap = v('savingsRate') - v('msr');
    tiles = [
      tile('Assigned beneficiaries', fmt(v('lum'), 'number0'), a ? vsMedian('lum', 'number0') : 'Median ACO', 'N_AB'),
      tile('Track in 2026', esc(a?.track2026 ?? (a ? 'Not in 2026 program' : 'n/a')), a ? `${esc(a.riskModel)} in PY2024` : '', 'Current_Track; 2026 ACO list'),
      tile('Savings rate vs. MSR', `${fmt(v('savingsRate') / 100, 'percent1')} <span class="tile-of">vs ${fmt(v('msr') / 100, 'percent1')}</span>`, gap >= 0 ? `Cleared MSR by ${fmt(gap / 100, 'percent1')}` : `<span class="warn">Short of MSR by ${fmt(-gap / 100, 'percent1')}</span>`, 'Sav_rate; MinSavPerc'),
      tile('Shared savings earned', a ? fmt(a.earned, 'currencyCompact') : 'n/a', a ? `Sharing rate ${fmt(a.shareRate / 100, 'percent0')}` : '', 'EarnSaveLoss; FinalShareRate'),
      tile('30-day readmission rate', fmt(v('readmitRate'), 'percent1'), a ? vsMedian('readmitRate', 'percent1') : '', 'Measure_479'),
      tile('Admissions per 1,000', fmt(v('stAdmitsPer1000'), 'number0'), a ? vsMedian('stAdmitsPer1000', 'number0') : '', 'ADM_S_Trm'),
      tile('Cost per admission', fmt(v('costPerAdmit'), 'currency0'), a ? vsMedian('costPerAdmit', 'currency0') : '', 'CapAnn_INP_S_trm ÷ ADM_S_Trm'),
      tile('Quality score', fmt(v('qualityScore'), 'number1'), a ? vsMedian('qualityScore', 'number1') : '', 'QualScore'),
      partDTile((named?.partD ?? m.partD).ras, (named?.partD ?? m.partD).dm, !named ? 'National, standalone drug plans' : named.partD?.basis === 'states' ? 'Drug plans in its states' : 'Drug plans in its counties'),
      dualTile(a ? [a] : []),
    ];
  }
  $('observed-notice').innerHTML = notice;
  $('tiles').innerHTML = tiles.join('');
  renderAcoTable(acos);
}

function renderAcoTable(acos) {
  const card = $('aco-table-card');
  card.hidden = acos.length < 2;
  if (card.hidden) return;
  const rows = [...acos].sort((a, b) => (b.lum ?? -1) - (a.lum ?? -1));
  $('aco-table-summary').textContent = `${acos.length} selected ACOs`;
  const pct = (x) => (x === null || x === undefined ? '<span class="muted">n/a</span>' : esc(fmt(x / 100, 'percent1')));
  $('aco-table').innerHTML = `<thead><tr><th scope="col">ACO</th><th scope="col">2026 track</th><th scope="col" class="num">Assigned</th>
      <th scope="col" class="num">Savings rate</th><th scope="col" class="num">MSR</th><th scope="col" class="num">Earned</th><th scope="col" class="num">Readmission</th></tr></thead>
    <tbody>${rows.map((a) => `<tr><th scope="row">${esc(a.name)} <span class="muted">${esc(a.id)}</span></th><td>${esc(a.track2026 ?? 'Not in 2026')}</td>
      ${a.hasResults
        ? `<td class="num">${esc(fmt(a.lum, 'number0'))}</td><td class="num">${pct(a.savingsRate)}</td><td class="num">${pct(a.msr)}</td><td class="num">${esc(fmt(a.earned, 'currencyCompact'))}</td><td class="num">${a.readmitRate === null ? '<span class="muted">n/a</span>' : esc(fmt(a.readmitRate, 'percent1'))}</td>`
        : '<td colspan="5" class="muted">No PY2024 results</td>'}</tr>`).join('')}</tbody>`;
}

// ---------- inputs ----------

function originTag(input) {
  if (!sameValue(input, state.values[input.id], state.defaults[input.id])) return tag('edited');
  if (state.origin[input.id] === 'cms') return tag('cms');
  if (state.origin[input.id] === 'median') return tag('median');
  return '';
}

function fieldTags(input) {
  const a = input.assumptionId ? ASSUMPTIONS[input.assumptionId] : null;
  return `${originTag(input)}${input.placeholder ? tag('placeholder') : ''}${a?.verify && input.group !== 'uncertainty' ? verifyTag() : ''}`;
}

function fieldTip(input) {
  const a = input.assumptionId ? ASSUMPTIONS[input.assumptionId] : null;
  const parts = [];
  if (input.column) parts.push(`<strong>CMS column:</strong> <code>${esc(input.column)}</code>`);
  if (input.tip) parts.push(esc(input.tip));
  if (a) parts.push(`${esc(a.note)}<br>${a.sources.map(citation).join(' · ')}`);
  return parts.length ? info(parts.join('<br>'), `About ${input.label}`) : '';
}

function inputField(input) {
  if (input.kind === 'choice') {
    return `<div class="field">
      <div class="field-head"><label for="in-${input.id}">${esc(input.label)}</label>${fieldTip(input)}</div>
      <div class="control"><select id="in-${input.id}" name="${input.id}">${input.options.map(([v, l]) => `<option value="${esc(v)}"${String(state.values[input.id]) === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field-tags" id="origin-${input.id}">${fieldTags(input)}</div>
    </div>`;
  }
  const prefix = input.kind === 'currency' ? '<span class="affix">$</span>' : '';
  const suffix = input.kind === 'percent' ? '%' : input.suffix ?? '';
  const max = input.kind === 'percent' ? ' max="100"' : input.max ? ` max="${input.max}"` : '';
  return `<div class="field">
      <div class="field-head"><label for="in-${input.id}">${esc(input.label)}</label>${fieldTip(input)}</div>
      <div class="control">${prefix}
        <input id="in-${input.id}" name="${input.id}" type="number" inputmode="decimal" min="0"${max} step="${input.step ?? 1}" value="${esc(state.values[input.id])}">
        ${suffix ? `<span class="affix">${esc(suffix)}</span>` : ''}</div>
      <div class="field-tags" id="origin-${input.id}">${fieldTags(input)}</div>
    </div>`;
}

function renderInputs() {
  const multi = isMulti();
  const n = selectedAcos().filter((a) => a.hasResults).length;
  $('inputs').innerHTML = GROUPS.map((g) => {
    let body = INPUTS.filter((i) => i.group === g.id).map(inputField).join('');
    if (g.id === 'aco' && multi) body = `<p class="group-note">Using each of the ${n} ACOs' own CMS data. Select one ACO to edit these.</p>`;
    return g.collapsible
      ? `<details class="group group-collapsible"><summary>${esc(g.label)}</summary><div class="group-body">${body}</div></details>`
      : `<fieldset class="group"><legend>${esc(g.label)}</legend>${body}</fieldset>`;
  }).join('');
}

// ---------- pilot ----------

function renderPilot(r) {
  const p = r.pilot;
  $('pilot-heading').textContent = `Pilot: ${fmt(p.cohort, 'number0')} patients, ${fmt(p.discharges, 'number0')} discharges, ${p.months} months`;
  $('pilot-stats').innerHTML = [
    statCard({
      label: 'Medicare spending avoided during pilot', value: r.dist.pilotGross.p50, sub: range(r.dist.pilotGross), tags: ['estimate'], primary: true,
      tip: `Median of ${fmt(DRAWS, 'number0')} simulated outcomes.<br><strong>CMS data:</strong> readmission rate, cost per admission.<br><strong>Assumed:</strong> engagement, adherence effect, readmission reduction, savings per adherent patient.`,
    }),
    statCard({
      label: 'Pilot cost', value: p.cost, sub: `${fmt(p.cohort, 'number0')} patients × ${p.months} months + ${fmt(p.discharges, 'number0')} discharges`, tags: ['placeholder'],
      tip: 'Placeholder prices, not Generated Health pricing. Change them under Price.',
    }),
    statCard({
      label: 'Net during pilot', value: r.dist.pilotNet.p50, sub: range(r.dist.pilotNet), tags: ['estimate'],
      tip: 'Spending avoided minus pilot cost. Savings are prorated by month with no ramp-up.',
    }),
  ].join('');

  const cell = (v, f) => (v === null ? '<span class="muted">n/a</span>' : esc(fmt(v, f)));
  const study = Object.fromEntries(studyPlan(r).map((x) => [x.id, x]));
  const readmitKnown = isMulti() || state.origin.baselineReadmit === 'cms';
  const nowTag = { adherence: state.values.targeting === 'gap' ? tag('assumption') : tag('cms'), readmit: readmitKnown ? tag('cms') : tag('median') };
  $('scorecard').innerHTML = `<thead><tr>
      <th scope="col">Measure</th><th scope="col" class="num">Now</th><th scope="col" class="num">Target</th>
      <th scope="col" class="num">Per group ${info('Patients per group (program and comparison) to detect the target with 95% confidence and 80% power. Two-proportion z-test.', 'About needed per group')}</th>
      <th scope="col" class="num">Pilot</th>
      <th scope="col" class="num">Months at scale ${info(`Months of continuous enrollment at the ACO\u2019s full-scale volume, plus the measurement window and about ${STUDY.claimsLagMonths} months of claims lag. Assumes delivery never lapses.`, 'About months to an answer')}</th>
      <th scope="col">Provable? ${info('<strong>Yes:</strong> pilot is large enough to show the effect.<br><strong>No:</strong> too small; treat as directional.<br><strong>Counted:</strong> measured directly, no comparison needed.', 'About provable')}</th></tr></thead>
    <tbody>${r.scorecard.map((row) => `<tr>
      <th scope="row">${esc(row.metric)}<div class="row-sub">${esc(row.measure)}</div></th>
      <td class="num">${row.baseline === null ? '<span class="muted">None yet</span>' : `${cell(row.baseline, row.format)} ${nowTag[row.id] ?? ''}`}</td>
      <td class="num strong">${cell(row.target, row.format)}</td>
      <td class="num">${row.required === null ? `<span class="muted">Not needed</span>${info(`Counted directly from the program, so there is no comparison group. With ${esc(fmt(row.have, 'number0'))} ${row.id === 'completion' ? 'discharges' : 'patients'}, a ${esc(fmt(row.target, 'percent0'))} rate is accurate to \u00b1${esc(fmt(1.96 * Math.sqrt((row.target * (1 - row.target)) / Math.max(1, row.have)), 'percent1'))} (95% confidence).`, 'About counted measures')}` : esc(fmt(row.required, 'number0'))}</td>
      <td class="num">${esc(fmt(row.have, 'number0'))}</td>
      <td class="num">${study[row.id] ? (study[row.id].totalMonths === null ? 'Never' : esc(fmt(study[row.id].totalMonths, 'number0'))) : '<span class="muted">From launch</span>'}</td>
      <td>${row.provable === null ? `<span class="pill pill-direct">Counted, \u00b1${esc(fmt(1.96 * Math.sqrt((row.target * (1 - row.target)) / Math.max(1, row.have)), 'percent1'))}</span>` : row.provable ? '<span class="pill pill-yes">Yes</span>' : '<span class="pill pill-no">No</span>'}</td>
    </tr>`).join('')}</tbody>`;
}

// ---------- distribution chart ----------

const GAIN = '#008c99';
const LOSS = '#b5452f';

function niceTicks(lo, hi, count = 5) {
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(Math.abs(t) < 1e-9 ? 0 : t);
  return ticks;
}

function renderDist(r) {
  const d = r.dist.acoNet;
  const hist = d.hist;
  const W = 640;
  const H = 220;
  const M = { l: 12, r: 12, t: 30, b: 30 };
  const x0 = hist[0].lo;
  const x1 = hist[hist.length - 1].hi;
  const x = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const maxShare = Math.max(...hist.map((b) => b.share), 1e-9);
  const y = (s) => H - M.b - (s / maxShare) * (H - M.t - M.b);
  const base = H - M.b;

  const bars = hist.map((b, i) => {
    const slot = x(b.hi) - x(b.lo);
    const w = Math.max(1, Math.min(24, slot - 2));
    const left = x(b.lo) + (slot - w) / 2;
    const top = y(b.share);
    const h = base - top;
    const r4 = Math.min(4, w / 2, h);
    const color = b.hi <= 0 ? LOSS : GAIN;
    const path = h <= 0 ? '' : `<path d="M${left},${base} V${top + r4} Q${left},${top} ${left + r4},${top} H${left + w - r4} Q${left + w},${top} ${left + w},${top + r4} V${base} Z" fill="${color}"/>`;
    return `${path}<rect class="hit" data-i="${i}" x="${x(b.lo)}" y="${M.t}" width="${slot}" height="${base - M.t}" fill="transparent"/>`;
  }).join('');

  const ticks = niceTicks(x0, x1).map((t) => `<g><line x1="${x(t)}" x2="${x(t)}" y1="${base}" y2="${base + 4}" stroke="var(--line-strong)"/>
    <text x="${x(t)}" y="${base + 18}" text-anchor="middle" class="axis">${esc(fmt(t, 'currencyCompact'))}</text></g>`).join('');

  const marker = (v, label, anchor) => (v < x0 || v > x1 ? '' : `<line x1="${x(v)}" x2="${x(v)}" y1="${M.t - 4}" y2="${base}" stroke="var(--ink)" stroke-width="1"/>
    <text x="${x(v)}" y="${M.t - 10}" text-anchor="${anchor}" class="marker">${esc(label)}</text>`);
  const edgeAnchor = (px) => (px < W * 0.15 ? 'start' : px > W * 0.85 ? 'end' : 'middle');
  const close = Math.abs(x(d.p50) - x(0)) < 110;
  const zeroAnchor = close ? (d.p50 > 0 ? 'end' : 'start') : edgeAnchor(x(0));
  const medAnchor = close ? (d.p50 > 0 ? 'start' : 'end') : edgeAnchor(x(d.p50));

  $('dist').innerHTML = `<figcaption class="dist-title"><span>ACO net gain per year: ${fmt(DRAWS, 'number0')} simulated outcomes</span>${tag('estimate')}${info('Each outcome draws engagement, adherence effect, savings realized, follow-up completion, and readmission reduction from their distributions (see Effect assumptions), then runs the CMS shared-savings math. Net gain = shared savings paid to the ACO minus program cost.', 'About this chart')}</figcaption>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of ACO net gain. Median ${esc(fmt(d.p50, 'currency0'))}; ${esc(fmt(d.probPositive, 'percent0'))} of outcomes above zero.">
        <line x1="${M.l}" x2="${W - M.r}" y1="${base}" y2="${base}" stroke="var(--line-strong)"/>
        ${bars}${ticks}
        ${marker(0, 'Break-even', zeroAnchor)}
        ${marker(d.p50, `Median ${fmt(d.p50, 'currencyCompact')}`, medAnchor)}
      </svg>
      <div class="chart-tip" id="chart-tip" hidden></div>
    </div>
    <div class="legend"><span><i style="background:${LOSS}"></i>ACO loses money</span><span><i style="background:${GAIN}"></i>ACO comes out ahead</span></div>`;

  const svg = $('dist').querySelector('svg');
  const tip = $('chart-tip');
  svg.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) return (tip.hidden = true);
    const b = hist[Number(hit.dataset.i)];
    tip.innerHTML = `<strong>${esc(fmt(b.lo, 'currencyCompact'))} to ${esc(fmt(b.hi, 'currencyCompact'))}</strong><br>${esc(fmt(b.share, 'percent1'))} of outcomes`;
    const box = svg.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 150, Math.max(0, e.clientX - box.left + 10))}px`;
    tip.style.top = `${Math.max(0, e.clientY - box.top - 50)}px`;
    tip.hidden = false;
  });
  svg.addEventListener('mouseleave', () => (tip.hidden = true));

  $('dist-side').innerHTML = `<div class="prob">
      <div class="stat-head"><span class="stat-label">${r.units.length > 1 ? 'Chance the ACOs come out ahead (combined)' : 'Chance the ACO comes out ahead'}</span>${info('Share of simulated outcomes where shared savings paid to the ACO exceed program cost.', 'About chance')}</div>
      <div class="prob-value">${esc(fmt(d.probPositive, 'percent0'))}</div>${tag('estimate')}</div>
    <table class="data-table pct-table"><caption class="sr-only">ACO net gain percentiles</caption><tbody>
      <tr><th scope="row">Bad year (10th percentile)</th><td class="num">${esc(fmt(d.p10, 'currency0'))}</td></tr>
      <tr><th scope="row">Median</th><td class="num strong">${esc(fmt(d.p50, 'currency0'))}</td></tr>
      <tr><th scope="row">Good year (90th percentile)</th><td class="num">${esc(fmt(d.p90, 'currency0'))}</td></tr>
    </tbody></table>`;
}

// ---------- scale cards ----------

function renderScale(r) {
  const s = r.scale;
  const multi = r.units.length > 1;
  const u0 = r.units[0];
  const known = multi
    ? "each ACO's sharing rate, MSR, and benchmark (CMS PY2024)"
    : `sharing rate ${esc(fmt(u0.shareRate, 'percent0'))}, MSR ${esc(fmt(u0.msr, 'percent1'))}, benchmark ${esc(fmt(u0.benchmark, 'currencyCompact'))}${state.origin.shareRate === 'cms' ? ' (CMS PY2024)' : ' (MSSP median)'}`;
  const cards = [
    statCard({
      label: 'Shared savings revenue to ACO', value: r.dist.acoShare.p50, sub: range(r.dist.acoShare), tags: ['estimate'], primary: true,
      tip: `Extra shared-savings payment CMS would make to the ACO because of the program. Paid only if the ACO's total savings clear its MSR.<br><strong>Known:</strong> ${known}.<br><strong>Estimated:</strong> Medicare spending avoided.`,
    }),
    statCard({
      label: 'Program cost to ACO', value: s.cost, sub: `${fmt(s.enrolled, 'number0')} patients, ${fmt(s.discharges, 'number0')} discharges`, tags: ['placeholder'],
      tip: '<strong>Known:</strong> assigned beneficiaries and admissions (CMS).<br><strong>Assumed:</strong> prevalence, enrollment share, price.',
    }),
    statCard({
      label: 'Medicare spending avoided', value: r.dist.gross.p50, sub: `${range(r.dist.gross)}<br>${esc(fmt(r.savingsPctOfBenchmark, 'percent1'))} of benchmark`, tags: ['estimate'],
      tip: 'Medicare Parts A and B spending avoided by better adherence and fewer readmissions. CMS keeps the part not shared with the ACO.',
    }),
  ];

  const below = s.perAco.filter((u) => u.belowMsr);
  if (below.length) {
    const closes = below.filter((u) => u.closesGap).length;
    cards.push(statCard({
      label: multi ? 'ACOs short of their MSR' : 'Short of MSR before program',
      value: multi ? `${below.length} <span class="tile-of">of ${r.units.length}</span>` : esc(fmt((u0.msr - u0.savingsRate) * u0.benchmark, 'currencyCompact')),
      sub: multi ? `Program closes the gap for ${closes} (central case)` : closes ? 'Program closes the gap (central case)' : 'Program does not close the gap (central case)',
      tags: ['cms', 'estimate'],
      tip: 'Below the MSR an ACO gets no shared savings. Closing the gap unlocks sharing on all of its savings, not just the program’s.',
    }));
  }
  $('scale-stats').innerHTML = cards.join('');
}

// ---------- how this is calculated ----------

function refChips(refs) {
  return refs.map((ref) => {
    if (ref.startsWith('input:')) {
      const input = INPUTS.find((i) => i.id === ref.slice(6));
      return `<span class="cite">${esc(input.label)}: ${input.column ? `<code>${esc(input.column)}</code>` : 'your input'}</span>`;
    }
    if (SOURCES[ref]) return citation(ref);
    const a = ASSUMPTIONS[ref];
    return a.sources.map(citation).join(' ') + (a.verify ? ` ${verifyTag()}` : '');
  }).join(' ');
}

function renderMath(out) {
  $('math').innerHTML = out.math.map((block) => `<section class="math-block"><h4>${esc(block.title)}</h4>
    ${block.steps.map((s) => `<div class="math-step"><div class="formula">${esc(s.formula)}</div><div class="live">= ${esc(s.live)}</div>
      ${s.refs.length ? `<div class="refs">${refChips(s.refs)}</div>` : ''}</div>`).join('')}</section>`).join('');
}

function renderAssumptions(r) {
  const rows = ASSUMPTION_IDS.map((id) => {
    const a = ASSUMPTIONS[id];
    const spec = r.specs[id];
    let dist;
    let center;
    let spread = '';
    if (spec) {
      const z = 1.2816;
      const lo = spec.dist === 'lognormal' ? spec.median * Math.exp(-z * spec.sdLog) : Math.max(spec.min, spec.mean - z * spec.sd);
      const hi = spec.dist === 'lognormal' ? spec.median * Math.exp(z * spec.sdLog) : Math.min(spec.max, spec.mean + z * spec.sd);
      dist = spec.dist === 'lognormal' ? 'Log-normal' : 'Normal';
      center = fmt(r.central[id], a.format);
      spread = `${fmt(lo, a.format)} to ${fmt(hi, a.format)}`;
    } else {
      const input = INPUTS.find((i) => i.assumptionId === id);
      const v = input ? Number(state.values[input.id]) / (input.kind === 'percent' ? 100 : 1) : a.value;
      dist = 'Fixed';
      center = fmt(v, a.format);
    }
    const anchor = a.anchor ?? (a.sources.includes('cmsResults') ? 'CMS data' : a.sources.includes('author') ? 'Assumption' : 'Literature');
    return `<tr><th scope="row">${esc(a.label)} ${a.verify ? verifyTag() : ''}${a.placeholder ? tag('placeholder') : ''}</th><td>${dist}</td><td class="num strong">${esc(center)}</td><td class="num">${esc(spread)}</td>
      <td>${esc(anchor)}</td><td class="source">${a.sources.map(citation).join(' ')}<div class="row-sub">${esc(a.note)}</div></td></tr>`;
  }).join('');
  $('assumptions').innerHTML = `<thead><tr><th scope="col">Assumption</th><th scope="col">Distribution</th><th scope="col" class="num">Center</th><th scope="col" class="num">10th–90th</th><th scope="col">Anchored to</th><th scope="col">Source</th></tr></thead><tbody>${rows}</tbody>`;

  const multi = r.units.length > 1;
  const prov = INPUTS.filter((i) => i.data).map((i) => {
    const v = Number(state.values[i.id]);
    const shown = multi ? 'Each ACO’s own value' : i.kind === 'percent' ? fmt(v / 100, 'percent1') : fmt(v, i.kind === 'currency' ? 'currency0' : 'number0');
    return `<tr><th scope="row">${esc(i.label)}</th><td class="num">${esc(shown)}</td><td><code>${esc(i.column)}</code></td><td>${multi ? tag('cms') : originTag(i)}</td></tr>`;
  }).join('');
  $('provenance').innerHTML = `<thead><tr><th scope="col">Input</th><th scope="col" class="num">Value</th><th scope="col">CMS column</th><th scope="col">Origin</th></tr></thead><tbody>${prov}</tbody>`;
}

function renderCaveats() {
  const items = [
    'Patients with more than one condition are counted once per condition at scale.',
    'Savings per adherent patient are 2011-dollar observational estimates, not inflation-adjusted.',
    'CMS settlement is simplified: no payment or loss caps, MLR equal to MSR, PY2024 terms, no benchmark rebasing.',
    'Only the five effect assumptions vary in the simulation. Prevalence, prices, and CMS data are held fixed.',
  ];
  $('caveats').innerHTML = items.map((c) => `<li>${esc(c)}</li>`).join('');
}

function renderMeta() {
  const acos = selectedAcos();
  const who = !acos.length ? 'Median MSSP ACO' : acos.length === 1 ? `${acos[0].name} (${acos[0].id})` : `${acos.length} ACOs: ${acos.slice(0, 3).map((a) => a.name).join('; ')}${acos.length > 3 ? '; ...' : ''}`;
  $('print-meta').textContent = `${who} · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}

// ---------- render ----------

function renderResults() {
  const out = compute(state.values, selectedAcos(), { medians: state.data.medians });
  const r = out.result;
  renderPilot(r);
  renderDist(r);
  renderScale(r);
  renderMath(out);
  renderAssumptions(r);
  renderMeta();
}

function renderAll({ keepPicker = false } = {}) {
  if (!keepPicker) $('aco-search').value = state.query;
  renderChips();
  renderObserved();
  renderInputs();
  renderCaveats();
  renderResults();
}

// ---------- wiring ----------

function bind() {
  const search = $('aco-search');
  search.addEventListener('input', () => {
    state.query = search.value;
    state.active = state.query.trim().length >= 2 ? 0 : -1;
    openOptions();
  });
  search.addEventListener('focus', openOptions);
  search.addEventListener('keydown', (e) => {
    const open = !$('aco-options').hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openOptions();
      state.active = Math.min(state.options.length - 1, state.active + 1);
      renderOptions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.active = Math.max(0, state.active - 1);
      renderOptions();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && state.active >= 0) chooseOption(state.active);
    } else if (e.key === 'Escape') {
      closeOptions();
    } else if (e.key === 'Backspace' && !search.value && state.selected.length) {
      selectionChanged(state.selected.slice(0, -1));
    }
  });
  $('aco-options').addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li) return;
    e.preventDefault(); // keep focus in the input
    chooseOption(Number(li.dataset.i));
  });
  document.addEventListener('mousedown', (e) => {
    if (!$('combo').contains(e.target)) closeOptions();
  });

  $('chips').addEventListener('click', (e) => {
    const x = e.target.closest('.chip-x');
    if (x) selectionChanged(state.selected.filter((id) => id !== x.dataset.id));
    if (e.target.id === 'clear-acos') selectionChanged([]);
  });

  $('inputs').addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('inputs').addEventListener('input', (e) => {
    const input = INPUTS.find((i) => i.id === e.target.name);
    if (!input) return;
    state.values[input.id] = e.target.value;
    $(`origin-${input.id}`).innerHTML = fieldTags(input);
    writeUrl();
    renderResults();
  });
  $('inputs').addEventListener('submit', (e) => e.preventDefault());

  $('reset').addEventListener('click', () => {
    applySelection(state.selected, { keepEdits: false });
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
    <span class="no-print"><a href="${esc(ROADMAP_URL)}" target="_blank" rel="noopener">Roadmap</a></span></p>`;
}

async function main() {
  renderFooter();
  try {
    await loadData();
  } catch (err) {
    document.querySelector('main').innerHTML = `<p class="notice">Could not load CMS data (${esc(err.message)}). Serve this folder over HTTP, for example <code>python3 -m http.server</code>.</p>`;
    return;
  }
  readUrl();
  writeUrl();
  renderAll();
  bind();
}

main();

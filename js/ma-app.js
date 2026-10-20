// MA Opportunity Finder page.

import { MA_ASSUMPTIONS } from './assumptions.js';
import { MEASURE_KEYS, tierFor, nearMeasures, membersToMove, dollarsAtStake } from './model/ma.js';
import { blendPartD } from './model/aco.js';
import { fmt } from './format.js';
import { AUTHOR } from './config.js';
import { $, esc, info, tag, verifyTag } from './ui.js';

const SHORT = { dm: 'Diabetes meds', ras: 'BP meds (RAS)', statin: 'Statins', cbp: 'BP control', spc: 'Statin, CVD', supd: 'Statin, diabetes' };
const TIERS = {
  1: { label: 'Bonus cliff', rule: (t) => `3.5 stars overall and a measure within ${t} pts of the next star` },
  2: { label: 'Defend the bonus', rule: (t) => `4.0 stars overall and a measure within ${t} pts of dropping a star` },
  3: { label: 'Measure lift', rule: (t) => `Any other plan with a measure within ${t} pts of the next star` },
};
const DEFAULTS = { t: 2, tier: 'all', stars: 'all', min: 0, m: 'any', q: '', snp: '0', sort: 'tier', dir: '1' };

const state = { data: null, f: { ...DEFAULTS }, a: Object.fromEntries(Object.entries(MA_ASSUMPTIONS).map(([k, v]) => [k, v.value])), selected: null };

// ---------- URL ----------

function readUrl() {
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) state.f[k] = q.get(k);
  for (const k of Object.keys(state.a)) if (q.has(k) && Number.isFinite(Number(q.get(k)))) state.a[k] = Number(q.get(k));
  state.selected = q.get('c');
}

function writeUrl() {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(state.f)) if (String(v) !== String(DEFAULTS[k])) q.set(k, v);
  for (const [k, v] of Object.entries(state.a)) if (v !== MA_ASSUMPTIONS[k].value) q.set(k, v);
  if (state.selected) q.set('c', state.selected);
  const qs = q.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ---------- derived rows ----------

const threshold = () => Number(state.f.t);
const keys = () => (state.f.m === 'any' ? MEASURE_KEYS : [state.f.m]);

function enrich(c) {
  const t = threshold();
  return {
    c,
    tier: tierFor(c, t, keys()),
    near: nearMeasures(c, t, keys()),
    members: membersToMove(c, t, state.a, keys()),
    dollars: dollarsAtStake(c, t, state.a, keys()),
  };
}

function filtered({ ignoreTier = false } = {}) {
  const q = state.f.q.trim().toLowerCase();
  const min = Number(state.f.min) || 0;
  return state.data.contracts.map(enrich).filter((r) => {
    if (!r.tier) return false;
    if (!ignoreTier && state.f.tier !== 'all' && String(r.tier) !== state.f.tier) return false;
    if (state.f.stars !== 'all' && r.c.overall !== Number(state.f.stars)) return false;
    if ((r.c.enrollment ?? 0) < min) return false;
    if (state.f.snp === '1' && !r.c.snp) return false;
    if (q && !`${r.c.id} ${r.c.name} ${r.c.marketing} ${r.c.parent}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const SORTS = {
  tier: (r) => r.tier,
  id: (r) => r.c.id,
  org: (r) => r.c.marketing,
  enrollment: (r) => r.c.enrollment ?? -1,
  overall: (r) => r.c.overall,
  members: (r) => r.members ?? -1,
  dollars: (r) => r.dollars ?? -1,
  ...Object.fromEntries(MEASURE_KEYS.map((k) => [k, (r) => r.c.measures[k]?.gapUp ?? 99])),
};

function sorted(rows) {
  const f = SORTS[state.f.sort] ?? SORTS.dollars;
  const dir = Number(state.f.dir) || -1;
  return [...rows].sort((a, b) => {
    const x = f(a);
    const y = f(b);
    const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return cmp * dir || (b.c.enrollment ?? 0) - (a.c.enrollment ?? 0);
  });
}

// ---------- render ----------

function renderStrip() {
  const m = state.data.meta;
  $('strip').innerHTML = `${tag('cms')} <strong>${m.starYear} Star Ratings</strong> (measurement year ${m.measurementYear}, affects ${m.paymentYear} bonus payments) · enrollment October 2026 · ${state.data.contracts.length} MA contracts with an overall rating ${info(`Plans close to a Star cut point on measures Florence can move: medication adherence (diabetes, RAS, statins), blood pressure control, and statin use. Gaps compare each plan’s published ${m.starYear} rate with this year’s MA-PD cut points. Sources: ${esc(m.sources.stars.file)}; ${esc(m.sources.enrollment.file)}; weights from ${esc(m.sources.weights.file)}.`, 'About this data')}`;
}

function renderTiers() {
  const all = filtered({ ignoreTier: true });
  const t = threshold();
  $('tiers').innerHTML = [1, 2, 3].map((n) => {
    const rows = all.filter((r) => r.tier === n);
    const enrolled = rows.reduce((s, r) => s + (r.c.enrollment ?? 0), 0);
    const dollars = rows.reduce((s, r) => s + (r.dollars ?? 0), 0);
    const active = state.f.tier === String(n);
    return `<button type="button" class="stat tier-card tier-${n} ${active ? 'is-active' : ''}" data-tier="${n}" aria-pressed="${active}">
      <div class="stat-head"><span class="stat-label">Tier ${n}: ${esc(TIERS[n].label)}</span></div>
      <div class="stat-value">${esc(fmt(rows.length, 'number0'))} <span class="tile-of">plans</span></div>
      <div class="stat-sub">${esc(TIERS[n].rule(t))}</div>
      <div class="stat-sub">${esc(fmt(enrolled, 'number0'))} members${n < 3 ? ` · ${esc(fmt(dollars, 'currencyCompact'))} bonus ${n === 1 ? 'to gain' : 'at risk'} ${verifyTag()}` : ''}</div>
    </button>`;
  }).join('');
}

function select(id, label, value, options) {
  return `<label class="ctl"><span>${esc(label)}</span><select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(value) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}

function renderControls() {
  const f = state.f;
  const starsAvail = [...new Set(state.data.contracts.map((c) => c.overall))].sort((a, b) => a - b);
  $('controls').innerHTML = `
    <label class="ctl ctl-wide"><span>Gap threshold: <strong id="t-val">${esc(Number(f.t).toFixed(1))} pts</strong></span>
      <input type="range" id="f-t" min="0.5" max="5" step="0.5" value="${esc(f.t)}"></label>
    ${select('f-tier', 'Tier', f.tier, [['all', 'All tiers'], ['1', 'Tier 1: Bonus cliff'], ['2', 'Tier 2: Defend the bonus'], ['3', 'Tier 3: Measure lift']])}
    ${select('f-stars', 'Overall stars', f.stars, [['all', 'Any'], ...starsAvail.map((s) => [s, `${s} stars`])])}
    ${select('f-m', 'Measure', f.m, [['any', 'Any target measure'], ...MEASURE_KEYS.map((k) => [k, `${SHORT[k]} (${state.data.meta.measures[k].id})`])])}
    <label class="ctl"><span>Minimum enrollment</span><input type="number" id="f-min" min="0" step="1000" value="${esc(f.min)}"></label>
    <label class="ctl ctl-wide"><span>Search</span><input type="search" id="f-q" placeholder="Contract, organization, or parent" value="${esc(f.q)}"></label>
    <label class="ctl ctl-check"><input type="checkbox" id="f-snp" ${f.snp === '1' ? 'checked' : ''}><span>Special Needs Plans only ${info('Contracts that include a Special Needs Plan (SNP column in the CMS summary file). This flag does not separate dual-eligible SNPs (D-SNPs) from chronic or institutional SNPs.', 'About SNP filter')}</span></label>`;
}

function measureCell(m, k, r) {
  if (!m || m.rate === null) return '<td class="mcell"><span class="muted">No rate</span></td>';
  const up = r.near.up.includes(k);
  const down = r.tier === 2 && r.near.down.includes(k);
  const held = m.cushion !== null && m.cushion < 0;
  const cushionText = held ? `${fmt(-m.cushion, 'number1')} pts below cut, kept by disaster rule` : `${fmt(m.cushion, 'number1')} pts cushion`;
  const note = (held && down) || m.stars === 5 ? cushionText : up ? `+${fmt(m.gapUp, 'number1')} to ★${m.stars + 1}` : down ? cushionText : m.gapUp !== null ? `+${fmt(m.gapUp, 'number1')} to ★${m.stars + 1}` : '';
  return `<td class="mcell ${up ? 'is-up' : ''} ${down ? 'is-down' : ''}"><span class="mrate">${esc(m.rate)}%</span> <span class="mstars">★${esc(m.stars)}</span><div class="mnote">${esc(note)}</div></td>`;
}

function sortHead(key, label, extra = '', cls = '') {
  const on = state.f.sort === key;
  const arrow = on ? (Number(state.f.dir) > 0 ? ' ↑' : ' ↓') : '';
  return `<th scope="col" class="${cls}" aria-sort="${on ? (Number(state.f.dir) > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="sort" data-sort="${key}">${esc(label)}${arrow}</button>${extra}</th>`;
}

function renderTable() {
  const rows = sorted(filtered());
  $('count').textContent = `${fmt(rows.length, 'number0')} plans, ${fmt(rows.reduce((s, r) => s + (r.c.enrollment ?? 0), 0), 'number0')} members`;
  const m = state.data.meta.measures;
  $('table').innerHTML = `<thead><tr>
      ${sortHead('tier', 'Tier')}${sortHead('id', 'Contract', '', 'sticky')}${sortHead('org', 'Organization / parent')}
      ${sortHead('enrollment', 'Enrollment', '', 'num')}${sortHead('overall', 'Overall', '', 'num')}
      ${MEASURE_KEYS.map((k) => sortHead(k, SHORT[k], info(`${esc(m[k].id)}: ${esc(m[k].name)}. Weight ${m[k].weight} in the overall rating (Technical Notes).`, `About ${SHORT[k]}`))).join('')}
      ${sortHead('members', 'Members to move', info('Rough. Enrollment × assumed share of members in each measure’s denominator × the gap. Tier 2 counts the cushion. Denominators are not public.', 'About members to move'), 'num')}
      ${sortHead('dollars', 'Bonus at stake', info('Illustrative order of magnitude, not a payment estimate: enrollment × benchmark PMPM × 12 × bonus %. Tier 1 and 2 only. Both inputs are assumptions.', 'About bonus at stake'), 'num')}
    </tr></thead>
    <tbody>${rows.map((r) => `<tr class="ma-row ${state.selected === r.c.id ? 'is-selected' : ''}" data-id="${esc(r.c.id)}" tabindex="0">
      <td><span class="tier-badge tier-${r.tier}">${r.tier}</span></td>
      <th scope="row" class="sticky">${esc(r.c.id)}</th>
      <td class="org"><strong>${esc(r.c.marketing)}</strong>${r.c.snp ? ' <span class="tag tag-assume">SNP</span>' : ''}<div class="row-sub">${esc(r.c.parent)}</div></td>
      <td class="num">${r.c.enrollment === null ? '<span class="muted">Suppressed</span>' : esc(fmt(r.c.enrollment, 'number0'))}</td>
      <td class="num strong">${esc(r.c.overall)}★</td>
      ${MEASURE_KEYS.map((k) => measureCell(r.c.measures[k], k, r)).join('')}
      <td class="num">${r.members === null ? '<span class="muted">n/a</span>' : `~${esc(fmt(r.members, 'number0'))}`}</td>
      <td class="num">${r.dollars === null ? '<span class="muted">Tier 3</span>' : esc(fmt(r.dollars, 'currencyCompact'))}</td>
    </tr>`).join('') || '<tr><td colspan="13" class="muted">No plans match these filters.</td></tr>'}</tbody>`;
}

function calculatorLink(c) {
  const e = c.enrollment ?? 0;
  const ras = c.measures.ras?.rate;
  const dm = c.measures.dm?.rate;
  const q = new URLSearchParams({
    lum: e, shareRate: 100, msr: 0, baselineSavingsRate: 0, lossRate: 0,
    benchmarkTotal: Math.round(e * state.a.benchmarkPMPM * 12), ma: c.id,
  });
  if (ras !== null && ras !== undefined && dm !== null && dm !== undefined) q.set('baselineAdherence', (blendPartD({ ras: ras / 100, dm: dm / 100 }) * 100).toFixed(1));
  return `index.html?${q}`;
}

function renderDetail() {
  const el = $('detail');
  const c = state.data.contracts.find((x) => x.id === state.selected);
  el.hidden = !c;
  if (!c) return;
  const r = enrich(c);
  const lo = 60;
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (100 - lo)) * 100)).toFixed(1)}%`;
  const cuts = state.data.meta.cuts;
  el.innerHTML = `<div class="detail-head">
      <div><h2 class="card-heading">${esc(c.marketing)} <span class="muted">${esc(c.id)}</span></h2>
        <div class="row-sub">${esc(c.name)} · ${esc(c.parent)} · ${esc(c.orgType)}${c.snp ? ' · includes a Special Needs Plan' : ''}</div></div>
      <div class="detail-actions no-print">
        <a class="btn btn-accent" href="${esc(calculatorLink(c))}">Model in calculator</a>
        <button type="button" class="btn btn-quiet" id="close-detail">Close</button>
      </div></div>
    <div class="detail-facts">
      <span><strong>${esc(fmt(c.enrollment, 'number0'))}</strong> members</span>
      <span><strong>${esc(c.overall)}★</strong> overall (Part C ${esc(c.partC ?? 'n/a')}, Part D ${esc(c.partD ?? 'n/a')})</span>
      ${r.tier ? `<span class="tier-badge tier-${r.tier}">${r.tier}</span> <span>${esc(TIERS[r.tier].label)}</span>` : ''}
      ${Object.entries(c.disaster ?? {}).filter(([, v]) => v).map(([y, v]) => `<span>${esc(v)}% of enrollment in ${esc(y)} disaster areas</span>`).join('')}
      ${r.dollars !== null ? `<span><strong>${esc(fmt(r.dollars, 'currencyCompact'))}</strong> bonus ${r.tier === 1 ? 'to gain' : 'at risk'} ${verifyTag()}</span>` : ''}
    </div>
    <div class="mbars">${MEASURE_KEYS.map((k) => {
      const m = c.measures[k];
      const cut = cuts[k];
      return `<div class="mbar">
        <div class="mbar-label"><strong>${esc(SHORT[k])}</strong> <span class="muted">${esc(state.data.meta.measures[k].id)} · weight ${esc(state.data.meta.measures[k].weight)}</span></div>
        <div class="mbar-track" aria-label="${esc(SHORT[k])}: rate ${m?.rate ?? 'none'}">
          ${[2, 3, 4, 5].map((s) => (cut[s] === null || cut[s] === undefined ? '' : `<span class="mbar-tick ${s % 2 ? 'below' : ''}" style="left:${pos(cut[s])}"><b>★${s} ${cut[s]}</b></span>`)).join('')}
          ${m?.rate !== null && m?.rate !== undefined ? `<span class="mbar-fill ${r.near.up.includes(k) ? 'is-up' : ''}" style="width:${pos(m.rate)}"></span><span class="mbar-dot" style="left:${pos(m.rate)}"></span>` : ''}
        </div>
        <div class="mbar-value">${m?.rate === null || m?.rate === undefined ? '<span class="muted">No rate</span>' : `${esc(m.rate)}% ★${esc(m.stars)}${m.cushion !== null && m.cushion < 0 ? ` · <span class="warn">${esc(fmt(-m.cushion, 'number1'))} pts below the ★${m.stars} cut; kept by disaster rule</span>` : ''}${m.gapUp !== null ? ` · +${esc(fmt(m.gapUp, 'number1'))} to ★${m.stars + 1}` : ' · top star'}`}</div>
      </div>`;
    }).join('')}</div>
    <p class="row-sub">Ticks are ${esc(state.data.meta.starYear)} MA-PD cut points (lower bound of each star). Scale ${lo}–100%. Model in calculator opens the estimator with this plan as a single payer that keeps 100% of savings, its enrollment, and its own adherence rate.</p>`;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderAssumptions() {
  $('assumptions').innerHTML = Object.entries(MA_ASSUMPTIONS).map(([k, a]) => {
    const pctKind = a.format === 'percent0';
    const v = pctKind ? +(state.a[k] * 100).toFixed(2) : state.a[k];
    return `<div class="field">
      <div class="field-head"><label for="a-${k}">${esc(a.label)}</label>${info(esc(a.note), `About ${a.label}`)}</div>
      <div class="control">${pctKind ? '' : '<span class="affix">$</span>'}<input id="a-${k}" data-a="${k}" type="number" min="0" step="${pctKind ? 1 : 50}" value="${esc(v)}">${pctKind ? '<span class="affix">%</span>' : ''}</div>
      <div class="field-tags">${tag('assumption')}${verifyTag()}</div></div>`;
  }).join('');
}

function renderMethod() {
  const m = state.data.meta;
  $('method').innerHTML = `<ul class="limits">
    <li><strong>Timing lag (confirmed from the files).</strong> The ${m.starYear} Star Ratings use measurement year ${m.measurementYear} (${esc(m.measurementPeriods.join('; '))}, from the data table headers), and CMS says they ${esc(m.paymentYearSource.replace(/^.*?: /, ''))}. So work done in ${m.measurementYear + 2} shows up in the ${m.starYear + 2} Star Ratings and ${m.paymentYear + 2} payments.</li>
    <li><strong>Cut points move.</strong> Next year’s cut points will differ; CMS applies guardrails and removes outliers when setting them. This page uses the ${m.starYear} MA-PD cut points as a proxy.</li>
    <li><strong>Overall rating is not measure math.</strong> These measures carry weight 3 (adherence, blood pressure control) or 1 (statin measures) among dozens, and the overall rating adds the reward factor and the Categorical Adjustment Index. Closing a gap does not by itself move a plan from 3.5 to 4 stars.</li>
    <li><strong>Disaster rule.</strong> Contracts with much of their enrollment in declared disaster areas keep the better of this year\u2019s and last year\u2019s measure stars. Where a published star sits above what the rate earns, the cushion is negative and labeled; that protection lapses without another declaration.</li>
    <li><strong>Rounding.</strong> CMS publishes rates and cut points as whole percentages but assigns stars on unrounded rates, so each gap is uncertain by about 0.5 point.</li>
    <li><strong>Data limits.</strong> Measure denominators, benchmarks, and contract service areas by state are not in these files. Members to move and bonus at stake use the flagged assumptions above. The SNP flag does not separate D-SNPs.</li>
    <li><strong>Excluded.</strong> ${Object.entries(m.dropped).map(([k, v]) => `${esc(fmt(v, 'number0'))} ${esc(k)}`).join('; ')}.</li>
  </ul>`;
}

function renderAll() {
  renderTiers();
  renderTable();
  renderDetail();
  writeUrl();
}

// ---------- CSV ----------

function exportCsv() {
  const rows = sorted(filtered());
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['tier', 'contract', 'organization', 'parent', 'snp', 'enrollment', 'overall_stars',
    ...MEASURE_KEYS.flatMap((k) => [`${k}_rate`, `${k}_stars`, `${k}_gap_up_pp`, `${k}_cushion_down_pp`]),
    'members_to_move_rough', 'bonus_at_stake_illustrative'];
  const lines = rows.map((r) => [r.tier, r.c.id, r.c.marketing, r.c.parent, r.c.snp ? 'Yes' : 'No', r.c.enrollment, r.c.overall,
    ...MEASURE_KEYS.flatMap((k) => { const m = r.c.measures[k] ?? {}; return [m.rate, m.stars, m.gapUp, m.cushion]; }),
    r.members === null ? '' : Math.round(r.members), r.dollars === null ? '' : Math.round(r.dollars)].map(cell).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ma-opportunities-${state.data.meta.starYear}-t${state.f.t}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- wiring ----------

function bind() {
  const map = { 'f-t': 't', 'f-tier': 'tier', 'f-stars': 'stars', 'f-m': 'm', 'f-min': 'min', 'f-q': 'q' };
  $('controls').addEventListener('input', (e) => {
    const k = map[e.target.id];
    if (k) state.f[k] = e.target.value;
    if (e.target.id === 'f-snp') state.f.snp = e.target.checked ? '1' : '0';
    if (e.target.id === 'f-t') $('t-val').textContent = `${Number(e.target.value).toFixed(1)} pts`;
    renderAll();
  });
  $('controls').addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('tiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    state.f.tier = state.f.tier === b.dataset.tier ? 'all' : b.dataset.tier;
    $('f-tier').value = state.f.tier;
    renderAll();
  });
  $('table').addEventListener('click', (e) => {
    const s = e.target.closest('[data-sort]');
    if (s) {
      state.f.dir = state.f.sort === s.dataset.sort ? String(-Number(state.f.dir)) : s.dataset.sort === 'id' || s.dataset.sort === 'org' || MEASURE_KEYS.includes(s.dataset.sort) ? '1' : '-1';
      state.f.sort = s.dataset.sort;
      renderAll();
      return;
    }
    const row = e.target.closest('[data-id]');
    if (row) {
      state.selected = row.dataset.id;
      renderAll();
    }
  });
  $('table').addEventListener('keydown', (e) => {
    const row = e.target.closest('[data-id]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      state.selected = row.dataset.id;
      renderAll();
    }
  });
  $('detail').addEventListener('click', (e) => {
    if (e.target.id === 'close-detail') {
      state.selected = null;
      renderAll();
    }
  });
  $('assumptions').addEventListener('input', (e) => {
    const k = e.target.dataset.a;
    if (!k) return;
    const v = Number(e.target.value) || 0;
    state.a[k] = MA_ASSUMPTIONS[k].format === 'percent0' ? v / 100 : v;
    renderAll();
  });
  $('export').addEventListener('click', exportCsv);
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
  const res = await fetch('data/ma_opportunities.json').catch(() => null);
  if (!res?.ok) {
    document.querySelector('main').innerHTML = '<p class="notice">Could not load data/ma_opportunities.json. Serve this folder over HTTP, for example <code>python3 -m http.server</code>.</p>';
    return;
  }
  state.data = await res.json();
  readUrl();
  renderStrip();
  renderControls();
  renderAssumptions();
  renderMethod();
  renderAll();
  bind();
}

main();

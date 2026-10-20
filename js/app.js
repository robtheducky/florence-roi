// Generic UI. Renders whichever module is active: its inputs, its outputs, and
// the assumptions it declares. Knows nothing module-specific.

import { MODULES, getModule, DEFAULT_MODULE } from './modules/index.js';
import { ASSUMPTIONS, SCENARIOS, SOURCES, DEFAULT_SCENARIO, isScenarioDependent } from './assumptions.js';
import { fmt } from './format.js';
import { AUTHOR, ROADMAP_URL } from './config.js';

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_FORMAT = { count: 'number0', percent: 'percent0', currency: 'currency0' };

const state = { module: getModule(DEFAULT_MODULE), scenario: DEFAULT_SCENARIO, values: {} };

// ---------- state <-> URL ----------

const defaultsFor = (mod) => Object.fromEntries(mod.inputs.map((i) => [i.id, String(i.default)]));

function readUrl() {
  const q = new URLSearchParams(location.search);
  state.module = getModule(q.get('module') ?? DEFAULT_MODULE);
  state.scenario = SCENARIOS.some((s) => s.id === q.get('scenario')) ? q.get('scenario') : DEFAULT_SCENARIO;
  state.values = defaultsFor(state.module);
  for (const input of state.module.inputs) {
    const raw = q.get(input.id);
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw))) state.values[input.id] = raw;
  }
}

// Only non-default values go into the URL, so shared links stay short.
function writeUrl() {
  const q = new URLSearchParams();
  if (state.module.id !== DEFAULT_MODULE) q.set('module', state.module.id);
  if (state.scenario !== DEFAULT_SCENARIO) q.set('scenario', state.scenario);
  for (const input of state.module.inputs) {
    const v = state.values[input.id];
    if (v !== '' && Number(v) !== Number(input.default)) q.set(input.id, v);
  }
  const qs = q.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ---------- badges and citations ----------

const verifyBadge = () => '<span class="badge badge-verify" title="Keep the value, but validate before relying on it">Needs validation</span>';
const placeholderBadge = () => '<span class="badge badge-placeholder" title="Not vendor pricing">Placeholder</span>';

function citation(sourceId) {
  const s = SOURCES[sourceId];
  const label = esc(s.short);
  return s.url
    ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.full)}">${label}</a>`
    : `<span class="cite cite-plain" title="${esc(s.full)}">${label}</span>`;
}

function refChips(refs) {
  return refs
    .map((ref) => {
      if (ref.startsWith('input:')) {
        const input = state.module.inputs.find((i) => i.id === ref.slice(6));
        return `<span class="cite cite-plain">Client input: ${esc(input.label)}</span>`;
      }
      const a = ASSUMPTIONS[ref];
      return a.sources.map(citation).join(' ') + (a.verify ? ` ${verifyBadge()}` : '') + (a.placeholder ? ` ${placeholderBadge()}` : '');
    })
    .join(' ');
}

// ---------- tabs ----------

function renderTabs() {
  $('tabs').innerHTML = `<div class="tablist" role="tablist">${MODULES.map((m) => {
    if (!m.disabled) {
      const active = m.id === state.module.id;
      return `<button type="button" role="tab" class="tab" aria-selected="${active}">${esc(m.label)}</button>`;
    }
    const tipId = `tip-${m.id}`;
    return `<div class="tab tab-disabled" role="tab" tabindex="0" aria-disabled="true" aria-describedby="${tipId}">
        ${esc(m.label)} <span class="tab-tag">Roadmap</span>
        <div class="tooltip" role="tooltip" id="${tipId}">
          <span>${esc(m.teaser)}</span>
          <a href="${esc(ROADMAP_URL)}#${esc(m.roadmapAnchor)}" target="_blank" rel="noopener">Read the roadmap</a>
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ---------- inputs ----------

function inputField(input) {
  const a = input.assumptionId ? ASSUMPTIONS[input.assumptionId] : null;
  const badges = [(input.placeholder || a?.placeholder) && placeholderBadge(), a?.verify && verifyBadge()].filter(Boolean).join(' ');
  const prefix = input.kind === 'currency' ? '<span class="affix">$</span>' : '';
  const suffix = input.kind === 'percent' ? '%' : input.suffix ?? '';
  const defaultText = input.kind === 'percent' ? `${input.default}%` : fmt(Number(input.default), input.kind === 'currency' && input.step < 1 ? 'currency2' : KIND_FORMAT[input.kind]);
  const max = input.kind === 'percent' ? ' max="100"' : '';
  const step = input.step ?? (input.kind === 'percent' ? 0.5 : 1);
  return `<div class="field">
      <label for="in-${input.id}">${esc(input.label)} ${badges}</label>
      <div class="control">
        ${prefix}
        <input id="in-${input.id}" name="${input.id}" type="number" inputmode="decimal" min="0"${max} step="${step}"
          value="${esc(state.values[input.id])}" aria-describedby="hint-${input.id}">
        ${suffix ? `<span class="affix">${esc(suffix)}</span>` : ''}
      </div>
      <p class="hint" id="hint-${input.id}">${input.help ? `${esc(input.help)} ` : ''}<span class="default">Default: ${esc(defaultText)}</span>${a ? ` ${a.sources.map(citation).join(' ')}` : ''}</p>
    </div>`;
}

function renderInputs() {
  const mod = state.module;
  $('inputs').innerHTML = mod.groups
    .map((g) => {
      const fields = mod.inputs.filter((i) => i.group === g.id).map(inputField).join('');
      return g.collapsible
        ? `<details class="group group-advanced"><summary>${esc(g.label)}</summary><div class="group-body">${fields}</div></details>`
        : `<fieldset class="group"><legend>${esc(g.label)}</legend>${fields}</fieldset>`;
    })
    .join('');
}

function syncInputValues() {
  for (const input of state.module.inputs) $(`in-${input.id}`).value = state.values[input.id];
}

// ---------- scenario control ----------

function renderScenario() {
  $('scenario').innerHTML =
    '<legend class="sr-only">Scenario</legend>' +
    SCENARIOS.map(
      (s) => `<label class="seg"><input type="radio" name="scenario" value="${s.id}"${s.id === state.scenario ? ' checked' : ''}><span>${esc(s.label)}</span></label>`,
    ).join('');
}

// ---------- results ----------

function renderHeadline(out) {
  $('headline').innerHTML = out.headline
    .map((h) => {
      const negative = Number.isFinite(h.value) && h.value < 0;
      return `<div class="stat ${h.primary ? 'stat-primary' : ''} ${negative ? 'is-negative' : ''}">
        <div class="stat-label">${esc(h.label)}</div>
        <div class="stat-value">${esc(fmt(h.value, h.format))}</div>
      </div>`;
    })
    .join('');
}

function renderComparison(all) {
  const values = SCENARIOS.map((s) => all[s.id].comparison.value);
  const max = Math.max(...values.map((v) => Math.abs(v)), 1);
  const label = all[state.scenario].comparison.label;
  $('comparison').innerHTML = `<h3 class="card-title">${esc(label)} by scenario</h3>
    <div class="bars">${SCENARIOS.map((s) => {
      const c = all[s.id].comparison;
      const width = (Math.abs(c.value) / max) * 100;
      const cls = [s.id === state.scenario ? 'is-active' : '', c.value < 0 ? 'is-negative' : ''].join(' ');
      return `<div class="bar-row ${cls}">
        <span class="bar-label">${esc(s.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${width.toFixed(1)}%"></span></span>
        <span class="bar-value">${esc(fmt(c.value, c.format))}${c.sub ? ` <span class="bar-sub">${esc(fmt(c.sub.value, c.sub.format))}</span>` : ''}</span>
      </div>`;
    }).join('')}</div>`;
}

function renderBreakdown(out) {
  $('breakdown').innerHTML = `<tbody>${out.breakdown
    .map((row) =>
      row.section
        ? `<tr class="section"><th colspan="2" scope="colgroup">${esc(row.section)}</th></tr>`
        : `<tr class="${row.indent ? 'indent' : ''} ${row.total ? 'total' : ''}">
            <th scope="row">${esc(row.label)}</th>
            <td class="${Number.isFinite(row.value) && row.value < 0 ? 'neg' : ''}">${esc(fmt(row.value, row.format))}</td>
          </tr>`,
    )
    .join('')}</tbody>`;
  $('caveats').innerHTML = out.caveats.map((c) => `<li>${esc(c)}</li>`).join('');
}

function renderMath(out) {
  $('math').innerHTML = out.math
    .map(
      (block) => `<section class="math-block">
        <h4>${esc(block.title)}</h4>
        ${block.steps
          .map(
            (s) => `<div class="math-step">
              <div class="formula">${esc(s.formula)}</div>
              <div class="live">= ${esc(s.live)}</div>
              ${s.refs.length ? `<div class="refs">${refChips(s.refs)}</div>` : ''}
            </div>`,
          )
          .join('')}
      </section>`,
    )
    .join('');
}

function renderAssumptions() {
  const overrides = Object.fromEntries(
    state.module.inputs
      .filter((i) => i.assumptionId && Number(state.values[i.id]) !== Number(i.default))
      .map((i) => [i.assumptionId, Number(state.values[i.id]) || 0]),
  );
  const activeKey = SCENARIOS.find((s) => s.id === state.scenario).key;
  const head = `<thead><tr><th scope="col">Parameter</th>${SCENARIOS.map(
    (s) => `<th scope="col" class="num ${s.key === activeKey ? 'is-active' : ''}">${esc(s.label)}</th>`,
  ).join('')}<th scope="col">Source and notes</th></tr></thead>`;
  const rows = state.module.assumptionIds
    .map((id) => {
      const a = ASSUMPTIONS[id];
      const badges = [a.verify && verifyBadge(), a.placeholder && placeholderBadge()].filter(Boolean).join(' ');
      const values = isScenarioDependent(a)
        ? SCENARIOS.map((s) => `<td class="num ${s.key === activeKey ? 'is-active' : ''}">${esc(fmt(a[s.key], a.format))}</td>`).join('')
        : `<td class="num fixed" colspan="3">${esc(fmt(a.value, a.format))}${
            id in overrides ? ` <span class="override">edited to ${esc(fmt(overrides[id], a.format))}</span>` : ''
          } <span class="muted">all scenarios</span></td>`;
      // Placeholder prices already appear under "Inputs used" in print.
      return `<tr${a.placeholder ? ' class="print-skip"' : ''}>
        <th scope="row">${esc(a.label)} ${badges}</th>
        ${values}
        <td class="source">${a.sources.map(citation).join(' ')}<div class="note">${esc(a.note)}</div></td>
      </tr>`;
    })
    .join('');
  $('assumptions').innerHTML = head + `<tbody>${rows}</tbody>`;
}

function renderPrintSummary() {
  const scenario = SCENARIOS.find((s) => s.id === state.scenario);
  $('print-scenario').textContent = `Scenario shown: ${scenario.label}`;
  $('print-meta').textContent = `Prepared ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
  $('print-inputs').innerHTML = `<h3 class="card-title">Inputs used</h3><dl>${state.module.inputs
    .map((i) => {
      const v = Number(state.values[i.id]) || 0;
      const shown = i.kind === 'percent' ? `${v}%` : fmt(v, i.kind === 'currency' && i.step < 1 ? 'currency2' : KIND_FORMAT[i.kind]);
      return `<div><dt>${esc(i.label)}</dt><dd>${esc(shown)}${i.placeholder ? ' (placeholder)' : ''}</dd></div>`;
    })
    .join('')}</dl>`;
}

function renderResults() {
  const all = Object.fromEntries(SCENARIOS.map((s) => [s.id, state.module.compute(state.values, s.id)]));
  const out = all[state.scenario];
  renderHeadline(out);
  renderComparison(all);
  renderBreakdown(out);
  renderMath(out);
  renderAssumptions();
  renderPrintSummary();
}

// ---------- wiring ----------

function renderFooter() {
  $('footer').innerHTML = `<p>Independent prototype by ${esc(AUTHOR)}. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.</p>`;
}

function bind() {
  $('inputs').addEventListener('input', (e) => {
    if (!e.target.name) return;
    state.values[e.target.name] = e.target.value;
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
    state.scenario = DEFAULT_SCENARIO;
    state.values = defaultsFor(state.module);
    syncInputValues();
    renderScenario();
    writeUrl();
    renderResults();
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

readUrl();
renderTabs();
renderInputs();
renderScenario();
renderFooter();
renderResults();
bind();

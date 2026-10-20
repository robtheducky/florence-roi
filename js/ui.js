// Small HTML components shared by the ROI and build pages.

import { SOURCES } from './assumptions.js';
import { fmt } from './format.js';

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let tipSeq = 0;
// An (i) button with a hover/focus tooltip. `html` is trusted markup built by the caller.
export function info(html, label = 'Details') {
  const id = `tip-${++tipSeq}`;
  return `<span class="info"><button type="button" class="info-btn" aria-label="${esc(label)}" aria-describedby="${id}">i</button><span class="tip" role="tooltip" id="${id}">${html}</span></span>`;
}

const TAGS = {
  cms: ['tag-cms', 'CMS data'],
  estimate: ['tag-est', 'Estimate'],
  assumption: ['tag-assume', 'Assumption'],
  placeholder: ['tag-placeholder', 'Placeholder price'],
  median: ['tag-assume', 'MSSP median'],
  edited: ['tag-edited', 'Edited'],
  costModel: ['tag-cms', 'Cost model'],
};
export const tag = (kind) => `<span class="tag ${TAGS[kind][0]}">${TAGS[kind][1]}</span>`;
export const verifyTag = () => '<span class="tag tag-verify">Needs validation</span>';

export function citation(sourceId) {
  const s = SOURCES[sourceId];
  return s.url
    ? `<a class="cite" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.short)}</a>`
    : `<span class="cite">${esc(s.short)}</span>`;
}

export function statCard({ label, value, sub = '', tags = [], tip = '', primary = false }) {
  const neg = typeof value === 'number' && value < 0;
  return `<div class="stat ${primary ? 'stat-primary' : ''} ${neg ? 'is-negative' : ''}">
    <div class="stat-head"><span class="stat-label">${esc(label)}</span>${tip ? info(tip, `About ${label}`) : ''}</div>
    <div class="stat-value">${typeof value === 'number' ? esc(fmt(value, 'currency0')) : value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    <div class="stat-tags">${tags.map((t) => (t === 'verify' ? verifyTag() : tag(t))).join('')}</div>
  </div>`;
}

export const range = (d, f = 'currencyCompact') => `${esc(fmt(d.p10, f))} to ${esc(fmt(d.p90, f))} <span class="muted">(10th–90th percentile)</span>`;

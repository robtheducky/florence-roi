// Regenerates docs/ASSUMPTIONS.md from js/assumptions.js.
// Usage: node scripts/build-assumptions-doc.js

import { writeFileSync } from 'node:fs';
import { ASSUMPTIONS, SOURCES, MA_ASSUMPTIONS } from '../js/assumptions.js';
import { fmt } from '../js/format.js';

const cell = (s) => String(s).replace(/\|/g, '\\|');
const sourceLink = (id) => (SOURCES[id].url ? `[${SOURCES[id].short}](${SOURCES[id].url})` : SOURCES[id].short);
const flags = (a) => [a.verify && '**VERIFY**', a.placeholder && '**PLACEHOLDER**'].filter(Boolean).join(' ');

const pct10 = (a) => {
  const z = 1.2816;
  return a.dist === 'lognormal'
    ? [a.median * Math.exp(-z * a.sdLog), a.median * Math.exp(z * a.sdLog)]
    : [Math.max(a.min, a.mean - z * a.sd), Math.min(a.max, a.mean + z * a.sd)];
};

const uncertainRows = Object.entries(ASSUMPTIONS)
  .filter(([, a]) => a.dist)
  .map(([id, a]) => {
    const [lo, hi] = pct10(a);
    const shape = a.dist === 'lognormal' ? `Log-normal, median ${fmt(a.median, a.format)}, log SD ${a.sdLog}` : `Normal, mean ${fmt(a.mean, a.format)}, SD ${fmt(a.sd, a.format)}`;
    return `| ${cell(a.label)} \`${id}\` | ${shape} | ${fmt(lo, a.format)} to ${fmt(hi, a.format)} | ${a.anchor} | ${a.sources.map(sourceLink).join('; ')} | ${cell(a.note)} | ${flags(a)} |`;
  });

const fixedRows = Object.entries(ASSUMPTIONS)
  .filter(([, a]) => !a.dist)
  .map(([id, a]) =>
    `| ${cell(a.label)} \`${id}\` | ${fmt(a.value, a.format)} | ${cell(a.unit)} | ${a.sources.map(sourceLink).join('; ')} | ${cell(a.note)} | ${flags(a)} |`,
  );

const maRows = Object.entries(MA_ASSUMPTIONS).map(([id, a]) => `| ${cell(a.label)} \`${id}\` | ${fmt(a.value, a.format)} | ${cell(a.note)} | **VERIFY** |`);

const sources = Object.values(SOURCES).map((s) => `- **${s.short}.** ${s.full}${s.url ? ` <${s.url}>` : ''}`);

const md = `# Assumptions and sources

Generated from \`js/assumptions.js\` by \`node scripts/build-assumptions-doc.js\`. Do not edit by hand.

**VERIFY** means the value is kept but must be validated before external use. The UI shows a "Needs validation" badge for these.
**PLACEHOLDER** means the value is not vendor pricing.

## Effect assumptions (sampled in the simulation)

The dashboard draws each of these from its distribution 2,000 times (seeded, so a shared link always shows the same result). Normal distributions are truncated to their valid range.

| Parameter | Distribution | 10th to 90th percentile | Anchored to | Source | Note | Flags |
|---|---|---|---|---|---|---|
${uncertainRows.join('\n')}

## Fixed parameters (editable as inputs)

| Parameter | Value | Unit | Source | Note | Flags |
|---|---:|---|---|---|---|
${fixedRows.join('\n')}

## Client inputs without a source

ACO baseline values (assigned beneficiaries, admissions, readmission rate, cost per admission, benchmark, savings rate, MSR, sharing and loss rates) come from the CMS MSSP PY2024 results file per ACO, or MSSP medians when no ACO is selected. Baseline adherence (60%) and pilot sizes are illustrative defaults; replace them with the prospect's own numbers.

## MA Opportunity Finder (\`ma-opportunities.html\`)

Rates, measure stars, cut points, weights, overall ratings, disaster percentages, and enrollment come from CMS files (see \`data/ma_opportunities.json\` meta). These are the only assumptions, all editable on the page:

| Assumption | Default | Note | Flag |
|---|---:|---|---|
${maRows.join('\n')}

## Sources

${sources.join('\n')}
`;

writeFileSync(new URL('../docs/ASSUMPTIONS.md', import.meta.url), md);
console.log('Wrote docs/ASSUMPTIONS.md');

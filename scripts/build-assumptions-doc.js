// Regenerates docs/ASSUMPTIONS.md from js/assumptions.js.
// Usage: node scripts/build-assumptions-doc.js

import { writeFileSync } from 'node:fs';
import { ASSUMPTIONS, SCENARIOS, SOURCES, isScenarioDependent } from '../js/assumptions.js';
import { fmt } from '../js/format.js';

const cell = (s) => String(s).replace(/\|/g, '\\|');
const sourceLink = (id) => (SOURCES[id].url ? `[${SOURCES[id].short}](${SOURCES[id].url})` : SOURCES[id].short);
const flags = (a) => [a.verify && '**VERIFY**', a.placeholder && '**PLACEHOLDER**'].filter(Boolean).join(' ');

const scenarioRows = Object.entries(ASSUMPTIONS)
  .filter(([, a]) => isScenarioDependent(a))
  .map(([id, a]) =>
    `| ${cell(a.label)} \`${id}\` | ${SCENARIOS.map((s) => fmt(a[s.key], a.format)).join(' | ')} | ${a.sources.map(sourceLink).join('; ')} | ${cell(a.note)} | ${flags(a)} |`,
  );

const fixedRows = Object.entries(ASSUMPTIONS)
  .filter(([, a]) => !isScenarioDependent(a))
  .map(([id, a]) =>
    `| ${cell(a.label)} \`${id}\` | ${fmt(a.value, a.format)} | ${cell(a.unit)} | ${a.sources.map(sourceLink).join('; ')} | ${cell(a.note)} | ${flags(a)} |`,
  );

const sources = Object.values(SOURCES).map((s) => `- **${s.short}.** ${s.full}${s.url ? ` <${s.url}>` : ''}`);

const md = `# Assumptions and sources

Generated from \`js/assumptions.js\` by \`node scripts/build-assumptions-doc.js\`. Do not edit by hand.

**VERIFY** means the value is kept but must be validated before external use. The UI shows a "Needs validation" badge for these.
**PLACEHOLDER** means the value is not vendor pricing.

## Scenario-dependent parameters

| Parameter | ${SCENARIOS.map((s) => s.label).join(' | ')} | Source | Note | Flags |
|---|${SCENARIOS.map(() => '---:').join('|')}|---|---|---|
${scenarioRows.join('\n')}

## Fixed parameters (editable in the Advanced drawer or as inputs)

| Parameter | Value | Unit | Source | Note | Flags |
|---|---:|---|---|---|---|
${fixedRows.join('\n')}

## Client inputs without a source

Baseline adherence (60%), baseline 30-day readmission rate (17%), enrollment counts, and discharge volume are illustrative defaults. Replace them with the prospect's own numbers.

## Sources

${sources.join('\n')}
`;

writeFileSync(new URL('../docs/ASSUMPTIONS.md', import.meta.url), md);
console.log('Wrote docs/ASSUMPTIONS.md');

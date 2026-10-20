// Builds data/acos.json and data/participants.json from CMS Shared Savings
// Program public use files. Downloads the CSVs into data-raw/ if missing.
// Usage: node scripts/build-aco-data.js [--refresh]
//
// To move to a newer performance year, update SOURCES below with the new
// data.cms.gov download URLs and release dates, then rerun.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SOURCES = {
  results: {
    name: 'Shared Savings Program Performance Year Financial and Quality Results, PY2024',
    short: 'CMS MSSP PY2024 results PUF',
    released: '2026-07-17 (revised)',
    page: 'https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results',
    url: 'https://data.cms.gov/sites/default/files/2026-07/fb6ba14b-3450-47c2-8ff5-d1f2a5bdb3e3/PY_Financial_and_Quality_Results_2024_revised%202026_07_17.csv',
    file: 'mssp_py2024_results.csv',
  },
  orgs: {
    name: 'Shared Savings Program Accountable Care Organizations, PY2026',
    short: 'CMS MSSP PY2026 ACO list',
    released: '2026-04',
    page: 'https://data.cms.gov/medicare-shared-savings-program/accountable-care-organizations',
    url: 'https://data.cms.gov/sites/default/files/2026-04/358ddf60-c203-41ef-a0c6-a62a79f466ee/PY2026_Medicare_Shared_Savings_Program_Organizations.csv',
    file: 'mssp_py2026_orgs.csv',
  },
  participants: {
    name: 'Shared Savings Program ACO Participants, PY2026',
    short: 'CMS MSSP PY2026 participants',
    released: '2026-01',
    page: 'https://data.cms.gov/medicare-shared-savings-program/accountable-care-organization-participants',
    url: 'https://data.cms.gov/sites/default/files/2026-01/453bc69c-61a4-4030-8d03-e33895fd1cfd/PY2026_Medicare_Shared_Savings_Program_Participants.csv',
    file: 'mssp_py2026_participants.csv',
  },
  acoCounty: {
    name: 'Number of ACO Assigned Beneficiaries by County, PY2024',
    short: 'CMS MSSP PY2024 beneficiaries by county',
    released: '2025-11',
    page: 'https://data.cms.gov/medicare-shared-savings-program/number-of-accountable-care-organization-assigned-beneficiaries-by-county',
    url: 'https://data.cms.gov/sites/default/files/2025-11/c9b8923e-5bb4-4d28-8387-48d9bde5e74c/Number_Of_ACO_Assigned_Beneficiaries_by_County_PUF_2024_01_01.csv',
    file: 'aco_bene_county_py2024.csv',
  },
  stars: {
    name: '2027 Part C and D Star Ratings Data Tables (measurement year 2025)',
    short: 'CMS 2027 Star Ratings, Part D adherence',
    released: '2026-10-08',
    page: 'https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data',
    url: 'https://www.cms.gov/files/zip/2027-star-ratings-data-tables-oct-8-2026.zip',
    file: 'stars2027.zip',
    zip: true,
    member: /Measure Data.*\.csv$/,
  },
  pdpEnroll: {
    name: 'Monthly PDP Enrollment by State/County/Contract, October 2026',
    short: 'CMS PDP enrollment by county, Oct 2026',
    released: '2026-10',
    page: 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/monthly-pdp-enrollment-state/county/contract',
    url: 'https://www.cms.gov/files/zip/pdp-enrollment-state-county-contract-october-2026-abridged-version-exclude-rows-10-or-less-enrollees.zip',
    file: 'pdp_enroll_2026_10.zip',
    zip: true,
    member: /SCC_Enrollment_PDP.*\.csv$/,
  },
};

const RAW = new URL('../data-raw/', import.meta.url);
const OUT = new URL('../data/', import.meta.url);

// RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM. Returns arrays.
function parseCsvRows(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Rows as objects keyed by the first row.
function parseCsv(text) {
  const rows = parseCsvRows(text);
  const header = rows.shift().map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// CMS suppresses small cells with '*' and marks n/a with '-'.
const num = (s) => {
  if (s === undefined) return null;
  const n = Number(String(s).replace(/[$,%]/g, ''));
  return s === '' || !Number.isFinite(n) ? null : n;
};

// Quality measures appear under one of several collection-type columns.
function quality(row, id) {
  for (const suffix of ['WI', 'eCQM', 'MedicareCQM', 'MIPSCQM']) {
    const v = num(row[`${id}_${suffix}`]);
    if (v !== null) return { value: v, collection: suffix };
  }
  return null;
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function ensure(src, refresh) {
  const path = new URL(src.file, RAW);
  if (refresh || !existsSync(path)) {
    console.log(`Downloading ${src.short}...`);
    const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`${src.url}: HTTP ${res.status}`);
    mkdirSync(RAW, { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  if (!src.zip) return readFileSync(path, 'utf8');
  // CMS zips hold several files; extract and read the one we need (latin1).
  const dir = fileURLToPath(new URL(`${src.file}.d/`, RAW));
  execFileSync('unzip', ['-o', '-q', fileURLToPath(path), '-d', dir]);
  const find = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? find(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const member = find(dir).find((f) => src.member.test(f));
  if (!member) throw new Error(`${src.file}: no file matching ${src.member}`);
  return readFileSync(member, 'latin1');
}

const refresh = process.argv.includes('--refresh');
const [resultsCsv, orgsCsv, partsCsv, countyCsv, starsCsv, pdpCsv] = await Promise.all(
  [SOURCES.results, SOURCES.orgs, SOURCES.participants, SOURCES.acoCounty, SOURCES.stars, SOURCES.pdpEnroll].map((s) => ensure(s, refresh)),
);

// ---------- Part D adherence near each ACO ----------
// Star Ratings adherence (share of members with PDC >= 80%) for each
// standalone drug plan (PDP), weighted by that plan's enrollment in each
// county, then by the ACO's assigned beneficiaries in each county.

const MEASURES = { dm: 'D08', ras: 'D09', statin: 'D10' };
const starsRows = parseCsvRows(starsCsv);
const starsHeader = starsRows[2];
const measureCol = Object.fromEntries(Object.entries(MEASURES).map(([k, code]) => [k, starsHeader.findIndex((h) => h.startsWith(`${code}:`))]));
const pdpRates = new Map();
for (const r of starsRows.slice(4)) {
  if (!r[1]?.trim().endsWith('PDP')) continue;
  const rates = Object.fromEntries(Object.entries(measureCol).map(([k, i]) => {
    const m = /^\s*([\d.]+)\s*%\s*$/.exec(r[i] ?? '');
    return [k, m ? Number(m[1]) / 100 : null];
  }));
  pdpRates.set(r[0].trim(), rates);
}

// county (SSA code) -> { measure: [weighted sum, weight] }, plus state and national rollups
const pdpRows = parseCsv(pdpCsv);
const acc = () => Object.fromEntries(Object.keys(MEASURES).map((k) => [k, [0, 0]]));
const byCounty = new Map();
const byState = new Map();
const national = acc();
for (const r of pdpRows) {
  const rates = pdpRates.get(r['Contract ID']);
  const n = Number(r.Enrolled);
  if (!rates || !Number.isFinite(n) || n <= 0) continue;
  const ssa = r['SSA Code'];
  if (!byCounty.has(ssa)) byCounty.set(ssa, acc());
  if (!byState.has(r.State)) byState.set(r.State, acc());
  for (const k of Object.keys(MEASURES)) {
    if (rates[k] === null) continue;
    for (const t of [byCounty.get(ssa), byState.get(r.State), national]) {
      t[k][0] += rates[k] * n;
      t[k][1] += n;
    }
  }
}
const rate = (t) => Object.fromEntries(Object.keys(MEASURES).map((k) => [k, t[k][1] ? t[k][0] / t[k][1] : null]));
const countyRate = new Map([...byCounty].map(([k, t]) => [k, rate(t)]));
const stateRate = new Map([...byState].map(([k, t]) => [k, rate(t)]));
const nationalRate = rate(national);

// ACO beneficiaries by county (PY2024). '*' marks 1-10 beneficiaries; count it as 5.
const acoCounties = new Map();
for (const r of parseCsv(countyCsv)) {
  const n = r.Tot_AB === '*' ? 5 : Number(r.Tot_AB);
  if (!Number.isFinite(n) || n <= 0) continue;
  const ssa = `${String(r.State_ID).padStart(2, '0')}${String(r.County_ID).padStart(3, '0')}`;
  (acoCounties.get(r.ACO_ID) ?? acoCounties.set(r.ACO_ID, []).get(r.ACO_ID)).push([ssa, n]);
}

function partD(id, serviceArea) {
  const out = acc();
  let matched = 0;
  let total = 0;
  for (const [ssa, n] of acoCounties.get(id) ?? []) {
    total += n;
    const cr = countyRate.get(ssa);
    if (!cr) continue;
    matched += n;
    for (const k of Object.keys(MEASURES)) if (cr[k] !== null) { out[k][0] += cr[k] * n; out[k][1] += n; }
  }
  if (matched > 0) return { ...round(rate(out)), basis: 'counties', coverage: +(matched / total).toFixed(3) };
  // No county data (ACO joined after PY2024): average its service-area states.
  const states = (serviceArea ?? '').split(',').map((x) => x.trim()).filter((x) => stateRate.has(x));
  if (!states.length) return null;
  for (const st of states) for (const k of Object.keys(MEASURES)) { const v = stateRate.get(st)[k]; if (v !== null) { out[k][0] += v; out[k][1] += 1; } }
  return { ...round(rate(out)), basis: 'states', coverage: null };
}
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? null : +v.toFixed(4)]));

const results = parseCsv(resultsCsv);
const orgs = new Map(parseCsv(orgsCsv).map((o) => [o.aco_id, o]));
const participantRows = parseCsv(partsCsv);

const participants = {};
for (const p of participantRows) {
  const id = (p.ACO_ID ?? p['ACO_ID ']).trim();
  (participants[id] ??= []).push(p.Par_LBN);
}
for (const id of Object.keys(participants)) participants[id].sort((a, b) => a.localeCompare(b));

function track2026(o) {
  if (!o) return null;
  if (o.enhanced_track === '1') return 'ENHANCED';
  if (o.basic_track === '1') return `BASIC Level ${o.basic_track_level}`;
  return null;
}

const TRACK_LABEL = { A: 'BASIC Level A', B: 'BASIC Level B', C: 'BASIC Level C', D: 'BASIC Level D', E: 'BASIC Level E', EN: 'ENHANCED' };

const acos = results.map((r) => {
  const id = r.ACO_ID;
  const o = orgs.get(id);
  const admST = num(r.ADM_S_Trm);
  const inpST = num(r.CapAnn_INP_S_trm);
  const readmit = num(r.Measure_479);
  return {
    id,
    name: r.ACO_Name,
    state: o?.aco_service_area ?? null,
    hasResults: true,
    active2026: Boolean(o),
    track2026: track2026(o),
    trackPY: TRACK_LABEL[r.Current_Track] ?? r.Current_Track,
    riskModel: r.Risk_Model,
    assignment: r.Assign_Type,
    lum: num(r.N_AB),
    personYears: num(r.N_AB_Year_PY),
    benchmarkTotal: num(r.ABtotBnchmk),
    expenditureTotal: num(r.ABtotExp),
    benchmarkPC: num(r.UpdatedBnchmk),
    expenditurePC: num(r.Per_Capita_Exp_TOTAL_PY),
    savingsTotal: num(r.GenSaveLoss),
    savingsRate: num(r.Sav_rate),
    msr: num(r.MinSavPerc),
    earned: num(r.EarnSaveLoss),
    shareRate: num(r.FinalShareRate),
    lossRate: num(r.FinalLossRate),
    qualityScore: num(r.QualScore),
    metQPS: r.Met_QPS === '1',
    admitsPer1000: num(r.ADM),
    stAdmitsPer1000: admST,
    stInpatientPC: inpST,
    costPerAdmit: admST ? Math.round(inpST / (admST / 1000)) : null,
    edPer1000: num(r.P_EDV_Vis),
    readmitRate: readmit,
    mccAdmitRate: num(r.Measure_484),
    controllingBP: quality(r, 'QualityID_236'),
    hba1cPoor: quality(r, 'QualityID_001'),
    percDual: num(r.Perc_Dual),
    dualPersonYears: num(r.N_AB_Year_Dual_PY),
    dualShare: num(r.N_AB_Year_PY) ? +(num(r.N_AB_Year_Dual_PY) / num(r.N_AB_Year_PY)).toFixed(4) : null,
    spendDual: num(r.Per_Capita_Exp_ALL_AGDU_PY),
    spendNonDual: num(r.Per_Capita_Exp_ALL_AGND_PY),
    nPCP: num(r.N_PCP),
    nSpec: num(r.N_Spec),
    nNPPA: (num(r.N_NP) ?? 0) + (num(r.N_PA) ?? 0),
    nHosp: num(r.N_Hosp),
    nParticipants: participants[id]?.length ?? null,
    partD: partD(id, o?.aco_service_area),
  };
});

// ACOs in the 2026 program that have no PY2024 results yet.
const withResults = new Set(acos.map((a) => a.id));
for (const [id, o] of orgs) {
  if (withResults.has(id)) continue;
  acos.push({
    id,
    name: o.aco_name,
    state: o.aco_service_area,
    hasResults: false,
    active2026: true,
    track2026: track2026(o),
    nParticipants: participants[id]?.length ?? null,
    partD: partD(id, o.aco_service_area),
  });
}
acos.sort((a, b) => a.name.localeCompare(b.name));

const withData = acos.filter((a) => a.hasResults);
const medians = Object.fromEntries(
  ['lum', 'benchmarkPC', 'expenditurePC', 'savingsRate', 'msr', 'shareRate', 'lossRate', 'qualityScore', 'stAdmitsPer1000', 'costPerAdmit', 'edPer1000', 'readmitRate', 'percDual', 'dualShare', 'spendDual', 'spendNonDual'].map(
    (k) => [k, median(withData.map((a) => a[k]))],
  ),
);
medians.partD = { ...round(nationalRate), basis: 'national' };

// Within-plan adherence gap for low-income subsidy / dual-eligible (LIS/DE)
// members vs. others, median across standalone drug plans. CMS publishes it
// only in a PDF: 2027 Categorical Adjustment Index Measure Supplement, Table 3.
const LIS_GAP = {
  dm: -0.01109,
  ras: -0.02976,
  statin: -0.00657,
  source: '2027 Categorical Adjustment Index Measure Supplement, Table 3 (PDP medians)',
  url: 'https://www.cms.gov/files/document/2027-categorical-adjustment-index-measure-supplement.pdf',
};

medians.lisGap = { dm: LIS_GAP.dm, ras: LIS_GAP.ras, statin: LIS_GAP.statin };

const meta = {
  built: new Date().toISOString().slice(0, 10),
  lisGap: LIS_GAP,
  sources: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { name: s.name, short: s.short, released: s.released, page: s.page, url: s.url }])),
  counts: { withResults: withData.length, active2026: acos.filter((a) => a.active2026).length, newSincePY: acos.length - withData.length },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('acos.json', OUT), JSON.stringify({ meta, medians, acos }));
writeFileSync(new URL('participants.json', OUT), JSON.stringify(participants));
console.log(`Wrote data/acos.json (${acos.length} ACOs, ${withData.length} with PY2024 results) and data/participants.json`);
console.log('MSSP medians:', medians);

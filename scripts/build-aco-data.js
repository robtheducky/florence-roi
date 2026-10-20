// Builds data/acos.json and data/participants.json from CMS Shared Savings
// Program public use files. Downloads the CSVs into data-raw/ if missing.
// Usage: node scripts/build-aco-data.js [--refresh]
//
// To move to a newer performance year, update SOURCES below with the new
// data.cms.gov download URLs and release dates, then rerun.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

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
};

const RAW = new URL('../data-raw/', import.meta.url);
const OUT = new URL('../data/', import.meta.url);

// RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM.
function parseCsv(text) {
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
  if (!refresh && existsSync(path)) return readFileSync(path, 'utf8');
  console.log(`Downloading ${src.short}...`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url}: HTTP ${res.status}`);
  const text = await res.text();
  mkdirSync(RAW, { recursive: true });
  writeFileSync(path, text);
  return text;
}

const refresh = process.argv.includes('--refresh');
const [resultsCsv, orgsCsv, partsCsv] = await Promise.all(
  [SOURCES.results, SOURCES.orgs, SOURCES.participants].map((s) => ensure(s, refresh)),
);

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
    nPCP: num(r.N_PCP),
    nSpec: num(r.N_Spec),
    nNPPA: (num(r.N_NP) ?? 0) + (num(r.N_PA) ?? 0),
    nHosp: num(r.N_Hosp),
    nParticipants: participants[id]?.length ?? null,
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
  });
}
acos.sort((a, b) => a.name.localeCompare(b.name));

const withData = acos.filter((a) => a.hasResults);
const medians = Object.fromEntries(
  ['lum', 'benchmarkPC', 'expenditurePC', 'savingsRate', 'msr', 'shareRate', 'lossRate', 'qualityScore', 'stAdmitsPer1000', 'costPerAdmit', 'edPer1000', 'readmitRate', 'percDual'].map(
    (k) => [k, median(withData.map((a) => a[k]))],
  ),
);

const meta = {
  built: new Date().toISOString().slice(0, 10),
  sources: Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, { name: s.name, short: s.short, released: s.released, page: s.page, url: s.url }])),
  counts: { withResults: withData.length, active2026: acos.filter((a) => a.active2026).length, newSincePY: acos.length - withData.length },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('acos.json', OUT), JSON.stringify({ meta, medians, acos }));
writeFileSync(new URL('participants.json', OUT), JSON.stringify(participants));
console.log(`Wrote data/acos.json (${acos.length} ACOs, ${withData.length} with PY2024 results) and data/participants.json`);
console.log('MSSP medians:', medians);

// "What if you build it yourself?" model. Pure functions, no DOM.
//
// Given the selected ACOs, the interventions to run, and which build steps are
// done, it returns message volume, AWS and labor cost, a week-by-week schedule
// to the first patient message, what each skipped step does to each
// intervention, and the shared savings at stake (via the ROI model).

import { STEPS, INTERVENTIONS, RATES, LABOR, PREV_COPD } from '../build/data.js';
import { compute, settlementUnits } from './aco.js';
import { nonNeg } from './core.js';

const WEEKS_PER_MONTH = 52 / 12;
const isEngineeringBuild = (s) => s.weeks === 0 && (s.buildHours ?? s.engHours) > 0;

// What each intervention still gets, given the skipped steps.
// Returns { [id]: { status: 'full' | 'weakened' | 'blocked' | 'off', reach, blockedBy[], weakenedBy[] } }
export function interventionStatus(skipped, running) {
  const out = {};
  for (const iv of INTERVENTIONS) {
    if (!running.has(iv.id)) {
      out[iv.id] = { status: 'off', reach: 0, blockedBy: [], weakenedBy: [] };
      continue;
    }
    let reach = 1;
    const blockedBy = [];
    const weakenedBy = [];
    for (const s of STEPS) {
      if (!skipped.has(s.id)) continue;
      const { blocks, weakens } = s.skip;
      if (blocks === 'all' || blocks?.includes(iv.id)) blockedBy.push(s.id);
      else if (weakens && (weakens.applies === 'all' || weakens.applies.includes(iv.id))) {
        reach *= weakens.factor;
        weakenedBy.push(s.id);
      }
    }
    if (blockedBy.length) out[iv.id] = { status: 'blocked', reach: 0, blockedBy, weakenedBy };
    else out[iv.id] = { status: weakenedBy.length ? 'weakened' : 'full', reach, blockedBy, weakenedBy };
  }
  return out;
}

// Steps that matter for the interventions being run.
export function relevantSteps(running) {
  return STEPS.filter((s) => {
    if (s.id === 'nurses' || s.id === 'inbox') return [...running].some((id) => INTERVENTIONS.find((i) => i.id === id).escalation > 0);
    return true;
  });
}

/**
 * Week-by-week schedule. Engineering build steps share one team and run one at
 * a time; vendor, clinical, and compliance steps run on their own calendars.
 * Skipped steps take no time and are treated as done.
 */
export function schedule(skipped, running, engFte) {
  const fte = Math.max(0.1, nonNeg(engFte));
  const steps = relevantSteps(running).filter((s) => !skipped.has(s.id));
  const done = new Map();
  let engFreeAt = 0;
  let engLast = null;
  for (const s of steps) {
    let start = 0;
    let drivenBy = null;
    for (const dep of s.after) {
      const d = done.get(dep);
      if (d && d.end > start) {
        start = d.end;
        drivenBy = dep;
      }
    }
    let weeks = s.weeks;
    if (isEngineeringBuild(s)) {
      weeks = (s.buildHours ?? s.engHours) / (fte * LABOR.engHoursPerWeek);
      if (engFreeAt > start) {
        start = engFreeAt;
        drivenBy = engLast;
      }
    }
    let end = start + weeks;
    if (s.notBefore && end < s.notBefore) end = s.notBefore;
    done.set(s.id, { id: s.id, start, end, drivenBy, engineering: isEngineeringBuild(s) });
    if (isEngineeringBuild(s) && weeks > 0) {
      engFreeAt = end;
      engLast = s.id;
    }
  }
  const rows = [...done.values()];
  const last = rows.reduce((m, r) => (r.end > (m?.end ?? -1) ? r : m), null);
  const critical = new Set();
  for (let r = last; r; r = r.drivenBy ? done.get(r.drivenBy) : null) critical.add(r.id);
  return { rows, launchWeek: last ? last.end : 0, critical };
}

// Monthly message volume at scale for the selected ACOs.
export function volume(values, units, running) {
  const pct = (id) => nonNeg(values[id]) / 100;
  const lum = units.reduce((t, u) => t + u.lum, 0);
  const admitsPerYear = units.reduce((t, u) => t + (u.lum * u.admitsPer1000) / 1000, 0);
  const prev = { htn: pct('prevHTN'), dm: pct('prevDM'), hf: pct('prevHF'), copd: pct('prevCOPD') };
  const rows = INTERVENTIONS.filter((iv) => running.has(iv.id)).map((iv) => {
    const enrolled = iv.perDischarge
      ? (admitsPerYear * pct('tocScale')) / 12
      : iv.conditions.reduce((t, c) => t + lum * prev[c], 0) * pct('scaleEnroll');
    const outbound = enrolled * iv.outbound;
    const inbound = enrolled * iv.inbound;
    return { id: iv.id, enrolled, outbound, inbound, escalations: inbound * iv.escalation };
  });
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  return { lum, admitsPerYear, rows, outbound: sum('outbound'), inbound: sum('inbound'), escalations: sum('escalations') };
}

// Year-1 and steady-state cost of the steps that are done.
export function cost(values, skipped, running, vol, launchWeek) {
  const engRate = nonNeg(values.engRate);
  const rnRate = nonNeg(values.rnRate);
  const active = relevantSteps(running).filter((s) => !skipped.has(s.id));
  const sum = (f) => active.reduce((t, s) => t + f(s), 0);

  const segOut = vol.outbound * RATES.segmentsPerMessage;
  const segIn = vol.inbound * RATES.segmentsPerMessage;
  const messagingMonthly = active.some((s) => s.id === 'aws')
    ? segOut * RATES.outboundPerSegment + segIn * RATES.inboundPerSegment + (segOut + segIn) * sum((s) => s.perSegment)
    : 0;
  const platformMonthly = sum((s) => s.monthly);
  const nurseHoursMonthly = active.some((s) => s.id === 'nurses') ? (vol.escalations * LABOR.minutesPerEscalation) / 60 : 0;
  const nurseMonthly = nurseHoursMonthly * rnRate;

  const oneTime = sum((s) => s.oneTime) + sum((s) => (s.clinicalHours ?? 0) * LABOR.clinicalRate);
  const engHoursY1 = sum((s) => s.engHours);
  const engHoursRun = sum((s) => s.runHours ?? 0);
  const monthsLive = Math.max(0, 12 - launchWeek / WEEKS_PER_MONTH);
  const runMonthly = messagingMonthly + platformMonthly + nurseMonthly;

  const year1 = {
    oneTime,
    engineering: engHoursY1 * engRate,
    messaging: messagingMonthly * monthsLive,
    platform: platformMonthly * monthsLive,
    nurses: nurseMonthly * monthsLive,
  };
  year1.total = Object.values(year1).reduce((t, v) => t + v, 0);
  const steady = {
    engineering: engHoursRun * engRate,
    messaging: messagingMonthly * 12,
    platform: platformMonthly * 12,
    nurses: nurseMonthly * 12,
  };
  steady.total = Object.values(steady).reduce((t, v) => t + v, 0);

  return {
    segOut, segIn, messagingMonthly, platformMonthly, nurseMonthly, runMonthly, monthsLive,
    engHoursY1, engFteY1: engHoursY1 / LABOR.hoursPerFte, nurseFte: (nurseHoursMonthly * 12) / LABOR.hoursPerFte,
    year1, steady,
  };
}

/**
 * Everything the build page shows.
 * @param values  input values (ROI inputs plus engFte, engRate, rnRate, prevCOPD, vendorWeeks)
 * @param acos    selected ACO rows from data/acos.json
 * @param skipped Set of skipped step ids
 * @param running Set of intervention ids to run
 */
export function buildCase(values, acos, skipped, running, { medians = {} } = {}) {
  const units = settlementUnits(values, acos, medians);
  const status = interventionStatus(skipped, running);
  const sched = schedule(skipped, running, values.engFte);
  // Blocked interventions send nothing, so they add no volume or nurse load.
  const live = new Set(Object.keys(status).filter((id) => status[id].status === 'full' || status[id].status === 'weakened'));
  const vol = volume(values, units, live);
  const anyRunning = live.size > 0;
  const launchWeek = anyRunning ? sched.launchWeek : null;
  const c = cost(values, skipped, running, vol, launchWeek ?? 52);

  // Shared savings via the ROI model: adherence savings come from medication
  // reminders, readmission savings from post-discharge follow-up. Other
  // interventions carry cost but no modeled savings.
  const share = (reachMeds, reachToc) => compute({
    ...values,
    scaleEnroll: reachMeds > 0 ? values.scaleEnroll : 0,
    engagementCenter: nonNeg(values.engagementCenter) * reachMeds,
    tocScale: reachToc > 0 ? nonNeg(values.tocScale) * reachToc : 0,
  }, acos, { medians, draws: 1 }).result.scale.acoShare;
  const full = share(running.has('meds') ? 1 : 0, running.has('toc') ? 1 : 0);
  const built = share(status.meds.reach, status.toc.reach);

  const vendorWeeks = nonNeg(values.vendorWeeks);
  const shareLive = (weeks) => (weeks === null ? 0 : Math.max(0, 12 - weeks / WEEKS_PER_MONTH) / 12);
  const value = {
    fullPerYear: full,
    builtPerYear: built,
    builtYear1: built * shareLive(launchWeek),
    vendorYear1: full * shareLive(vendorWeeks),
  };
  value.lostYear1 = value.vendorYear1 - value.builtYear1;

  return { units, status, schedule: sched, launchWeek, vendorWeeks, volume: vol, cost: c, value };
}

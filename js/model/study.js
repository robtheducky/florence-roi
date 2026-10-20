// How long an ACO must run a program continuously before a study can show
// whether it works. Pure functions, no DOM.
//
// For each outcome: patients needed per group (two-proportion test), how many
// the ACO can enroll per month, months of continuous enrollment to reach that,
// the measurement window each patient needs, and the claims lag before the
// data can be analyzed. Weaker delivery (reach < 1) dilutes the effect, so it
// raises the number needed as well as slowing enrollment.

import { sampleSizePerArm, nonNeg } from './core.js';

// Author assumptions, shown in the UI.
export const STUDY = {
  rampMonths: 6, // months to enroll the full panel of eligible chronic patients
  pdcWindowMonths: 6, // months of fills per patient to measure PDC (Star Ratings use a full year)
  readmitWindowMonths: 1, // 30-day readmission window
  claimsLagMonths: 3, // claims run-out before CCLF / Part D data are complete
};

export const STUDY_NOTES = {
  rampMonths: 'Assumption: an ACO enrolls its full panel of eligible chronic patients over 6 months.',
  pdcWindowMonths: 'Assumption: PDC needs at least 6 months of fills per patient; Star Ratings measure a full calendar year.',
  readmitWindowMonths: 'Each discharge needs 30 days of follow-up.',
  claimsLagMonths: 'Assumption: about 3 months of claims run-out before CCLF and Part D data are complete.',
};

/**
 * @param c       a compute() result (central case): uses pilotAnnual and scale
 * @param reach   { meds, toc }: share of patients the program actually reaches (0-1)
 * @param study   overrides for STUDY
 */
export function studyPlan(c, reach = { meds: 1, toc: 1 }, study = {}) {
  const s = { ...STUDY, ...study };
  const pa = c.pilotAnnual;
  const rMeds = Math.min(1, nonNeg(reach.meds));
  const rToc = Math.min(1, nonNeg(reach.toc));

  const adhTarget = pa.p0 + rMeds * pa.engagement * pa.adherenceLift;
  const readTarget = pa.baselineReadmitRate * (1 - rToc * pa.completion * pa.relativeReduction);
  const chronicPanel = c.scale.enrolled * rMeds;
  const dischargesPerMonth = (c.scale.discharges / 12) * rToc;

  const row = (id, label, baseline, target, perMonth, windowMonths, measure) => {
    const perGroup = sampleSizePerArm(baseline, target);
    const can = perGroup !== null && perMonth > 0;
    const accrualMonths = can ? perGroup / perMonth : null;
    return {
      id, label, baseline, target, perGroup, perMonth, windowMonths, lagMonths: s.claimsLagMonths, measure,
      accrualMonths,
      totalMonths: can ? accrualMonths + windowMonths + s.claimsLagMonths : null,
      // Patients who must be in active intervention at the same time.
      concurrent: can ? Math.min(perGroup, perMonth * windowMonths) : null,
    };
  };

  return [
    row('adherence', 'Patients adherent (PDC ≥ 80%)', pa.p0, adhTarget, chronicPanel / s.rampMonths, s.pdcWindowMonths, 'Part D claims in CCLF vs. a comparison group'),
    row('readmit', '30-day readmission rate', pa.baselineReadmitRate, readTarget, dischargesPerMonth, s.readmitWindowMonths, 'ACO claims (CCLF) vs. a comparison group'),
  ];
}

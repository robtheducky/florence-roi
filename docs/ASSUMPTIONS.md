# Assumptions and sources

Generated from `js/assumptions.js` by `node scripts/build-assumptions-doc.js`. Do not edit by hand.

**VERIFY** means the value is kept but must be validated before external use. The UI shows a "Needs validation" badge for these.
**PLACEHOLDER** means the value is not vendor pricing.

## Scenario-dependent parameters

| Parameter | Conservative | Base | Vendor-reported | Source | Note | Flags |
|---|---:|---:|---:|---|---|---|
| Engagement (share of enrolled who actively respond) `engagement` | 50% | 70% | 80% | Vendor-reported (public website); Author assumption | Vendor site reports 77–88% response rates. Conservative and Base values are author assumptions. | **VERIFY** |
| Adherence odds ratio from SMS `adherenceOR` | 1.68 | 2.11 | 2.11 | [Thakkar et al., JAMA Intern Med 2016](https://doi.org/10.1001/jamainternmed.2015.7667) | Meta-analysis of 16 RCTs, n=2,742. OR 2.11 (95% CI 1.52–2.93); 1.68 after adjusting for publication bias. |  |
| Realization of literature savings `realization` | 50% | 75% | 100% | Author assumption | Haircut because Roebuck is observational and reported in 2011 dollars. |  |
| Transitions-of-care program completion `tocCompletion` | 50% | 65% | 73% | Vendor-reported (public website); Author assumption | Vendor reports 73% post-discharge completion. Conservative and Base values are author assumptions. | **VERIFY** |
| Relative reduction in 30-day readmissions among completers `readmitReduction` | 10% | 15% | 29% | Vendor-reported (public website); Author assumption | 29% is vendor-reported (single hospital, n not disclosed). 10% and 15% are author placeholders. | **VERIFY** |

## Fixed parameters (editable in the Advanced drawer or as inputs)

| Parameter | Value | Unit | Source | Note | Flags |
|---|---:|---|---|---|---|
| Net annual savings per newly adherent patient, hypertension `savingsHTN` | $3,908 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. About 135k patients, observational. |  |
| Net annual savings per newly adherent patient, diabetes `savingsDM` | $3,756 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Net annual savings per newly adherent patient, heart failure `savingsCHF` | $7,823 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Average cost of a readmission `readmitCost` | $15,200 | USD per readmission | [AHRQ HCUP Statistical Brief #278](https://hcup-us.ahrq.gov/reports/statbriefs/statbriefs.jsp) | All payers, 2018. Confirm the brief number before external use: the $15,200 all-payer figure may come from HCUP Statistical Brief #248. | **VERIFY** |
| Program price, chronic care `pmpm` | $8.00 | USD PMPM | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |
| Program price, transitions of care `episodeFee` | $50 | USD per discharge episode | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |

## Client inputs without a source

Baseline adherence (60%), baseline 30-day readmission rate (17%), enrollment counts, and discharge volume are illustrative defaults. Replace them with the prospect's own numbers.

## Sources

- **Thakkar et al., JAMA Intern Med 2016.** Thakkar J, et al. Mobile telephone text messaging for medication adherence in chronic disease: a meta-analysis. JAMA Intern Med. 2016;176(3):340-349. <https://doi.org/10.1001/jamainternmed.2015.7667>
- **Roebuck et al., Health Affairs 2011.** Roebuck MC, et al. Medication adherence leads to lower health care use and costs despite increased drug spending. Health Aff. 2011;30(1):91-99. <https://doi.org/10.1377/hlthaff.2010.0421>
- **AHRQ HCUP Statistical Brief #278.** AHRQ Healthcare Cost and Utilization Project (HCUP) Statistical Brief #278. 2018 data, all payers. <https://hcup-us.ahrq.gov/reports/statbriefs/statbriefs.jsp>
- **Vendor-reported (public website).** Figures reported on the vendor’s public website. Not peer reviewed. Capture the exact page and date before relying on them.
- **Author assumption.** Assumption chosen by the author of this prototype. Replace with client data or a cited source.

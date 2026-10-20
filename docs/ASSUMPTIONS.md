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
| Net annual savings per newly adherent patient, hypertension `savingsHTN` | $3,908 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. About 135k patients, observational. ACO benchmarks cover Parts A and B only, so the added Part D drug spend does not hit the ACO; using the net figure is conservative for an ACO. |  |
| Net annual savings per newly adherent patient, diabetes `savingsDM` | $3,756 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Net annual savings per newly adherent patient, heart failure `savingsCHF` | $7,823 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Cost per short-term inpatient admission `costPerAdmit` | $12,354 | USD per admission | [CMS MSSP PY2024 results PUF](https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results) | Derived per ACO: short-term inpatient spend per capita ÷ short-term admissions per capita (CapAnn_INP_S_trm ÷ ADM_S_Trm). Default is the MSSP median. A readmission may cost more or less than the average admission. |  |
| Prevalence among assigned beneficiaries, hypertension `prevHTN` | 57% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. Replace with the ACO’s registry count when available. | **VERIFY** |
| Prevalence among assigned beneficiaries, diabetes `prevDM` | 27% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. | **VERIFY** |
| Prevalence among assigned beneficiaries, heart failure `prevHF` | 14% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. | **VERIFY** |
| Share of eligible patients enrolled at scale `scaleEnroll` | 30% | share | Author assumption | An ACO decision, not a fact. Most ACOs would target patients with an adherence gap rather than everyone with the condition. |  |
| Share of short-term admissions enrolled in transitions of care at scale `tocScale` | 50% | share | Author assumption | Depends on ADT feed coverage across the ACO’s hospitals. |  |
| Program price, chronic care `pmpm` | $8.00 | USD PMPM | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |
| Program price, transitions of care `episodeFee` | $50 | USD per discharge episode | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |

## Client inputs without a source

Baseline adherence (60%), baseline 30-day readmission rate (17%), enrollment counts, and discharge volume are illustrative defaults. Replace them with the prospect's own numbers.

## Sources

- **Thakkar et al., JAMA Intern Med 2016.** Thakkar J, et al. Mobile telephone text messaging for medication adherence in chronic disease: a meta-analysis. JAMA Intern Med. 2016;176(3):340-349. <https://doi.org/10.1001/jamainternmed.2015.7667>
- **Roebuck et al., Health Affairs 2011.** Roebuck MC, et al. Medication adherence leads to lower health care use and costs despite increased drug spending. Health Aff. 2011;30(1):91-99. <https://doi.org/10.1377/hlthaff.2010.0421>
- **CMS MSSP PY2024 results PUF.** Shared Savings Program Performance Year Financial and Quality Results, PY2024 (revised 2026-07-17). ACO-level public use file. <https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results>
- **MSSP financial methodology.** Shared Savings Program financial reconciliation rules (MSR, sharing rate, loss rate). Simplified here; verify against the current year’s CMS documentation. <https://www.cms.gov/medicare/payment/fee-for-service-providers/shared-savings-program-ssp-acos/guidance-regulations>
- **CMS Chronic Conditions Data Warehouse.** Approximate national Medicare fee-for-service prevalence from CMS chronic condition reporting. Confirm against the current CCW tables, or replace with the ACO’s own registry counts. <https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts>
- **Two-proportion sample size.** Standard two-sided two-proportion z-test, alpha 0.05, power 0.80, equal arms. Assumes a comparable comparison group.
- **Vendor-reported (public website).** Figures reported on the vendor’s public website. Not peer reviewed. Capture the exact page and date before relying on them.
- **Author assumption.** Assumption chosen by the author of this prototype. Replace with client data or a cited source.

# Assumptions and sources

Generated from `js/assumptions.js` by `node scripts/build-assumptions-doc.js`. Do not edit by hand.

**VERIFY** means the value is kept but must be validated before external use. The UI shows a "Needs validation" badge for these.
**PLACEHOLDER** means the value is not vendor pricing.

## Effect assumptions (sampled in the simulation)

The dashboard draws each of these from its distribution 2,000 times (seeded, so a shared link always shows the same result). Normal distributions are truncated to their valid range.

| Parameter | Distribution | 10th to 90th percentile | Anchored to | Source | Note | Flags |
|---|---|---|---|---|---|---|
| Engagement (share of enrolled who respond) `engagement` | Normal, mean 77%, SD 7% | 68% to 86% | Generated Health | Vendor-reported (public website) | Centered on the low end of the vendor-reported 77–88% response rate. SD 7 points. | **VERIFY** |
| Adherence odds ratio from SMS `adherenceOR` | Log-normal, median 1.68, log SD 0.167 | 1.36 to 2.08 | Literature | [Thakkar et al., JAMA Intern Med 2016](https://doi.org/10.1001/jamainternmed.2015.7667) | Centered on the publication-bias-adjusted OR 1.68. Spread from the 95% CI 1.52–2.93 (log SD 0.167). The unadjusted 2.11 sits near the 91st percentile. |  |
| Share of literature savings realized `realization` | Normal, mean 75%, SD 15% | 56% to 94% | Assumption | Author assumption | Haircut because Roebuck is observational and in 2011 dollars. |  |
| Transitions-of-care completion `tocCompletion` | Normal, mean 73%, SD 7% | 64% to 82% | Generated Health | Vendor-reported (public website) | Centered on the vendor-reported 73% post-discharge completion. SD 7 points. | **VERIFY** |
| Readmission reduction among completers `readmitReduction` | Normal, mean 15%, SD 9% | 4% to 26% | Assumption | Vendor-reported (public website); Author assumption | Vendor-reported 29% is one hospital, n not disclosed, no comparison group, so it is set at the 95th percentile rather than the center. | **VERIFY** |

## Fixed parameters (editable as inputs)

| Parameter | Value | Unit | Source | Note | Flags |
|---|---:|---|---|---|---|
| Net annual savings per newly adherent patient, hypertension `savingsHTN` | $3,908 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. About 135k patients, observational. ACO benchmarks cover Parts A and B only, so the added Part D drug spend does not hit the ACO; using the net figure is conservative for an ACO. |  |
| Net annual savings per newly adherent patient, diabetes `savingsDM` | $3,756 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Net annual savings per newly adherent patient, heart failure `savingsCHF` | $7,823 | USD per patient-year | [Roebuck et al., Health Affairs 2011](https://doi.org/10.1377/hlthaff.2010.0421) | Net of added drug spend. 2011 dollars. |  |
| Cost per short-term inpatient admission `costPerAdmit` | $12,354 | USD per admission | [CMS MSSP PY2024 results PUF](https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results) | Derived per ACO: short-term inpatient spend per capita ÷ short-term admissions per capita (CapAnn_INP_S_trm ÷ ADM_S_Trm). Default is the MSSP median. A readmission may cost more or less than the average admission. |  |
| Next-year adherence of last year’s non-adherent patients, without the program `targetedAdherence` | 50% | share | Author assumption | Used only when texts go to patients below 80% PDC last year. Many recover on their own (regression to the mean), so this is well above zero. Replace with the ACO’s own Part D claims (CCLF). | **VERIFY** |
| Prevalence among assigned beneficiaries, hypertension `prevHTN` | 57% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. Replace with the ACO’s registry count when available. | **VERIFY** |
| Prevalence among assigned beneficiaries, diabetes `prevDM` | 27% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. | **VERIFY** |
| Prevalence among assigned beneficiaries, heart failure `prevHF` | 14% | share | [CMS Chronic Conditions Data Warehouse](https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts) | Approximate national Medicare FFS prevalence. | **VERIFY** |
| Share of eligible patients enrolled at scale `scaleEnroll` | 30% | share | Author assumption | An ACO decision, not a fact. Most ACOs would target patients with an adherence gap rather than everyone with the condition. |  |
| Share of short-term admissions enrolled in transitions of care at scale `tocScale` | 50% | share | Author assumption | Depends on how many of the ACO’s hospitals send discharge notifications. |  |
| Program price, chronic care `pmpm` | $8.00 | USD PMPM | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |
| Program price, transitions of care `episodeFee` | $50 | USD per discharge episode | Author assumption | Placeholder. Not Generated Health pricing. | **PLACEHOLDER** |

## Client inputs without a source

ACO baseline values (assigned beneficiaries, admissions, readmission rate, cost per admission, benchmark, savings rate, MSR, sharing and loss rates) come from the CMS MSSP PY2024 results file per ACO, or MSSP medians when no ACO is selected. Baseline adherence (60%) and pilot sizes are illustrative defaults; replace them with the prospect's own numbers.

## MA Opportunity Finder (`ma-opportunities.html`)

Rates, measure stars, cut points, weights, overall ratings, disaster percentages, and enrollment come from CMS files (see `data/ma_opportunities.json` meta). These are the only assumptions, all editable on the page:

| Assumption | Default | Note | Flag |
|---|---:|---|---|
| MA benchmark, per member per month `benchmarkPMPM` | $1,200 | Order-of-magnitude county benchmark. Real benchmarks vary by county and by the plan’s service area; take them from the CMS ratebook. | **VERIFY** |
| Quality bonus at 4 stars or more `qbpPct` | 5% | Bonus added to the benchmark for contracts rated 4 stars or higher (10% in some counties). Ignores rebate-percentage changes. Verify against the current rate announcement. | **VERIFY** |
| Members in the diabetes medication measure `shareDm` | 25% | Share of enrollment in the D08 denominator. True denominators are not public. | **VERIFY** |
| Members in the hypertension (RAS) medication measure `shareRas` | 40% | Share of enrollment in the D09 denominator. True denominators are not public. | **VERIFY** |
| Members in the statin adherence measure `shareStatin` | 45% | Share of enrollment in the D10 denominator. True denominators are not public. | **VERIFY** |
| Members in Controlling Blood Pressure `shareCbp` | 50% | Share of enrollment with a hypertension diagnosis in the HEDIS denominator. True denominators are not public. | **VERIFY** |
| Members in Statin Therapy for Cardiovascular Disease `shareSpc` | 12% | Share of enrollment in the C18 denominator. True denominators are not public. | **VERIFY** |
| Members in Statin Use in Persons with Diabetes `shareSupd` | 20% | Share of enrollment in the D11 denominator. True denominators are not public. | **VERIFY** |

## Sources

- **Thakkar et al., JAMA Intern Med 2016.** Thakkar J, et al. Mobile telephone text messaging for medication adherence in chronic disease: a meta-analysis. JAMA Intern Med. 2016;176(3):340-349. <https://doi.org/10.1001/jamainternmed.2015.7667>
- **Roebuck et al., Health Affairs 2011.** Roebuck MC, et al. Medication adherence leads to lower health care use and costs despite increased drug spending. Health Aff. 2011;30(1):91-99. <https://doi.org/10.1377/hlthaff.2010.0421>
- **CMS MSSP PY2024 results PUF.** Shared Savings Program Performance Year Financial and Quality Results, PY2024 (revised 2026-07-17). ACO-level public use file. <https://data.cms.gov/medicare-shared-savings-program/performance-year-financial-and-quality-results>
- **MSSP financial methodology.** Shared Savings Program financial reconciliation rules (MSR, sharing rate, loss rate). Simplified here; verify against the current year’s CMS documentation. <https://www.cms.gov/medicare/payment/fee-for-service-providers/shared-savings-program-ssp-acos/guidance-regulations>
- **CMS Chronic Conditions Data Warehouse.** Approximate national Medicare fee-for-service prevalence from CMS chronic condition reporting. Confirm against the current CCW tables, or replace with the ACO’s own registry counts. <https://www2.ccwdata.org/web/guest/medicare-charts/medicare-chronic-condition-charts>
- **CMS 2027 Star Ratings (Part D adherence).** 2027 Part C and D Star Ratings Data Tables, measurement year 2025: D08 diabetes medications, D09 RAS antagonists, D10 statins, for standalone drug plans (PDPs). Weighted by October 2026 PDP enrollment by county and by the ACO’s PY2024 assigned beneficiaries by county. <https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data>
- **Two-proportion sample size.** Standard two-sided two-proportion z-test, alpha 0.05, power 0.80, equal arms. Assumes a comparable comparison group.
- **Vendor-reported (public website).** Figures reported on the vendor’s public website. Not peer reviewed. Capture the exact page and date before relying on them.
- **Author assumption.** Assumption chosen by the author of this prototype. Replace with client data or a cited source.

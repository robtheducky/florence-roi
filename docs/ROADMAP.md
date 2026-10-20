# Roadmap

Phase 1 (Core population) is built. Everything below is planned, not built. Each phase becomes one file in `js/modules/` plus one line in `js/modules/index.js`, reusing the same input, compute, and output contract.

Rule for every phase: anything that depends on CMS rules that change each year is marked **verify against the current year's CMS documentation**. No measure IDs, weights, cut points, or rates are hardcoded from memory.

## 1. Medicare Advantage

**Buyer's question.** If adherence and blood pressure control improve, how close do we get to the next Star Rating cut point, and what is that worth in quality bonus payments and rebates?

**New inputs**
- Current contract rates for the three Part D adherence measures (diabetes medications, RAS antagonists, statins) and Controlling Blood Pressure
- Measure cut points for each star level. **Verify against the current year's CMS documentation.**
- Measure weights. **Verify against the current year's CMS documentation.**
- Current overall and Part C / Part D summary star ratings
- Enrollment by contract
- Benchmark PMPM and the bid, for the rebate calculation

**Calculation**
- Lift each measure rate using the Phase 1 adherence model (Part D measures) and a BP-control lift parameter (Controlling Blood Pressure)
- Distance to the next cut point per measure, and probability of crossing it given rate uncertainty
- Weighted change in summary and overall star rating
- Quality bonus payment and rebate percentage at the resulting star level, times benchmark and enrollment. **Verify QBP thresholds and rebate percentages against the current year's CMS documentation.**
- Account for the measure-level adjustments CMS applies (for example, Reward Factor and the Categorical Adjustment Index). **Verify against the current year's CMS documentation.**

**Public data for presets**
- CMS Part C and D Star Ratings data tables (measure-level rates, cut points)
- CMS Star Ratings Technical Notes
- MA enrollment by contract files
- MA ratebooks and benchmark data

**Open questions**
- How much of Controlling Blood Pressure is moved by SMS alone vs. BP cuff programs?
- Is the Part D adherence lift in MA smaller because baseline rates are already 80% to 90%?
- Which measures are excluded or reweighted this year? **Verify against the current year's CMS documentation.**
- Lag: Star Ratings use measurement data from roughly two years before the payment year.

## 2. ACO (MSSP / ACO REACH)

**Buyer's question.** Of the gross savings, how much does the ACO actually keep?

**New inputs**
- Program and track (MSSP BASIC levels, ENHANCED; ACO REACH Professional or Global)
- Assigned or aligned beneficiaries and benchmark expenditure
- Shared savings rate for the track. **Verify against the current year's CMS documentation.**
- Minimum savings rate (MSR). **Verify against the current year's CMS documentation.**
- Quality performance standard status, including Controlling High Blood Pressure and Diabetes: Hemoglobin A1c Poor Control. **Verify measure set against the current year's CMS documentation.**

**Calculation**
- Apply Phase 1 gross savings to the attributed population
- Compare total savings against benchmark and MSR
- Shared savings = savings above threshold times the sharing rate, scaled by quality score
- Show the incremental dollars the program contributes to clearing the MSR

**Public data for presets**
- MSSP ACO performance-year Public Use File
- ACO REACH participant lists and financial results
- MSSP and REACH financial methodology documents

**Open questions**
- Benchmark rebasing effects in later agreement periods
- How to treat savings that accrue to beneficiaries who leave attribution
- REACH discount and risk corridor treatment. **Verify against the current year's CMS documentation.**

## 3. Commercial / self-insured

**Buyer's question.** What does this save an employer or commercial plan per employee per month?

**New inputs**
- PEPM pricing (instead of PMPM)
- Commercial unit costs. HCUP reports private-payer readmissions costing about 30% more than the index admission.
- Medical trend rate
- Optional productivity impact (absenteeism, presenteeism). Off by default.

**Calculation**
- Phase 1 model with commercial unit costs substituted
- Multi-year view with medical trend applied
- Optional productivity add-on shown separately from medical savings

**Public data for presets**
- HCUP statistical briefs by payer
- Health Care Cost Institute reports (commercial price indexes)
- KFF Employer Health Benefits Survey for premium and trend context

**Open questions**
- Member turnover and its effect on payback period
- Commercial adherence baselines vs. Medicare

## 4. Hospital and provider revenue

**Buyer's question.** How much HRRP penalty exposure does this reduce, and what care-management revenue can we bill?

**New inputs**
- HRRP condition-level excess readmission ratios for heart failure and COPD, and payment adjustment factor
- Medicare base operating DRG payments
- Eligible patients for CCM, RPM, and APCM, and expected enrollment
- Fee schedule rates per code. **Verify against the current year's Physician Fee Schedule.**

**Calculation**
- Change in excess readmission ratio from avoided readmissions, mapped to penalty reduction. **Verify HRRP methodology against the current year's CMS documentation.**
- Billable revenue = eligible patients times enrollment times months times rate, net of staff time

**Public data for presets**
- HRRP supplemental data files (Hospital Compare / Provider Data Catalog)
- Physician Fee Schedule look-up tool and RVU files

**Open questions**
- Does automated SMS satisfy the time and interaction requirements for each code? **Verify against the current year's CMS documentation.**
- Peer-group stratification in HRRP

## 5. Clinical outcomes layer

**Buyer's question.** What clinical events does this prevent?

**New inputs**
- Systolic BP reduction from telemonitoring. TASMINH4 (Lancet 2018, n=1,182) found 4.7 mmHg lower systolic BP with self-monitoring plus telemonitoring vs. usual care.
- Relative risk per 10 mmHg systolic reduction. Ettehad et al. (Lancet 2016) found RR 0.80 for major cardiovascular events.
- Baseline cardiovascular event rate for the population
- Cost per event

**Calculation**
- RR = 0.80 ^ (mmHg reduction / 10)
- Events avoided = population times baseline rate times (1 minus RR)
- Savings = events avoided times cost per event, kept separate from Phase 1 to avoid double counting

**Public data for presets**
- Published trial results above; event costs from HCUP or literature

**Open questions**
- Overlap with Phase 1 adherence savings (Roebuck already captures some of this)
- Time horizon: BP effects on events take years

## 6. PUF-powered "find my organization"

**Buyer's question.** Can you pre-fill this for us?

**What it does.** Pick a real MA contract, ACO, or hospital and auto-fill inputs from public files. Doubles as a prospect-targeting tool (rank organizations by dollars at stake).

**Build notes**
- Preprocess public files into small static JSON (no runtime fetch from CMS)
- Search box with typeahead
- Show the file name and release date for every auto-filled value

**Public data**
- Star Ratings data tables, MA enrollment files, MSSP PUF, REACH participant lists, HRRP supplemental files

**Open questions**
- Refresh cadence and file size limits for GitHub Pages
- Which fields map cleanly to inputs and which need judgment

## 7. Polish

- Tornado sensitivity chart (which assumption moves the answer most)
- PDF export (beyond the browser print stylesheet)
- Inflation adjustment of the 2011-dollar Roebuck figures (CPI medical care index), with the index year shown
- Calibration slot: replace literature values with a client's own claims-based estimates, with the source labeled

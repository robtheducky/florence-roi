# Two-way SMS care for Medicare ACOs: pilot and scale estimator (independent prototype)

A single-screen dashboard for a Medicare Shared Savings Program (MSSP) ACO considering an automated two-way SMS program for medication adherence and transitions of care.

1. **CMS data.** Type to search; pick one ACO, several, or "Select all ACOs containing ..." (for example every Aledade ACO). PY2024 results (assigned beneficiaries, savings rate vs. MSR, shared savings earned, readmission rate, admissions, cost per admission, quality) load from the CMS public use files. Each tile's (i) shows its CMS column.
2. **Pilot.** Expected Medicare spending avoided, pilot cost, net, and which success measures the pilot is large enough to prove statistically.
3. **At scale, per year.** A distribution of ACO net gain from 2,000 simulated outcomes, the chance the ACO comes out ahead, shared savings revenue to the ACO, program cost, and Medicare spending avoided. With several ACOs selected, each settles with CMS on its own benchmark, MSR, and sharing rate, and the results are summed.

Every card is tagged **CMS data**, **Estimate**, **Assumption**, or **Placeholder price**, and its (i) says what is known and what is assumed.

The five effect assumptions (engagement, adherence odds ratio, savings realized, follow-up completion, readmission reduction) are distributions, not fixed scenarios. Engagement and completion are centered on Generated Health's reported figures; the adherence effect on the Thakkar meta-analysis; the vendor's single-site 29% readmission reduction sits at the 95th percentile rather than the center. See `docs/ASSUMPTIONS.md`.

> Independent prototype by Rob Martin. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.

## What if you build it yourself? (`build.html`)

Linked from the estimator header and sized to the same ACO selection. It turns the Flo SMS cost model (AWS End User Messaging rates, 10DLC fees, monitoring, engineering and nurse hours) into four answers: the week the first text reaches a patient, year-1 cost, people needed, and shared savings revenue lost against a vendor.

- **Build steps** (10 from the cost model, leaving out the HIPAA program most aggregators already run; 2 added: clinical protocols, consent/opt-in) can each be switched off. Skipping a step saves its time and cost but **blocks** or **weakens** specific programs.
- **Programs** are based on what Generated Health describes for Florence: medication reminders (including COPD), home blood pressure readings, heart failure daily weight, COPD check-ins, and 30-day post-discharge follow-up. Volume = assigned beneficiaries (CMS) x prevalence x enrollment share x texts per patient.
- **How long until you know it works.** For adherence and readmissions: patients needed per group, enrollment per month at the ACO's real volume, months of continuous enrollment, the measurement window, and claims lag. Weaker delivery dilutes the effect, so it raises the number needed. A single median ACO needs years to show a readmission effect; pooling ACOs (an aggregator) gets there in months. The estimator's pilot table shows the same months-to-an-answer at full scale.
- Calendar weeks, dependencies, skip effects, texts per patient, enrollment ramp, PDC window, and claims lag are author assumptions; the cost model gives costs and hours only.

## What the public data can and cannot do

- Lives under management are published **per ACO only**. CMS does not publish participant TINs or assignment by TIN; the participant file lists legal business names. TIN-level views need the ACO's own CMS assignment reports or claims line feed.
- **Adherence (PDC ≥ 80%) now comes from CMS.** MSSP covers Parts A and B only, so there is no ACO-level PDC. The estimator uses 2027 Star Ratings Part D adherence (measurement year 2025) for standalone drug plans, weighted by October 2026 plan enrollment in each county and by the ACO's PY2024 beneficiaries in each county. It lands near 89% everywhere, so texting everyone with the condition has a small gap; the estimator lets you target only last year's non-adherent patients instead.
- Condition prevalence is not in the MSSP files. The dashboard uses approximate national Medicare FFS prevalence (flagged "Needs validation") unless the ACO enters its own registry counts.
- 122 ACOs in the 2026 program joined after PY2024 and have no results yet. They load with MSSP medians.

## Run locally

No build step and no dependencies.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Run the tests (Node 18+):

```sh
node --test
```

Refresh the CMS data (downloads into `data-raw/`, which is git-ignored, and writes `data/*.json`):

```sh
node scripts/build-aco-data.js            # uses cached CSVs if present
node scripts/build-aco-data.js --refresh  # re-download
```

When CMS publishes PY2025 results, update the URLs in `scripts/build-aco-data.js` and rerun.

After changing any file in `js/`, restamp the script versions so browsers never mix cached and new modules (GitHub Pages caches scripts for 10 minutes; `node --test` fails if you forget):

```sh
node scripts/stamp-versions.js
```

Regenerate `docs/ASSUMPTIONS.md` after editing `js/assumptions.js`:

```sh
node scripts/build-assumptions-doc.js
```

## How it is organized

```
index.html
css/styles.css             includes the print stylesheet
data/acos.json             598 ACOs: PY2024 results joined to the 2026 ACO list, Part D adherence near each ACO, MSSP medians
data/participants.json     2026 participant legal business names by ACO (not shown in the UI yet)
js/assumptions.js          single source of truth for every literature and author assumption
js/model/core.js           pure functions: adherence and readmission model, MSSP settlement, sample size, seeded Monte Carlo
js/model/aco.js            inputs, CMS-grounded defaults, pilot / scale / pass-through, simulation over one or many ACOs
js/format.js               number formatting
js/app.js                  estimator UI and URL state
js/ui.js                   shared tags, tooltips, cards
js/build/data.js           build steps (from the cost model), programs, AWS rates
js/model/build.js          build schedule, volume, cost, skip effects, value at stake
js/model/study.js          patients and months of continuous enrollment needed to measure each outcome
js/build-app.js            build page UI
build.html                 "What if you build it yourself?" page
js/config.js               author name, roadmap link
scripts/build-aco-data.js  CMS CSV to JSON
tests/model.test.js
tests/build.test.js
docs/ROADMAP.md
docs/ASSUMPTIONS.md
```

## Sharing and printing

- The selected ACOs and every edited input are kept in the URL (for example `?aco=A1001,A1002&pmpm=10`). The simulation is seeded, so a shared link shows the same distribution. Use **Copy link** to share.
- **Print** produces a one-page leave-behind (US Letter): CMS data, pilot, and the distribution at scale.

## Deploy to GitHub Pages

```sh
gh repo create florence-roi --public --source . --push
gh api -X POST repos/{owner}/florence-roi/pages -f "source[branch]=main" -f "source[path]=/"
```

Or in the browser: push to a new repo, then **Settings > Pages > Build and deployment > Deploy from a branch > main / (root)**. The site appears at `https://<user>.github.io/florence-roi/` within a minute or two. The `.nojekyll` file makes Pages serve the files as-is.

After the repo exists, set `ROADMAP_URL` in `js/config.js` to `https://github.com/<user>/florence-roi/blob/main/docs/ROADMAP.md` so the roadmap tooltips open the rendered document with working section anchors.

## Disclaimer

Program prices are placeholders, not Generated Health pricing. Values marked "Needs validation" come from vendor-reported figures or author assumptions and must be validated before external use. Literature savings are from an observational study in 2011 dollars. The MSSP pass-through is simplified (no payment or loss caps, MLR assumed equal to MSR, PY2024 terms, no rebasing). Patients with multiple conditions are counted once per condition at scale. Only the five effect assumptions vary in the simulation, so the spread understates total uncertainty.

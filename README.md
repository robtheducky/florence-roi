# Two-way SMS care for Medicare ACOs: pilot and scale estimator (independent prototype)

A single-screen dashboard for a Medicare Shared Savings Program (MSSP) ACO considering an automated two-way SMS program for medication adherence and transitions of care.

1. **What CMS data shows.** Pick any MSSP ACO. Its PY2024 results (lives under management, benchmark, savings rate vs. MSR, sharing rate, readmission rate, admissions, cost per admission, quality) load from the CMS public use files and become the baseline. Every value shows its PUF column.
2. **The bet: pilot.** What a pilot of a given size should deliver, the success metrics with targets, and whether the pilot is large enough to prove each one statistically.
3. **The bet: at scale.** Gross Medicare Parts A and B savings, what the ACO keeps after MSSP sharing, ACO net of program cost, and the break-even point expressed as a share of the bet. That break-even share is the scale-up threshold for the pilot.

Three scenarios (Conservative, Base, Vendor-reported) switch every effect assumption at once. Every parameter links to a cited source or is labeled as an assumption.

> Independent prototype by Rob Martin. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.

## What the public data can and cannot do

- Lives under management are published **per ACO only**. CMS does not publish participant TINs or assignment by TIN; the participant file lists legal business names. TIN-level views need the ACO's own CMS assignment reports or claims line feed.
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

Regenerate `docs/ASSUMPTIONS.md` after editing `js/assumptions.js`:

```sh
node scripts/build-assumptions-doc.js
```

## How it is organized

```
index.html
css/styles.css             includes the print stylesheet
data/acos.json             598 ACOs: PY2024 results joined to the 2026 ACO list, plus MSSP medians
data/participants.json     2026 participant legal business names by ACO
js/assumptions.js          single source of truth for every literature and author assumption
js/model/core.js           pure functions: adherence and readmission model, MSSP settlement, sample size, solver
js/model/aco.js            dashboard inputs, CMS-grounded defaults, pilot / scale / pass-through compute
js/format.js               number formatting
js/app.js                  UI and URL state
js/config.js               author name, roadmap link
scripts/build-aco-data.js  CMS CSV to JSON
tests/model.test.js
docs/ROADMAP.md
docs/ASSUMPTIONS.md
```

## Sharing and printing

- The selected ACO, scenario, and every edited input are kept in the URL (for example `?aco=A1001&scenario=conservative`). Use **Copy link** to share a pre-filled estimate.
- **Print** produces a one-page leave-behind (US Letter): CMS baseline, pilot scorecard, scale results, and caveats.

## Deploy to GitHub Pages

```sh
gh repo create florence-roi --public --source . --push
gh api -X POST repos/{owner}/florence-roi/pages -f "source[branch]=main" -f "source[path]=/"
```

Or in the browser: push to a new repo, then **Settings > Pages > Build and deployment > Deploy from a branch > main / (root)**. The site appears at `https://<user>.github.io/florence-roi/` within a minute or two. The `.nojekyll` file makes Pages serve the files as-is.

After the repo exists, set `ROADMAP_URL` in `js/config.js` to `https://github.com/<user>/florence-roi/blob/main/docs/ROADMAP.md` so the roadmap tooltips open the rendered document with working section anchors.

## Disclaimer

Program prices are placeholders, not Generated Health pricing. Values marked "Needs validation" come from vendor-reported figures or author assumptions and must be validated before external use. Literature savings are from an observational study in 2011 dollars. The MSSP pass-through is simplified (no payment or loss caps, MLR assumed equal to MSR, PY2024 terms, no rebasing). Patients with multiple conditions are counted once per condition at scale.

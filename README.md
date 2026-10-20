# SMS care program ROI estimator (independent prototype)

A standalone estimator for the financial impact of automated, protocol-driven two-way SMS for chronic care (medication adherence) and transitions of care (readmissions). A prospective buyer enters their numbers and gets an estimate under three scenarios: Conservative, Base, and Vendor-reported. Every parameter links to a cited source or is labeled as an assumption.

> Independent prototype by Rob Martin. Not affiliated with or endorsed by Generated Health. Estimates are illustrative.

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

Regenerate `docs/ASSUMPTIONS.md` after editing `js/assumptions.js`:

```sh
node scripts/build-assumptions-doc.js
```

## How it is organized

```
index.html
css/styles.css             includes the print stylesheet
js/assumptions.js          single source of truth for every parameter
js/model/core.js           pure model functions, no DOM
js/format.js               number formatting
js/modules/index.js        module registry (plus roadmap stubs)
js/modules/population.js   Phase 1 module
js/app.js                  generic UI, URL state
js/config.js               author name, roadmap link
tests/model.test.js
docs/ROADMAP.md
docs/ASSUMPTIONS.md
```

Each buyer module exports `{ id, label, assumptionIds, groups, inputs, compute(values, scenarioId) }`. The UI renders any module's inputs and outputs, so adding the Medicare Advantage module means adding one file and changing one registry line.

## Sharing and printing

- All inputs and the scenario are kept in the URL query string. Use **Copy link** to share a pre-filled estimate. Only non-default values are written, so links stay short.
- **Print** produces a one-page leave-behind (US Letter) with the inputs used, results, and sources.

## Deploy to GitHub Pages

```sh
gh repo create florence-roi --public --source . --push
gh api -X POST repos/{owner}/florence-roi/pages -f "source[branch]=main" -f "source[path]=/"
```

Or in the browser: push to a new repo, then **Settings > Pages > Build and deployment > Deploy from a branch > main / (root)**. The site appears at `https://<user>.github.io/florence-roi/` within a minute or two. The `.nojekyll` file makes Pages serve the files as-is.

After the repo exists, set `ROADMAP_URL` in `js/config.js` to `https://github.com/<user>/florence-roi/blob/main/docs/ROADMAP.md` so the roadmap tooltips open the rendered document with working section anchors.

## Disclaimer

Program prices are placeholders, not Generated Health pricing. Values marked "Needs validation" come from vendor-reported figures or author assumptions and must be validated before external use. Literature savings are from an observational study in 2011 dollars. Patients with heart failure may appear in both the chronic and transitions-of-care populations, so estimates may double-count if those populations overlap.

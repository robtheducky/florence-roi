"""Build data/ma_opportunities.json from CMS Star Ratings and enrollment files.

Python standard library only. Reads the files that scripts/fetch_data.py put in
data/raw/. Measures are matched by name (CMS renumbers them every year), and
the matched IDs are logged and written to the output.

Measure weights come from the Technical Notes (Attachment G and each measure's
"Weighting Value"). The PDF is converted to text with `pdftotext -layout`
(poppler) when available; otherwise the committed data/ma_measure_weights.json
from the last successful run is used.

Usage: python3 scripts/build_ma_opportunities.py [--inspect]
"""

import csv
import datetime
import io
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "ma_opportunities.json")
WEIGHTS = os.path.join(ROOT, "data", "ma_measure_weights.json")

STARS_ZIP = "2027-star-ratings-data-tables.zip"
ENROLL_ZIP = "monthly-enrollment-contract-2026-10.zip"
TECH_NOTES = "2027-tech-notes.pdf"
FACT_SHEET = "2027-star-ratings-fact-sheet.pdf"

# key -> name to match (case-insensitive, punctuation-insensitive), part
TARGETS = {
    "dm": ("Medication Adherence for Diabetes Medications", "D"),
    "ras": ("Medication Adherence for Hypertension (RAS antagonists)", "D"),
    "statin": ("Medication Adherence for Cholesterol (Statins)", "D"),
    "cbp": ("Controlling Blood Pressure", "C"),
    "spc": ("Statin Therapy for Patients with Cardiovascular Disease", "C"),
    "supd": ("Statin Use in Persons with Diabetes", "D"),
}
DEFAULT_THRESHOLD = 2.0


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def name_matches(target, label):
    """Every word of the target name appears in the label, in any order.
    CMS's labels drift ("Controlling Blood Pressure" vs. "Controlling High
    Blood Pressure"), so exact matching is too strict."""
    words = set(norm(label).split())
    return all(w in words for w in norm(target).split())


def read_csv(z, pattern):
    name = next((n for n in z.namelist() if re.search(pattern, n)), None)
    if not name:
        sys.exit(f"Missing file matching {pattern!r} in {z.filename}")
    text = z.read(name).decode("cp1252", errors="replace")
    return name, list(csv.reader(io.StringIO(text)))


def pct(cell):
    """'82%' or '82 %' or '82' -> 82.0; placeholders -> None."""
    m = re.fullmatch(r"\s*(-?[\d.]+)\s*%?\s*", cell or "")
    return float(m.group(1)) if m else None


def match_columns(header):
    """Map target key -> (column index, measure id, full label) by name."""
    found = {}
    for i, h in enumerate(header):
        m = re.match(r"\s*([CD]\d\d):\s*(.+)", h)
        if not m:
            continue
        for key, (target, part) in TARGETS.items():
            if m.group(1).startswith(part) and name_matches(target, m.group(2)):
                found[key] = (i, m.group(1), m.group(2).strip())
    return found


def parse_cut_points(rows, org_col):
    """Lower bound of each star level for each target measure.

    Rows look like ['MA-PD ', '3star ', '>= 86 % to < 89 %', ...] for Part D
    (org_col=True) or ['3star ', ...] for Part C.
    """
    header = rows[2]
    cols = match_columns(header)
    cuts = {k: {} for k in cols}
    for r in rows[4:]:
        if org_col and r[0].strip() != "MA-PD":
            continue
        star_cell = r[1] if org_col else r[0]
        sm = re.match(r"\s*(\d)\s*star", star_cell)
        if not sm:
            continue
        star = int(sm.group(1))
        for key, (i, _, _) in cols.items():
            lo = re.search(r">=?\s*(-?[\d.]+)", r[i] if i < len(r) else "")
            cuts[key][star] = float(lo.group(1)) if lo and r[i].strip().startswith(">") else None
    return cols, cuts


def measurement_period(rows, cols):
    """Measurement period string from the row under the measure names."""
    periods = {rows[3][i].replace("\x96", "-").replace("–", "-").strip() for i, _, _ in cols.values() if i < len(rows[3])}
    return sorted(periods)


def tech_note_weights():
    """Parse each target measure's Weighting Value from the Technical Notes."""
    pdf = os.path.join(RAW, TECH_NOTES)
    tool = shutil.which("pdftotext")
    if not (os.path.exists(pdf) and tool):
        if os.path.exists(WEIGHTS):
            print("weights: pdftotext or PDF not available; using committed", os.path.relpath(WEIGHTS, ROOT))
            return json.load(open(WEIGHTS))
        sys.exit("No measure weights: install poppler (pdftotext) or restore data/ma_measure_weights.json")
    text = subprocess.run([tool, "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    blocks = re.split(r"\n\s*Measure: ([CD]\d\d) - ([^\n]+)\n", text)
    weights = {}
    for i in range(1, len(blocks), 3):
        mid, label, body = blocks[i], blocks[i + 1].strip(), blocks[i + 2]
        w = re.search(r"Weighting Value:\s*([\d.]+)", body)
        if not w:
            continue  # table-of-contents entry
        for key, (target, _) in TARGETS.items():
            if name_matches(target, label):
                weights[key] = {"id": mid, "weight": float(w.group(1)), "source": f"{TECH_NOTES}, Measure: {mid}, Weighting Value"}
    json.dump(weights, open(WEIGHTS, "w"), indent=2)
    return weights


def payment_year():
    pdf = os.path.join(RAW, FACT_SHEET)
    tool = shutil.which("pdftotext")
    if not (os.path.exists(pdf) and tool):
        return None, "fact sheet not parsed"
    text = subprocess.run([tool, pdf, "-"], capture_output=True, text=True, check=True).stdout
    m = re.search(r"impact\s+(\d{4})\s+MA\s+quality\s+bonus\s+payments", re.sub(r"\s+", " ", text))
    return (int(m.group(1)), f"{FACT_SHEET}: \"impact {m.group(1)} MA quality bonus payments\"") if m else (None, "not found in fact sheet")


def inspect(z, ez):
    print("Files:", *z.namelist(), *ez.namelist(), sep="\n  ")
    for pattern in ["Measure Data", "Measure Stars", "Summary Ratings", "Part C Cut Points", "Part D Cut Points"]:
        name, rows = read_csv(z, pattern)
        print(f"\n== {name}")
        for r in rows[:9]:
            print([c[:40] for c in r[:10]])


def main():
    z = zipfile.ZipFile(os.path.join(RAW, STARS_ZIP))
    ez = zipfile.ZipFile(os.path.join(RAW, ENROLL_ZIP))
    if "--inspect" in sys.argv:
        inspect(z, ez)
        return

    data_name, data_rows = read_csv(z, r"Measure Data")
    stars_name, star_rows = read_csv(z, r"Measure Stars")
    sum_name, sum_rows = read_csv(z, r"Summary Ratings")
    pc_name, pc_rows = read_csv(z, r"Part C Cut Points")
    pd_name, pd_rows = read_csv(z, r"Part D Cut Points")
    enr_name = next(n for n in ez.namelist() if n.endswith(".csv"))
    enr_rows = list(csv.DictReader(io.StringIO(ez.read(enr_name).decode("cp1252", errors="replace"))))

    data_cols = match_columns(data_rows[2])
    star_cols = match_columns(star_rows[2])
    c_cols, c_cuts = parse_cut_points(pc_rows, org_col=False)
    d_cols, d_cuts = parse_cut_points(pd_rows, org_col=True)
    cuts = {**c_cuts, **d_cuts}
    weights = tech_note_weights()
    pay_year, pay_source = payment_year()

    missing = [k for k in TARGETS if k not in data_cols or k not in star_cols or k not in cuts]
    measure_map = {k: {"id": data_cols[k][1], "name": data_cols[k][2]} for k in TARGETS if k in data_cols}
    print("Measures matched by name:")
    for k, v in measure_map.items():
        print(f"  {k:6} -> {v['id']}: {v['name']}  weight {weights.get(k, {}).get('weight')}  cuts {cuts.get(k)}")
    if missing:
        print("NOT FOUND:", missing)

    # Summary ratings
    sh = [h.strip() for h in sum_rows[1]]
    col = {h: i for i, h in enumerate(sh)}
    overall_col = next(i for h, i in col.items() if h.endswith("Overall"))
    star_year = int(re.match(r"(\d{4})", sh[overall_col]).group(1))
    summary = {}
    for r in sum_rows[2:]:
        if not r or not r[0].strip():
            continue
        summary[r[0].strip()] = {
            "orgType": r[col["Organization Type"]].strip(),
            "name": r[col["Contract Name"]].strip(),
            "marketing": r[col["Organization Marketing Name"]].strip(),
            "parent": r[col["Parent Organization"]].strip(),
            "snp": r[col["SNP"]].strip() == "Yes",
            "disaster": {h.split()[0]: pct(r[i]) for h, i in col.items() if h.endswith("Disaster %")},
            "partC": pct(r[col[f"{star_year} Part C Summary"]]),
            "partD": pct(r[col[f"{star_year} Part D Summary"]]),
            "overall": pct(r[overall_col]),
        }

    rates = {r[0].strip(): r for r in data_rows[4:] if r and r[0].strip()}
    stars = {r[0].strip(): r for r in star_rows[4:] if r and r[0].strip()}
    enrollment = {}
    for r in enr_rows:
        e = r["Enrollment"].strip()
        enrollment[r["Contract Number"].strip()] = None if e == "*" else int(e.replace(",", ""))

    contracts, dropped = [], {}

    def drop(reason):
        dropped[reason] = dropped.get(reason, 0) + 1

    for cid, s in sorted(summary.items()):
        if cid[0] not in "HRE":
            drop("not an MA contract (PDP or other)")
            continue
        if s["overall"] is None:
            drop("no numeric overall rating")
            continue
        measures = {}
        for k in measure_map:
            rate = pct(rates[cid][data_cols[k][0]]) if cid in rates else None
            st = pct(stars[cid][star_cols[k][0]]) if cid in stars else None
            st = int(st) if st is not None else None
            cut = cuts.get(k, {})
            cur_cut = cut.get(st) if st else None
            next_cut = cut.get(st + 1) if st and st < 5 else None
            measures[k] = {
                "rate": rate,
                "stars": st,
                "nextCut": next_cut,
                "curCut": cur_cut,
                "gapUp": round(next_cut - rate, 2) if rate is not None and next_cut is not None else None,
                "cushion": round(rate - cur_cut, 2) if rate is not None and cur_cut is not None else None,
            }
        contracts.append({
            "id": cid, "name": s["name"], "marketing": s["marketing"], "parent": s["parent"], "orgType": s["orgType"],
            "snp": s["snp"], "disaster": s["disaster"], "enrollment": enrollment.get(cid), "overall": s["overall"], "partC": s["partC"], "partD": s["partD"],
            "measures": measures,
        })
        if enrollment.get(cid) is None:
            drop("kept, but enrollment suppressed or missing")

    periods = measurement_period(data_rows, data_cols)
    meas_year = int(re.search(r"(\d{4})\s*$", periods[0]).group(1)) if periods else None
    meta = {
        "starYear": star_year,
        "measurementYear": meas_year,
        "measurementPeriods": periods,
        "paymentYear": pay_year,
        "paymentYearSource": pay_source,
        "built": datetime.date.today().isoformat(),
        "downloaded": datetime.date.fromtimestamp(os.path.getmtime(os.path.join(RAW, STARS_ZIP))).isoformat(),
        "sources": {
            "stars": {"file": STARS_ZIP, "members": [data_name, stars_name, sum_name, pc_name, pd_name],
                      "page": "https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data"},
            "enrollment": {"file": ENROLL_ZIP, "member": enr_name,
                           "page": "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/monthly-enrollment-contract"},
            "weights": {"file": TECH_NOTES, "detail": "Attachment G and each measure's Weighting Value"},
        },
        "cutPointTables": {"partD": f"{pd_name} (MA-PD rows)", "partC": pc_name},
        "cuts": cuts,
        "measures": {k: {**measure_map[k], "weight": weights.get(k, {}).get("weight"), "part": TARGETS[k][1]} for k in measure_map},
        "notFound": missing,
        "dropped": dropped,
        "notes": [
            "Rates and measure stars are the contract's published values; next-star cut points are this year's MA-PD cut points.",
            "Contracts whose overall rating is not numeric (too new, too small, or not applicable) are excluded.",
            "CMS publishes rates and cut points as whole percentages; stars are assigned on unrounded rates, so each gap is uncertain by about 0.5 point.",
            "A negative cushion means the published measure star is above what this year's rate earns, typically because the disaster policy (extreme and uncontrollable circumstances) let the contract keep a prior-year star. See each contract's Disaster % columns.",
        ],
    }
    json.dump({"meta": meta, "contracts": contracts}, open(OUT, "w"), separators=(",", ":"))

    # Summary log at the default threshold (same rules as js/model/ma.js).
    def tier(c, t=DEFAULT_THRESHOLD):
        ms = c["measures"].values()
        gap = any(m["gapUp"] is not None and m["gapUp"] <= t for m in ms)
        cushion = any(m["cushion"] is not None and m["cushion"] <= t for m in ms)
        if c["overall"] == 3.5 and gap:
            return 1
        if c["overall"] == 4.0 and cushion:
            return 2
        return 3 if gap else None

    counts = {}
    for c in contracts:
        counts[tier(c)] = counts.get(tier(c), 0) + 1
    print(f"\nWrote {os.path.relpath(OUT, ROOT)}: {len(contracts)} contracts, Star year {star_year}, measurement year {meas_year}, payment year {pay_year}")
    print("Tiers at", DEFAULT_THRESHOLD, "pp:", {f"Tier {k}" if k else "no tier": v for k, v in sorted(counts.items(), key=lambda x: (x[0] is None, x[0]))})
    print("Dropped / flagged:", dropped)
    t1 = sorted([c for c in contracts if tier(c) == 1], key=lambda c: -(c["enrollment"] or 0))[:10]
    print("\nTop 10 Tier 1 by enrollment:")
    for c in t1:
        near = ", ".join(f"{k} +{m['gapUp']}" for k, m in c["measures"].items() if m["gapUp"] is not None and m["gapUp"] <= DEFAULT_THRESHOLD)
        print(f"  {c['id']}  {c['enrollment'] or 0:>9,}  {c['marketing'][:28]:28}  {c['parent'][:30]:30}  {near}")


if __name__ == "__main__":
    main()

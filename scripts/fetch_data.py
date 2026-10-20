"""Download the CMS files for the MA Opportunity Finder into data/raw/.

Python standard library only. If a download fails, it prints exactly which
file to fetch by hand and where to put it, then exits non-zero.

Usage: python3 scripts/fetch_data.py [--refresh]
"""

import os
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")

# Most recent releases as of October 2026. Update these when CMS posts new ones.
FILES = {
    "stars": {
        "label": "2027 Part C and D Star Ratings data tables (released Oct 8, 2026)",
        "page": "https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data",
        "url": "https://www.cms.gov/files/zip/2027-star-ratings-data-tables-oct-8-2026.zip",
        "file": "2027-star-ratings-data-tables.zip",
    },
    "tech_notes": {
        "label": "2027 Star Ratings Technical Notes (Sep 30, 2026), for measure weights and timing",
        "page": "https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data",
        "url": "https://www.cms.gov/files/document/2027-tech-notes-2026-09-30.pdf",
        "file": "2027-tech-notes.pdf",
    },
    "fact_sheet": {
        "label": "2027 Star Ratings fact sheet, for the payment year",
        "page": "https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data",
        "url": "https://www.cms.gov/files/document/2027-star-ratings-fact-sheet.pdf",
        "file": "2027-star-ratings-fact-sheet.pdf",
    },
    "enrollment": {
        "label": "Monthly Enrollment by Contract, October 2026",
        "page": "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/monthly-enrollment-contract",
        "url": "https://www.cms.gov/files/zip/monthly-enrollment-contract-october-2026.zip",
        "file": "monthly-enrollment-contract-2026-10.zip",
    },
}


def fetch(spec, refresh):
    path = os.path.join(RAW, spec["file"])
    if os.path.exists(path) and not refresh:
        print(f"have  {spec['file']}")
        return True
    try:
        req = urllib.request.Request(spec["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as out:
            out.write(r.read())
        if spec["file"].endswith(".zip"):
            zipfile.ZipFile(path).testzip()
        print(f"got   {spec['file']} ({os.path.getsize(path):,} bytes)")
        return True
    except Exception as e:  # noqa: BLE001 - report every failure the same way
        if os.path.exists(path):
            os.remove(path)
        print(f"FAILED {spec['file']}: {e}")
        return False


def main():
    os.makedirs(RAW, exist_ok=True)
    refresh = "--refresh" in sys.argv
    failed = [s for s in FILES.values() if not fetch(s, refresh)]
    if failed:
        print("\nDownload these by hand, then rerun:")
        for s in failed:
            print(f"  - {s['label']}\n    from {s['page']}\n    ({s['url']})\n    save as {os.path.join(RAW, s['file'])}")
        sys.exit(1)


if __name__ == "__main__":
    main()

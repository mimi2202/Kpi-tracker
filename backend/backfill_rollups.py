"""Build monthly / quarterly / annual totals from the weekly (and monthly)
results already in the database.

Run AFTER the is_rollup migration has been deployed.

    # PowerShell, from the backend folder, venv active
    $env:DATABASE_URL = "<production url>"
    python backfill_rollups.py --preview     # shows how every KPI would be combined, changes nothing
    python backfill_rollups.py               # applies it

Preview first: KPIs imported from spreadsheets all have unit "NUMBER", so the
script guesses SUM vs AVERAGE from the name ("%", rate, score, average ...).
Anything the guess got wrong: set the KPI's Unit in KPI Library and re-run.
"""
import os
import sys
from collections import defaultdict

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.kpis.models import KPI  # noqa: E402
from apps.results.models import KPIResult  # noqa: E402
from apps.results.rollup import CHAIN, aggregation_mode, rollup_key, rollup_results, _native_index  # noqa: E402


def main():
    preview = "--preview" in sys.argv

    qs = KPIResult.objects.filter(
        period_type__in=CHAIN[:3], is_rollup=False, actual_value__isnull=False
    ).only("kpi_id", "responsible_person_id", "period_type", "period_start_date")

    keys_by_kpi = defaultdict(set)
    for r in qs.iterator():
        keys_by_kpi[r.kpi_id].add(rollup_key(r))

    kpis = KPI.objects.in_bulk(list(keys_by_kpi))
    rows = []
    for kpi_id, keys in keys_by_kpi.items():
        kpi = kpis.get(kpi_id)
        if kpi is None:
            continue
        native = _native_index(kpi)
        # skip KPIs where nothing sits below their own level
        if native is None or all(CHAIN.index(k[2]) + 1 > 3 or native >= CHAIN.index(k[2]) + 1 for k in keys):
            continue
        rows.append((kpi, keys))

    print(f"{len(rows)} KPI(s) will get roll-ups\n")
    print(f"{'CODE':<12}{'FREQ':<11}{'UNIT':<10}{'MODE':<5}{'SRC':<5} NAME")
    for kpi, keys in sorted(rows, key=lambda x: (str(x[0].department_id), x[0].code)):
        print(f"{str(kpi.code)[:11]:<12}{kpi.reporting_frequency:<11}{str(kpi.unit_type)[:9]:<10}"
              f"{aggregation_mode(kpi):<5}{len(keys):<5} {kpi.name[:60]}")

    if preview:
        print("\nPreview only, nothing changed. Run without --preview to apply.")
        return

    total = 0
    for i, (kpi, keys) in enumerate(rows, 1):
        total += rollup_results(keys)
        if i % 20 == 0:
            print(f"  ...{i}/{len(rows)} KPIs")
    print(f"\nDone. {total} roll-up result(s) written or refreshed.")


if __name__ == "__main__":
    main()
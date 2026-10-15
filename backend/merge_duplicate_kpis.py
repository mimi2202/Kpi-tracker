"""Merge duplicate KPIs created by import name variations into one KPI each.

For every (keep, drop) pair below, the results of the dropped KPI are moved
onto the kept KPI (same week + same person already on the kept KPI: the kept
one wins, unless it has no value and the dropped one does), the dropped KPI's
auto totals are deleted, the dropped KPI is removed, and totals for the kept
KPI are rebuilt.

    python merge_duplicate_kpis.py            # preview only, changes nothing
    python merge_duplicate_kpis.py --apply    # does it

Run with venv active and $env:DATABASE_URL set. Edit PAIRS if a choice is wrong.
"""
import os
import sys

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from django.db import transaction  # noqa: E402

from apps.kpis.models import KPI  # noqa: E402
from apps.results.models import KPIResult  # noqa: E402
from apps.results.rollup import rollup_key, rollup_results  # noqa: E402

# (keep, drop)
PAIRS = [
    ("DM-002", "DM-001"),
    ("PM-002", "PM-017"),
    ("PM-007", "PM-018"),
    ("BDS-001", "BDS-007"),
    ("F-001", "F-007"),
    ("HQ-001", "HQ2-001"),
]


def one(code):
    found = list(KPI.objects.filter(code=code))
    if len(found) != 1:
        raise SystemExit(f"Expected exactly one KPI with code {code}, found {len(found)}")
    return found[0]


def save_result(r):
    r._skip_rollup = True
    try:
        r.save()
    except ValueError:
        r._skip_calc = True
        r.save()


def merge(keep, drop, apply):
    own = KPIResult.objects.filter(kpi=drop, is_rollup=False)
    moved = filled = dropped_dupes = 0
    plan = []
    for r in own:
        clash = KPIResult.objects.filter(
            kpi=keep, reporting_period_id=r.reporting_period_id,
            responsible_person_id=r.responsible_person_id,
        ).first()
        if clash is None:
            plan.append(("move", r, None)); moved += 1
        elif clash.actual_value is None and r.actual_value is not None:
            plan.append(("fill", r, clash)); filled += 1
        else:
            plan.append(("skip", r, clash)); dropped_dupes += 1
    print(f"{keep.code} <- {drop.code}: '{keep.name}' / '{drop.name}' "
          f"| move {moved}, fill {filled}, discard duplicate week {dropped_dupes}")
    if not apply:
        return

    KPIResult.objects.filter(kpi=drop, is_rollup=True).delete()
    for action, r, clash in plan:
        if action == "move":
            r.kpi = keep
            r.department = keep.department
            r.target_value = keep.target_value
            r.calculation_direction = keep.calculation_direction
            r.warning_threshold = keep.warning_threshold
            save_result(r)
        elif action == "fill":
            clash.actual_value = r.actual_value
            if r.notes and not clash.notes:
                clash.notes = r.notes
            save_result(clash)
            r.delete()
        else:
            r.delete()

    try:
        drop.delete()
    except Exception as e:  # PROTECT / other references
        print(f"   could not remove {drop.code}: {e}. Results were moved; delete it in KPI Library.")

    keys = {rollup_key(x) for x in KPIResult.objects.filter(kpi=keep, is_rollup=False, actual_value__isnull=False)}
    if keys:
        rollup_results(keys)


def main():
    apply = "--apply" in sys.argv
    pairs = [(one(k), one(d)) for k, d in PAIRS]
    with transaction.atomic():
        for keep, drop in pairs:
            merge(keep, drop, apply)
    print("\nDone." if apply else "\nPreview only, n
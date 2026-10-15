"""Open reporting periods.

    python manage.py open_periods                    # this week, month, quarter, year
    python manage.py open_periods --backfill         # also group existing weekly periods into months/quarters/years
    python manage.py open_periods --from 2026-01-05 --to 2026-12-28   # open a whole range
"""
from datetime import date

from django.core.management.base import BaseCommand

from apps.periods.auto import backfill_parents, ensure_current_periods, ensure_range, local_today


class Command(BaseCommand):
    help = "Open the current reporting periods and optionally backfill / pre-open others."

    def add_arguments(self, parser):
        parser.add_argument("--backfill", action="store_true")
        parser.add_argument("--from", dest="start")
        parser.add_argument("--to", dest="end")

    def handle(self, *args, **opts):
        created = ensure_current_periods(force=True)
        if opts["backfill"]:
            created += backfill_parents()
        if opts["start"]:
            start = date.fromisoformat(opts["start"])
            end = date.fromisoformat(opts["end"]) if opts["end"] else local_today()
            created += ensure_range(start, end)
        for c in created:
            self.stdout.write(f"created {c}")
        self.stdout.write(self.style.SUCCESS(f"Done. {len(created)} period(s) created."))
"""One-time cleanup: merge duplicate HR-related departments into one canonical
'HR & QA' department.

Run this directly as a plain script -- NOT through 'manage.py shell' -- since
piping or passing this via -c has run into PowerShell quoting/indentation
issues each time tonight. Running it as a real .py file sidesteps all of
that entirely.

    $env:DATABASE_URL = "your-production-postgres-url"
    python merge_hr_departments.py
"""
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
django.setup()

from apps.accounts.models import User
from apps.organisation.models import Department, UserDepartment
from apps.kpis.models import KPI
from apps.results.models import KPIResult

ADMIN_EMAIL = "ulokajidaniel@gmail.com"
CANONICAL_NAME = "HR & QA"
DUPLICATE_NAMES = ["HR", "HR/QA"]  # Quality Assurance is left alone -- separate department

org_id = User.objects.get(email=ADMIN_EMAIL).organisation_id

canonical = Department.objects.filter(organisation_id=org_id, name__iexact=CANONICAL_NAME).first()
if not canonical:
    print(f"ABORTING -- canonical department '{CANONICAL_NAME}' not found. Check spelling and try again.")
else:
    for dup_name in DUPLICATE_NAMES:
        dup = Department.objects.filter(organisation_id=org_id, name__iexact=dup_name).first()
        if not dup:
            print(f"Skipping '{dup_name}' -- no department with that name found.")
            continue
        if dup.id == canonical.id:
            print(f"Skipping '{dup_name}' -- same record as canonical, nothing to merge.")
            continue

        kpi_count = KPI.objects.filter(department=dup).update(department=canonical)
        result_count = KPIResult.objects.filter(department=dup).update(department=canonical)

        # UserDepartment has a unique_together on (user, department) -- if a
        # user is somehow already linked to BOTH the duplicate and the
        # canonical department, reassigning would violate that constraint.
        # Handle it per-row: drop the now-redundant link if one already
        # exists on canonical, otherwise repoint it.
        moved, dropped = 0, 0
        for ud in UserDepartment.objects.filter(department=dup):
            if UserDepartment.objects.filter(user=ud.user, department=canonical).exists():
                ud.delete()
                dropped += 1
            else:
                ud.department = canonical
                ud.save(update_fields=["department"])
                moved += 1

        dup_name_actual = dup.name
        dup.delete()
        print(
            f"Merged '{dup_name_actual}' -> '{CANONICAL_NAME}': "
            f"{kpi_count} KPIs, {result_count} results, "
            f"{moved} user-links moved, {dropped} redundant user-links dropped. "
            f"'{dup_name_actual}' deleted."
        )

    print("Done.")
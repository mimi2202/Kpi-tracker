from apps.results.models import KPIResult

fixed = 0
for r in KPIResult.objects.filter(actual_value__isnull=False, achievement_percentage__isnull=True):
    r._calculate()
    r.save()
    fixed += 1

print(f"Backfilled {fixed} results.")
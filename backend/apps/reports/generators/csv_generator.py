"""Plain CSV export. Raw results only, no summary, no chart. Matches what the
frontend tells the user CSV contains, keep it that way rather than sneaking in extra sheets.
"""
import csv
import io


def build_csv(context) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["KPI Code", "KPI Name", "Department", "Target", "Actual", "Achievement %", "Status", "Trend"])
    for res in context["results"]:
        writer.writerow([
            res.kpi.code,
            res.kpi.name,
            res.department.name,
            res.target_value,
            res.actual_value if res.actual_value is not None else "",
            res.achievement_percentage if res.achievement_percentage is not None else "",
            res.rag_status,
            res.trend_status,
        ])
    return buf.getvalue()
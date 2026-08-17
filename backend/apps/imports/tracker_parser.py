"""Parses the 'KPI Tracker' workbook format: a title row, then real headers a
row or two down, grouped department rows, then a period summary block and a
legend. This is a real operational spreadsheet layout, not a flat table, so it
gets its own parser rather than being forced through the generic one.

Handles multiple sheets in one workbook (Weekly / Monthly / Quarterly / Annual),
skips Trend / History / Scorecard sheets since those are read-only views, not
raw data to import.

Each sheet has its own period column, in its own format:
  Weekly    — mislabeled header, value like "Week of 22 June 2026"
  Monthly   — "REPORTING MONTH" column, value like "April 2026"
  Quarterly — "REPORTING QUARTER" column, value like "Q2 2026"
  Annual    — "REPORTING YEAR" column, value like "2026"
"""
import re
from datetime import date, datetime

SKIP_SHEET_KEYWORDS = ("trend", "history", "scorecard")
PERIOD_TYPE_BY_SHEET_KEYWORD = {
    "weekly": "WEEKLY",
    "monthly": "MONTHLY",
    "quarterly": "QUARTERLY",
    "annual": "ANNUAL",
}
STOP_MARKERS = ("period summary", "yellow cells")

WEEK_OF_PATTERN = re.compile(
    r"(?:week|month|quarter|year)\s+of\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{4})",
    re.IGNORECASE,
)
QUARTER_PATTERN = re.compile(r"^Q\s*(\d)\D+(\d{4})$", re.IGNORECASE)
BARE_MONTH_YEAR_PATTERN = re.compile(r"^[A-Za-z]+\s+\d{4}$")
BARE_YEAR_PATTERN = re.compile(r"^\d{4}$")


def is_tracker_workbook(wb):
    return any(_find_header_row(ws)[0] is not None for ws in wb.worksheets)


def parse_tracker_workbook(wb):
    rows = []
    for ws in wb.worksheets:
        sheet_lower = ws.title.lower()
        if any(kw in sheet_lower for kw in SKIP_SHEET_KEYWORDS):
            continue

        period_type = next(
            (pt for kw, pt in PERIOD_TYPE_BY_SHEET_KEYWORD.items() if kw in sheet_lower),
            None,
        )
        if not period_type:
            continue

        header_row_idx, roles_by_col = _find_header_row(ws)
        if header_row_idx is None:
            continue

        rows.extend(_extract_rows(ws, header_row_idx, roles_by_col, period_type))

    return rows


def _find_header_row(ws):
    """Scans the first few rows for one that looks like the real header,
    identified by having recognizable department/target/actual columns,
    rather than assuming row 1 is always the header.
    """
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=6, values_only=True), start=1):
        normalized = [str(c).strip().lower() if c else "" for c in row]
        has_department = "department" in normalized
        has_target = "target" in normalized
        has_actual = any(c.startswith("actual") for c in normalized)
        if has_department and has_target and has_actual:
            roles_by_col = {}
            for col_idx, text in enumerate(normalized):
                role = _classify_header_cell(text)
                if role:
                    roles_by_col[role] = col_idx
            return row_idx, roles_by_col
    return None, None


def _classify_header_cell(text):
    if text == "department":
        return "department"
    if "objective" in text:
        return "kpi_name"
    if text == "target":
        return "target"
    if text.startswith("actual") and "previous" not in text:
        return "actual"
    if "previous" in text and "actual" in text:
        return "previous_actual"
    if "responsible" in text:
        return "responsible"
    if "notes" in text:
        return "notes"
    if text.startswith("reporting"):
        return "period_text"
    return None


def _extract_rows(ws, header_row_idx, roles_by_col, period_type):
    rows = []
    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        if row is None or all(c is None or str(c).strip() == "" for c in row):
            break
        if any(_looks_like_stop_marker(c) for c in row):
            break

        values = {role: (row[col] if col < len(row) else None) for role, col in roles_by_col.items()}
        department = _clean(values.get("department"))
        kpi_name = _clean(values.get("kpi_name"))
        if not department or not kpi_name:
            continue  # blank spacer row inside the data block

        period_date = _resolve_period_date(row, values.get("period_text"))

        rows.append({
            "department": department,
            "kpi_name": kpi_name,
            "target": values.get("target"),
            "actual": values.get("actual"),
            "previous_actual": values.get("previous_actual"),
            "notes": _clean(values.get("notes")) or "",
            "period_type": period_type,
            "period_date": period_date,
        })

    return rows


def _looks_like_stop_marker(cell):
    if not isinstance(cell, str):
        return False
    lowered = cell.strip().lower()
    return any(marker in lowered for marker in STOP_MARKERS)


def _clean(value):
    if value is None:
        return ""
    return str(value).strip()


def _resolve_period_date(row, period_text_cell):
    """Prefers the sheet's own dedicated period column (found by header name).
    Falls back to scanning every cell for a 'Week of ...' style phrase, for
    sheets like Weekly here whose header for that column is mislabeled.
    """
    if period_text_cell is not None:
        parsed = _parse_period_text(period_text_cell)
        if parsed:
            return parsed

    for cell in row:
        if isinstance(cell, str):
            parsed = _parse_period_text(cell)
            if parsed:
                return parsed
    return None


def _parse_period_text(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str):
        return None

    text = value.strip()
    if not text:
        return None

    match = WEEK_OF_PATTERN.search(text)
    if match:
        date_text = match.group(1)
        for fmt in ("%d %B %Y", "%B %Y"):
            try:
                return datetime.strptime(date_text, fmt).date()
            except ValueError:
                continue

    match = QUARTER_PATTERN.match(text)
    if match:
        quarter, year = int(match.group(1)), int(match.group(2))
        first_month = (quarter - 1) * 3 + 1
        return date(year, first_month, 1)

    if BARE_MONTH_YEAR_PATTERN.match(text):
        try:
            return datetime.strptime(text, "%B %Y").date()
        except ValueError:
            pass

    if BARE_YEAR_PATTERN.match(text):
        return date(int(text), 1, 1)

    return None
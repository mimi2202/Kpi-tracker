"""Parses the 'KPI Tracker' workbook format: a title row, then real headers a
row or two down, grouped department rows, then a period summary block and a
legend. This is a real operational spreadsheet layout, not a flat table, so it
gets its own parser rather than being forced through the generic one.

Handles three distinct sheet SHAPES within one workbook, detected by header
content rather than by sheet name (so renamed/reordered/emoji-prefixed tabs
still work, as long as the columns match one of these shapes):

  1. LONG-FORMAT PERIOD SHEETS (Weekly / Monthly / Quarterly / Annual) —
     one row per KPI, current-period columns: Department, Target, Actual, ...
     Each sheet has its own period column, in its own format:
       Weekly    — mislabeled header, value like "Week of 22 June 2026"
       Monthly   — "REPORTING MONTH" column, value like "April 2026"
       Quarterly — "REPORTING QUARTER" column, value like "Q2 2026"
       Annual    — "REPORTING YEAR" column, value like "2026"

  2. HISTORY TRACKER — a flat bulk-import sheet: one row per (period, KPI),
     with an explicit, self-contained period label per row:
       Weekly   -> "W14 Apr 2025"   (week number + year; month word is just
                                      a human hint, ISO week + year is used)
       Monthly  -> "January 2025"
       Quarterly-> "Q1 2025"
       Annual   -> "FY 2024"
     Every label here carries its own year, so nothing is guessed.

  3. WIDE TREND SHEETS (Weekly / Monthly / Quarterly Trend) — one row per
     KPI, with one column per period instead of one row per period:
       Weekly Trend    columns: W26, W27, ... (NO YEAR on the sheet)
       Monthly Trend   columns: Jan, Feb, ... (NO YEAR on the sheet)
       Quarterly Trend columns: Q1 2026, Q2 2026, ... (year included)
     Weekly/Monthly Trend columns carry no year at all, so the current
     calendar year is assumed for those, and every row derived this way is
     flagged (assumed_year=True) so importer.py can surface a clear warning
     in the import preview rather than silently guessing.

     The KPI/Metric cell in these sheets often carries the target inline,
     e.g. "Tickets resolved within 48hrs\\n(Target: 90%)" — that suffix is
     stripped off and parsed out separately so the KPI name still matches
     the same KPI created from a long-format sheet (which has no suffix).

Dept/Scorecard-style rollup sheets (no raw enterable values, just computed
summaries) won't match any of the three shapes above and are silently
skipped — no name-based skip list needed anymore.

All three shapes are normalized down to the SAME row dict shape:
    {department, kpi_name, target, actual, previous_actual, notes,
     period_type, period_date, assumed_year}
so importer.py's _import_tracker_results() handles all of them uniformly,
with no awareness of which sheet shape a given row came from.
"""
import re
from datetime import date, datetime, timedelta

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

# --- History Tracker (flat bulk sheet) ---
HISTORY_WEEK_LABEL = re.compile(r"^W(\d{1,2})\s+[A-Za-z]+\s+(\d{4})$", re.IGNORECASE)
HISTORY_FY_LABEL = re.compile(r"^FY\s*(\d{4})$", re.IGNORECASE)

# --- Wide trend sheet column headers ---
TREND_WEEK_COL = re.compile(r"^W(\d{1,2})$", re.IGNORECASE)
TREND_QUARTER_COL = re.compile(r"^Q([1-4])\s+(\d{4})$", re.IGNORECASE)
MONTH_NUMBER = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Target embedded in the KPI/Metric cell text of wide trend sheets, e.g.
# "Tickets resolved within 48hrs\n(Target: 90%)" -> name + "90%".
TARGET_IN_NAME = re.compile(r"^(.*?)\s*\(\s*target[:\s]*([^)]*)\)\s*$", re.IGNORECASE)


def is_tracker_workbook(wb):
    return any(_detect_sheet_shape(ws) is not None for ws in wb.worksheets)


def parse_tracker_workbook(wb):
    rows = []
    for ws in wb.worksheets:
        shape = _detect_sheet_shape(ws)
        if shape is None:
            continue

        kind, header_row_idx, meta = shape

        if kind == "long":
            rows.extend(_extract_long_rows(ws, header_row_idx, meta["roles_by_col"], meta["period_type"]))
        elif kind == "history":
            rows.extend(_extract_history_rows(ws, header_row_idx, meta["roles_by_col"]))
        elif kind == "trend":
            rows.extend(_extract_trend_rows(
                ws, header_row_idx, meta["dept_col"], meta["kpi_col"],
                meta["period_cols"], meta["period_type"],
            ))

    return rows


def _detect_sheet_shape(ws):
    """Scans the first few rows of a sheet and returns (kind, header_row_idx,
    meta) for whichever of the three known shapes matches, or None if this
    sheet doesn't look like enterable KPI data (e.g. a scorecard rollup).
    """
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=6, values_only=True), start=1):
        normalized = [_norm(c) for c in row]

        # --- Shape 2: History Tracker ---
        if "period type" in normalized and "period label" in normalized and "department" in normalized:
            roles_by_col = {}
            for col_idx, text in enumerate(normalized):
                role = _classify_history_header_cell(text)
                if role:
                    roles_by_col[role] = col_idx
            required = {"period_type", "period_label", "kpi_name", "department", "actual"}
            if required.issubset(roles_by_col):
                return "history", row_idx, {"roles_by_col": roles_by_col}
            continue

        # --- Shape 3: Wide trend sheet ---
        if "department" in normalized and any(
            _classify_header_cell(t) == "kpi_name" for t in normalized
        ):
            period_cols, period_type = _find_trend_period_columns(normalized)
            if period_cols:
                dept_col = normalized.index("department")
                kpi_col = next(i for i, t in enumerate(normalized) if _classify_header_cell(t) == "kpi_name")
                return "trend", row_idx, {
                    "dept_col": dept_col,
                    "kpi_col": kpi_col,
                    "period_cols": period_cols,
                    "period_type": period_type,
                }

        # --- Shape 1: Long-format period sheet (original behaviour) ---
        has_department = "department" in normalized
        has_target = "target" in normalized
        has_actual = any(c.startswith("actual") for c in normalized)
        if has_department and has_target and has_actual:
            roles_by_col = {}
            for col_idx, text in enumerate(normalized):
                role = _classify_header_cell(text)
                if role:
                    roles_by_col[role] = col_idx
            period_type = next(
                (pt for kw, pt in PERIOD_TYPE_BY_SHEET_KEYWORD.items() if kw in _norm(ws.title)),
                None,
            )
            if period_type:
                return "long", row_idx, {"roles_by_col": roles_by_col, "period_type": period_type}

    return None


def _norm(cell):
    return str(cell).strip().lower().replace("\n", " ") if cell else ""


def _classify_header_cell(text):
    if text == "department":
        return "department"
    if "objective" in text or "kpi / metric" in text or "kpi/metric" in text:
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


def _classify_history_header_cell(text):
    if text == "period type":
        return "period_type"
    if text == "period label":
        return "period_label"
    if "kpi" in text and ("metric" in text or text == "kpi"):
        return "kpi_name"
    if text == "department":
        return "department"
    if text == "target":
        return "target"
    if text == "actual":
        return "actual"
    if "notes" in text:
        return "notes"
    return None


def _find_trend_period_columns(normalized_headers):
    """Looks for a consistent run of week/month/quarter column headers.
    Returns (period_cols, period_type) where period_cols is a list of
    (col_idx, ref_date, assumed_year, ordinal) tuples (ordinal = the week
    or month number written in the header, None for quarters), or ([], None) if this sheet
    doesn't look like a wide trend sheet.
    """
    week_cols, month_cols, quarter_cols = [], [], []
    current_year = date.today().year

    for col_idx, text in enumerate(normalized_headers):
        raw = text.strip()

        m = TREND_WEEK_COL.match(raw)
        if m:
            week_no = int(m.group(1))
            try:
                ref_date = date.fromisocalendar(current_year, week_no, 1)
                week_cols.append((col_idx, ref_date, True, week_no))  # assumed_year=True
            except ValueError:
                pass
            continue

        m = TREND_QUARTER_COL.match(raw)
        if m:
            quarter, year = int(m.group(1)), int(m.group(2))
            first_month = (quarter - 1) * 3 + 1
            quarter_cols.append((col_idx, date(year, first_month, 1), False, None))
            continue

        month_key = raw[:3].lower()
        if raw.lower() in MONTH_NUMBER or month_key in MONTH_NUMBER:
            month_no = MONTH_NUMBER.get(raw.lower()) or MONTH_NUMBER[month_key]
            ref_date = date(current_year, month_no, 1)
            month_cols.append((col_idx, ref_date, True, month_no))  # assumed_year=True

    if week_cols:
        return week_cols, "WEEKLY"
    if quarter_cols:
        return quarter_cols, "QUARTERLY"
    if month_cols:
        return month_cols, "MONTHLY"
    return [], None


def _extract_long_rows(ws, header_row_idx, roles_by_col, period_type):
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
            "assumed_year": False,
        })

    return rows


def _extract_history_rows(ws, header_row_idx, roles_by_col):
    rows = []
    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        if row is None or all(c is None or str(c).strip() == "" for c in row):
            break
        if any(_looks_like_stop_marker(c) for c in row):
            break

        values = {role: (row[col] if col < len(row) else None) for role, col in roles_by_col.items()}
        department = _clean(values.get("department"))
        kpi_name = _clean(values.get("kpi_name"))
        period_type_text = _clean(values.get("period_type")).upper()
        period_label = _clean(values.get("period_label"))

        if not department or not kpi_name or not period_type_text or not period_label:
            continue  # blank spacer / instructions row

        if period_type_text not in ("WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"):
            continue  # e.g. the "HOW TO USE" note row

        period_date = _resolve_history_period_label(period_type_text, period_label)
        if period_date is None:
            continue  # unparseable label — skip rather than guess

        rows.append({
            "department": department,
            "kpi_name": kpi_name,
            "target": values.get("target"),
            "actual": values.get("actual"),
            "previous_actual": None,
            "notes": _clean(values.get("notes")) or "",
            "period_type": period_type_text,
            "period_date": period_date,
            "assumed_year": False,  # every History Tracker label carries its own year
        })

    return rows


def _extract_trend_rows(ws, header_row_idx, dept_col, kpi_col, period_cols, period_type):
    rows = []
    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        if row is None or all(c is None or str(c).strip() == "" for c in row):
            break
        if any(_looks_like_stop_marker(c) for c in row):
            break

        department = _clean(row[dept_col] if dept_col < len(row) else None)
        raw_kpi_name = _clean(row[kpi_col] if kpi_col < len(row) else None)
        if not department or not raw_kpi_name:
            continue  # blank spacer row

        kpi_name, target = _split_name_and_inline_target(raw_kpi_name)

        first_ordinal = next((c[3] for c in period_cols if c[3] is not None), None)
        for col_idx, ref_date, assumed_year, ordinal in period_cols:
            if col_idx >= len(row):
                continue
            actual = row[col_idx]
            if actual is None or str(actual).strip() == "":
                continue  # this period hasn't been filled in yet — nothing to import

            rows.append({
                "department": department,
                "kpi_name": kpi_name,
                "target": target,
                "actual": actual,
                "previous_actual": None,
                "notes": "",
                "period_type": period_type,
                "period_date": ref_date,
                "assumed_year": assumed_year,
                # How far this column sits from the sheet's first period
                # (in weeks or months). Lets the importer re-anchor the whole
                # sheet when the user says which month it starts in.
                "trend_offset": _trend_offset(period_type, ordinal, first_ordinal) if assumed_year else None,
            })

    return rows


def _trend_offset(period_type, ordinal, first_ordinal):
    if ordinal is None or first_ordinal is None:
        return None
    diff = ordinal - first_ordinal
    if period_type == "MONTHLY" and diff < 0:
        diff += 12  # sheet runs across a year end, e.g. Nov, Dec, Jan
    return diff


def trend_start_hint(rows):
    """If any rows came from a Weekly/Monthly Trend sheet (no year, and for
    weeks no month either), returns {'month', 'year'} guessed from the first
    column so the import screen can pre-fill its 'starting month' question.
    Returns None when every row carries its own full date."""
    for r in rows:
        if r.get("assumed_year") and r.get("trend_offset") == 0:
            d = r["period_date"]
            return {"month": d.month, "year": d.year}
    return None


def _first_monday_on_or_after(d):
    return d + timedelta(days=(7 - d.weekday()) % 7)


def apply_trend_start(rows, start_month, start_year):
    """Re-anchors Weekly/Monthly Trend rows to a chosen starting month: the
    first weekly column becomes the first Monday of that month and later
    columns follow week by week; monthly columns follow month by month
    (rolling into the next year after December). Returns new row dicts."""
    out = []
    base_monday = _first_monday_on_or_after(date(start_year, start_month, 1))
    for r in rows:
        offset = r.get("trend_offset")
        if r.get("assumed_year") and offset is not None:
            r = dict(r)
            if r["period_type"] == "WEEKLY":
                r["period_date"] = base_monday + timedelta(weeks=offset)
            else:
                m = (start_month - 1) + offset
                r["period_date"] = date(start_year + m // 12, m % 12 + 1, 1)
            r["assumed_year"] = False
        out.append(r)
    return out


def _split_name_and_inline_target(raw_name):
    """'Tickets resolved within 48hrs\\n(Target: 90%)' -> ('Tickets resolved
    within 48hrs', 90.0). Falls back to (raw_name, None) if there's no
    inline target suffix, or if the number inside it can't be parsed —
    a missing target here just means the importer falls back to its
    existing needs_target / placeholder-target behaviour.
    """
    match = TARGET_IN_NAME.match(raw_name)
    if not match:
        return raw_name.strip(), None

    name, target_text = match.group(1).strip(), match.group(2)
    number_match = re.search(r"[\d.,]+", target_text or "")
    if not number_match:
        return name, None

    try:
        return name, float(number_match.group(0).replace(",", ""))
    except ValueError:
        return name, None


def _resolve_history_period_label(period_type, label):
    if period_type == "WEEKLY":
        m = HISTORY_WEEK_LABEL.match(label)
        if m:
            week_no, year = int(m.group(1)), int(m.group(2))
            try:
                return date.fromisocalendar(year, week_no, 1)
            except ValueError:
                return None
        return None

    if period_type == "MONTHLY":
        try:
            return datetime.strptime(label, "%B %Y").date().replace(day=1)
        except ValueError:
            return None

    if period_type == "QUARTERLY":
        m = QUARTER_PATTERN.match(label)
        if m:
            quarter, year = int(m.group(1)), int(m.group(2))
            first_month = (quarter - 1) * 3 + 1
            return date(year, first_month, 1)
        return None

    if period_type == "ANNUAL":
        m = HISTORY_FY_LABEL.match(label)
        if m:
            return date(int(m.group(1)), 1, 1)
        if BARE_YEAR_PATTERN.match(label.strip()):
            return date(int(label.strip()), 1, 1)
        return None

    return None


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
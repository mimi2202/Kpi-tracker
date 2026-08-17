"""Decides what kind of data a parsed file contains, by column signature.
No mode picker in the UI, the headers themselves say what the file is.
"""


def classify_rows(rows):
    if not rows:
        return "empty"

    headers = set(rows[0].keys())

    is_results = "kpi_code" in headers and ("actual" in headers or "actual_value" in headers)
    is_definitions = (
        "code" in headers
        and "name" in headers
        and "kpi_code" not in headers
        and ("target" in headers or "target_value" in headers)
    )

    if is_results:
        return "results"
    if is_definitions:
        return "definitions"
    return "unknown"
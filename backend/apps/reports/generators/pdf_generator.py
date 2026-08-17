"""PDF report: summary, a RAG pie chart, department table, then the full results table.
Requires reportlab.
"""
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.legends import Legend

from .data import RAG_LABELS

RAG_COLORS = {
    "ON_TRACK": colors.HexColor("#10B981"),
    "AT_RISK": colors.HexColor("#F59E0B"),
    "OFF_TRACK": colors.HexColor("#EF4444"),
    "NO_DATA": colors.HexColor("#9CA3AF"),
}


def build_pdf(context, organisation_name: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleX", parent=styles["Title"], fontSize=20)
    subtitle_style = ParagraphStyle("SubtitleX", parent=styles["Normal"], textColor=colors.HexColor("#6B7280"), fontSize=11)

    period = context["period"]
    story = [
        Paragraph(organisation_name, title_style),
        Paragraph(
            f"{context['period_type'].title()} Report — {period.label if period else 'No period data'}",
            subtitle_style,
        ),
        Spacer(1, 16),
        _summary_table(context),
        Spacer(1, 20),
    ]

    if context["total_kpis"] > 0:
        story.append(_rag_chart(context))
        story.append(Spacer(1, 20))

    story.append(Paragraph("Department Summary", styles["Heading2"]))
    story.append(Spacer(1, 8))
    if context["dept_scores"]:
        story.append(_department_table(context))
    else:
        story.append(Paragraph("No department data for this period.", styles["Normal"]))
    story.append(Spacer(1, 20))

    story.append(Paragraph("KPI Results", styles["Heading2"]))
    story.append(Spacer(1, 8))
    if context["results"]:
        story.append(_results_table(context))
    else:
        story.append(Paragraph("No KPI results for this period.", styles["Normal"]))

    doc.build(story)
    return buf.getvalue()


def _summary_table(context):
    data = [
        ["Total KPIs", str(context["total_kpis"])],
        ["Average Achievement", f"{context['avg_achievement']}%" if context["avg_achievement"] is not None else "N/A"],
    ]
    t = Table(data, colWidths=[6 * cm, 6 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6B7280")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _rag_chart(context):
    d = Drawing(400, 160)
    pie = Pie()
    pie.x, pie.y = 30, 15
    pie.width, pie.height = 130, 130

    keys = [k for k in RAG_LABELS if context["rag_counts"][k] > 0]
    pie.data = [context["rag_counts"][k] for k in keys]
    pie.labels = [RAG_LABELS[k] for k in keys]
    pie.slices.strokeWidth = 1
    for i, k in enumerate(keys):
        pie.slices[i].fillColor = RAG_COLORS[k]

    legend = Legend()
    legend.x, legend.y = 220, 100
    legend.colorNamePairs = [(RAG_COLORS[k], RAG_LABELS[k]) for k in keys]
    legend.fontSize = 9

    d.add(pie)
    d.add(legend)
    return d


def _department_table(context):
    # dept_scores is a list of plain dicts, computed live in data.py.
    rows = [["Department", "KPIs", "Avg Achievement", "Status"]]
    for ds in context["dept_scores"]:
        rows.append([
            ds["department_name"],
            str(ds["kpi_count"]),
            f"{ds['avg_achievement']}%" if ds["avg_achievement"] is not None else "—",
            ds["rag_status"].replace("_", " ").title(),
        ])
    t = Table(rows, colWidths=[6 * cm, 2.5 * cm, 4 * cm, 3.5 * cm], repeatRows=1)
    t.setStyle(_table_style())
    return t


def _results_table(context):
    rows = [["Code", "KPI", "Department", "Target", "Actual", "Achievement", "Status"]]
    for res in context["results"]:
        rows.append([
            res.kpi.code,
            res.kpi.name,
            res.department.name,
            str(res.target_value),
            str(res.actual_value) if res.actual_value is not None else "—",
            f"{res.achievement_percentage}%" if res.achievement_percentage is not None else "—",
            res.rag_status.replace("_", " ").title(),
        ])
    t = Table(rows, colWidths=[2 * cm, 5 * cm, 3.5 * cm, 2 * cm, 2 * cm, 2.5 * cm, 2.5 * cm], repeatRows=1)
    t.setStyle(_table_style())
    return t


def _table_style():
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366F1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ])
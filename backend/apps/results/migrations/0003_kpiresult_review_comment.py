from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("results", "0002_remove_kpiresult_unique_kpi_period_result_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="kpiresult",
            name="review_comment",
            field=models.TextField(
                blank=True,
                help_text="Reviewer's note or rejection reason from the most recent decision",
            ),
        ),
    ]
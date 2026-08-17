from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_theme_preference"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="period_reminders",
            field=models.BooleanField(default=True),
        ),
    ]
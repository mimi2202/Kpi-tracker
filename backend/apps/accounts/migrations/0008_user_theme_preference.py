from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0007_user_dark_mode"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="dark_mode",
        ),
        migrations.AddField(
            model_name="user",
            name="theme_preference",
            field=models.CharField(
                max_length=10,
                choices=[("system", "System"), ("light", "Light"), ("dark", "Dark")],
                default="system",
            ),
        ),
    ]
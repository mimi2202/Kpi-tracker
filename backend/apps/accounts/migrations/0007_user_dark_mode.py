from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_avatar"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="dark_mode",
            field=models.BooleanField(default=False),
        ),
    ]
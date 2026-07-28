from django.db import migrations


def backfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Organisation = apps.get_model("accounts", "Organisation")
    Department = apps.get_model("organisation", "Department")

    org = Organisation.objects.first()
    if org is None:
        org = Organisation.objects.create(name="Default Organisation")

    User.objects.filter(organisation__isnull=True, role="ADMIN").update(organisation=org)
    Department.objects.filter(organisation__isnull=True).update(organisation=org)

    for u in User.objects.filter(organisation__isnull=True).exclude(manager__isnull=True):
        if u.manager.organisation_id:
            u.organisation_id = u.manager.organisation_id
            u.save(update_fields=["organisation"])

    print("Backfill complete")


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        (("accounts", "0005_user_avatar")),
    ]
    operations = [migrations.RunPython(backfill, noop)]


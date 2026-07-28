from django.db import migrations


def backfill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Organisation = apps.get_model("accounts", "Organisation")
    Department = apps.get_model("organisation", "Department")

    # 1. Admins with no org: assign to an existing org, or create one
    orphan_admins = User.objects.filter(organisation__isnull=True, role="ADMIN")
    if orphan_admins.exists():
        org = Organisation.objects.first()
        if org is None:
            org = Organisation.objects.create(name="Default Organisation")
        orphan_admins.update(organisation=org)

    # 2. Non-admin users with no org: inherit from their manager
    for u in User.objects.filter(organisation__isnull=True).exclude(manager__isnull=True):
        if u.manager.organisation_id:
            u.organisation_id = u.manager.organisation_id
            u.save(update_fields=["organisation"])

    # 3. Departments with no org: assign to the org of their KPIs or the first org
    if Organisation.objects.count() == 1:
        org = Organisation.objects.first()
        Department.objects.filter(organisation__isnull=True).update(organisation=org)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_alter_user_organisation"),
        ("organisation", "0001_initial"),
    ]

    operations = [migrations.RunPython(backfill, noop)]

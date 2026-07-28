from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta
from decimal import Decimal
from apps.accounts.models import User, Role
from apps.organisation.models import Department
from apps.kpis.models import KPI, CalculationDirection, ReportingFrequency, UnitType
from apps.periods.models import ReportingPeriod, PeriodStatus

class Command(BaseCommand):
    help = 'Seed the database with sample data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding database...')

        admin, _ = User.objects.get_or_create(
            email='admin@ips.com',
            defaults={
                'first_name': 'System', 'last_name': 'Admin',
                'role': Role.SUPER_ADMIN, 'is_staff': True, 'is_superuser': True,
            }
        )
        admin.set_password('password123')
        admin.save()
        self.stdout.write(f'  Admin user ready: admin@ips.com / password123')

        dept_data = [
            ('OPS', 'Operations (S_E_A_P)', '#3B82F6', 1),
            ('BD', 'Business Development & Sales', '#10B981', 2),
            ('PM', 'Program Management', '#F59E0B', 3),
            ('FIN', 'Finance', '#8B5CF6', 4),
            ('HR', 'Human Resources', '#EC4899', 5),
            ('QA', 'Quality Assurance', '#EF4444', 6),
            ('FAC', 'Facility Management', '#06B6D4', 7),
            ('DM', 'Digital Marketing', '#F97316', 8),
        ]
        departments = {}
        for code, name, colour, order in dept_data:
            dept, _ = Department.objects.get_or_create(code=code, defaults={'name': name, 'colour': colour, 'display_order': order})
            departments[code] = dept
            self.stdout.write(f'  Department: {name}')

        kpi_list = [
            ('OPS-W-001', 'Tickets resolved within 48 hours', 'OPS', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('90'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('BD-W-001', 'New accounts acquired', 'BD', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('5'), UnitType.NUMBER, Decimal('1.0')),
            ('BD-W-002', 'Qualified leads generated', 'BD', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('20'), UnitType.NUMBER, Decimal('1.0')),
            ('PM-W-001', 'SLA compliance rate', 'PM', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('95'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('FIN-W-001', 'Invoices issued within 48 hours', 'FIN', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('100'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('HR-W-001', 'Weekly stand-up compliance', 'HR', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('100'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('DM-W-001', 'Social media posts', 'DM', ReportingFrequency.WEEKLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('10'), UnitType.NUMBER, Decimal('1.0')),
            ('OPS-M-001', 'System availability', 'OPS', ReportingFrequency.MONTHLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('99.9'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('PM-M-001', 'Projects delivered on time', 'PM', ReportingFrequency.MONTHLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('90'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('PM-M-002', 'Project cost variance', 'PM', ReportingFrequency.MONTHLY, CalculationDirection.LOWER_IS_BETTER, Decimal('10'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('FIN-M-001', 'Budget variance', 'FIN', ReportingFrequency.MONTHLY, CalculationDirection.LOWER_IS_BETTER, Decimal('5'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('FIN-M-002', 'Regulatory compliance violations', 'FIN', ReportingFrequency.MONTHLY, CalculationDirection.LOWER_IS_BETTER, Decimal('0'), UnitType.NUMBER, Decimal('1.0')),
            ('HR-M-001', 'Training hours per employee', 'HR', ReportingFrequency.MONTHLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('8'), UnitType.HOURS, Decimal('1.0')),
            ('HR-M-002', 'Employee retention rate', 'HR', ReportingFrequency.MONTHLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('95'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('FAC-M-001', 'Facility uptime', 'FAC', ReportingFrequency.MONTHLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('99'), UnitType.PERCENTAGE, Decimal('1.0')),
            ('FAC-M-002', 'Lost-time accidents', 'FAC', ReportingFrequency.MONTHLY, CalculationDirection.LOWER_IS_BETTER, Decimal('0'), UnitType.NUMBER, Decimal('1.0')),
            ('OPS-Q-001', 'Customer satisfaction score', 'OPS', ReportingFrequency.QUARTERLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('85'), UnitType.SCORE, Decimal('2.0')),
            ('BD-Q-001', 'Revenue growth YoY', 'BD', ReportingFrequency.QUARTERLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('15'), UnitType.PERCENTAGE, Decimal('2.0')),
            ('BD-Q-002', 'Proposal win rate', 'BD', ReportingFrequency.QUARTERLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('40'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('QA-Q-001', 'Staff trained on QMS', 'QA', ReportingFrequency.QUARTERLY, CalculationDirection.HIGHER_IS_BETTER, Decimal('100'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('QA-A-001', 'Internal audits conducted', 'QA', ReportingFrequency.ANNUAL, CalculationDirection.EXACT_TARGET, Decimal('4'), UnitType.NUMBER, Decimal('2.0')),
            ('QA-A-002', 'Audit findings closed within 30 days', 'QA', ReportingFrequency.ANNUAL, CalculationDirection.HIGHER_IS_BETTER, Decimal('95'), UnitType.PERCENTAGE, Decimal('1.5')),
            ('HR-A-001', 'Employee satisfaction score', 'HR', ReportingFrequency.ANNUAL, CalculationDirection.HIGHER_IS_BETTER, Decimal('80'), UnitType.SCORE, Decimal('2.0')),
        ]
        for code, name, dept_code, freq, direction, target, unit, weight in kpi_list:
            kpi, created = KPI.objects.get_or_create(
                code=code,
                defaults={
                    'name': name, 'department': departments[dept_code],
                    'reporting_frequency': freq, 'calculation_direction': direction,
                    'target_value': target, 'unit_type': unit, 'weight': weight,
                    'responsible_person': admin, 'department_owner': admin,
                }
            )
            if created:
                self.stdout.write(f'  KPI: {code} - {name}')

        today = date.today()
        month_start = today.replace(day=1)
        if today.month == 12:
            next_month = today.replace(year=today.year+1, month=1, day=1)
        else:
            next_month = today.replace(month=today.month+1, day=1)

        periods = [
            ("WEEKLY", f'Week {today.isocalendar()[1]-3}', today - timedelta(days=28), today - timedelta(days=22), today.year, today.isocalendar()[1]-3, None, None),
            ("WEEKLY", f'Week {today.isocalendar()[1]-2}', today - timedelta(days=21), today - timedelta(days=15), today.year, today.isocalendar()[1]-2, None, None),
            ("WEEKLY", f'Week {today.isocalendar()[1]-1}', today - timedelta(days=14), today - timedelta(days=8), today.year, today.isocalendar()[1]-1, None, None),
            ("WEEKLY", f'Week {today.isocalendar()[1]}', today - timedelta(days=7), today, today.year, today.isocalendar()[1], None, None),
            ("MONTHLY", today.strftime('%B %Y'), month_start, next_month - timedelta(days=1), today.year, None, today.month, None),
            ("QUARTERLY", f'Q{(today.month-1)//3+1} {today.year}', today.replace(month=((today.month-1)//3)*3+1, day=1), today, today.year, None, None, (today.month-1)//3+1),
            ("ANNUAL", f'FY {today.year}', today.replace(month=1, day=1), today.replace(month=12, day=31), today.year, None, None, None),
        ]
        for ptype, label, start, end, year, week, month, quarter in periods:
            period, created = ReportingPeriod.objects.get_or_create(
                period_type=ptype, reporting_year=year,
                week_number=week, month=month, quarter=quarter,
                defaults={'start_date': start, 'end_date': end, 'label': label, 'status': "OPEN"}
            )
            if created:
                self.stdout.write(f'  Period: {label}')

        self.stdout.write(self.style.SUCCESS('\nDone! Login: admin@ips.com / password123'))



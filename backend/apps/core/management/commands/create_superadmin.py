"""
Management command to create the initial super admin user in MongoDB.
Usage: python manage.py create_superadmin
"""
import datetime
from django.core.management.base import BaseCommand
from apps.utils.mongodb import get_main_db
from apps.auth_app.mongo_auth import hash_password


class Command(BaseCommand):
    help = 'Create the initial super admin user in MongoDB'

    def add_arguments(self, parser):
        parser.add_argument('--email',    default='admin@dynamicadmin.com')
        parser.add_argument('--password', default='Admin@123')
        parser.add_argument('--first',    default='Super')
        parser.add_argument('--last',     default='Admin')

    def handle(self, *args, **options):
        db = get_main_db()
        email = options['email'].strip().lower()

        if db['users'].find_one({'email': email}):
            self.stdout.write(self.style.WARNING(f'Super admin already exists: {email}'))
            return

        now = datetime.datetime.utcnow()
        user_doc = {
            'email':         email,
            'password_hash': hash_password(options['password']),
            'first_name':    options['first'],
            'last_name':     options['last'],
            'role':          'super_admin',
            'company_id':    None,
            'phone':         None,
            'is_active':     True,
            'is_staff':      True,
            'is_superuser':  True,
            'date_joined':   now,
            'last_login':    None,
            'metadata':      {},
        }
        db['users'].insert_one(user_doc)
        db['users'].create_index('email', unique=True, background=True)

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Super admin created successfully\n'
            f'  Email   : {email}\n'
            f'  Password: {options["password"]}\n'
            f'  Role    : super_admin\n'
        ))

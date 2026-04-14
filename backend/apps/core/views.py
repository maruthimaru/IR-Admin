"""
Core Views - Company Management, Tenant Setup, Health Check
"""
import logging
from bson import ObjectId
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from slugify import slugify

from apps.utils.mongodb import get_main_db, get_tenant_db

logger = logging.getLogger(__name__)


def is_super_admin(user):
    return user.role == 'super_admin'


def is_company_admin(user):
    return user.role in ('super_admin', 'company_admin')


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint."""
    return Response({
        'status': 'healthy',
        'service': 'Dynamic Admin Panel API',
        'version': '1.0.0',
    })


# ─────────────────────────────────────────────
# COMPANY MANAGEMENT (Super Admin)
# ─────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def companies_list(request):
    """
    GET  - List all companies (super admin only)
    POST - Create a new company (super admin only)
    """
    if not is_super_admin(request.user):
        return Response({'error': 'Super admin access required'}, status=status.HTTP_403_FORBIDDEN)

    db = get_main_db()

    if request.method == 'GET':
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        skip = (page - 1) * page_size

        companies = list(db['companies'].find({}, {'password_hash': 0})
                         .skip(skip).limit(page_size))
        total = db['companies'].count_documents({})

        # Serialise ObjectId and datetime fields
        import datetime as _dt
        for c in companies:
            c['_id'] = str(c['_id'])
            if isinstance(c.get('created_at'), _dt.datetime):
                c['created_at'] = c['created_at'].isoformat()

        return Response({
            'results': companies,
            'total': total,
            'page': page,
            'page_size': page_size,
        })

    elif request.method == 'POST':
        data = request.data
        name = data.get('name', '').strip()
        plan = data.get('plan', 'basic')

        if not name:
            return Response({'error': 'Company name is required'}, status=status.HTTP_400_BAD_REQUEST)

        # custom_domain is mandatory
        custom_domain = data.get('custom_domain', '').strip().lower()
        if not custom_domain:
            return Response(
                {'error': 'custom_domain is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check custom_domain uniqueness
        if db['companies'].find_one({'custom_domain': custom_domain}):
            return Response(
                {'error': f'Domain "{custom_domain}" is already registered.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Auto-generate subdomain from company name (internal use)
        base_slug = slugify(name)
        subdomain = base_slug
        suffix = 1
        while db['companies'].find_one({'subdomain': subdomain}):
            subdomain = f'{base_slug}-{suffix}'
            suffix += 1

        # Password for the company admin account
        admin_password = data.get('admin_password', '').strip()
        if not admin_password or len(admin_password) < 8:
            return Response(
                {'error': 'admin_password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create company record
        import datetime
        from apps.auth_app.mongo_auth import hash_password as _hash
        db_name = f"tenant_{subdomain.replace('-', '_')}"
        company = {
            'name': name,
            'subdomain': subdomain,
            'db_name': db_name,
            'plan': plan,
            'custom_domain': custom_domain,
            'is_active': True,
            'created_at': datetime.datetime.utcnow(),
            'created_by': str(request.user.id),
            'settings': {
                'timezone': data.get('timezone', 'UTC'),
                'currency': data.get('currency', 'USD'),
                'language': data.get('language', 'en'),
            },
            'contact_email': data.get('contact_email', ''),
            'contact_phone': data.get('contact_phone', ''),
        }

        result = db['companies'].insert_one(company)
        company_id = str(result.inserted_id)

        # Create company admin user in main users collection
        contact_email = data.get('contact_email', '').strip().lower()
        if contact_email and not db['users'].find_one({'email': contact_email}):
            now = datetime.datetime.utcnow()
            db['users'].insert_one({
                'email':         contact_email,
                'password_hash': _hash(admin_password),
                'first_name':    data.get('admin_first_name', name),
                'last_name':     data.get('admin_last_name', 'Admin'),
                'role':          'company_admin',
                'company_id':    company_id,
                'phone':         data.get('contact_phone'),
                'is_active':     True,
                'date_joined':   now,
                'last_login':    None,
                'metadata':      {},
            })

        # Initialize tenant database with default collections
        _initialize_tenant_db(db_name, company_id, name)

        company['_id'] = company_id
        logger.info(f"Company created: {name} ({subdomain})")

        hosted_url = f"https://{custom_domain}"

        return Response({
            'message': f'Company "{name}" created successfully',
            'company': company,
            'subdomain_url': hosted_url,
        }, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def company_detail(request, company_id):
    """Get, update, or deactivate a company."""
    if not is_super_admin(request.user):
        return Response({'error': 'Super admin access required'}, status=status.HTTP_403_FORBIDDEN)

    db = get_main_db()
    try:
        company = db['companies'].find_one({'_id': ObjectId(company_id)})
    except Exception:
        return Response({'error': 'Invalid company ID'}, status=status.HTTP_400_BAD_REQUEST)

    if not company:
        return Response({'error': 'Company not found'}, status=status.HTTP_404_NOT_FOUND)

    import datetime as _dt
    company['_id'] = str(company['_id'])
    if isinstance(company.get('created_at'), _dt.datetime):
        company['created_at'] = company['created_at'].isoformat()

    if request.method == 'GET':
        return Response(company)

    elif request.method == 'PUT':
        allowed_fields = ['name', 'plan', 'is_active', 'settings', 'contact_email', 'contact_phone', 'custom_domain']
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}
        db['companies'].update_one({'_id': ObjectId(company_id)}, {'$set': update_data})

        # Optional: reset company admin password
        new_password = request.data.get('new_admin_password', '').strip()
        if new_password:
            if len(new_password) < 8:
                return Response(
                    {'error': 'new_admin_password must be at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from apps.auth_app.mongo_auth import hash_password as _hash
            db['users'].update_one(
                {'company_id': company_id, 'role': 'company_admin'},
                {'$set': {'password_hash': _hash(new_password)}},
            )

        return Response({'message': 'Company updated successfully'})

    elif request.method == 'DELETE':
        db['companies'].update_one(
            {'_id': ObjectId(company_id)},
            {'$set': {'is_active': False}}
        )
        return Response({'message': 'Company deactivated successfully'})


def _initialize_tenant_db(db_name: str, company_id: str, company_name: str):
    """Initialize a new tenant database with required collections and indexes."""
    import datetime
    tenant_db = get_tenant_db(db_name)

    # Create initial collections with indexes
    tenant_db['dynamic_forms'].create_index('form_name', unique=True)
    tenant_db['dynamic_fields'].create_index('form_id')
    tenant_db['audit_logs'].create_index([('created_at', -1)])

    # Insert default audit log
    tenant_db['audit_logs'].insert_one({
        'action': 'tenant_initialized',
        'company_id': company_id,
        'company_name': company_name,
        'created_at': datetime.datetime.utcnow(),
    })

    logger.info(f"Tenant database initialized: {db_name}")


# ─────────────────────────────────────────────
# DASHBOARD STATS
# ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    """Get dashboard statistics."""
    db = get_main_db()

    if is_super_admin(request.user):
        # Super admin sees platform-wide stats
        stats = {
            'total_companies':  db['companies'].count_documents({}),
            'active_companies': db['companies'].count_documents({'is_active': True}),
            'total_users':      db['users'].count_documents({}),
            'active_users':     db['users'].count_documents({'is_active': True}),
        }
    else:
        # Company users see tenant-specific stats
        tenant_db_name = getattr(request, 'tenant_db_name', None)
        if not tenant_db_name:
            return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.utils.mongodb import get_tenant_db
        tenant_db = get_tenant_db(tenant_db_name)
        stats = {
            'total_forms': tenant_db['dynamic_forms'].count_documents({}),
            'total_records': 0,  # Sum across all record collections
            'recent_activity': list(
                tenant_db['audit_logs'].find().sort('created_at', -1).limit(10)
            ),
        }
        # Convert ObjectIds in recent_activity
        for log in stats.get('recent_activity', []):
            log['_id'] = str(log['_id'])

    return Response(stats)

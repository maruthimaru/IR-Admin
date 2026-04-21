"""
Core Views - Company Management, Tenant Setup, Health Check, RBAC
"""
import datetime
import logging
from bson import ObjectId
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from slugify import slugify

from apps.utils.mongodb import get_main_db, get_tenant_db
from apps.core.middleware import get_tenant_db_name

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


# ─────────────────────────────────────────────
# ROLES API (Tenant-scoped)
# ─────────────────────────────────────────────

def _serialize_role(role: dict) -> dict:
    role = dict(role)
    role['_id'] = str(role['_id'])
    if isinstance(role.get('created_at'), datetime.datetime):
        role['created_at'] = role['created_at'].isoformat()
    return role


def _check_section_permission(request, db, section: str, action: str) -> bool:
    """Check if the user has a specific action on a section permission."""
    role = getattr(request.user, 'role', 'end_user')
    if role in ('super_admin', 'company_admin', 'developer'):
        return True
    user_doc = get_main_db()['users'].find_one({'_id': ObjectId(request.user.id)})
    tenant_role_id = (user_doc or {}).get('tenant_role_id')
    if not tenant_role_id:
        return False
    tenant_role = db['roles'].find_one({'_id': ObjectId(tenant_role_id)})
    if not tenant_role or not tenant_role.get('is_active', True):
        return False
    perms = tenant_role.get('permissions', {})
    val = perms.get(section)
    if isinstance(val, bool):
        return val
    if isinstance(val, dict):
        return bool(val.get(action, False))
    return False


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def roles_list(request):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_tenant_db(db_name)

    if request.method == 'GET':
        if not is_company_admin(request.user) and not _check_section_permission(request, db, 'roles', 'view'):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    else:
        if not is_company_admin(request.user) and not _check_section_permission(request, db, 'roles', 'add'):
            return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        main_db = get_main_db()
        roles = []
        for r in db['roles'].find().sort('name', 1):
            r_data = _serialize_role(r)
            r_data['user_count'] = main_db['users'].count_documents({'tenant_role_id': str(r['_id'])})
            roles.append(r_data)
        return Response({'results': roles, 'total': len(roles)})

    name = (request.data.get('name') or '').strip()
    if not name:
        return Response({'error': 'Role name is required'}, status=status.HTTP_400_BAD_REQUEST)
    if db['roles'].find_one({'name': name}):
        return Response({'error': f'Role "{name}" already exists'}, status=status.HTTP_409_CONFLICT)

    now = datetime.datetime.utcnow()
    doc = {
        'name': name,
        'description': request.data.get('description', ''),
        'permissions': request.data.get('permissions', {}),
        'is_active': True,
        'created_at': now,
        'created_by': str(request.user.id),
    }
    result = db['roles'].insert_one(doc)
    doc['_id'] = str(result.inserted_id)
    doc['created_at'] = now.isoformat()
    return Response(doc, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def role_detail(request, role_id):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_tenant_db(db_name)
    action_map = {'GET': 'view', 'PUT': 'edit', 'DELETE': 'delete'}
    required_action = action_map.get(request.method, 'view')
    if not is_company_admin(request.user) and not _check_section_permission(request, db, 'roles', required_action):
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    try:
        role = db['roles'].find_one({'_id': ObjectId(role_id)})
    except Exception:
        return Response({'error': 'Invalid role ID'}, status=status.HTTP_400_BAD_REQUEST)
    if not role:
        return Response({'error': 'Role not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(_serialize_role(role))

    elif request.method == 'PUT':
        allowed = ['name', 'description', 'permissions', 'is_active']
        update = {k: v for k, v in request.data.items() if k in allowed}
        if update:
            db['roles'].update_one({'_id': ObjectId(role_id)}, {'$set': update})
        return Response({'message': 'Role updated successfully'})

    elif request.method == 'DELETE':
        count = get_main_db()['users'].count_documents({'tenant_role_id': role_id})
        if count > 0:
            return Response(
                {'error': f'Cannot delete: {count} user(s) assigned to this role'},
                status=status.HTTP_409_CONFLICT,
            )
        db['roles'].delete_one({'_id': ObjectId(role_id)})
        return Response({'message': 'Role deleted successfully'})


# ─────────────────────────────────────────────
# TENANT USERS API
# ─────────────────────────────────────────────

def _serialize_tenant_user(u: dict) -> dict:
    return {
        'id':             str(u['_id']),
        'email':          u['email'],
        'first_name':     u.get('first_name', ''),
        'last_name':      u.get('last_name', ''),
        'full_name':      f"{u.get('first_name','')} {u.get('last_name','')}".strip(),
        'role':           u.get('role', 'end_user'),
        'tenant_role_id': u.get('tenant_role_id'),
        'phone':          u.get('phone'),
        'is_active':      u.get('is_active', True),
        'date_joined':    u['date_joined'].isoformat() if isinstance(u.get('date_joined'), datetime.datetime) else None,
        'last_login':     u['last_login'].isoformat()  if isinstance(u.get('last_login'),  datetime.datetime) else None,
    }


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def tenant_users_list(request):
    if not is_company_admin(request.user):
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    company_id = str(request.user.company_id) if request.user.company_id else None
    if not company_id:
        return Response({'error': 'No company context'}, status=status.HTTP_400_BAD_REQUEST)

    main_db = get_main_db()

    if request.method == 'GET':
        page      = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 50))
        query     = {'company_id': company_id}
        total     = main_db['users'].count_documents(query)
        users     = list(main_db['users'].find(query)
                         .sort('date_joined', -1)
                         .skip((page - 1) * page_size)
                         .limit(page_size))
        return Response({
            'results':   [_serialize_tenant_user(u) for u in users],
            'total':     total,
            'page':      page,
            'page_size': page_size,
        })

    # POST - create user
    from apps.auth_app.mongo_auth import hash_password as _hash

    required = ['email', 'password', 'first_name', 'last_name']
    missing = [f for f in required if not (request.data.get(f) or '').strip()]
    if missing:
        return Response({'error': f'Missing: {", ".join(missing)}'}, status=status.HTTP_400_BAD_REQUEST)

    email    = request.data['email'].strip().lower()
    password = request.data['password']

    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters'}, status=status.HTTP_400_BAD_REQUEST)
    if main_db['users'].find_one({'email': email}):
        return Response({'error': 'Email already exists'}, status=status.HTTP_409_CONFLICT)

    now = datetime.datetime.utcnow()
    user_doc = {
        'email':          email,
        'password_hash':  _hash(password),
        'first_name':     request.data['first_name'].strip(),
        'last_name':      request.data['last_name'].strip(),
        'role':           'end_user',
        'company_id':     company_id,
        'tenant_role_id': request.data.get('tenant_role_id') or None,
        'phone':          request.data.get('phone'),
        'is_active':      True,
        'date_joined':    now,
        'last_login':     None,
        'metadata':       {},
    }
    result = main_db['users'].insert_one(user_doc)
    user_doc['_id'] = result.inserted_id
    return Response(_serialize_tenant_user(user_doc), status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def tenant_user_detail(request, user_id):
    if not is_company_admin(request.user):
        return Response({'error': 'Admin access required'}, status=status.HTTP_403_FORBIDDEN)

    company_id = str(request.user.company_id) if request.user.company_id else None
    main_db = get_main_db()

    try:
        user = main_db['users'].find_one({'_id': ObjectId(user_id), 'company_id': company_id})
    except Exception:
        return Response({'error': 'Invalid user ID'}, status=status.HTTP_400_BAD_REQUEST)
    if not user:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(_serialize_tenant_user(user))

    elif request.method == 'PUT':
        allowed = ['first_name', 'last_name', 'phone', 'tenant_role_id', 'is_active']
        update = {k: v for k, v in request.data.items() if k in allowed}
        new_password = (request.data.get('password') or '').strip()
        if new_password:
            if len(new_password) < 8:
                return Response({'error': 'Password must be at least 8 characters'}, status=status.HTTP_400_BAD_REQUEST)
            from apps.auth_app.mongo_auth import hash_password as _hash
            update['password_hash'] = _hash(new_password)
        if update:
            main_db['users'].update_one({'_id': ObjectId(user_id)}, {'$set': update})
        return Response(_serialize_tenant_user(main_db['users'].find_one({'_id': ObjectId(user_id)})))

    elif request.method == 'DELETE':
        if user.get('role') == 'company_admin':
            return Response({'error': 'Cannot deactivate company admin'}, status=status.HTTP_403_FORBIDDEN)
        main_db['users'].update_one({'_id': ObjectId(user_id)}, {'$set': {'is_active': False}})
        return Response({'message': 'User deactivated successfully'})


# ─────────────────────────────────────────────
# MY PERMISSIONS
# ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_permissions(request):
    """Return effective permissions for the current user."""
    if request.user.role in ('super_admin', 'company_admin', 'developer'):
        return Response({'full_access': True, 'role_name': request.user.role, 'permissions': {}})

    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'full_access': False, 'permissions': {}})

    main_db = get_main_db()
    try:
        user_doc = main_db['users'].find_one({'_id': ObjectId(request.user.id)})
    except Exception:
        return Response({'full_access': False, 'permissions': {}})

    tenant_role_id = (user_doc or {}).get('tenant_role_id')
    if not tenant_role_id:
        return Response({'full_access': False, 'permissions': {}})

    tenant_db = get_tenant_db(db_name)
    try:
        role = tenant_db['roles'].find_one({'_id': ObjectId(tenant_role_id)})
    except Exception:
        return Response({'full_access': False, 'permissions': {}})

    if not role or not role.get('is_active', True):
        return Response({'full_access': False, 'permissions': {}})

    return Response({
        'full_access': False,
        'role_name':   role.get('name', ''),
        'permissions': role.get('permissions', {}),
    })

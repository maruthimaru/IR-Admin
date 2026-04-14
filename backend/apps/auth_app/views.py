"""
Authentication Views — MongoDB-backed, PyJWT tokens
"""
import datetime
import logging

from bson import ObjectId
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.utils.mongodb import get_main_db
from .mongo_auth import (
    MongoUser, generate_tokens, decode_token, blacklist_token,
    hash_password, check_password,
)

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────

def _user_response(user_doc: dict) -> dict:
    """Serialise a MongoDB user document for API responses."""
    return {
        'id':         str(user_doc['_id']),
        'email':      user_doc['email'],
        'first_name': user_doc.get('first_name', ''),
        'last_name':  user_doc.get('last_name', ''),
        'full_name':  f"{user_doc.get('first_name','')} {user_doc.get('last_name','')}".strip(),
        'role':       user_doc.get('role', 'end_user'),
        'company_id': user_doc.get('company_id'),
        'phone':      user_doc.get('phone'),
        'is_active':  user_doc.get('is_active', True),
        'date_joined': user_doc['date_joined'].isoformat() if user_doc.get('date_joined') else None,
        'last_login':  user_doc['last_login'].isoformat()  if user_doc.get('last_login')  else None,
    }


def _ensure_users_indexes(db):
    db['users'].create_index('email', unique=True, background=True)
    db['users'].create_index('role',  background=True)


# ── Register super admin (one-time) ──────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def register_super_admin(request):
    """
    One-time super admin setup.
    Locked permanently once any super_admin exists.
    """
    db = get_main_db()
    _ensure_users_indexes(db)

    if db['users'].find_one({'role': 'super_admin'}):
        return Response(
            {'error': 'Super admin already exists. Use login instead.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    required = ['email', 'password', 'first_name', 'last_name']
    missing = [f for f in required if not request.data.get(f, '').strip()]
    if missing:
        return Response(
            {'error': f'Missing required fields: {", ".join(missing)}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email    = request.data['email'].strip().lower()
    password = request.data['password']
    first    = request.data['first_name'].strip()
    last     = request.data['last_name'].strip()

    if db['users'].find_one({'email': email}):
        return Response(
            {'error': 'An account with this email already exists.'},
            status=status.HTTP_409_CONFLICT,
        )

    if len(password) < 8:
        return Response(
            {'error': 'Password must be at least 8 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = datetime.datetime.utcnow()
    user_doc = {
        'email':         email,
        'password_hash': hash_password(password),
        'first_name':    first,
        'last_name':     last,
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

    result   = db['users'].insert_one(user_doc)
    user_doc['_id'] = result.inserted_id
    tokens   = generate_tokens(user_doc)

    logger.info(f'Super admin registered: {email}')
    return Response({
        'message': 'Super admin account created successfully.',
        **tokens,
        'user': _user_response(user_doc),
    }, status=status.HTTP_201_CREATED)


# ── Login ─────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    email    = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')

    if not email or not password:
        return Response(
            {'error': 'Email and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    db = get_main_db()
    user_doc = db['users'].find_one({'email': email})

    if not user_doc or not check_password(password, user_doc.get('password_hash', '')):
        return Response(
            {'error': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user_doc.get('is_active', True):
        return Response(
            {'error': 'Account is deactivated. Please contact support.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    db['users'].update_one(
        {'_id': user_doc['_id']},
        {'$set': {'last_login': datetime.datetime.utcnow()}},
    )

    tokens = generate_tokens(user_doc)
    logger.info(f'User logged in: {email}')

    return Response({
        **tokens,
        'user': _user_response(user_doc),
    }, status=status.HTTP_200_OK)


# ── Register (company admin / developer creates end users) ────

@api_view(['POST'])
@permission_classes([AllowAny])
def register_view(request):
    db = get_main_db()
    _ensure_users_indexes(db)

    required = ['email', 'password', 'first_name', 'last_name']
    missing = [f for f in required if not request.data.get(f, '').strip()]
    if missing:
        return Response(
            {'error': f'Missing required fields: {", ".join(missing)}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email    = request.data['email'].strip().lower()
    password = request.data['password']
    role     = request.data.get('role', 'end_user')

    # Only end_user role allowed via public registration
    if role not in ('end_user',):
        role = 'end_user'

    if db['users'].find_one({'email': email}):
        return Response(
            {'error': 'An account with this email already exists.'},
            status=status.HTTP_409_CONFLICT,
        )

    if len(password) < 8:
        return Response(
            {'error': 'Password must be at least 8 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = datetime.datetime.utcnow()
    user_doc = {
        'email':         email,
        'password_hash': hash_password(password),
        'first_name':    request.data['first_name'].strip(),
        'last_name':     request.data['last_name'].strip(),
        'role':          role,
        'company_id':    request.data.get('company_id'),
        'phone':         request.data.get('phone'),
        'is_active':     True,
        'date_joined':   now,
        'last_login':    None,
        'metadata':      {},
    }

    result = db['users'].insert_one(user_doc)
    user_doc['_id'] = result.inserted_id
    tokens = generate_tokens(user_doc)

    logger.info(f'User registered: {email} role={role}')
    return Response({
        'message': 'Registration successful.',
        **tokens,
        'user': _user_response(user_doc),
    }, status=status.HTTP_201_CREATED)


# ── Logout ────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    refresh_token = request.data.get('refresh')
    if not refresh_token:
        return Response(
            {'error': 'Refresh token required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    blacklist_token(refresh_token)
    # Also blacklist the current access token
    access_token = request.META.get('HTTP_AUTHORIZATION', '').replace('Bearer ', '')
    if access_token:
        blacklist_token(access_token)

    logger.info(f'User logged out: {request.user.email}')
    return Response({'message': 'Logged out successfully.'})


# ── Token refresh ─────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def refresh_token_view(request):
    refresh = request.data.get('refresh', '')
    if not refresh:
        return Response({'error': 'Refresh token required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = decode_token(refresh)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_401_UNAUTHORIZED)

    if payload.get('type') != 'refresh':
        return Response({'error': 'Invalid token type.'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_main_db()
    try:
        user_doc = db['users'].find_one({'_id': ObjectId(payload['user_id'])})
    except Exception:
        return Response({'error': 'User not found.'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user_doc or not user_doc.get('is_active', True):
        return Response({'error': 'User not found or deactivated.'}, status=status.HTTP_401_UNAUTHORIZED)

    # Blacklist old refresh token, issue new pair
    blacklist_token(refresh)
    tokens = generate_tokens(user_doc)

    return Response(tokens)


# ── Verify token ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_token(request):
    """Used by frontend on every page load to validate session."""
    return Response({
        'valid': True,
        'user': request.user.to_dict(),
    })


# ── Profile ───────────────────────────────────────────────────

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    db = get_main_db()
    user_id = ObjectId(request.user.id)

    if request.method == 'GET':
        doc = db['users'].find_one({'_id': user_id})
        return Response(_user_response(doc))

    # PUT
    allowed = ['first_name', 'last_name', 'phone', 'metadata']
    update = {k: v for k, v in request.data.items() if k in allowed}
    if update:
        db['users'].update_one({'_id': user_id}, {'$set': update})
    doc = db['users'].find_one({'_id': user_id})
    return Response(_user_response(doc))


# ── Change password ───────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    current  = request.data.get('current_password', '')
    new_pass = request.data.get('new_password', '')

    if not current or not new_pass:
        return Response(
            {'error': 'current_password and new_password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_pass) < 8:
        return Response(
            {'error': 'Password must be at least 8 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    db = get_main_db()
    doc = db['users'].find_one({'_id': ObjectId(request.user.id)})

    if not check_password(current, doc.get('password_hash', '')):
        return Response(
            {'error': 'Current password is incorrect.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    db['users'].update_one(
        {'_id': ObjectId(request.user.id)},
        {'$set': {'password_hash': hash_password(new_pass)}},
    )
    logger.info(f'Password changed: {request.user.email}')
    return Response({'message': 'Password changed successfully.'})


# ── Tenant Login ─────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def tenant_login_view(request):
    """
    Login for company admins / end users scoped to a tenant subdomain.
    Validates that the user belongs to the specified company.
    """
    # Accept full hostname (e.g. "pandaprabha.localhost" or "pandaprabha.com")
    host     = request.data.get('subdomain', '').strip().lower()  # field kept as 'subdomain' for compat
    email    = request.data.get('email', '').strip().lower()
    password = request.data.get('password', '')

    if not host or not email or not password:
        return Response(
            {'error': 'host, email and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    db = get_main_db()

    # Resolve company: first try exact custom_domain match,
    # then fall back to subdomain match (first segment of host)
    company_doc = db['companies'].find_one({'custom_domain': host})
    if not company_doc:
        slug = host.split('.')[0]
        company_doc = db['companies'].find_one({'subdomain': slug})
    if not company_doc:
        return Response(
            {'error': 'Company not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not company_doc.get('is_active', True):
        return Response(
            {'error': 'This company account is deactivated. Please contact support.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Validate credentials
    user_doc = db['users'].find_one({'email': email})
    if not user_doc or not check_password(password, user_doc.get('password_hash', '')):
        return Response(
            {'error': 'Invalid email or password.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user_doc.get('is_active', True):
        return Response(
            {'error': 'Account is deactivated. Please contact support.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Verify user belongs to this company
    company_id = str(company_doc['_id'])
    if str(user_doc.get('company_id', '')) != company_id:
        return Response(
            {'error': 'You do not have access to this company.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Only company_admin / developer / end_user roles allowed here
    if user_doc.get('role') == 'super_admin':
        return Response(
            {'error': 'Super admins must use the main login.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    db['users'].update_one(
        {'_id': user_doc['_id']},
        {'$set': {'last_login': datetime.datetime.utcnow()}},
    )

    tokens = generate_tokens(user_doc)
    logger.info(f'Tenant login: {email} → {host}')

    # Serialise company for response
    company_out = {
        '_id':          company_id,
        'name':         company_doc['name'],
        'subdomain':    company_doc['subdomain'],
        'db_name':      company_doc.get('db_name', ''),
        'plan':         company_doc.get('plan', 'basic'),
        'is_active':    company_doc.get('is_active', True),
        'custom_domain': company_doc.get('custom_domain'),
        'settings':     company_doc.get('settings', {}),
        'created_at':   company_doc['created_at'].isoformat() if company_doc.get('created_at') else None,
    }

    return Response({
        **tokens,
        'user':    _user_response(user_doc),
        'company': company_out,
    }, status=status.HTTP_200_OK)


# ── Users list (super admin) ──────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def users_list(request):
    if request.user.role != 'super_admin':
        return Response(
            {'error': 'Super admin access required.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    db = get_main_db()
    page      = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    skip      = (page - 1) * page_size

    total = db['users'].count_documents({})
    docs  = list(db['users'].find({}, {'password_hash': 0})
                 .sort('date_joined', -1)
                 .skip(skip).limit(page_size))

    # Role counts
    pipeline = [{'$group': {'_id': '$role', 'count': {'$sum': 1}}}]
    role_counts = {r['_id']: r['count'] for r in db['users'].aggregate(pipeline)}

    return Response({
        'results':       [_user_response(d) for d in docs],
        'total':         total,
        'active_count':  db['users'].count_documents({'is_active': True}),
        'inactive_count': db['users'].count_documents({'is_active': False}),
        'role_counts':   role_counts,
        'page':          page,
        'page_size':     page_size,
    })

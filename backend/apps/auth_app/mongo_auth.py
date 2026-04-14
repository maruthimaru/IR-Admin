"""
MongoDB-based user model and JWT authentication for DRF.
Replaces Django ORM User + simplejwt entirely.
"""
import uuid
import datetime
import logging

import bcrypt
import jwt
from bson import ObjectId
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from apps.utils.mongodb import get_main_db

logger = logging.getLogger(__name__)

# ── JWT helpers ───────────────────────────────────────────────

def _jwt_settings():
    access_minutes  = getattr(settings, 'JWT_ACCESS_TOKEN_LIFETIME_MINUTES', 1440)
    refresh_days    = getattr(settings, 'JWT_REFRESH_TOKEN_LIFETIME_DAYS', 30)
    return access_minutes, refresh_days


def generate_tokens(user_doc: dict) -> dict:
    """Generate access + refresh JWT pair for a MongoDB user document."""
    access_minutes, refresh_days = _jwt_settings()
    now = datetime.datetime.utcnow()

    base_payload = {
        'user_id':    str(user_doc['_id']),
        'email':      user_doc['email'],
        'role':       user_doc['role'],
        'company_id': user_doc.get('company_id') or '',
        'full_name':  f"{user_doc.get('first_name','')} {user_doc.get('last_name','')}".strip(),
        'iat':        now,
    }

    access_payload = {
        **base_payload,
        'type': 'access',
        'exp':  now + datetime.timedelta(minutes=access_minutes),
        'jti':  str(uuid.uuid4()),
    }

    refresh_payload = {
        **base_payload,
        'type': 'refresh',
        'exp':  now + datetime.timedelta(days=refresh_days),
        'jti':  str(uuid.uuid4()),
    }

    secret = settings.SECRET_KEY
    access  = jwt.encode(access_payload,  secret, algorithm='HS256')
    refresh = jwt.encode(refresh_payload, secret, algorithm='HS256')

    return {'access': access, 'refresh': refresh}


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises AuthenticationFailed on any error."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        raise AuthenticationFailed('Token has expired.')
    except jwt.InvalidTokenError:
        raise AuthenticationFailed('Invalid token.')

    # Check blacklist
    db = get_main_db()
    if db['token_blacklist'].find_one({'jti': payload['jti']}):
        raise AuthenticationFailed('Token has been revoked.')

    return payload


def blacklist_token(token: str):
    """Add a token's JTI to the MongoDB blacklist with TTL expiry."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'],
                             options={'verify_exp': False})
        exp = datetime.datetime.utcfromtimestamp(payload['exp'])
        db = get_main_db()
        db['token_blacklist'].update_one(
            {'jti': payload['jti']},
            {'$set': {'jti': payload['jti'], 'expires_at': exp}},
            upsert=True,
        )
        # TTL index — auto-cleans expired blacklist entries
        db['token_blacklist'].create_index('expires_at', expireAfterSeconds=0, background=True)
    except Exception as e:
        logger.warning(f'blacklist_token error: {e}')


# ── MongoUser ────────────────────────────────────────────────

class MongoUser:
    """
    A non-ORM user object built from a MongoDB document.
    Satisfies DRF's authentication/permission checks.
    """
    is_anonymous    = False
    is_authenticated = True

    def __init__(self, doc: dict):
        self.id         = str(doc['_id'])
        self.email      = doc['email']
        self.first_name = doc.get('first_name', '')
        self.last_name  = doc.get('last_name', '')
        self.role       = doc.get('role', 'end_user')
        self.company_id = doc.get('company_id')
        self.phone      = doc.get('phone')
        self.is_active  = doc.get('is_active', True)
        self.date_joined = doc.get('date_joined')
        self.last_login  = doc.get('last_login')
        self.metadata    = doc.get('metadata', {})

    def get_full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()

    def to_dict(self) -> dict:
        return {
            'id':          self.id,
            'email':       self.email,
            'first_name':  self.first_name,
            'last_name':   self.last_name,
            'full_name':   self.get_full_name(),
            'role':        self.role,
            'company_id':  self.company_id,
            'phone':       self.phone,
            'is_active':   self.is_active,
            'date_joined': self.date_joined.isoformat() if self.date_joined else None,
            'last_login':  self.last_login.isoformat()  if self.last_login  else None,
        }

    # Properties used in core/views.py
    @property
    def is_super_admin(self): return self.role == 'super_admin'

    @property
    def is_company_admin(self): return self.role in ('company_admin', 'super_admin')

    @property
    def is_developer(self): return self.role in ('developer', 'company_admin', 'super_admin')


# ── DRF Authentication class ─────────────────────────────────

class MongoJWTAuthentication(BaseAuthentication):
    """
    Custom DRF authentication backend.
    Reads Bearer token → decodes JWT → fetches user from MongoDB.
    """

    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.startswith('Bearer '):
            return None

        token = header.split(' ', 1)[1].strip()
        payload = decode_token(token)

        if payload.get('type') != 'access':
            raise AuthenticationFailed('Invalid token type.')

        db = get_main_db()
        try:
            user_doc = db['users'].find_one({'_id': ObjectId(payload['user_id'])})
        except Exception:
            raise AuthenticationFailed('Invalid user ID in token.')

        if not user_doc:
            raise AuthenticationFailed('User not found.')

        if not user_doc.get('is_active', True):
            raise AuthenticationFailed('User account is deactivated.')

        # Update last_login asynchronously (non-blocking best-effort)
        try:
            db['users'].update_one(
                {'_id': user_doc['_id']},
                {'$set': {'last_login': datetime.datetime.utcnow()}}
            )
        except Exception:
            pass

        return (MongoUser(user_doc), token)

    def authenticate_header(self, request):
        return 'Bearer'


# ── Password helpers ─────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

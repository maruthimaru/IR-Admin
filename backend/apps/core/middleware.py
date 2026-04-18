"""
Tenant Middleware - Resolves subdomain to company/database
Extracts subdomain from request and maps to correct MongoDB database
"""
import logging
from django.conf import settings
from apps.utils.mongodb import get_main_db

logger = logging.getLogger(__name__)


class TenantMiddleware:
    """
    Middleware to identify tenant from subdomain.

    Flow:
    1. Extract subdomain from request HOST header
    2. Look up company in main database
    3. Attach company info and db_name to request
    4. All subsequent views use request.tenant_db_name
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self.base_domain = getattr(settings, 'BASE_DOMAIN', 'yourapp.com')
        # Paths that don't require tenant resolution
        self.exempt_paths = [
            '/django-admin/',
            '/api/v1/auth/login/',
            '/api/v1/auth/register/',
            '/api/v1/auth/refresh/',
            '/api/v1/core/companies/',  # Super admin company management
            '/api/v1/core/health/',
        ]

    def __call__(self, request):
        # Extract and resolve tenant
        self._resolve_tenant(request)
        response = self.get_response(request)
        return response

    def _resolve_tenant(self, request):
        """Extract subdomain and resolve to tenant database."""
        host = request.get_host().lower()

        # Remove port if present
        if ':' in host:
            host = host.split(':')[0]

        request.tenant = None
        request.tenant_db_name = None

        # Check if it's a subdomain request
        subdomain = self._extract_subdomain(host)

        if subdomain and subdomain not in ['www', 'api', 'admin']:
            try:
                db = get_main_db()
                company = db['companies'].find_one(
                    {'subdomain': subdomain, 'is_active': True}
                )
                if company:
                    request.tenant = company
                    request.tenant_db_name = company.get('db_name')
                    logger.debug(f"Tenant resolved: {subdomain} → {company.get('db_name')}")
                else:
                    logger.warning(f"No active company found for subdomain: {subdomain}")
            except Exception as e:
                logger.error(f"Error resolving tenant for {subdomain}: {e}")

    def _extract_subdomain(self, host: str) -> str:
        """Extract subdomain from host."""
        base = self.base_domain.lower()
        if host == base or host == f'www.{base}':
            return None
        if host.endswith(f'.{base}'):
            subdomain = host[: -(len(base) + 1)]
            return subdomain
        # For localhost development
        if 'localhost' in host or '127.0.0.1' in host:
            return None
        return None


def get_tenant_db_name(request) -> str:
    """
    Get tenant db name from request.
    Priority: middleware-resolved (subdomain) → X-Tenant header (dev / direct API).
    """
    if getattr(request, 'tenant_db_name', None):
        return request.tenant_db_name

    # Support explicit header for local dev where subdomain routing isn't active
    tenant_header = request.META.get('HTTP_X_TENANT', '').strip().lower()
    if tenant_header:
        try:
            from apps.utils.mongodb import get_main_db
            db = get_main_db()
            company = db['companies'].find_one(
                {'subdomain': tenant_header, 'is_active': True}
            )
            if company:
                return company.get('db_name')
        except Exception:
            pass

    return None


def require_tenant(view_func):
    """Decorator to enforce tenant context on views."""
    from functools import wraps
    from rest_framework.response import Response
    from rest_framework import status

    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not getattr(request, 'tenant_db_name', None):
            return Response(
                {'error': 'Tenant not found. Please use your company subdomain.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return view_func(request, *args, **kwargs)
    return wrapper

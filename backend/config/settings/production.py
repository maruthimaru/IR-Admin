"""
Production Settings
"""
from .base import *

DEBUG = False

# Security headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# SSL redirect is handled by the reverse proxy (nginx/load balancer), not Django
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False  # Set to True only when HTTPS is configured
CSRF_COOKIE_SECURE = False     # Set to True only when HTTPS is configured

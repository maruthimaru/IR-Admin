"""
Company Integration Settings API
Allows company admins to configure their own payment, SMS, and email credentials.
These views are the control panel for enabling/disabling and storing per-company keys.
"""
import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.integrations.company_credentials import CompanyCredentials

logger = logging.getLogger(__name__)


def _get_company_id(request) -> str | None:
    """Extract company_id from the authenticated user."""
    user = request.user
    # Super admin can pass ?company_id=xxx to manage any company
    if user.role == 'super_admin' and request.GET.get('company_id'):
        return request.GET.get('company_id')
    # For tenant users, use their own company_id
    return user.company_id


def _require_company_admin(request):
    """Check caller is at least a company admin."""
    return request.user.role in ('super_admin', 'company_admin')


# ── Overview ────────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def integration_overview(request):
    """
    GET /api/v1/integrations/settings/
    Returns configured status of all integrations for the company (masked credentials).
    """
    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found for this user'}, status=400)

    creds = CompanyCredentials(company_id)
    overview = creds.get_all_providers(decrypt=False)

    return Response({
        'company_id': company_id,
        'integrations': overview,
        'available_providers': {
            'payment': ['stripe', 'razorpay'],
            'sms': ['twilio'],
            'email': ['sendgrid', 'smtp'],
        }
    })


# ── Payment Gateway ──────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def payment_settings(request):
    """
    GET  — Get current payment gateway config (masked)
    POST — Save Stripe or Razorpay credentials

    POST body examples:

    Stripe:
    {
        "provider": "stripe",
        "enabled": true,
        "credentials": {
            "secret_key": "sk_live_...",
            "publishable_key": "pk_live_...",
            "webhook_secret": "whsec_..."
        }
    }

    Razorpay:
    {
        "provider": "razorpay",
        "enabled": true,
        "credentials": {
            "key_id": "rzp_live_...",
            "key_secret": "...",
            "webhook_secret": "..."
        }
    }
    """
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found'}, status=400)

    creds = CompanyCredentials(company_id)

    if request.method == 'GET':
        stripe_data = creds.get_provider('stripe', decrypt=False)
        razorpay_data = creds.get_provider('razorpay', decrypt=False)
        return Response({
            'stripe': stripe_data or {'enabled': False, 'configured': False, 'credentials': {}},
            'razorpay': razorpay_data or {'enabled': False, 'configured': False, 'credentials': {}},
        })

    # POST — save credentials
    provider = request.data.get('provider', '').lower()
    if provider not in ('stripe', 'razorpay'):
        return Response({'error': 'provider must be "stripe" or "razorpay"'}, status=400)

    credentials = request.data.get('credentials', {})
    enabled = request.data.get('enabled', True)

    # Validate required fields
    if provider == 'stripe':
        if not credentials.get('secret_key'):
            return Response({'error': 'Stripe secret_key is required'}, status=400)
        if not credentials.get('publishable_key'):
            return Response({'error': 'Stripe publishable_key is required'}, status=400)

    elif provider == 'razorpay':
        if not credentials.get('key_id') or not credentials.get('key_secret'):
            return Response({'error': 'Razorpay key_id and key_secret are required'}, status=400)

    # Test the credentials before saving
    test_result = _test_payment_credentials(provider, credentials)
    if not test_result['valid']:
        return Response({
            'error': f'Invalid {provider} credentials: {test_result["message"]}',
            'hint': test_result.get('hint', '')
        }, status=400)

    result = creds.save_provider(provider, credentials, enabled=enabled)
    logger.info(f"Payment gateway {provider} saved for company {company_id}")

    return Response({
        'message': f'{provider.title()} payment gateway configured successfully!',
        'provider': provider,
        'enabled': enabled,
    }, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_payment(request):
    """Toggle payment gateway on/off without changing credentials."""
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    provider = request.data.get('provider', '').lower()
    enabled = request.data.get('enabled', False)

    if provider not in ('stripe', 'razorpay'):
        return Response({'error': 'Invalid provider'}, status=400)

    creds = CompanyCredentials(company_id)
    result = creds.toggle_provider(provider, enabled)
    return Response({'message': f'{provider} {"enabled" if enabled else "disabled"}', **result})


# ── Cash on Delivery (COD) ───────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def cod_settings(request):
    """
    GET  — Get COD settings
    POST — Save COD settings
    {
        "enabled": true,
        "settings": {
            "instructions": "Pay cash to the delivery agent.",
            "max_order_amount": 5000
        }
    }
    """
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found'}, status=400)

    creds = CompanyCredentials(company_id)

    if request.method == 'GET':
        data = creds.get_provider('cod', decrypt=False)
        return Response(data or {'enabled': False, 'configured': False, 'credentials': {}})

    enabled = bool(request.data.get('enabled', True))
    settings = request.data.get('settings') or {}
    if not isinstance(settings, dict):
        settings = {}

    try:
        creds.save_provider('cod', settings, enabled=enabled)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)
    except Exception as e:
        logger.exception(f"Failed to save COD settings for company {company_id}")
        return Response({'error': f'Database error: {str(e)}'}, status=500)

    return Response({'message': 'COD settings saved successfully', 'enabled': enabled}, status=201)


# ── SMS (Twilio) ─────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def sms_settings(request):
    """
    GET  — Get current Twilio config (masked)
    POST — Save Twilio credentials

    POST body:
    {
        "enabled": true,
        "credentials": {
            "account_sid": "ACxxxxxx",
            "auth_token": "xxxxxxxx",
            "phone_number": "+14155552671"
        }
    }
    """
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found'}, status=400)

    creds = CompanyCredentials(company_id)

    if request.method == 'GET':
        data = creds.get_provider('twilio', decrypt=False)
        return Response(data or {'enabled': False, 'configured': False, 'credentials': {}})

    credentials = request.data.get('credentials', {})
    enabled = request.data.get('enabled', True)

    required = ['account_sid', 'auth_token', 'phone_number']
    missing = [f for f in required if not credentials.get(f)]
    if missing:
        return Response({'error': f'Missing required fields: {", ".join(missing)}'}, status=400)

    # Test credentials
    test_result = _test_twilio_credentials(credentials)
    if not test_result['valid']:
        return Response({'error': f'Invalid Twilio credentials: {test_result["message"]}'}, status=400)

    creds.save_provider('twilio', credentials, enabled=enabled)
    return Response({'message': 'SMS (Twilio) configured successfully!', 'enabled': enabled}, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_sms(request):
    """Send a test SMS to verify Twilio is working."""
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    to_number = request.data.get('to_number')
    if not to_number:
        return Response({'error': 'to_number is required'}, status=400)

    creds = CompanyCredentials(company_id)
    sms_service = creds.get_sms_service()
    if not sms_service:
        return Response({'error': 'SMS not configured. Please save Twilio credentials first.'}, status=400)

    result = sms_service.send_sms(to_number, 'Test SMS from Dynamic Admin Panel ✓')
    return Response(result)


# ── Email ────────────────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def email_settings(request):
    """
    GET  — Get current email config (masked)
    POST — Save SendGrid or SMTP credentials

    SendGrid:
    {
        "provider": "sendgrid",
        "enabled": true,
        "credentials": {
            "api_key": "SG.xxxx",
            "from_email": "hello@company.com"
        }
    }

    SMTP:
    {
        "provider": "smtp",
        "enabled": true,
        "credentials": {
            "host": "smtp.gmail.com",
            "port": 587,
            "username": "you@gmail.com",
            "password": "app-password"
        }
    }
    """
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found'}, status=400)

    creds = CompanyCredentials(company_id)

    if request.method == 'GET':
        sendgrid = creds.get_provider('sendgrid', decrypt=False)
        smtp = creds.get_provider('smtp', decrypt=False)
        return Response({
            'sendgrid': sendgrid or {'enabled': False, 'configured': False, 'credentials': {}},
            'smtp': smtp or {'enabled': False, 'configured': False, 'credentials': {}},
        })

    provider = request.data.get('provider', '').lower()
    if provider not in ('sendgrid', 'smtp'):
        return Response({'error': 'provider must be "sendgrid" or "smtp"'}, status=400)

    credentials = request.data.get('credentials', {})
    enabled = request.data.get('enabled', True)

    if provider == 'sendgrid' and not credentials.get('api_key'):
        return Response({'error': 'SendGrid api_key is required'}, status=400)

    if provider == 'smtp':
        required = ['host', 'port', 'username', 'password']
        missing = [f for f in required if not credentials.get(f)]
        if missing:
            return Response({'error': f'Missing required fields: {", ".join(missing)}'}, status=400)

    creds.save_provider(provider, credentials, enabled=enabled)
    return Response({'message': f'Email ({provider}) configured successfully!', 'enabled': enabled}, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_email(request):
    """Send a test email to verify configuration is working."""
    if not _require_company_admin(request):
        return Response({'error': 'Company admin access required'}, status=403)

    company_id = _get_company_id(request)
    to_email = request.data.get('to_email') or request.user.email

    creds = CompanyCredentials(company_id)
    email_service = creds.get_email_service()
    if not email_service:
        return Response({'error': 'Email not configured. Please save email credentials first.'}, status=400)

    result = email_service.send_email(
        to_email,
        subject='Test Email from Dynamic Admin Panel ✓',
        html_content='<p>Your email configuration is working correctly! 🎉</p>',
    )
    return Response(result)


# ── Runtime Integration Endpoints (using company credentials) ────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment(request):
    """
    Create a payment using the company's configured gateway (Stripe or Razorpay).
    Body: { "amount": 100.00, "currency": "USD", "description": "..." }
    """
    company_id = _get_company_id(request)
    if not company_id:
        return Response({'error': 'Company not found'}, status=400)

    amount = request.data.get('amount')
    if not amount:
        return Response({'error': 'amount is required'}, status=400)

    creds = CompanyCredentials(company_id)
    payment_service = creds.get_payment_service()

    if not payment_service:
        return Response({
            'error': 'No payment gateway configured.',
            'hint': 'Go to Company Settings → Integrations → Payment to set up Stripe or Razorpay.'
        }, status=400)

    try:
        from apps.integrations.payment import StripePaymentService, RazorpayPaymentService
        currency = request.data.get('currency', 'USD')

        if isinstance(payment_service, StripePaymentService):
            result = payment_service.create_payment_intent(
                amount=float(amount),
                currency=currency,
                metadata={'user_id': str(request.user.id), 'company_id': company_id},
            )
        else:
            # Razorpay
            result = payment_service.create_payment_order(
                amount=float(amount),
                currency=currency,
                receipt=request.data.get('receipt', ''),
            )
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_sms_message(request):
    """Send an SMS using the company's Twilio config."""
    company_id = _get_company_id(request)
    to_number = request.data.get('to_number')
    message = request.data.get('message')

    if not to_number or not message:
        return Response({'error': 'to_number and message are required'}, status=400)

    creds = CompanyCredentials(company_id)
    sms_service = creds.get_sms_service()
    if not sms_service:
        return Response({
            'error': 'SMS not configured.',
            'hint': 'Go to Company Settings → Integrations → SMS to set up Twilio.'
        }, status=400)

    return Response(sms_service.send_sms(to_number, message))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_email_message(request):
    """Send an email using the company's configured email service."""
    company_id = _get_company_id(request)
    to_email = request.data.get('to_email')
    subject = request.data.get('subject')
    html_content = request.data.get('html_content')

    if not all([to_email, subject, html_content]):
        return Response({'error': 'to_email, subject, html_content are required'}, status=400)

    creds = CompanyCredentials(company_id)
    email_service = creds.get_email_service()
    if not email_service:
        return Response({
            'error': 'Email not configured.',
            'hint': 'Go to Company Settings → Integrations → Email.'
        }, status=400)

    return Response(email_service.send_email(to_email, subject, html_content))


# ── Credential validation helpers ────────────────────────────────────────────

def _test_payment_credentials(provider: str, credentials: dict) -> dict:
    """Quickly validate credentials without saving."""
    try:
        if provider == 'stripe':
            import stripe
            stripe.api_key = credentials['secret_key']
            # A lightweight call that doesn't charge anything
            stripe.Balance.retrieve()
            return {'valid': True, 'message': 'Connected successfully'}
        elif provider == 'razorpay':
            import razorpay
            client = razorpay.Client(auth=(credentials['key_id'], credentials['key_secret']))
            # Fetch account details as validation
            client.account.fetch()
            return {'valid': True, 'message': 'Connected successfully'}
    except Exception as e:
        error_msg = str(e)
        if 'Authentication' in error_msg or 'Invalid API Key' in error_msg or 'Unauthorized' in error_msg:
            return {'valid': False, 'message': 'Invalid API key', 'hint': 'Double-check your secret key in the Stripe/Razorpay dashboard'}
        # For test mode or network issues, accept anyway
        if 'No such' in error_msg or 'test' in error_msg.lower():
            return {'valid': True, 'message': 'Test mode key accepted'}
        return {'valid': False, 'message': error_msg}

    return {'valid': False, 'message': 'Could not validate credentials'}


def _test_twilio_credentials(credentials: dict) -> dict:
    """Validate Twilio credentials."""
    try:
        from twilio.rest import Client
        client = Client(credentials['account_sid'], credentials['auth_token'])
        # Fetch account info as validation
        account = client.api.accounts(credentials['account_sid']).fetch()
        return {'valid': True, 'message': f'Connected: {account.friendly_name}'}
    except Exception as e:
        error_msg = str(e)
        if '20003' in error_msg or 'authenticate' in error_msg.lower():
            return {'valid': False, 'message': 'Invalid Account SID or Auth Token'}
        return {'valid': False, 'message': error_msg}

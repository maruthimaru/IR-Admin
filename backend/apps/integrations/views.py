"""
Integration API Views - Payment, Email, SMS endpoints
"""
import logging
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from .payment import payment_service
from .email_service import email_service
from .sms_service import sms_service

logger = logging.getLogger(__name__)


# ── PAYMENT ENDPOINTS ──────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_payment_intent(request):
    """Create a Stripe payment intent."""
    amount = request.data.get('amount')
    currency = request.data.get('currency', 'usd')

    if not amount:
        return Response({'error': 'Amount is required'}, status=400)

    try:
        result = payment_service.create_payment_intent(
            amount=float(amount),
            currency=currency,
            metadata={
                'user_id': str(request.user.id),
                'company_id': request.user.company_id or '',
            }
        )
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_payment(request):
    """Confirm payment status."""
    payment_intent_id = request.data.get('payment_intent_id')
    if not payment_intent_id:
        return Response({'error': 'payment_intent_id required'}, status=400)

    try:
        result = payment_service.confirm_payment(payment_intent_id)
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([AllowAny])
def stripe_webhook(request):
    """Handle Stripe webhook events."""
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

    try:
        event = payment_service.construct_webhook_event(payload, sig_header)
        result = payment_service.handle_webhook(event)
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_refund(request):
    """Process a refund."""
    payment_intent_id = request.data.get('payment_intent_id')
    amount = request.data.get('amount')  # Optional partial refund

    if not payment_intent_id:
        return Response({'error': 'payment_intent_id required'}, status=400)

    try:
        result = payment_service.create_refund(
            payment_intent_id=payment_intent_id,
            amount=float(amount) if amount else None,
        )
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=400)


# ── EMAIL ENDPOINTS ──────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_email(request):
    """Send a custom email."""
    to_email = request.data.get('to_email')
    subject = request.data.get('subject')
    html_content = request.data.get('html_content')

    if not all([to_email, subject, html_content]):
        return Response({'error': 'to_email, subject, and html_content are required'}, status=400)

    result = email_service.send_email(to_email, subject, html_content)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_otp_email(request):
    """Send OTP verification email."""
    to_email = request.data.get('email')
    user_name = request.data.get('name', 'User')
    otp = request.data.get('otp')  # If provided, else auto-generate

    if not to_email:
        return Response({'error': 'email is required'}, status=400)

    import random, string
    if not otp:
        otp = ''.join(random.choices(string.digits, k=6))

    result = email_service.send_otp_email(to_email, user_name, otp)

    # Return success but not the OTP (security - store it server-side)
    return Response({
        'success': result.get('success'),
        'message': 'OTP sent successfully' if result.get('success') else 'Failed to send OTP',
    })


# ── SMS ENDPOINTS ──────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_sms(request):
    """Send an SMS message."""
    phone_number = request.data.get('phone_number')
    message = request.data.get('message')

    if not all([phone_number, message]):
        return Response({'error': 'phone_number and message are required'}, status=400)

    result = sms_service.send_sms(phone_number, message)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_otp_sms(request):
    """Send OTP via SMS."""
    phone_number = request.data.get('phone_number')
    user_id = str(request.user.id)

    if not phone_number:
        return Response({'error': 'phone_number is required'}, status=400)

    result = sms_service.send_otp(phone_number)

    if result.get('success'):
        # Store OTP in cache with user_id key (use Redis in production)
        otp = result.pop('otp')
        # In production: cache.set(f"otp:{user_id}", otp, timeout=600)
        return Response({'success': True, 'message': 'OTP sent successfully'})

    return Response({'success': False, 'error': result.get('error')}, status=400)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def integration_status(request):
    """Check status of all integrations."""
    status_checks = {
        'stripe': bool(settings.STRIPE_SECRET_KEY),
        'sendgrid': bool(settings.SENDGRID_API_KEY),
        'twilio': bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
    }

    return Response({
        'integrations': status_checks,
        'all_configured': all(status_checks.values()),
    })

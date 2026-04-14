"""
SMS Service — Twilio
Credentials are supplied per-company (not from env vars).
"""
import logging
import random
import string
import hmac

logger = logging.getLogger(__name__)


class SMSService:
    """
    SMS service using Twilio, initialized with company-specific credentials.
    """

    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_number = from_number
        self._client = None

    @property
    def client(self):
        if not self._client:
            try:
                from twilio.rest import Client
                self._client = Client(self.account_sid, self.auth_token)
            except ImportError:
                raise ImportError("Install twilio: pip install twilio")
        return self._client

    def send_sms(self, to_number: str, message: str) -> dict:
        """Send an SMS. to_number must be in E.164 format (+1234567890)."""
        try:
            if not to_number.startswith('+'):
                to_number = f'+{to_number}'
            msg = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_number,
            )
            logger.info(f"SMS sent to {to_number}: {msg.sid}")
            return {'success': True, 'message_sid': msg.sid, 'status': msg.status}
        except Exception as e:
            logger.error(f"Twilio SMS error: {e}")
            return {'success': False, 'error': str(e)}

    def send_otp(self, phone_number: str, expiry_minutes: int = 10) -> dict:
        """Generate and send a 6-digit OTP."""
        otp = ''.join(random.choices(string.digits, k=6))
        message = (
            f"Your verification code is: {otp}\n"
            f"Expires in {expiry_minutes} minutes. Do not share."
        )
        result = self.send_sms(phone_number, message)
        if result.get('success'):
            result['otp'] = otp  # Caller must store this securely (cache/DB)
        return result

    def send_welcome_sms(self, phone_number: str, user_name: str,
                          app_url: str = '') -> dict:
        message = f"Welcome, {user_name}! Your account is ready. {app_url}".strip()
        return self.send_sms(phone_number, message)

    def send_payment_notification(self, phone_number: str, amount: float,
                                   currency: str = 'USD', invoice_number: str = None) -> dict:
        inv = f" (Invoice #{invoice_number})" if invoice_number else ""
        message = f"Payment Confirmed{inv}: {currency} {amount:.2f} received. Thank you!"
        return self.send_sms(phone_number, message)

    def verify_otp(self, stored_otp: str, provided_otp: str) -> bool:
        """Constant-time OTP comparison."""
        return hmac.compare_digest(str(stored_otp), str(provided_otp))

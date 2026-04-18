"""
Company Credentials Manager
Loads, stores, and decrypts per-company integration credentials from MongoDB.

Architecture:
  Each company stores its own keys in the main DB under companies.integrations.
  Keys are encrypted at rest using Fernet (AES-128).
  Services (Stripe, Twilio, SendGrid) are instantiated on-demand using these keys.
"""
import logging
from typing import Optional
from bson import ObjectId
from apps.utils.mongodb import get_main_db
from apps.utils.encryption import encrypt_dict, decrypt_dict, mask_value

logger = logging.getLogger(__name__)

# ── Key lists per provider ─────────────────────────────────────────────────────

STRIPE_KEYS      = ['secret_key', 'publishable_key', 'webhook_secret']
RAZORPAY_KEYS    = ['key_id', 'key_secret', 'webhook_secret']
TWILIO_KEYS      = ['account_sid', 'auth_token', 'phone_number']
SENDGRID_KEYS    = ['api_key']
SMTP_KEYS        = ['host', 'port', 'username', 'password']

PROVIDER_ENCRYPT_KEYS = {
    'stripe':    STRIPE_KEYS,
    'razorpay':  RAZORPAY_KEYS,
    'twilio':    TWILIO_KEYS,
    'sendgrid':  SENDGRID_KEYS,
    'smtp':      SMTP_KEYS,
    'cod':       [],   # no sensitive fields
}


class CompanyCredentials:
    """
    Manages integration credentials for a specific company.
    Credentials are stored encrypted in MongoDB and decrypted on retrieval.
    """

    def __init__(self, company_id: str):
        self.company_id = company_id
        self._db = get_main_db()

    def _get_company(self) -> Optional[dict]:
        try:
            return self._db['companies'].find_one(self._company_oid())
        except Exception:
            return None

    # ── Save / Update ──────────────────────────────────────────────────────────

    def _company_oid(self):
        """Return a query filter for this company, handling both ObjectId and string IDs."""
        try:
            return {'_id': ObjectId(self.company_id)}
        except Exception:
            return {'_id': self.company_id}

    def save_provider(self, provider: str, credentials: dict, enabled: bool = True) -> dict:
        """
        Save (and encrypt) credentials for a provider.
        provider: 'stripe' | 'razorpay' | 'twilio' | 'sendgrid' | 'smtp' | 'cod'
        """
        encrypt_keys = PROVIDER_ENCRYPT_KEYS.get(provider, [])
        encrypted = encrypt_dict(credentials, encrypt_keys)

        update = {
            f'integrations.{provider}': {
                'enabled': enabled,
                'credentials': encrypted,
            }
        }

        result = self._db['companies'].update_one(
            self._company_oid(),
            {'$set': update}
        )
        if result.matched_count == 0:
            raise ValueError(f"Company {self.company_id} not found in database")
        logger.info(f"Saved {provider} credentials for company {self.company_id}")
        return {'success': True, 'provider': provider, 'enabled': enabled}

    def toggle_provider(self, provider: str, enabled: bool) -> dict:
        """Enable or disable a provider without changing its credentials."""
        self._db['companies'].update_one(
            self._company_oid(),
            {'$set': {f'integrations.{provider}.enabled': enabled}}
        )
        return {'success': True, 'provider': provider, 'enabled': enabled}

    # ── Retrieve ───────────────────────────────────────────────────────────────

    def get_provider(self, provider: str, decrypt: bool = True) -> Optional[dict]:
        """
        Get credentials for a provider.
        Returns None if not configured or not enabled.
        Set decrypt=False to get masked values for the settings UI.
        """
        company = self._get_company()
        if not company:
            return None

        integrations = company.get('integrations', {})
        provider_data = integrations.get(provider)

        if not provider_data:
            return None

        raw_creds = provider_data.get('credentials', {})
        result = {
            'enabled': provider_data.get('enabled', False),
            'configured': bool(raw_creds) or provider_data.get('enabled', False),
            'credentials': {},
        }

        if decrypt:
            encrypt_keys = PROVIDER_ENCRYPT_KEYS.get(provider, [])
            try:
                result['credentials'] = decrypt_dict(raw_creds, encrypt_keys)
            except ValueError as e:
                logger.error(f"Failed to decrypt {provider} for company {self.company_id}: {e}")
                return None
        else:
            # Return masked values for display
            encrypt_keys = PROVIDER_ENCRYPT_KEYS.get(provider, [])
            masked = {}
            for k, v in raw_creds.items():
                masked[k] = mask_value(str(v)) if k in encrypt_keys and v else v
            result['credentials'] = masked

        return result

    def get_all_providers(self, decrypt: bool = False) -> dict:
        """Get status of all configured integrations (masked, for settings UI)."""
        company = self._get_company()
        if not company:
            return {}

        integrations = company.get('integrations', {})
        result = {}

        for provider in ['stripe', 'razorpay', 'cod', 'twilio', 'sendgrid', 'smtp']:
            pdata = integrations.get(provider)
            if pdata:
                result[provider] = {
                    'enabled': pdata.get('enabled', False),
                    'configured': bool(pdata.get('credentials')),
                    'credentials': self.get_provider(provider, decrypt=False)['credentials']
                    if not decrypt else {}
                }
            else:
                result[provider] = {'enabled': False, 'configured': False, 'credentials': {}}

        return result

    def is_enabled(self, provider: str) -> bool:
        """Quick check: is this provider enabled for the company?"""
        data = self.get_provider(provider, decrypt=False)
        return bool(data and data.get('enabled'))

    # ── Service Factory ────────────────────────────────────────────────────────

    def get_payment_service(self):
        """
        Returns an initialized payment service for this company.
        Tries Stripe first, then Razorpay.
        Returns None if no payment gateway is configured.
        """
        from apps.integrations.payment import StripePaymentService, RazorpayPaymentService

        stripe_data = self.get_provider('stripe')
        if stripe_data and stripe_data['enabled'] and stripe_data['credentials'].get('secret_key'):
            return StripePaymentService(
                secret_key=stripe_data['credentials']['secret_key'],
                publishable_key=stripe_data['credentials'].get('publishable_key', ''),
                webhook_secret=stripe_data['credentials'].get('webhook_secret', ''),
            )

        razorpay_data = self.get_provider('razorpay')
        if razorpay_data and razorpay_data['enabled'] and razorpay_data['credentials'].get('key_id'):
            return RazorpayPaymentService(
                key_id=razorpay_data['credentials']['key_id'],
                key_secret=razorpay_data['credentials']['key_secret'],
                webhook_secret=razorpay_data['credentials'].get('webhook_secret', ''),
            )

        return None

    def get_sms_service(self):
        """Returns an initialized SMS service (Twilio) or None."""
        from apps.integrations.sms_service import SMSService

        twilio_data = self.get_provider('twilio')
        if twilio_data and twilio_data['enabled'] and twilio_data['credentials'].get('account_sid'):
            creds = twilio_data['credentials']
            return SMSService(
                account_sid=creds['account_sid'],
                auth_token=creds['auth_token'],
                from_number=creds['phone_number'],
            )
        return None

    def get_email_service(self):
        """Returns an initialized email service or None."""
        from apps.integrations.email_service import EmailService

        sendgrid_data = self.get_provider('sendgrid')
        if sendgrid_data and sendgrid_data['enabled'] and sendgrid_data['credentials'].get('api_key'):
            return EmailService(
                provider='sendgrid',
                api_key=sendgrid_data['credentials']['api_key'],
            )

        smtp_data = self.get_provider('smtp')
        if smtp_data and smtp_data['enabled']:
            creds = smtp_data['credentials']
            return EmailService(
                provider='smtp',
                smtp_host=creds.get('host', ''),
                smtp_port=int(creds.get('port', 587)),
                smtp_user=creds.get('username', ''),
                smtp_pass=creds.get('password', ''),
            )

        return None

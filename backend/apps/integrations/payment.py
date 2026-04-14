"""
Payment Gateway Services
Supports Stripe and Razorpay — credentials supplied per-company (not from env vars).
"""
import logging

logger = logging.getLogger(__name__)


class StripePaymentService:
    """
    Stripe payment service initialized with company-specific credentials.
    Each company provides their own Stripe keys in Company Settings.
    """

    def __init__(self, secret_key: str, publishable_key: str = '', webhook_secret: str = ''):
        import stripe
        self._stripe = stripe
        self._stripe.api_key = secret_key
        self.publishable_key = publishable_key
        self.webhook_secret = webhook_secret

    def create_payment_intent(self, amount: float, currency: str = 'usd',
                               metadata: dict = None) -> dict:
        """Create a payment intent. Amount in major unit (e.g. 10.50 for $10.50)."""
        try:
            amount_cents = int(round(amount * 100))
            intent = self._stripe.PaymentIntent.create(
                amount=amount_cents,
                currency=currency.lower(),
                metadata=metadata or {},
                automatic_payment_methods={'enabled': True},
            )
            return {
                'provider': 'stripe',
                'client_secret': intent.client_secret,
                'payment_intent_id': intent.id,
                'publishable_key': self.publishable_key,
                'amount': amount,
                'currency': currency.upper(),
                'status': intent.status,
            }
        except self._stripe.error.StripeError as e:
            logger.error(f"Stripe error: {e}")
            raise ValueError(f"Payment error: {e.user_message}")

    def confirm_payment(self, payment_intent_id: str) -> dict:
        try:
            intent = self._stripe.PaymentIntent.retrieve(payment_intent_id)
            return {
                'provider': 'stripe',
                'payment_id': intent.id,
                'status': intent.status,
                'amount': intent.amount / 100,
                'currency': intent.currency.upper(),
                'succeeded': intent.status == 'succeeded',
            }
        except self._stripe.error.StripeError as e:
            raise ValueError(str(e))

    def create_customer(self, email: str, name: str, metadata: dict = None) -> str:
        try:
            customer = self._stripe.Customer.create(
                email=email, name=name, metadata=metadata or {}
            )
            return customer.id
        except self._stripe.error.StripeError as e:
            raise ValueError(str(e))

    def create_refund(self, payment_intent_id: str, amount: float = None,
                       reason: str = 'requested_by_customer') -> dict:
        try:
            params = {'payment_intent': payment_intent_id, 'reason': reason}
            if amount:
                params['amount'] = int(round(amount * 100))
            refund = self._stripe.Refund.create(**params)
            return {
                'provider': 'stripe',
                'refund_id': refund.id,
                'status': refund.status,
                'amount': refund.amount / 100,
            }
        except self._stripe.error.StripeError as e:
            raise ValueError(str(e))

    def construct_webhook_event(self, payload: bytes, sig_header: str):
        try:
            return self._stripe.Webhook.construct_event(
                payload, sig_header, self.webhook_secret
            )
        except self._stripe.error.SignatureVerificationError:
            raise ValueError("Invalid webhook signature")

    def handle_webhook_event(self, event) -> dict:
        event_type = event['type']
        logger.info(f"Stripe webhook received: {event_type}")
        return {'handled': True, 'event_type': event_type, 'provider': 'stripe'}


class RazorpayPaymentService:
    """
    Razorpay payment service initialized with company-specific credentials.
    Popular for Indian market / INR payments.
    """

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str = ''):
        try:
            import razorpay
            self._client = razorpay.Client(auth=(key_id, key_secret))
        except ImportError:
            raise ImportError("Install razorpay: pip install razorpay")
        self.key_id = key_id
        self.webhook_secret = webhook_secret

    def create_payment_order(self, amount: float, currency: str = 'INR',
                              receipt: str = None, notes: dict = None) -> dict:
        """
        Create a Razorpay order. Amount in major unit (e.g. 100.00 for ₹100).
        Razorpay uses paise (1 INR = 100 paise).
        """
        try:
            amount_paise = int(round(amount * 100))
            order = self._client.order.create({
                'amount': amount_paise,
                'currency': currency.upper(),
                'receipt': receipt or f'order_{amount_paise}',
                'notes': notes or {},
            })
            return {
                'provider': 'razorpay',
                'order_id': order['id'],
                'key_id': self.key_id,  # Needed by frontend Razorpay.js
                'amount': amount,
                'currency': currency.upper(),
                'status': order['status'],
            }
        except Exception as e:
            logger.error(f"Razorpay error: {e}")
            raise ValueError(f"Payment order error: {e}")

    def verify_payment_signature(self, order_id: str, payment_id: str,
                                   signature: str) -> bool:
        """Verify payment signature from Razorpay callback."""
        try:
            params = {
                'razorpay_order_id': order_id,
                'razorpay_payment_id': payment_id,
                'razorpay_signature': signature,
            }
            self._client.utility.verify_payment_signature(params)
            return True
        except Exception:
            return False

    def create_refund(self, payment_id: str, amount: float = None) -> dict:
        """Process a refund."""
        try:
            params = {}
            if amount:
                params['amount'] = int(round(amount * 100))
            refund = self._client.payment.refund(payment_id, params)
            return {
                'provider': 'razorpay',
                'refund_id': refund['id'],
                'status': refund['status'],
                'amount': refund['amount'] / 100,
            }
        except Exception as e:
            raise ValueError(str(e))

    def construct_webhook_event(self, payload: bytes, sig_header: str) -> dict:
        """Verify Razorpay webhook signature."""
        import hmac, hashlib
        expected = hmac.new(
            self.webhook_secret.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        if expected != sig_header:
            raise ValueError("Invalid Razorpay webhook signature")
        import json
        return json.loads(payload)

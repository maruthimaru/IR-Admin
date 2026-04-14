"""
Email Service — SendGrid + SMTP fallback
Credentials supplied per-company (not from env vars).
"""
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from django.conf import settings

logger = logging.getLogger(__name__)


class EmailService:
    """
    Email service supporting SendGrid and SMTP.
    Initialized with company-specific credentials.
    """

    def __init__(self, provider: str = 'smtp', api_key: str = '',
                 smtp_host: str = 'smtp.gmail.com', smtp_port: int = 587,
                 smtp_user: str = '', smtp_pass: str = '',
                 from_email: str = None):
        self.provider = provider
        self.api_key = api_key
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_pass = smtp_pass
        self.from_email = from_email or smtp_user or getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@app.com')

    def send_email(self, to_email: str, subject: str, html_content: str,
                   plain_content: str = None, from_email: str = None) -> dict:
        """Send an email using the configured provider."""
        sender = from_email or self.from_email
        if self.provider == 'sendgrid' and self.api_key:
            return self._send_sendgrid(to_email, subject, html_content, plain_content, sender)
        return self._send_smtp(to_email, subject, html_content, plain_content, sender)

    def _send_sendgrid(self, to_email, subject, html_content, plain_content, from_email) -> dict:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            msg = Mail(
                from_email=from_email,
                to_emails=to_email,
                subject=subject,
                html_content=html_content,
            )
            if plain_content:
                msg.plain_text_content = plain_content
            sg = SendGridAPIClient(self.api_key)
            response = sg.send(msg)
            logger.info(f"SendGrid email to {to_email}: {response.status_code}")
            return {
                'success': response.status_code in (200, 202),
                'provider': 'sendgrid',
                'status_code': response.status_code,
            }
        except Exception as e:
            logger.error(f"SendGrid error: {e}")
            return {'success': False, 'error': str(e), 'provider': 'sendgrid'}

    def _send_smtp(self, to_email, subject, html_content, plain_content, from_email) -> dict:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = from_email
            msg['To'] = to_email
            if plain_content:
                msg.attach(MIMEText(plain_content, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))

            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.ehlo()
                server.starttls()
                if self.smtp_user and self.smtp_pass:
                    server.login(self.smtp_user, self.smtp_pass)
                server.sendmail(from_email, to_email, msg.as_string())

            logger.info(f"SMTP email sent to {to_email}")
            return {'success': True, 'provider': 'smtp'}
        except Exception as e:
            logger.error(f"SMTP error: {e}")
            return {'success': False, 'error': str(e), 'provider': 'smtp'}

    # ── Templated Emails ──────────────────────────────────────────────────────

    def send_welcome_email(self, to_email: str, user_name: str,
                            company_name: str = '', login_url: str = '') -> dict:
        subject = f"Welcome to {company_name or 'the platform'}!"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#4F46E5;">Welcome, {user_name}! 🎉</h2>
          <p>Your account has been created on <strong>{company_name}</strong>.</p>
          {f'<a href="{login_url}" style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px;">Get Started →</a>' if login_url else ''}
          <p style="color:#6B7280;font-size:13px;margin-top:24px;">If you have questions, reply to this email.</p>
        </div>"""
        return self.send_email(to_email, subject, html)

    def send_otp_email(self, to_email: str, user_name: str, otp: str) -> dict:
        subject = "Your Verification Code"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2>Verification Code</h2>
          <p>Hi {user_name}, your OTP is:</p>
          <div style="background:#F3F4F6;padding:24px;border-radius:8px;text-align:center;margin:16px 0;">
            <span style="font-size:40px;font-weight:bold;letter-spacing:12px;color:#4F46E5;">{otp}</span>
          </div>
          <p style="color:#6B7280;font-size:13px;">Expires in 10 minutes. Never share this code.</p>
        </div>"""
        return self.send_email(to_email, subject, html)

    def send_invoice_email(self, to_email: str, user_name: str, invoice: dict) -> dict:
        amount = invoice.get('amount', 0)
        currency = invoice.get('currency', 'USD')
        subject = f"Invoice #{invoice.get('number', '')} – Payment Confirmation"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#059669;">Payment Confirmed ✓</h2>
          <p>Hi {user_name}, your payment has been processed.</p>
          <div style="background:#F3F4F6;padding:16px;border-radius:8px;margin:16px 0;">
            <p><strong>Invoice #:</strong> {invoice.get('number', 'N/A')}</p>
            <p><strong>Amount:</strong> {currency} {float(amount):.2f}</p>
            <p><strong>Date:</strong> {invoice.get('date', '')}</p>
            <p><strong>Status:</strong> <span style="color:#059669;">Paid</span></p>
          </div>
        </div>"""
        return self.send_email(to_email, subject, html)

    def send_password_reset(self, to_email: str, user_name: str, reset_url: str) -> dict:
        subject = "Password Reset Request"
        html = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2>Reset Your Password</h2>
          <p>Hi {user_name}, click below to reset your password:</p>
          <a href="{reset_url}" style="background:#EF4444;color:white;padding:12px 24px;
             border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
            Reset Password
          </a>
          <p style="color:#6B7280;font-size:13px;">Link expires in 1 hour. Ignore if you didn't request this.</p>
        </div>"""
        return self.send_email(to_email, subject, html)

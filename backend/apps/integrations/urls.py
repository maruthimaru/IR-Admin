"""Integration URL Routes"""
from django.urls import path
from . import settings_views

urlpatterns = [
    # ── Company Integration Settings (configure credentials) ──
    path('settings/', settings_views.integration_overview, name='integration_overview'),
    path('settings/payment/', settings_views.payment_settings, name='payment_settings'),
    path('settings/payment/toggle/', settings_views.toggle_payment, name='toggle_payment'),
    path('settings/sms/', settings_views.sms_settings, name='sms_settings'),
    path('settings/sms/test/', settings_views.test_sms, name='test_sms'),
    path('settings/email/', settings_views.email_settings, name='email_settings'),
    path('settings/email/test/', settings_views.test_email, name='test_email'),

    # ── Runtime Integration Actions (use configured credentials) ──
    path('payment/create/', settings_views.create_payment, name='create_payment'),
    path('sms/send/', settings_views.send_sms_message, name='send_sms'),
    path('email/send/', settings_views.send_email_message, name='send_email'),
]

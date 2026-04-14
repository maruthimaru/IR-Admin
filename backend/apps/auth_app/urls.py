"""Auth URL Routes"""
from django.urls import path
from . import views

urlpatterns = [
    path('register-super-admin/', views.register_super_admin, name='register_super_admin'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    path('refresh/', views.refresh_token_view, name='token_refresh'),
    path('profile/', views.profile_view, name='profile'),
    path('change-password/', views.change_password_view, name='change_password'),
    path('verify/', views.verify_token, name='verify_token'),
    path('tenant-login/', views.tenant_login_view, name='tenant_login'),
    path('users/', views.users_list, name='users_list'),
]

"""Core URL Routes"""
from django.urls import path
from . import views

urlpatterns = [
    path('health/',                         views.health_check,          name='health_check'),
    path('companies/',                       views.companies_list,         name='companies_list'),
    path('companies/<str:company_id>/',      views.company_detail,         name='company_detail'),
    path('dashboard/',                       views.dashboard_stats,        name='dashboard_stats'),
    # RBAC - Roles
    path('roles/',                           views.roles_list,             name='roles_list'),
    path('roles/<str:role_id>/',             views.role_detail,            name='role_detail'),
    # RBAC - Tenant Users
    path('tenant-users/',                    views.tenant_users_list,      name='tenant_users_list'),
    path('tenant-users/<str:user_id>/',      views.tenant_user_detail,     name='tenant_user_detail'),
    # My Permissions
    path('my-permissions/',                  views.my_permissions,         name='my_permissions'),
]

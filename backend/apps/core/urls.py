"""Core URL Routes"""
from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('companies/', views.companies_list, name='companies_list'),
    path('companies/<str:company_id>/', views.company_detail, name='company_detail'),
    path('dashboard/', views.dashboard_stats, name='dashboard_stats'),
]

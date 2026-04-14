"""Dynamic Forms URL Routes"""
from django.urls import path
from . import views

urlpatterns = [
    # Form configuration (developer panel)
    path('configs/', views.form_configs, name='form_configs'),
    path('configs/<str:form_name>/', views.form_config_detail, name='form_config_detail'),

    # Runtime data API
    path('records/<str:form_name>/', views.form_records, name='form_records'),
    path('records/<str:form_name>/<str:record_id>/', views.record_detail, name='record_detail'),

    # List page
    path('list-page/<str:page_name>/', views.list_page_data, name='list_page_data'),
]

"""Dynamic Forms URL Routes"""
from django.urls import path
from . import views

urlpatterns = [
    # Form configuration (developer panel)
    path('configs/', views.form_configs, name='form_configs'),
    path('configs/<str:form_name>/', views.form_config_detail, name='form_config_detail'),

    # Export / Import (before record_id pattern to avoid conflict)
    path('records/<str:form_name>/export/', views.export_records, name='export_records'),
    path('records/<str:form_name>/import/', views.import_records, name='import_records'),
    path('records/<str:form_name>/bulk-update/', views.bulk_update_records, name='bulk_update_records'),
    path('records/<str:form_name>/bulk-delete/', views.bulk_delete_records, name='bulk_delete_records'),

    # Runtime data API
    path('records/<str:form_name>/', views.form_records, name='form_records'),
    path('records/<str:form_name>/<str:record_id>/', views.record_detail, name='record_detail'),

    # List page
    path('list-page/<str:page_name>/', views.list_page_data, name='list_page_data'),

    # Report (join) configuration & data
    path('reports/', views.report_configs, name='report_configs'),
    path('reports/<str:report_name>/', views.report_config_detail, name='report_config_detail'),
    path('reports/<str:report_name>/data/', views.report_data, name='report_data'),
]

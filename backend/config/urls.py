"""
Main URL Configuration for Dynamic Admin Panel
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Django Admin
    path('django-admin/', admin.site.urls),

    # API v1 Routes
    path('api/v1/auth/', include('apps.auth_app.urls')),
    path('api/v1/core/', include('apps.core.urls')),
    path('api/v1/forms/', include('apps.dynamic_forms.urls')),
    path('api/v1/integrations/', include('apps.integrations.urls')),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

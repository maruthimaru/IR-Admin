"""Custom exception handler for DRF."""
import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """Custom exception handler that returns consistent error format."""
    response = exception_handler(exc, context)

    if response is not None:
        # Standardize error format
        if isinstance(response.data, dict) and 'detail' in response.data:
            response.data = {'error': str(response.data['detail'])}
    else:
        # Unhandled exceptions
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        response = Response(
            {'error': 'An internal server error occurred'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    return response

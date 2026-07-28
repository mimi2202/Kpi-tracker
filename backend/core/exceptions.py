# backend/core/exceptions.py
"""Custom exception handling."""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """Custom exception handler with consistent error format."""
    response = exception_handler(exc, context)

    if response is not None:
        errors = []
        if isinstance(response.data, dict):
            for key, value in response.data.items():
                if isinstance(value, list):
                    errors.extend(value)
                else:
                    errors.append(str(value))
        elif isinstance(response.data, list):
            errors = response.data

        response.data = {
            "success": False,
            "errors": errors,
            "status_code": response.status_code,
        }

    return response


class ValidationError(Exception):
    """Custom validation error."""
    def __init__(self, message, code=None):
        self.message = message
        self.code = code
        super().__init__(message)
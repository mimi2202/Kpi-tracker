# backend/config/settings/development.py
"""Development settings."""
from .base import *  # noqa: F403

DEBUG = True

INSTALLED_APPS += [  # noqa: F405
    "django_extensions",
]

# Email backend for development
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Allow all hosts in development
ALLOWED_HOSTS = ["*"]

# Disable password validation in development for convenience
AUTH_PASSWORD_VALIDATORS = []
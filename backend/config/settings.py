# backend/config/settings.py  — ADD/MERGE these production-driven bits.
# Uses environment variables so the same file works locally and on Render.
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-key-change-me")
DEBUG = os.environ.get("DEBUG", "True") == "True"

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

# --- Database: use DATABASE_URL in prod, fall back to local in dev ---
# pip install dj-database-url psycopg2-binary
import dj_database_url
DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL", "sqlite:///db.sqlite3"),
        conn_max_age=600,
        ssl_require=not DEBUG,
    )
}

# --- Static files via WhiteNoise (Render serves them from the app) ---
# pip install whitenoise
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
# Add 'whitenoise.middleware.WhiteNoiseMiddleware' right AFTER SecurityMiddleware:
#   MIDDLEWARE = [
#       "django.middleware.security.SecurityMiddleware",
#       "whitenoise.middleware.WhiteNoiseMiddleware",   # <-- here
#       ... rest ...
#   ]

# --- Media (user uploads: avatars, org logos) ---
# NOTE: Render's disk is EPHEMERAL — uploaded files vanish on redeploy.
# For persistence use a Render Disk or S3/Cloudinary. See notes below.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- CORS: allow the Vercel frontend to call the API ---
# pip install django-cors-headers  (add 'corsheaders' to INSTALLED_APPS,
# and 'corsheaders.middleware.CorsMiddleware' high in MIDDLEWARE)
CORS_ALLOWED_ORIGINS = [
    o for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o
]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# --- Security (only bite in prod) ---
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
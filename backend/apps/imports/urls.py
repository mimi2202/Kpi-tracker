from django.urls import path
from .views import ImportPreviewView, ImportCommitView

app_name = 'imports'
urlpatterns = [
    path("imports/preview/", ImportPreviewView.as_view(), name="import-preview"),
    path("imports/commit/", ImportCommitView.as_view(), name="import-commit"),
]
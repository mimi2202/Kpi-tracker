"""Period views."""
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import ReportingPeriod
from .serializers import ReportingPeriodSerializer, PeriodActionSerializer


class ReportingPeriodViewSet(viewsets.ModelViewSet):
    """Reporting period management."""
    queryset = ReportingPeriod.objects.all()
    serializer_class = ReportingPeriodSerializer
    
    def get_queryset(self):
        queryset = ReportingPeriod.objects.all()
        period_type = self.request.query_params.get("period_type")
        year = self.request.query_params.get("year")
        status_filter = self.request.query_params.get("status")
        
        if period_type:
            queryset = queryset.filter(period_type=period_type)
        if year:
            queryset = queryset.filter(reporting_year=year)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset

    @action(detail=True, methods=["post"])
    def open(self, request, pk=None):
        """Open a period for data entry."""
        period = self.get_object()
        period.open_period(request.user)
        return Response({
            "success": True,
            "message": f"Period '{period.label}' is now open.",
        })

    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        """Lock a period."""
        period = self.get_object()
        period.lock_period(request.user)
        return Response({
            "success": True,
            "message": f"Period '{period.label}' has been locked.",
        })

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Reopen a locked period."""
        period = self.get_object()
        serializer = PeriodActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        reason = serializer.validated_data.get("reason", "")
        period.reopen_period(request.user, reason)
        
        return Response({
            "success": True,
            "message": f"Period '{period.label}' has been reopened.",
        })



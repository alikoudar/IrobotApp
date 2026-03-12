"""Dashboard router — admin and manager metrics endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_admin, get_current_manager_or_admin
from app.models.database import User, get_db
from app.models.schemas import AdminDashboardResponse, ManagerDashboardResponse
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

metrics_service = MetricsService()


@router.get("/dashboard/admin", response_model=AdminDashboardResponse)
async def admin_dashboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """Tableau de bord administrateur — métriques complètes."""
    return await metrics_service.get_admin_metrics(db)


@router.get("/dashboard/manager", response_model=ManagerDashboardResponse)
async def manager_dashboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_manager_or_admin)):
    """Tableau de bord gestionnaire — métriques documents et chunks."""
    return await metrics_service.get_manager_metrics(db)

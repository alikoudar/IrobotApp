import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_manager_or_admin, get_current_user
from app.models.database import Category, Document, User, get_db
from app.models.schemas import (
    CategoryCreateRequest,
    CategoryListResponse,
    CategoryResponse,
    CategoryUpdateRequest,
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1", tags=["categories"])
audit_service = AuditService()


@router.get("/categories", response_model=CategoryListResponse)
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste de toutes les catégories avec le nombre de documents."""
    stmt = select(Category).order_by(Category.name)
    result = await db.execute(stmt)
    categories = list(result.scalars().all())

    responses = []
    for cat in categories:
        count_stmt = select(func.count(Document.id)).where(Document.category == cat.name)
        doc_count = (await db.execute(count_stmt)).scalar() or 0
        resp = CategoryResponse.model_validate(cat)
        resp.document_count = doc_count
        responses.append(resp)

    return CategoryListResponse(categories=responses, total=len(responses))


@router.post("/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    body: CategoryCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Créer une nouvelle catégorie."""
    # Check uniqueness
    existing = await db.execute(select(Category).where(Category.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"La catégorie « {body.name} » existe déjà",
        )

    category = Category(name=body.name, description=body.description)
    db.add(category)
    await db.flush()

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="category_created",
        entity_type="category",
        entity_id=category.id,
        details={"name": body.name},
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(category)

    resp = CategoryResponse.model_validate(category)
    resp.document_count = 0
    return resp


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Mettre à jour une catégorie."""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")

    old_name = category.name
    details: dict = {}

    if body.name is not None and body.name != category.name:
        # Check uniqueness of new name
        existing = await db.execute(select(Category).where(Category.name == body.name))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=409,
                detail=f"La catégorie « {body.name} » existe déjà",
            )
        # Update documents referencing old name
        doc_stmt = select(Document).where(Document.category == old_name)
        docs_result = await db.execute(doc_stmt)
        for doc in docs_result.scalars().all():
            doc.category = body.name
        category.name = body.name
        details["old_name"] = old_name
        details["new_name"] = body.name

    if body.description is not None:
        details["old_description"] = category.description
        category.description = body.description
        details["new_description"] = body.description

    category.updated_at = datetime.utcnow()

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="category_updated",
        entity_type="category",
        entity_id=category_id,
        details=details,
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(category)

    count_stmt = select(func.count(Document.id)).where(Document.category == category.name)
    doc_count = (await db.execute(count_stmt)).scalar() or 0

    resp = CategoryResponse.model_validate(category)
    resp.document_count = doc_count
    return resp


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_manager_or_admin),
):
    """Supprimer une catégorie. Les documents associés perdent leur catégorie."""
    category = await db.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")

    # Unset category on associated documents
    doc_stmt = select(Document).where(Document.category == category.name)
    docs_result = await db.execute(doc_stmt)
    affected = 0
    for doc in docs_result.scalars().all():
        doc.category = None
        affected += 1

    await db.delete(category)

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="category_deleted",
        entity_type="category",
        entity_id=category_id,
        details={"name": category.name, "documents_affected": affected},
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

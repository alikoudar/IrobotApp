"""Chat router — SSE streaming endpoint, conversation history, feedback, and conversations."""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.dependencies import get_current_user
from app.models.database import ChatFeedback, ChatMessage, Conversation, User, get_db
from app.models.schemas import (
    ChatMessageResponse,
    ChatRequest,
    ConversationHistoryResponse,
    ConversationListResponse,
    ConversationResponse,
    ConversationUpdateRequest,
    FeedbackRequest,
    ImageUploadResponse,
)
from app.services.agents.orchestrator_agent import orchestrator_agent
from app.services.audit_service import AuditService
from app.services.minio_service import MinIOService

audit_service = AuditService()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["chat"])

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/chat/upload-image", response_model=ImageUploadResponse)
async def upload_chat_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload an image for chat analysis. Only images allowed (PNG, JPEG, WebP, GIF), max 5MB."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non autorisé : {file.content_type}. "
            "Seules les images (PNG, JPEG, WebP, GIF) sont acceptées.",
        )

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="L'image dépasse la taille maximale de 5 Mo.",
        )

    # Determine extension from content type
    ext_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    ext = ext_map.get(file.content_type, "png")
    key = f"{uuid.uuid4()}.{ext}"

    minio = MinIOService()
    await minio.upload_file("chat-images", key, data, content_type=file.content_type)

    image_url = f"/api/v1/chat/images/{key}"
    return ImageUploadResponse(image_id=key, image_url=image_url)


@router.get("/chat/images/{image_id}")
async def get_chat_image(
    image_id: str,
    current_user: User = Depends(get_current_user),
):
    """Serve a chat image from MinIO."""
    minio = MinIOService()
    try:
        data = await minio.download_file("chat-images", image_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Image introuvable")

    ext = image_id.rsplit(".", 1)[-1].lower() if "." in image_id else "png"
    content_type_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}
    content_type = content_type_map.get(ext, "image/png")

    return Response(content=data, media_type=content_type)


@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SSE streaming chat endpoint."""

    async def event_generator():
        async for event in orchestrator_agent.handle(
            request, db, user_id=str(current_user.id)
        ):
            yield {
                "event": event["event"],
                "data": json.dumps(event["data"], ensure_ascii=False),
            }

    return EventSourceResponse(event_generator())


@router.get("/chat/conversations", response_model=ConversationListResponse)
async def list_conversations(
    is_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liste des conversations de l'utilisateur courant."""
    # Count total
    count_stmt = select(func.count(Conversation.id)).where(
        Conversation.user_id == current_user.id,
        Conversation.is_archived == is_archived,
    )
    total = (await db.execute(count_stmt)).scalar() or 0

    # Fetch conversations ordered by most recent
    stmt = (
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.is_archived == is_archived,
        )
        .order_by(Conversation.updated_at.desc())
    )
    result = await db.execute(stmt)
    conversations = list(result.scalars().all())

    responses = []
    for conv in conversations:
        # Get last message preview
        last_msg_stmt = (
            select(ChatMessage.content)
            .where(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg_result = await db.execute(last_msg_stmt)
        last_message = last_msg_result.scalar_one_or_none()

        responses.append(ConversationResponse(
            id=conv.id,
            title=conv.title,
            is_archived=conv.is_archived,
            last_message=last_message[:200] if last_message else None,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
        ))

    return ConversationListResponse(conversations=responses, total=total)


@router.patch("/chat/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    body: ConversationUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mettre à jour une conversation (archiver/désarchiver)."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de conversation invalide")

    conv = await db.get(Conversation, conv_uuid)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : cette conversation ne vous appartient pas",
        )

    if body.is_archived is not None:
        conv.is_archived = body.is_archived
        action = "conversation_archived" if body.is_archived else "conversation_unarchived"
        await audit_service.log(
            db=db,
            user_id=current_user.id,
            action=action,
            entity_type="conversation",
            entity_id=conv_uuid,
            details={"is_archived": body.is_archived},
            ip_address=request.client.host if request.client else None,
        )

    await db.commit()
    await db.refresh(conv)

    # Get last message preview
    last_msg_stmt = (
        select(ChatMessage.content)
        .where(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    last_msg_result = await db.execute(last_msg_stmt)
    last_message = last_msg_result.scalar_one_or_none()

    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        is_archived=conv.is_archived,
        last_message=last_message[:200] if last_message else None,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.delete("/chat/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Supprimer une conversation et ses messages associés."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de conversation invalide")

    conv = await db.get(Conversation, conv_uuid)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : cette conversation ne vous appartient pas",
        )

    # Delete associated chat messages
    msg_stmt = select(ChatMessage).where(ChatMessage.conversation_id == conv_uuid)
    msg_result = await db.execute(msg_stmt)
    for msg in msg_result.scalars().all():
        await db.delete(msg)

    # Delete associated feedback
    fb_stmt = select(ChatFeedback).where(ChatFeedback.conversation_id == conv_uuid)
    fb_result = await db.execute(fb_stmt)
    for fb in fb_result.scalars().all():
        await db.delete(fb)

    await db.delete(conv)
    await db.commit()


@router.get("/chat/{conversation_id}/feedback")
async def get_feedback(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Récupérer les retours de l'utilisateur pour chaque message d'une conversation."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de conversation invalide")

    stmt = select(ChatFeedback).where(
        ChatFeedback.conversation_id == conv_uuid,
        ChatFeedback.user_id == current_user.id,
    )
    result = await db.execute(stmt)
    feedbacks = result.scalars().all()
    # Return a map of message_id -> rating
    feedback_map: dict[str, int] = {}
    for fb in feedbacks:
        feedback_map[str(fb.message_id)] = fb.rating
    return {"feedbacks": feedback_map}


@router.get("/chat/{conversation_id}/history", response_model=ConversationHistoryResponse)
async def get_history(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get conversation message history."""
    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de conversation invalide")

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_uuid)
        .order_by(ChatMessage.created_at)
    )
    result = await db.execute(stmt)
    messages = result.scalars().all()

    if not messages:
        raise HTTPException(status_code=404, detail="Conversation introuvable")

    response_messages = []
    for m in messages:
        msg = ChatMessageResponse.model_validate(m)
        if m.image_url:
            msg.image_url = f"/api/v1/chat/images/{m.image_url}"
        response_messages.append(msg)

    return ConversationHistoryResponse(
        conversation_id=conversation_id,
        messages=response_messages,
    )


@router.post("/chat/{conversation_id}/feedback")
async def submit_feedback(
    conversation_id: str,
    request_body: FeedbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit thumbs up/down feedback for a specific message."""
    if request_body.rating not in (-1, 1):
        raise HTTPException(
            status_code=400,
            detail="La note doit être -1 (négatif) ou 1 (positif)",
        )

    try:
        conv_uuid = uuid.UUID(conversation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de conversation invalide")

    try:
        msg_uuid = uuid.UUID(request_body.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Identifiant de message invalide")

    # Upsert: update existing feedback for this message or create new
    stmt = select(ChatFeedback).where(
        ChatFeedback.conversation_id == conv_uuid,
        ChatFeedback.user_id == current_user.id,
        ChatFeedback.message_id == msg_uuid,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.rating = request_body.rating
        existing.comment = request_body.comment
    else:
        feedback = ChatFeedback(
            conversation_id=conv_uuid,
            message_id=msg_uuid,
            user_id=current_user.id,
            rating=request_body.rating,
            comment=request_body.comment,
        )
        db.add(feedback)

    await audit_service.log(
        db=db,
        user_id=current_user.id,
        action="chat_feedback",
        entity_type="conversation",
        entity_id=conv_uuid,
        details={
            "rating": request_body.rating,
            "comment": request_body.comment,
            "conversation_id": conversation_id,
            "message_id": request_body.message_id,
        },
        ip_address=request.client.host if request.client else None,
    )

    await db.commit()

    return {"status": "ok", "message": "Merci pour votre retour"}

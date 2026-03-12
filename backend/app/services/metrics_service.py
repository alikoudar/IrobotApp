"""Service for dashboard metrics and cost tracking."""

from sqlalchemy import case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import ChatFeedback, ChatMessage, Chunk, Conversation, Document, TokenUsage, User
from app.models.schemas import (
    AdminDashboardResponse,
    DocumentsByCategory,
    DocumentsByStatus,
    DocumentsByType,
    FeedbackStats,
    ManagerDashboardResponse,
    SystemHealth,
    TokenUsageByOperation,
    UsersByRole,
)

PROCESSING_STATUSES = {"uploaded", "converting", "ocr_pending", "ocr_processing", "chunking", "embedding"}


class MetricsService:
    """Service for dashboard metrics and cost tracking."""

    async def get_admin_metrics(self, db: AsyncSession) -> AdminDashboardResponse:
        """Aggregate all admin dashboard metrics."""
        # Counts
        total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
        total_documents = (await db.execute(select(func.count(Document.id)))).scalar_one()
        total_chunks = (await db.execute(select(func.count(Chunk.id)))).scalar_one()
        total_categories = (await db.execute(
            select(func.count(distinct(Document.category))).where(Document.category.is_not(None))
        )).scalar_one()
        total_conversations = (await db.execute(select(func.count(Conversation.id)))).scalar_one()
        total_messages = (await db.execute(select(func.count(ChatMessage.id)))).scalar_one()

        # Token usage by operation + model
        token_rows = (await db.execute(
            select(
                TokenUsage.operation,
                TokenUsage.model,
                func.coalesce(func.sum(TokenUsage.input_tokens), 0).label("total_input"),
                func.coalesce(func.sum(TokenUsage.output_tokens), 0).label("total_output"),
                func.coalesce(func.sum(TokenUsage.estimated_cost_usd), 0).label("cost_usd"),
                func.coalesce(func.sum(TokenUsage.estimated_cost_xaf), 0).label("cost_xaf"),
            ).group_by(TokenUsage.operation, TokenUsage.model)
        )).all()

        token_usage = [
            TokenUsageByOperation(
                operation=r.operation,
                model=r.model,
                total_input_tokens=int(r.total_input),
                total_output_tokens=int(r.total_output),
                total_cost_usd=float(r.cost_usd),
                total_cost_xaf=float(r.cost_xaf),
            )
            for r in token_rows
        ]

        total_cost_usd = sum(t.total_cost_usd for t in token_usage)
        total_cost_xaf = sum(t.total_cost_xaf for t in token_usage)
        total_input_tokens = sum(t.total_input_tokens for t in token_usage)
        total_output_tokens = sum(t.total_output_tokens for t in token_usage)

        # Feedback stats
        feedback_row = (await db.execute(
            select(
                func.count(ChatFeedback.id).label("total"),
                func.coalesce(func.sum(case((ChatFeedback.rating == 1, 1), else_=0)), 0).label("positive"),
                func.coalesce(func.sum(case((ChatFeedback.rating == -1, 1), else_=0)), 0).label("negative"),
                func.avg(ChatFeedback.rating).label("avg_score"),
            )
        )).one()

        # Total assistant messages (eligible for feedback)
        total_assistant_messages = (await db.execute(
            select(func.count(ChatMessage.id)).where(ChatMessage.role == "assistant")
        )).scalar_one()

        feedback = FeedbackStats(
            total=feedback_row.total,
            positive=int(feedback_row.positive),
            negative=int(feedback_row.negative),
            average_score=float(feedback_row.avg_score) if feedback_row.avg_score is not None else None,
            total_messages=total_assistant_messages,
            feedback_ratio=round(feedback_row.total / total_assistant_messages * 100, 2) if total_assistant_messages > 0 else None,
        )

        # System health
        processing_docs = (await db.execute(
            select(func.count(Document.id)).where(Document.processing_status.in_(PROCESSING_STATUSES))
        )).scalar_one()
        failed_jobs = (await db.execute(
            select(func.count(Document.id)).where(Document.processing_status == "failed")
        )).scalar_one()

        system_health = SystemHealth(
            queue_depth=processing_docs,
            failed_jobs=failed_jobs,
            processing_documents=processing_docs,
        )

        # Documents by status
        docs_by_status = await self._docs_by_status(db)

        # Users by role
        role_rows = (await db.execute(
            select(User.role, func.count(User.id).label("cnt"))
            .where(User.is_active.is_(True))
            .group_by(User.role)
        )).all()
        users_by_role = [UsersByRole(role=r.role, count=r.cnt) for r in role_rows]

        return AdminDashboardResponse(
            total_users=total_users,
            total_documents=total_documents,
            total_chunks=total_chunks,
            total_categories=total_categories,
            total_conversations=total_conversations,
            total_messages=total_messages,
            token_usage=token_usage,
            total_cost_usd=total_cost_usd,
            total_cost_xaf=total_cost_xaf,
            total_input_tokens=total_input_tokens,
            total_output_tokens=total_output_tokens,
            feedback=feedback,
            system_health=system_health,
            documents_by_status=docs_by_status,
            users_by_role=users_by_role,
        )

    async def get_manager_metrics(self, db: AsyncSession) -> ManagerDashboardResponse:
        """Aggregate manager dashboard metrics."""
        total_documents = (await db.execute(select(func.count(Document.id)))).scalar_one()
        total_chunks = (await db.execute(select(func.count(Chunk.id)))).scalar_one()
        avg_chunks = total_chunks / total_documents if total_documents > 0 else 0.0

        docs_by_status = await self._docs_by_status(db)

        # By type
        type_rows = (await db.execute(
            select(Document.original_extension, func.count(Document.id).label("cnt"))
            .group_by(Document.original_extension)
        )).all()
        docs_by_type = [DocumentsByType(extension=r.original_extension, count=r.cnt) for r in type_rows]

        # By category
        cat_label = func.coalesce(Document.category, "Non classé")
        cat_rows = (await db.execute(
            select(cat_label.label("cat"), func.count(Document.id).label("cnt"))
            .group_by(cat_label)
        )).all()
        docs_by_category = [DocumentsByCategory(category=r.cat, count=r.cnt) for r in cat_rows]

        total_categories = sum(1 for r in cat_rows if r.cat != "Non classé")

        # Success / failure rates
        ready_count = next((d.count for d in docs_by_status if d.status == "ready"), 0)
        failed_count = next((d.count for d in docs_by_status if d.status == "failed"), 0)
        success_rate = (ready_count / total_documents * 100) if total_documents > 0 else 0.0
        failure_rate = (failed_count / total_documents * 100) if total_documents > 0 else 0.0

        return ManagerDashboardResponse(
            total_documents=total_documents,
            total_chunks=total_chunks,
            avg_chunks_per_document=round(avg_chunks, 2),
            documents_by_status=docs_by_status,
            documents_by_type=docs_by_type,
            documents_by_category=docs_by_category,
            total_categories=total_categories,
            processing_success_rate=round(success_rate, 2),
            processing_failure_rate=round(failure_rate, 2),
        )

    async def _docs_by_status(self, db: AsyncSession) -> list[DocumentsByStatus]:
        rows = (await db.execute(
            select(Document.processing_status, func.count(Document.id).label("cnt"))
            .group_by(Document.processing_status)
        )).all()
        return [DocumentsByStatus(status=r.processing_status, count=r.cnt) for r in rows]

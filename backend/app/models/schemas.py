import uuid
from datetime import datetime
from enum import Enum
from ipaddress import IPv4Address, IPv6Address
from typing import Any

from pydantic import BaseModel


class ServiceStatus(BaseModel):
    postgres: str = "ok"
    redis: str = "ok"
    minio: str = "ok"


class HealthResponse(BaseModel):
    status: str  # "ok" | "degraded"
    services: ServiceStatus


class ErrorResponse(BaseModel):
    detail: str
    code: str


class DocumentStatus(str, Enum):
    UPLOADED = "uploaded"
    CONVERTING = "converting"
    OCR_PENDING = "ocr_pending"
    OCR_PROCESSING = "ocr_processing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    READY = "ready"
    FAILED = "failed"


class DocumentResponse(BaseModel):
    id: uuid.UUID
    filename: str
    original_extension: str
    mime_type: str | None = None
    file_size_bytes: int | None = None
    category: str | None = None
    processing_status: str
    created_at: datetime
    uploader_matricule: str | None = None

    model_config = {"from_attributes": True}


class FileError(BaseModel):
    filename: str
    error: str


class UploadResponse(BaseModel):
    documents: list[DocumentResponse]
    errors: list[FileError]


class URLUploadRequest(BaseModel):
    url: str


class ChatRequest(BaseModel):
    message: str = ""
    conversation_id: str | None = None
    document_ids: list[str] | None = None
    image_id: str | None = None


class ChatSource(BaseModel):
    document_id: str
    filename: str
    category: str | None = None
    page_number: int | None = None
    score: float | None = None
    snippet: str | None = None


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    image_url: str | None = None
    agent_type: str | None = None
    sources: list[dict] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class ImageUploadResponse(BaseModel):
    image_id: str
    image_url: str


class ConversationHistoryResponse(BaseModel):
    conversation_id: str
    messages: list[ChatMessageResponse]


class FeedbackRequest(BaseModel):
    message_id: str
    rating: int
    comment: str | None = None


class OCRBatchStatus(BaseModel):
    job_id: str
    status: str
    total_requests: int | None = None
    completed_requests: int | None = None
    succeeded_requests: int | None = None
    failed_requests: int | None = None


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    action: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    details: dict = {}
    ip_address: IPv4Address | IPv6Address | str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogResponse]
    total: int
    limit: int
    offset: int


# --- Dashboard Schemas ---

class TokenUsageByOperation(BaseModel):
    operation: str
    model: str
    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float
    total_cost_xaf: float


class FeedbackStats(BaseModel):
    total: int
    positive: int
    negative: int
    average_score: float | None = None
    total_messages: int = 0
    feedback_ratio: float | None = None


class SystemHealth(BaseModel):
    queue_depth: int
    failed_jobs: int
    processing_documents: int


class DocumentsByStatus(BaseModel):
    status: str
    count: int


class DocumentsByType(BaseModel):
    extension: str
    count: int


class DocumentsByCategory(BaseModel):
    category: str
    count: int


class UsersByRole(BaseModel):
    role: str
    count: int


class AdminDashboardResponse(BaseModel):
    total_users: int
    total_documents: int
    total_chunks: int
    total_categories: int
    total_conversations: int = 0
    total_messages: int = 0
    token_usage: list[TokenUsageByOperation]
    total_cost_usd: float
    total_cost_xaf: float
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    feedback: FeedbackStats
    system_health: SystemHealth
    documents_by_status: list[DocumentsByStatus]
    users_by_role: list[UsersByRole] = []


class ManagerDashboardResponse(BaseModel):
    total_documents: int
    total_chunks: int
    avg_chunks_per_document: float
    documents_by_status: list[DocumentsByStatus]
    documents_by_type: list[DocumentsByType]
    documents_by_category: list[DocumentsByCategory]
    total_categories: int
    processing_success_rate: float
    processing_failure_rate: float


# --- Config Schemas ---

class AppConfigResponse(BaseModel):
    key: str
    value: Any
    description: str | None = None
    category: str | None = None
    updated_by: uuid.UUID | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class AppConfigListResponse(BaseModel):
    configs: list[AppConfigResponse]


class AppConfigUpdateRequest(BaseModel):
    values: dict[str, Any]


# --- Document Management Schemas ---

class DocumentDetailResponse(BaseModel):
    id: uuid.UUID
    filename: str
    original_extension: str
    mime_type: str | None = None
    file_size_bytes: int | None = None
    file_hash: str
    category: str | None = None
    minio_bucket: str
    minio_key: str
    source_url: str | None = None
    processing_status: str
    error_message: str | None = None
    ocr_job_id: str | None = None
    page_count: int | None = None
    uploaded_by: uuid.UUID | None = None
    uploader_name: str | None = None
    uploader_matricule: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    chunk_count: int = 0

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: list[DocumentResponse]
    total: int
    limit: int
    offset: int


class DocumentUpdateRequest(BaseModel):
    category: str | None = None


class DocumentStatusResponse(BaseModel):
    id: uuid.UUID
    processing_status: str
    error_message: str | None = None
    page_count: int | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Category Schemas ---

class CategoryCreateRequest(BaseModel):
    name: str
    description: str | None = None


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    document_count: int = 0
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class CategoryListResponse(BaseModel):
    categories: list[CategoryResponse]
    total: int


# --- Auth Schemas ---

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserProfileUpdate(BaseModel):
    name: str | None = None


# --- User Management Schemas ---

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    matricule: str
    role: str
    is_active: bool = True
    created_at: datetime
    model_config = {"from_attributes": True}


class UserCreateRequest(BaseModel):
    email: str
    name: str
    matricule: str
    password: str
    role: str = "user"


class UserUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    matricule: str | None = None
    role: str | None = None
    is_active: bool | None = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int
    limit: int
    offset: int


class BulkCreateResponse(BaseModel):
    created: list[UserResponse]
    errors: list[dict]


# --- Conversation Schemas ---

class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str | None = None
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime | None = None
    last_message: str | None = None
    model_config = {"from_attributes": True}


class ConversationUpdateRequest(BaseModel):
    is_archived: bool | None = None


class ConversationListResponse(BaseModel):
    conversations: list[ConversationResponse]
    total: int = 0


# --- Document Chunks Schemas ---

class ChunkResponse(BaseModel):
    id: uuid.UUID
    chunk_index: int
    page_number: int | None = None
    content: str
    token_count: int | None = None
    metadata: dict = {}
    model_config = {"from_attributes": True}


class DocumentChunksResponse(BaseModel):
    document_id: uuid.UUID
    chunks: list[ChunkResponse]
    total: int

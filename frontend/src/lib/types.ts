export interface Document {
  id: string;
  filename: string;
  original_extension: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  category: string | null;
  processing_status: string;
  created_at: string;
  uploader_matricule: string | null;
}

export interface DocumentDetail extends Document {
  file_hash: string;
  minio_bucket: string;
  minio_key: string;
  source_url: string | null;
  error_message: string | null;
  ocr_job_id: string | null;
  page_count: number | null;
  uploaded_by: string | null;
  uploader_name: string | null;
  uploader_matricule: string | null;
  updated_at: string | null;
  chunk_count: number;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

export interface UploadResponse {
  documents: Document[];
  errors: FileError[];
}

export interface FileError {
  filename: string;
  error: string;
}

export interface DocumentStatusResponse {
  id: string;
  processing_status: string;
  error_message: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface ChatSource {
  document_id: string;
  filename: string;
  category: string | null;
  page_number: number | null;
  score: number | null;
  snippet: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  sources?: ChatSource[];
  conversationId?: string;
}

export interface ConversationPreview {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: string;
  isArchived: boolean;
}

export interface ChatMessageResponse {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  image_url: string | null;
  agent_type: string | null;
  sources: Record<string, unknown>[];
  created_at: string;
}

export interface ConversationHistoryResponse {
  conversation_id: string;
  messages: ChatMessageResponse[];
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  document_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface CategoryListResponse {
  categories: Category[];
  total: number;
}

export interface TokenUsageByOperation {
  operation: string;
  model: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_cost_xaf: number;
}

export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  average_score: number | null;
  total_messages: number;
  feedback_ratio: number | null;
}

export interface SystemHealth {
  queue_depth: number;
  failed_jobs: number;
  processing_documents: number;
}

export interface DocumentsByStatus {
  status: string;
  count: number;
}

export interface DocumentsByType {
  extension: string;
  count: number;
}

export interface DocumentsByCategory {
  category: string;
  count: number;
}

export interface AdminDashboardResponse {
  total_users: number;
  total_documents: number;
  total_chunks: number;
  total_categories: number;
  total_conversations: number;
  total_messages: number;
  token_usage: TokenUsageByOperation[];
  total_cost_usd: number;
  total_cost_xaf: number;
  total_input_tokens: number;
  total_output_tokens: number;
  feedback: FeedbackStats;
  system_health: SystemHealth;
  documents_by_status: DocumentsByStatus[];
  users_by_role: { role: string; count: number }[];
}

export interface ManagerDashboardResponse {
  total_documents: number;
  total_chunks: number;
  avg_chunks_per_document: number;
  documents_by_status: DocumentsByStatus[];
  documents_by_type: DocumentsByType[];
  documents_by_category: DocumentsByCategory[];
  total_categories: number;
  processing_success_rate: number;
  processing_failure_rate: number;
}

export interface AppConfig {
  key: string;
  value: unknown;
  description: string | null;
  category: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface AppConfigListResponse {
  configs: AppConfig[];
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export type Role = "admin" | "manager" | "user";

// Auth
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  matricule: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}

// Users
export interface UserData {
  id: string;
  email: string;
  name: string;
  matricule: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface UserListResponse {
  users: UserData[];
  total: number;
  limit: number;
  offset: number;
}

export interface BulkCreateResponse {
  created: UserData[];
  errors: { line: number; error: string; email?: string }[];
}

// Conversations
export interface ConversationData {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string | null;
  last_message: string | null;
  is_archived: boolean;
}

export interface ConversationListResponse {
  conversations: ConversationData[];
}

// Chunks
export interface ChunkData {
  id: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  token_count: number | null;
  metadata: Record<string, unknown>;
}

export interface DocumentChunksResponse {
  document_id: string;
  chunks: ChunkData[];
  total: number;
}

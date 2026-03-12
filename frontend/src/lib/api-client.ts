import { apiFetch, apiUpload } from "./api";
import type {
  DocumentListResponse,
  DocumentDetail,
  DocumentStatusResponse,
  UploadResponse,
  ConversationHistoryResponse,
  Category,
  CategoryListResponse,
  AdminDashboardResponse,
  ManagerDashboardResponse,
  AppConfigListResponse,
  AuditLogListResponse,
  UserListResponse,
  UserData,
  BulkCreateResponse,
  ConversationListResponse,
  DocumentChunksResponse,
  AuthUser,
} from "./types";

// Documents
export function fetchDocuments(params?: {
  status?: string;
  category?: string;
  search?: string;
  uploaded_by?: string;
  limit?: number;
  offset?: number;
}): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.category) query.set("category", params.category);
  if (params?.search) query.set("search", params.search);
  if (params?.uploaded_by) query.set("uploaded_by", params.uploaded_by);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch<DocumentListResponse>(`/documents${qs ? `?${qs}` : ""}`);
}

export function fetchDocumentDetail(id: string): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/documents/${id}`);
}

export function fetchDocumentStatus(id: string): Promise<DocumentStatusResponse> {
  return apiFetch<DocumentStatusResponse>(`/documents/${id}/status`);
}

export function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/documents/${id}`, { method: "DELETE" });
}

export function updateDocument(id: string, data: { category?: string }): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function retryDocument(id: string): Promise<void> {
  return apiFetch<void>(`/documents/${id}/retry`, { method: "POST" });
}

export function fetchDocumentChunks(id: string): Promise<DocumentChunksResponse> {
  return apiFetch<DocumentChunksResponse>(`/documents/${id}/chunks`);
}

// Upload
export function uploadFiles(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  return apiUpload<UploadResponse>("/upload", formData);
}

export function uploadUrl(url: string): Promise<UploadResponse> {
  return apiFetch<UploadResponse>("/upload-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// Chat Image Upload
export function uploadChatImage(
  file: File
): Promise<{ image_id: string; image_url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<{ image_id: string; image_url: string }>("/chat/upload-image", formData);
}

// Chat
export function fetchConversationHistory(
  conversationId: string
): Promise<ConversationHistoryResponse> {
  return apiFetch<ConversationHistoryResponse>(`/chat/${conversationId}/history`);
}

export function sendFeedback(
  conversationId: string,
  messageId: string,
  rating: number,
  comment?: string
): Promise<void> {
  return apiFetch<void>(`/chat/${conversationId}/feedback`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId, rating, comment: comment || null }),
  });
}

export function fetchFeedback(
  conversationId: string
): Promise<{ feedbacks: Record<string, number> }> {
  return apiFetch<{ feedbacks: Record<string, number> }>(`/chat/${conversationId}/feedback`);
}

// Conversations
export function fetchConversations(params?: { is_archived?: boolean }): Promise<ConversationListResponse> {
  const query = new URLSearchParams();
  if (params?.is_archived !== undefined) query.set("is_archived", String(params.is_archived));
  const qs = query.toString();
  return apiFetch<ConversationListResponse>(`/chat/conversations${qs ? `?${qs}` : ""}`);
}

export function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/chat/conversations/${id}`, { method: "DELETE" });
}

export function archiveConversation(id: string, is_archived: boolean): Promise<unknown> {
  return apiFetch(`/chat/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ is_archived }),
  });
}

// Categories
export function fetchCategories(): Promise<CategoryListResponse> {
  return apiFetch<CategoryListResponse>("/categories");
}

export function createCategory(data: { name: string; description?: string }): Promise<Category> {
  return apiFetch<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCategory(
  id: string,
  data: { name?: string; description?: string }
): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: string): Promise<void> {
  return apiFetch<void>(`/categories/${id}`, { method: "DELETE" });
}

// Dashboard
export function fetchAdminDashboard(): Promise<AdminDashboardResponse> {
  return apiFetch<AdminDashboardResponse>("/dashboard/admin");
}

export function fetchManagerDashboard(): Promise<ManagerDashboardResponse> {
  return apiFetch<ManagerDashboardResponse>("/dashboard/manager");
}

// Config
export function fetchConfig(): Promise<AppConfigListResponse> {
  return apiFetch<AppConfigListResponse>("/config");
}

export function updateConfig(values: Record<string, unknown>): Promise<void> {
  return apiFetch<void>("/config", {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

// Audit Logs
export function fetchAuditLogs(params?: {
  action?: string;
  entity_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogListResponse> {
  const query = new URLSearchParams();
  if (params?.action) query.set("action", params.action);
  if (params?.entity_type) query.set("entity_type", params.entity_type);
  if (params?.date_from) query.set("date_from", params.date_from);
  if (params?.date_to) query.set("date_to", params.date_to);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch<AuditLogListResponse>(`/audit-logs${qs ? `?${qs}` : ""}`);
}

export function archiveAuditLogs(): Promise<{ message: string; archived_count: number; file_key: string | null }> {
  return apiFetch("/audit-logs/archive", { method: "POST" });
}

export function fetchAuditArchives(): Promise<{ archives: { name: string; size: number; last_modified: string | null; download_url: string }[] }> {
  return apiFetch("/audit-logs/archives");
}

export async function downloadAuditArchive(downloadUrl: string, filename: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(downloadUrl, { headers });
  if (!res.ok) throw new Error("Échec du téléchargement");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Auth
export function updateProfile(data: { name?: string }): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

// Users (admin)
export function fetchUsers(params?: {
  search?: string;
  role?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<UserListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.role) query.set("role", params.role);
  if (params?.is_active !== undefined) query.set("is_active", String(params.is_active));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch<UserListResponse>(`/users${qs ? `?${qs}` : ""}`);
}

export function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  return apiFetch<void>(`/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export function createUser(data: {
  email: string;
  name: string;
  matricule: string;
  password: string;
  role: string;
}): Promise<UserData> {
  return apiFetch<UserData>("/users", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateUser(
  id: string,
  data: { name?: string; email?: string; matricule?: string; role?: string; is_active?: boolean }
): Promise<UserData> {
  return apiFetch<UserData>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}

export function bulkCreateUsers(file: File): Promise<BulkCreateResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<BulkCreateResponse>("/users/bulk", formData);
}

export async function downloadBulkTemplate(): Promise<void> {
  const token = localStorage.getItem("access_token");
  const res = await fetch("/api/v1/users/bulk-template", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Erreur lors du téléchargement");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele_utilisateurs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadBulkTemplateXlsx(): Promise<void> {
  const token = localStorage.getItem("access_token");
  const res = await fetch("/api/v1/users/bulk-template-xlsx", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Erreur lors du téléchargement");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele_utilisateurs.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

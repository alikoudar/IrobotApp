import { MessageSquare, FileText, BarChart3, Settings, ScrollText, Users, Tag } from "lucide-react";
import type { Role } from "./types";

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "T\u00e9l\u00e9vers\u00e9",
  converting: "Conversion",
  ocr_pending: "OCR en attente",
  ocr_processing: "OCR en cours",
  chunking: "D\u00e9coupage",
  embedding: "Indexation",
  ready: "Pr\u00eat",
  failed: "\u00c9chec",
};

export const ACTION_LABELS: Record<string, string> = {
  document_uploaded: "Document t\u00e9l\u00e9vers\u00e9",
  document_deleted: "Document supprim\u00e9",
  document_updated: "Document modifi\u00e9",
  document_retry: "Relance document",
  category_created: "Cat\u00e9gorie cr\u00e9\u00e9e",
  category_updated: "Cat\u00e9gorie modifi\u00e9e",
  category_deleted: "Cat\u00e9gorie supprim\u00e9e",
  chat_query: "Question chat",
  chat_feedback: "Retour chat",
  config_changed: "Configuration modifi\u00e9e",
  batch_started: "Lot OCR d\u00e9marr\u00e9",
  ocr_completed: "OCR termin\u00e9",
  ocr_failed: "OCR \u00e9chou\u00e9",
  user_created: "Utilisateur cr\u00e9\u00e9",
  user_updated: "Utilisateur modifi\u00e9",
  user_deactivated: "Utilisateur d\u00e9sactiv\u00e9",
  users_bulk_created: "Import en lot",
};

export const CONFIG_LABELS: Record<string, string> = {
  chat_model: "Mod\u00e8le de chat",
  embedding_model: "Mod\u00e8le d'embedding",
  ocr_model: "Mod\u00e8le OCR",
  chunk_size: "Taille des chunks",
  chunk_overlap: "Chevauchement des chunks",
  rag_top_k: "Nombre de r\u00e9sultats (top_k)",
  max_upload_files: "Fichiers max par envoi",
  max_file_size_mb: "Taille max par fichier (Mo)",
  usd_to_xaf_rate: "Taux USD \u2192 XAF",
  chat_max_tokens: "Tokens max (chat)",
  batch_timeout_minutes: "Timeout batch OCR (min)",
  title_model: "Mod\u00e8le de titres",
  classify_model: "Mod\u00e8le de classification",
  vision_model: "Mod\u00e8le de vision",
  greeting_model: "Mod\u00e8le de salutations",
};

export const CONFIG_CATEGORY_LABELS: Record<string, string> = {
  models: "Mod\u00e8les",
  rag: "RAG",
  ocr: "OCR",
  costs: "Co\u00fbts",
  general: "G\u00e9n\u00e9ral",
};

export const OPERATION_LABELS: Record<string, string> = {
  embed: "Embedding",
  chat: "Chat",
  ocr: "OCR",
  classify: "Classification",
  title_gen: "Titre",
  vision_ocr: "Vision OCR",
  vision: "Vision",
  greeting: "Salutation",
  rerank: "Reclassement",
};

export const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "Tous les types" },
  { value: "document", label: "Document" },
  { value: "category", label: "Cat\u00e9gorie" },
  { value: "config", label: "Configuration" },
  { value: "chat", label: "Chat" },
  { value: "user", label: "Utilisateur" },
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  manager: "Gestionnaire",
  user: "Utilisateur",
};

export interface NavItem {
  href: string;
  label: string;
  icon: typeof MessageSquare;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chat", icon: MessageSquare, roles: ["admin", "manager", "user"] },
  { href: "/documents", label: "Documents", icon: FileText, roles: ["admin", "manager"] },
  { href: "/categories", label: "Catégories", icon: Tag, roles: ["admin", "manager"] },
  { href: "/dashboard", label: "Tableau de bord", icon: BarChart3, roles: ["admin", "manager"] },
  { href: "/config", label: "Configuration", icon: Settings, roles: ["admin"] },
  { href: "/logs", label: "Journaux d'audit", icon: ScrollText, roles: ["admin"] },
  { href: "/users", label: "Utilisateurs", icon: Users, roles: ["admin"] },
];

export const ALLOWED_EXTENSIONS = [
  ".txt", ".rtf", ".docx", ".xlsx", ".pptx", ".pdf",
  ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp",
];

export const TERMINAL_STATUSES = ["ready", "failed"];

export const MAX_UPLOAD_FILES = 10;
export const MAX_FILE_SIZE_MB = 10;

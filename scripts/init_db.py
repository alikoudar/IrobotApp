"""Initialize database: create extensions and seed data.

Tables are managed by Alembic migrations (backend/alembic/).
This script only creates required extensions and seeds initial data.
"""

import os
import sys

import psycopg2


def get_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "ragdb"),
        user=os.getenv("POSTGRES_USER", "raguser"),
        password=os.getenv("POSTGRES_PASSWORD", "ragpass123"),
    )


EXTENSIONS = """
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
"""

SEED_ADMIN = """
INSERT INTO users (id, email, name, role, password_hash, matricule, is_active, created_at)
VALUES (gen_random_uuid(), 'admin@beac.int', 'Administrateur', 'admin', '$2b$12$7or.Ffar1DbYeUMsgVOj/.AzcZ9PKsArHgRa0INC9SyYPAV857jLC', 'ADM001', true, NOW())
ON CONFLICT (email) DO UPDATE SET
    password_hash = COALESCE(NULLIF(users.password_hash, ''), EXCLUDED.password_hash),
    matricule = COALESCE(NULLIF(users.matricule, ''), EXCLUDED.matricule);
"""

SEED_CONFIG = """
INSERT INTO app_config (key, value, description, category, updated_at) VALUES
    ('chat_model', '"mistral-small-latest"', 'Modèle de chat Mistral', 'models', NOW()),
    ('embedding_model', '"mistral-embed"', 'Modèle d''embeddings Mistral', 'models', NOW()),
    ('ocr_model', '"mistral-ocr-latest"', 'Modèle OCR Mistral', 'models', NOW()),
    ('chunk_size', '1000', 'Taille des chunks en tokens', 'rag', NOW()),
    ('chunk_overlap', '200', 'Chevauchement des chunks en tokens', 'rag', NOW()),
    ('rag_top_k', '5', 'Nombre de chunks récupérés', 'rag', NOW()),
    ('max_upload_files', '10', 'Nombre maximum de fichiers par téléversement', 'general', NOW()),
    ('max_file_size_mb', '10', 'Taille maximale d''un fichier en Mo', 'general', NOW()),
    ('usd_to_xaf_rate', '655', 'Taux de conversion USD vers XAF', 'costs', NOW()),
    ('chat_max_tokens', '2048', 'Tokens maximum pour la réponse chat', 'models', NOW()),
    ('batch_timeout_minutes', '30', 'Timeout du batch OCR en minutes', 'ocr', NOW()),
    ('rerank_model', '"mistral-medium-latest"', 'Modèle de reclassement', 'models', NOW()),
    ('rerank_top_k', '3', 'Nombre de résultats après reclassement', 'rag', NOW()),
    ('rerank_enabled', 'true', 'Activer le reclassement LLM', 'rag', NOW())
ON CONFLICT (key) DO NOTHING;
"""


def main():
    print("Connexion à PostgreSQL...")
    try:
        conn = get_connection()
        conn.autocommit = True
        cur = conn.cursor()

        print("Création des extensions...")
        cur.execute(EXTENSIONS)

        print("Insertion de l'administrateur par défaut...")
        cur.execute(SEED_ADMIN)

        print("Insertion de la configuration par défaut...")
        cur.execute(SEED_CONFIG)

        cur.close()
        conn.close()
        print("Base de données initialisée avec succès.")
    except Exception as e:
        print(f"Erreur lors de l'initialisation : {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

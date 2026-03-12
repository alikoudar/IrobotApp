from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_root_user: str = "minioadmin"
    minio_root_password: str = "minioadmin123"
    minio_secure: bool = False

    # PostgreSQL
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "ragdb"
    postgres_user: str = "raguser"
    postgres_password: str = "ragpass123"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Mistral
    mistral_api_key: str = "your_key_here"

    # Upload
    max_upload_files: int = 10
    max_file_size_mb: int = 10

    # Embedding
    embedding_model: str = "mistral-embed"
    embedding_dimension: int = 1024

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Chat
    chat_model: str = "mistral-small-latest"
    chat_max_tokens: int = 2048

    # Per-task models
    title_model: str = "mistral-small-latest"
    classify_model: str = "mistral-small-latest"
    vision_model: str = "mistral-small-latest"
    greeting_model: str = "mistral-small-latest"

    # RAG
    rag_top_k: int = 5

    # Cost
    usd_to_xaf_rate: float = 655.0

    # JWT
    jwt_secret_key: str = "beac-rag-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

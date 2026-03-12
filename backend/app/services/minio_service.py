import asyncio
from datetime import timedelta
from io import BytesIO

from minio import Minio

from app.config import get_settings


class MinIOService:
    """Service for MinIO object storage operations."""

    def __init__(self) -> None:
        settings = get_settings()
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_root_user,
            secret_key=settings.minio_root_password,
            secure=settings.minio_secure,
        )

    async def upload_file(self, bucket: str, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        stream = BytesIO(data)
        await asyncio.to_thread(
            self.client.put_object,
            bucket,
            key,
            stream,
            length=len(data),
            content_type=content_type,
        )
        return key

    async def download_file(self, bucket: str, key: str) -> bytes:
        response = await asyncio.to_thread(self.client.get_object, bucket, key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    async def delete_file(self, bucket: str, key: str) -> None:
        await asyncio.to_thread(self.client.remove_object, bucket, key)

    async def get_presigned_url(self, bucket: str, key: str, expires: int = 3600) -> str:
        url = await asyncio.to_thread(
            self.client.presigned_get_object,
            bucket,
            key,
            expires=timedelta(seconds=expires),
        )
        return url

    async def list_objects(self, bucket: str, prefix: str) -> list[str]:
        objects = await asyncio.to_thread(
            lambda: list(self.client.list_objects(bucket, prefix=prefix, recursive=True))
        )
        return [obj.object_name for obj in objects]

    async def delete_prefix(self, bucket: str, prefix: str) -> int:
        keys = await self.list_objects(bucket, prefix)
        for key in keys:
            await self.delete_file(bucket, key)
        return len(keys)

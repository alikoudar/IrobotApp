"""Initialize MinIO buckets."""

import os
import sys

from minio import Minio
from minio.error import S3Error


BUCKETS = ["uploads", "processed", "ocr-images", "audit-archives", "chat-images"]


def main():
    endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    access_key = os.getenv("MINIO_ROOT_USER", "minioadmin")
    secret_key = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin123")
    secure = os.getenv("MINIO_SECURE", "false").lower() == "true"

    print(f"Connexion à MinIO ({endpoint})...")
    try:
        client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)

        for bucket in BUCKETS:
            if not client.bucket_exists(bucket):
                client.make_bucket(bucket)
                print(f"  Bucket '{bucket}' créé.")
            else:
                print(f"  Bucket '{bucket}' existe déjà.")

        print("MinIO initialisé avec succès.")
    except S3Error as e:
        print(f"Erreur MinIO : {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Erreur : {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

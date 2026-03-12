import os

from celery import Celery

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "rag_worker",
    broker=redis_url,
    backend=redis_url,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "sweep-ocr-pending": {
            "task": "run_ocr_batch",
            "schedule": 60.0,
        },
        "sweep-chunking-pending": {
            "task": "sweep_chunking_pending",
            "schedule": 120.0,
        },
        "archive-old-audit-logs": {
            "task": "archive_old_audit_logs",
            "schedule": 86400.0,  # every 24h
        },
    },
)

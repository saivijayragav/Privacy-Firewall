"""Cloudflare R2 (S3-compatible) object storage client.

When R2 credentials are not configured, every method is a graceful no-op
so the application keeps working in local-only mode.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)


class R2ObjectStore:
    """Thin wrapper around boto3 S3 client configured for Cloudflare R2."""

    def __init__(
        self,
        endpoint_url: str | None,
        access_key_id: str | None,
        secret_access_key: str | None,
        bucket_name: str = "privacy-firewall",
    ) -> None:
        self.bucket = bucket_name
        self._enabled = all([endpoint_url, access_key_id, secret_access_key])
        self._client = None

        if self._enabled:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=endpoint_url,
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                config=Config(signature_version="s3v4"),
                region_name="auto",  # R2 uses "auto"
            )
            logger.info("R2 object store enabled  bucket=%s", bucket_name)
        else:
            logger.info("R2 object store disabled (credentials not configured)")

    # ------------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return self._enabled

    # ------------------------------------------------------------------

    @staticmethod
    def make_key(filename: str, scan_id: str | None = None) -> str:
        """Build a date-partitioned object key.

        Format: ``redacted/YYYY-MM-DD/{scan_id}_{filename}``
        """
        prefix = f"redacted/{date.today().isoformat()}"
        stem = f"{scan_id}_{filename}" if scan_id else filename
        return f"{prefix}/{stem}"

    # ------------------------------------------------------------------

    def upload(self, local_path: Path, object_key: str | None = None, scan_id: str | None = None) -> str | None:
        """Upload *local_path* to R2 and return the object key, or ``None`` if disabled."""
        if not self._enabled:
            return None

        if object_key is None:
            object_key = self.make_key(local_path.name, scan_id=scan_id)

        content_type = self._guess_content_type(local_path)

        try:
            self._client.upload_file(
                str(local_path),
                self.bucket,
                object_key,
                ExtraArgs={"ContentType": content_type},
            )
            logger.info("R2 upload OK  key=%s  size=%d", object_key, local_path.stat().st_size)
            return object_key
        except Exception:
            logger.exception("R2 upload failed  key=%s", object_key)
            return None

    def presigned_url(self, object_key: str, expires_in: int = 3600) -> str | None:
        """Generate a presigned download URL valid for *expires_in* seconds."""
        if not self._enabled:
            return None

        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": object_key},
                ExpiresIn=expires_in,
            )
        except Exception:
            logger.exception("R2 presigned URL generation failed  key=%s", object_key)
            return None

    def delete(self, object_key: str) -> bool:
        """Delete an object from R2.  Returns True on success."""
        if not self._enabled:
            return False

        try:
            self._client.delete_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception:
            logger.exception("R2 delete failed  key=%s", object_key)
            return False

    def list_objects(self, prefix: str = "redacted/", max_keys: int = 100) -> list[dict]:
        """List objects under *prefix*.  Returns list of {key, size, last_modified}."""
        if not self._enabled:
            return []

        try:
            resp = self._client.list_objects_v2(
                Bucket=self.bucket, Prefix=prefix, MaxKeys=max_keys,
            )
            return [
                {
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat(),
                }
                for obj in resp.get("Contents", [])
            ]
        except Exception:
            logger.exception("R2 list_objects failed  prefix=%s", prefix)
            return []

    # ------------------------------------------------------------------

    @staticmethod
    def _guess_content_type(path: Path) -> str:
        mapping = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".flac": "audio/flac",
        }
        return mapping.get(path.suffix.lower(), "application/octet-stream")

from __future__ import annotations

import sys
from pathlib import Path

# When executed as a script (python app/main.py), ensure project root is on sys.path
if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router as api_router
from app.settings import get_settings

settings = get_settings()


async def _cleanup_old_files() -> None:
    """Delete local uploads/outputs older than the configured max age."""
    import asyncio
    import time
    from pathlib import Path

    max_age_sec = settings.local_file_max_age_hours * 3600
    dirs = [
        Path.cwd() / "storage" / "uploads",
        Path.cwd() / "storage" / "outputs",
    ]
    while True:
        now = time.time()
        for d in dirs:
            if not d.exists():
                continue
            for f in d.iterdir():
                if f.is_file() and (now - f.stat().st_mtime) > max_age_sec:
                    f.unlink(missing_ok=True)
        await asyncio.sleep(600)  # check every 10 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    cleanup_task = asyncio.create_task(_cleanup_old_files())
    yield
    cleanup_task.cancel()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

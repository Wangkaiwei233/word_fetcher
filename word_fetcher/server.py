import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from word_fetcher.web.api import api_router


def create_app() -> FastAPI:
    app = FastAPI(title="word_fetcher", version="0.1.0")

    base_dir = Path(__file__).resolve().parent.parent
    web_dir = base_dir / "web"
    static_dir = web_dir / "static"

    app.include_router(api_router, prefix="/api")

    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/")
    def index():
        return FileResponse(str(web_dir / "index.html"))

    return app


def run() -> None:
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("word_fetcher.server:create_app", factory=True, host=host, port=port, reload=False)



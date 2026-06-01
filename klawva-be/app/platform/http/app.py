from fastapi import FastAPI

from app.platform.http.routes.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(title="Klawva Backend", version="0.1.0")
    app.include_router(health_router)
    return app

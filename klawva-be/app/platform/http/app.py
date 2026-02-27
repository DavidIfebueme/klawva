from fastapi import FastAPI

from app.features.sessions.routes import router as sessions_router
from app.platform.errors.handlers import register_exception_handlers
from app.platform.http.routes.health import router as health_router
from app.platform.logging.config import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="Klawva Backend", version="0.1.0")
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(sessions_router)
    return app

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.features.activity.routes import router as activity_router
from app.features.channels.routes import router as channels_router
from app.features.emails.routes import router as emails_router
from app.features.history.routes import router as history_router
from app.features.payments.routes import router as payments_router
from app.features.provisioning.routes import router as provisioning_router
from app.features.reports.routes import router as reports_router
from app.features.sessions.routes import router as sessions_router
from app.features.termination.routes import router as termination_router
from app.platform.config import settings
from app.platform.errors.handlers import register_exception_handlers
from app.platform.http.routes.health import router as health_router
from app.platform.logging.config import configure_logging
from app.platform.logging.middleware import register_request_logging
from app.platform.observability.routes import router as observability_router
from app.platform.security.middleware import register_security_middleware


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title="Klawva Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_base_url, "http://127.0.0.1:3000", "https://www.klawva.xyz"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_request_logging(app)
    register_security_middleware(app)
    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(sessions_router)
    app.include_router(channels_router)
    app.include_router(activity_router)
    app.include_router(emails_router)
    app.include_router(history_router)
    app.include_router(payments_router)
    app.include_router(provisioning_router)
    app.include_router(reports_router)
    app.include_router(termination_router)
    app.include_router(observability_router)
    return app

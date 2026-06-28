from app.features.activity import models as activity_models
from app.features.channels import models as channels_models
from app.features.emails import models as emails_models
from app.features.payments import models as payments_models
from app.features.provisioning import models as provisioning_models
from app.features.reports import models as reports_models
from app.features.sessions import models as sessions_models
from app.features.termination import models as termination_models
from app.features.users import models as users_models
from app.platform.db.models import idempotency_key as idempotency_models

MODEL_MODULES = [
    users_models,
    sessions_models,
    payments_models,
    provisioning_models,
    channels_models,
    activity_models,
    reports_models,
    termination_models,
    emails_models,
    idempotency_models,
]


def load_model_registry() -> None:
    for _module in MODEL_MODULES:
        pass

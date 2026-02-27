SENSITIVE_TOKENS = [
    "token",
    "secret",
    "password",
    "api-key",
    "authorization",
]


def redact_sensitive(value: str) -> str:
    lowered = value.lower()
    for token in SENSITIVE_TOKENS:
        if token in lowered:
            return "[REDACTED]"
    return value

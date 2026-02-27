"""
Application settings loaded from environment variables.

Uses pydantic-settings for type-safe env var parsing.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # Anthropic
    ANTHROPIC_API_KEY: str
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    # Database
    DATABASE_URL: str

    # Supabase Auth — JWKS endpoint for JWT verification (ES256)
    SUPABASE_URL: str

    # OpenAI — Embeddings API for RAG (v0.2)
    OPENAI_API_KEY: str = ""

    # App
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    # CORS — comma-separated allowed origins.
    # Wildcard entries like "https://*.vercel.app" are parsed and handled
    # via allow_origin_regex in main.py; they must not be passed to
    # allow_origins directly (Starlette does not support glob patterns there).
    FRONTEND_URL: str = "http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        """Return list of allowed origins split from FRONTEND_URL."""
        return [o.strip() for o in self.FRONTEND_URL.split(",")]

    @property
    def cookie_secure(self) -> bool:
        """True in production (requires HTTPS), False in development."""
        return self.ENVIRONMENT == "production"


settings = Settings()
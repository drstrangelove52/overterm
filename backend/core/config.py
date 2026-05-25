from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "overterm"
    db_password: str = "changeme"
    db_name: str = "overterm"

    secret_key: str = "insecure-dev-key-change-in-production"
    encryption_key: str = ""  # base64-encoded 32-byte key; generated if empty

    server_name: str = ""

    access_token_expire_hours: int = 8

    first_admin_username: str = "admin"
    first_admin_password: str = "changeme"
    first_admin_email: str = "admin@example.com"

    cors_origins: str = "http://localhost:3000,http://localhost"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+aiomysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()

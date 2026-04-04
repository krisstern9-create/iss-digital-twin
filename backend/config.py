"""
Централизованные настройки API (переменные окружения).
"""
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Tuple


def _split_origins(raw: str) -> List[str]:
    return [x.strip() for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    cors_origins: Tuple[str, ...]
    database_path: str
    tle_cache_seconds: int
    tle_request_timeout_sec: float
    stations_catalog_max: int
    log_level: str
    api_version: str = "1.1.0"


@lru_cache
def get_settings() -> Settings:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    default_db = os.path.join(base_dir, "digital_twin.db")
    return Settings(
        cors_origins=tuple(
            _split_origins(
                os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"),
            ),
        ),
        database_path=os.getenv("DATABASE_PATH", default_db),
        tle_cache_seconds=max(60, int(os.getenv("TLE_CACHE_SECONDS", "3600"))),
        tle_request_timeout_sec=float(os.getenv("TLE_REQUEST_TIMEOUT_SEC", "12")),
        stations_catalog_max=max(1, min(40, int(os.getenv("STATIONS_CATALOG_MAX", "8")))),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )


def clear_settings_cache() -> None:
    """Для тестов."""
    get_settings.cache_clear()

"""
Centralized configuration, loaded from environment variables / .env.

Nothing sensitive is hardcoded here — Sentinel Hub (Copernicus Data Space
Ecosystem) credentials must be supplied via the environment. See
server/.env.example for the full list of variables.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load the .env file located at the server package root (server/.env).
# When running the app from the project root (urbaninsight/) the default
# relative env_file could point to the wrong directory, so use an absolute
# path relative to this file to ensure the server reads `server/.env`.
_ENV_PATH = str(Path(__file__).resolve().parent.parent / ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_PATH, env_file_encoding="utf-8", extra="ignore")

    # --- Copernicus Data Space Ecosystem / Sentinel Hub OAuth ---
    # Create a free account at https://dataspace.copernicus.eu and register
    # an OAuth client under "User Settings" -> "OAuth clients".
    SH_CLIENT_ID: str = ""
    SH_CLIENT_SECRET: str = ""

    # CDSE endpoints (stable as of 2026; override if Copernicus changes them)
    SH_TOKEN_URL: str = (
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    )
    SH_CATALOG_URL: str = "https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search"
    SH_PROCESS_URL: str = "https://sh.dataspace.copernicus.eu/api/v1/process"

    # --- Scene search defaults (overridable per-request) ---
    DEFAULT_LOOKBACK_DAYS: int = 60          # window to search for the "after" scene
    DEFAULT_BASELINE_OFFSET_DAYS: int = 180  # how far back to look for the "before" scene
    DEFAULT_BASELINE_WINDOW_DAYS: int = 45   # search window around the baseline offset
    DEFAULT_MAX_CLOUD_COVER: float = 20.0    # percent

    # --- Change detection thresholds ---
    NDBI_CHANGE_THRESHOLD: float = 0.15      # min NDBI increase to flag as "new built-up"
    NDVI_DROP_CORROBORATION: float = 0.10    # NDVI decrease that corroborates construction
    MIN_POLYGON_AREA_M2: float = 200.0       # drop tiny/noisy polygons after vectorization

    # --- Imagery request sizing ---
    MAX_AOI_AREA_KM2: float = 400.0          # safety cap so requests stay cheap/fast
    PROCESSING_RESOLUTION_M: float = 10.0    # Sentinel-2 native resolution for B08/B04; B11 is resampled
    THUMBNAIL_MAX_PX: int = 512

    # --- Cache / storage ---
    DATABASE_PATH: str = str(Path(__file__).resolve().parent.parent / "data" / "cache.db")
    THUMBNAIL_DIR: str = str(Path(__file__).resolve().parent.parent / "data" / "thumbnails")
    CACHE_TTL_HOURS: int = 24  # re-check the same AOI+date-pair after this long, in case of reprocessing

    # --- CORS ---
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- Reservoirs ---
    RESERVOIR_SCRAPER_URL: str = ""
    RESERVOIR_DEMAND_ML_DAY: float = 4200.0

    # --- Live External API Keys ---
    TOMTOM_API_KEY: str = ""
    WAQI_API_KEY: str = ""
    
    # --- NASA Earthdata Credentials ---
    EARTHDATA_USERNAME: str = ""
    EARTHDATA_PASSWORD: str = ""
    BLACKMARBLE_TOKEN: str = ""



settings = Settings()

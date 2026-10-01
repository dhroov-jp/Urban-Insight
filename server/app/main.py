from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import construction, reservoirs, urban, lighting
from .services.scheduler import start_scheduler, shutdown_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the scheduled daily reservoir scraper
    start_scheduler()
    yield
    # Shutdown the scheduler
    shutdown_scheduler()


app = FastAPI(
    title="UrbanInsight — Urban Operations & Water Security API",
    description="Sentinel-2 change detection and reservoir water stock tracking.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(settings.THUMBNAIL_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/static/thumbnails", StaticFiles(directory=settings.THUMBNAIL_DIR), name="thumbnails")

app.include_router(construction.router)
app.include_router(reservoirs.router)
app.include_router(urban.router, prefix="/api")
app.include_router(lighting.router, prefix="/api/lighting")


@app.get("/api/health")
def health():
    return {"status": "ok"}


from pathlib import Path

from ..config import settings


def save_thumbnail(aoi_hash: str, label: str, date: str, png_bytes: bytes) -> str:
    """Writes a thumbnail PNG to disk and returns its public URL
    (served by FastAPI's StaticFiles mount at /static/thumbnails)."""
    out_dir = Path(settings.THUMBNAIL_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{aoi_hash}_{label}_{date}.png"
    (out_dir / filename).write_bytes(png_bytes)
    return f"/static/thumbnails/{filename}"

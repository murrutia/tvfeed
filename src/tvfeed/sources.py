"""Récupération des vidéos d'une source (chaîne YouTube, playlist...) via yt-dlp."""

import hashlib
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from yt_dlp import YoutubeDL

CACHE_TTL = 6 * 3600

# URL de chaîne sans onglet : on cible l'onglet "Vidéos" (exclut shorts et lives).
_CHANNEL_ROOT = re.compile(r"^https?://(www\.)?youtube\.com/(@[^/]+|channel/[^/]+|c/[^/]+)/?$")


@dataclass
class Video:
    id: str
    title: str
    duration: int  # secondes
    url: str
    source: str


def normalize_url(url: str) -> str:
    if _CHANNEL_ROOT.match(url):
        return url.rstrip("/") + "/videos"
    return url


def _fetch(url: str, limit: int) -> list[Video]:
    opts = {
        "extract_flat": "in_playlist",
        "playlistend": limit,
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(normalize_url(url), download=False)
    source = info.get("channel") or info.get("uploader") or info.get("title") or url
    videos = []
    for e in info.get("entries") or []:
        # Sans durée : live, première à venir, vidéo privée... inutilisable dans une grille.
        if not e.get("duration") or e.get("live_status") in ("is_live", "is_upcoming"):
            continue
        videos.append(
            Video(
                id=e["id"],
                title=e.get("title") or e["id"],
                duration=int(e["duration"]),
                url=e.get("url") or f"https://www.youtube.com/watch?v={e['id']}",
                source=source,
            )
        )
    return videos


def get_videos(url: str, limit: int, cache_dir: Path, force: bool = False) -> list[Video]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{url}|{limit}".encode()).hexdigest()
    path = cache_dir / f"{key}.json"
    if not force and path.exists():
        cached = json.loads(path.read_text())
        if time.time() - cached["fetched_at"] < CACHE_TTL:
            return [Video(**v) for v in cached["videos"]]
    videos = _fetch(url, limit)
    path.write_text(
        json.dumps({"url": url, "fetched_at": time.time(), "videos": [asdict(v) for v in videos]})
    )
    return videos

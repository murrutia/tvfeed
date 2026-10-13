"""Serveur web : API JSON du programme et interface compilée (`web/dist`)."""

import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import guide
from .config import load_channels
from .schedule import Slot

WEB_DIST = Path(os.environ.get("TVFEED_WEB", "web/dist"))
"""Dossier de l'interface compilée (variable `TVFEED_WEB`)."""

app = FastAPI(title="tvfeed")


def _slot(slot: Slot) -> dict:
    v = slot.video
    return {
        "id": v.id,
        "title": v.title,
        "source": v.source,
        "url": v.url,
        "thumbnail": v.thumbnail or f"https://i.ytimg.com/vi/{v.id}/mqdefault.jpg",
        "duration": v.duration,
        "start": slot.start.isoformat(),
        "end": slot.end.isoformat(),
    }


def _guide(now: datetime, guides: list[guide.ChannelGuide]) -> dict:
    return {
        "now": now.isoformat(),
        "channels": [
            {
                "name": g.channel.name,
                "themes": g.channel.themes,
                "video_count": g.video_count,
                "slots": [_slot(s) for s in g.slots],
            }
            for g in guides
        ],
    }


# Routes synchrones : FastAPI les exécute dans un pool de threads, la récupération
# yt-dlp ne bloque donc pas le serveur.
@app.get("/api/guide")
def get_guide(hours: float = 4, refresh: bool = False) -> dict:
    """Programme de toutes les chaînes.

    Args:
        hours: Durée couverte, en heures.
        refresh: Ignore le cache des sources.
    """
    return _guide(*guide.get_guide(hours, refresh=refresh))


@app.post("/api/shuffle")
def shuffle_all(hours: float = 4) -> dict:
    """Remélange toutes les chaînes et renvoie le nouveau programme."""
    guide.shuffle()
    return _guide(*guide.get_guide(hours))


@app.post("/api/channels/{name}/shuffle")
def shuffle_channel(name: str, hours: float = 4) -> dict:
    """Remélange une chaîne et renvoie son nouveau programme.

    Raises:
        HTTPException: 404 si la chaîne n'existe pas.
    """
    if name not in {c.name for c in load_channels(guide.CONFIG)}:
        raise HTTPException(404, f"Chaîne inconnue : {name}")
    guide.shuffle(name)
    return _guide(*guide.get_guide(hours, channel=name))


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")

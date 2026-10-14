"""Serveur web : API JSON du programme et interface compilée (`web/dist`)."""

import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import guide
from .config import load_channels
from .schedule import Slot
from .sources import Video, get_chapters

WEB_DIST = Path(os.environ.get("TVFEED_WEB", "web/dist"))
"""Dossier de l'interface compilée (variable `TVFEED_WEB`)."""

app = FastAPI(title="tvfeed")


VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}")


def _video(v: Video) -> dict:
    return {
        "id": v.id,
        "title": v.title,
        "source": v.source,
        "url": v.url,
        "thumbnail": v.thumbnail or f"https://i.ytimg.com/vi/{v.id}/mqdefault.jpg",
        "duration": v.duration,
    }


def _slot(slot: Slot) -> dict:
    return {**_video(slot.video), "start": slot.start.isoformat(), "end": slot.end.isoformat()}


def _check_id(video_id: str) -> None:
    if not VIDEO_ID.fullmatch(video_id):
        raise HTTPException(400, "Identifiant de vidéo invalide")


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
        "later": [
            {**_video(m.video), "channel": m.channel, "marked_at": m.marked_at}
            for m in guide.load_later()
            if not m.done
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


@app.get("/api/videos/{video_id}/chapters")
def chapters(video_id: str) -> list[dict]:
    """Chapitres d'une vidéo YouTube (liste vide si elle n'en a pas).

    Raises:
        HTTPException: 400 si l'identifiant est invalide, 502 si YouTube ne répond pas.
    """
    # L'identifiant sert de nom de fichier dans le cache : on le valide strictement.
    _check_id(video_id)
    try:
        return [vars(c) for c in get_chapters(video_id, guide.DATA / "cache")]
    except Exception as e:
        raise HTTPException(502, f"Chapitres indisponibles : {e}") from e


@app.post("/api/channels/{name}/videos/{video_id}/mark")
def mark(name: str, video_id: str, hours: float = 4) -> dict:
    """Marque une vidéo « à revoir » : elle quitte sa chaîne et la suivante démarre.

    Raises:
        HTTPException: 404 si la chaîne ou la vidéo est inconnue.
    """
    _check_id(video_id)
    try:
        guide.mark(name, video_id)
    except KeyError as e:
        raise HTTPException(404, f"Introuvable : {e}") from e
    return _guide(*guide.get_guide(hours))


@app.delete("/api/later/{video_id}")
def unmark(video_id: str, hours: float = 4) -> dict:
    """Retire une vidéo de la liste « à revoir » et la remet dans sa chaîne.

    Raises:
        HTTPException: 404 si la vidéo n'est pas dans la liste.
    """
    _check_id(video_id)
    try:
        guide.unmark(video_id)
    except KeyError as e:
        raise HTTPException(404, f"Introuvable : {e}") from e
    return _guide(*guide.get_guide(hours))


@app.post("/api/later/{video_id}/done")
def mark_done(video_id: str, hours: float = 4) -> dict:
    """Note une vidéo de la liste « à revoir » comme vue.

    Raises:
        HTTPException: 404 si la vidéo n'est pas dans la liste.
    """
    _check_id(video_id)
    try:
        guide.mark_done(video_id)
    except KeyError as e:
        raise HTTPException(404, f"Introuvable : {e}") from e
    return _guide(*guide.get_guide(hours))


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")

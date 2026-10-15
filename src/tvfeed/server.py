"""Serveur web : API JSON du programme et interface compilée (`web/dist`)."""

import os
import re
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import ai, assist, config, guide, iptv
from .config import DEFAULT_PER_SOURCE, IPTV, YOUTUBE, Channel, load_channels
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
                "kind": g.channel.kind,
                "themes": g.channel.themes,
                "video_count": g.video_count,
                "slots": [_slot(s) for s in g.slots],
                # Chaîne IPTV : flux à essayer dans l'ordre, et logo.
                "streams": g.channel.sources if g.channel.is_iptv else [],
                "logo": g.channel.logo,
                "aspect": g.channel.aspect,
                "fill": g.channel.fill,
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


class ChannelIn(BaseModel):
    """Définition d'une chaîne envoyée par l'interface."""

    name: str = Field(min_length=1, max_length=60)
    themes: list[str] = []
    sources: list[str] = Field(min_length=1)
    per_source: int = Field(DEFAULT_PER_SOURCE, ge=1, le=200)
    kind: str = Field(YOUTUBE, pattern=f"^({YOUTUBE}|{IPTV})$")
    logo: str = ""
    iptv_id: str = ""
    aspect: str = Field("", pattern=r"^(\d+(\.\d+)?:\d+(\.\d+)?)?$")
    fill: bool = False

    def to_channel(self) -> Channel:
        clean = lambda items: list(dict.fromkeys(i.strip() for i in items if i.strip()))
        return Channel(
            self.name.strip(), clean(self.sources), clean(self.themes), self.per_source,
            self.kind, self.logo.strip(), self.iptv_id.strip(), self.aspect.strip(), self.fill,
        )


class Order(BaseModel):
    names: list[str]


@app.get("/api/channels")
def list_channels() -> list[dict]:
    """Définition des chaînes, dans l'ordre de `channels.toml`."""
    return [vars(c) for c in load_channels(guide.CONFIG)]


def _save(channel: ChannelIn, previous_name: str | None) -> list[dict]:
    c = channel.to_channel()
    if not c.name or not c.sources:
        raise HTTPException(422, "Il faut un nom et au moins une source")
    try:
        guide.save_channel(c, previous_name)
    except KeyError as e:
        raise HTTPException(404, f"Chaîne inconnue : {e}") from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return list_channels()


@app.post("/api/channels")
def create_channel(channel: ChannelIn) -> list[dict]:
    """Crée une chaîne ; les sources sont vérifiées (422 si l'une est invalide)."""
    return _save(channel, None)


@app.put("/api/channels/order")
def reorder_channels(order: Order) -> list[dict]:
    """Réordonne les chaînes (liste complète des noms)."""
    try:
        config.reorder_channels(guide.CONFIG, order.names)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return list_channels()


@app.put("/api/channels/{name}")
def update_channel(name: str, channel: ChannelIn) -> list[dict]:
    """Modifie (ou renomme) une chaîne ; seules les sources ajoutées sont vérifiées."""
    return _save(channel, name)


class Display(BaseModel):
    """Affichage de l'image d'une chaîne."""

    aspect: str = ""
    fill: bool = False


@app.put("/api/channels/{name}/display")
def set_display(name: str, display: Display, hours: float = 4) -> dict:
    """Règle le format d'image (`4:3`… ou vide) et le remplissage d'une chaîne.

    Raises:
        HTTPException: 404 si la chaîne n'existe pas, 422 si le format est invalide.
    """
    try:
        config.set_display(guide.CONFIG, name, display.aspect.strip(), display.fill)
    except KeyError as e:
        raise HTTPException(404, f"Chaîne inconnue : {e}") from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return _guide(*guide.get_guide(hours, channel=name))


@app.delete("/api/channels/{name}")
def delete_channel(name: str) -> list[dict]:
    """Supprime une chaîne."""
    try:
        guide.delete_channel(name)
    except KeyError as e:
        raise HTTPException(404, f"Chaîne inconnue : {e}") from e
    return list_channels()


class Draft(BaseModel):
    """Chaîne en cours d'édition, pour les suggestions."""

    name: str = ""
    themes: list[str] = []
    sources: list[str] = []
    use_ai: bool = True


@app.get("/api/ai")
def ai_status() -> dict:
    """Modèle d'IA locale utilisé, ou `null` si Ollama est indisponible."""
    return {"model": ai.model()}


@app.post("/api/assist/themes")
def suggest_themes(draft: Draft) -> dict:
    """Thèmes proposés par l'IA d'après les vidéos des sources.

    Raises:
        HTTPException: 503 si l'IA locale est indisponible ou en erreur.
    """
    try:
        return {"themes": assist.suggest_themes(draft.name, draft.themes, draft.sources)}
    except Exception as e:
        raise HTTPException(503, f"IA locale indisponible : {e}") from e


@app.post("/api/assist/channels")
def discover_channels(draft: Draft) -> dict:
    """Chaînes YouTube qui conviendraient, d'après le nom, les thèmes et les sources.

    Raises:
        HTTPException: 422 sans nom ni thème, 502 si la recherche YouTube échoue.
    """
    if not draft.name.strip() and not draft.themes:
        raise HTTPException(422, "Indiquez au moins un nom ou un thème")
    try:
        return assist.discover(draft.name.strip(), draft.themes, draft.sources, draft.use_ai)
    except Exception as e:
        raise HTTPException(502, f"Recherche impossible : {e}") from e


def _catalog() -> iptv.Catalog:
    try:
        return iptv.catalog(guide.DATA / "cache" / "iptv")
    except OSError as e:
        raise HTTPException(502, f"Catalogue iptv-org injoignable : {e}") from e


@app.get("/api/iptv/filters")
def iptv_filters() -> dict:
    """Pays et catégories du catalogue iptv-org, avec leur nombre de chaînes.

    Raises:
        HTTPException: 502 si le catalogue est injoignable.
    """
    return iptv.filters(_catalog())


@app.get("/api/iptv/search")
def iptv_search(q: str = "", country: str = "", category: str = "", limit: int = 60) -> list[dict]:
    """Chaînes du catalogue iptv-org par mots-clés, pays (`PE`) et catégorie (`news`).

    Raises:
        HTTPException: 502 si le catalogue est injoignable.
    """
    return iptv.search(_catalog(), q, country, category, min(limit, 200))


if WEB_DIST.is_dir():
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")

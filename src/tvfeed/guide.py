"""Programme des chaînes : état (graine, ancre), récupération et calcul des grilles.

Partagé par la ligne de commande et le serveur web.
"""

import json
import os
import random
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import Channel, load_channels
from .schedule import Slot, build_playlist, build_schedule
from .sources import Video, get_videos

CONFIG = Path(os.environ.get("TVFEED_CONFIG", "channels.toml"))
"""Fichier de définition des chaînes (variable `TVFEED_CONFIG`)."""
DATA = Path(os.environ.get("TVFEED_DATA", "data"))
"""Dossier du cache et de l'état (variable `TVFEED_DATA`)."""
STATE = DATA / "state.json"


@dataclass
class ChannelGuide:
    """Programme d'une chaîne.

    Attributes:
        channel: Chaîne concernée.
        video_count: Nombre de vidéos dans la playlist.
        slots: Créneaux à venir, le premier étant la vidéo en cours.
    """

    channel: Channel
    video_count: int
    slots: list[Slot]


def load_state() -> dict:
    """Lit l'état des chaînes (graine et ancre) depuis `data/state.json`."""
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state: dict) -> None:
    """Enregistre l'état des chaînes dans `data/state.json`."""
    DATA.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2))


def new_run() -> dict:
    """Tire une nouvelle graine et place l'ancre à maintenant."""
    return {"seed": random.randrange(2**32), "anchor": datetime.now().astimezone().isoformat()}


def fetch_all(channels: list[Channel], force: bool) -> dict[str, list[Video]]:
    """Récupère toutes les sources en parallèle. Une source en erreur est ignorée.

    Args:
        channels: Chaînes dont on récupère les sources.
        force: Ignore le cache.

    Returns:
        Les vidéos de chaque chaîne, indexées par nom de chaîne.
    """
    jobs = {(c.name, url): c.per_source for c in channels for url in c.sources}
    result: dict[str, list[Video]] = {c.name: [] for c in channels}

    def job(key):
        name, url = key
        try:
            return name, get_videos(url, jobs[key], DATA / "cache", force)
        except Exception as e:
            print(f"! {url} : {e}")
            return name, []

    with ThreadPoolExecutor(max_workers=8) as pool:
        for name, videos in pool.map(job, jobs):
            result[name].extend(videos)
    return result


def get_guide(
    hours: float, channel: str | None = None, refresh: bool = False
) -> tuple[datetime, list[ChannelGuide]]:
    """Calcule le programme des chaînes.

    Une chaîne vue pour la première fois reçoit une graine et une ancre.

    Args:
        hours: Durée couverte par le programme, en heures.
        channel: Limite le programme à cette chaîne.
        refresh: Ignore le cache des sources.

    Returns:
        L'instant de référence et le programme de chaque chaîne.
    """
    channels = load_channels(CONFIG)
    if channel:
        channels = [c for c in channels if c.name == channel]
    state = load_state()
    for c in channels:
        state.setdefault(c.name, new_run())
    save_state(state)

    videos = fetch_all(channels, refresh)
    now = datetime.now().astimezone()
    guides = []
    for c in channels:
        run = state[c.name]
        playlist = build_playlist(videos[c.name], run["seed"])
        slots = build_schedule(playlist, datetime.fromisoformat(run["anchor"]), now, hours)
        guides.append(ChannelGuide(c, len(playlist), slots))
    return now, guides


def shuffle(channel: str | None = None) -> list[str]:
    """Remélange une chaîne, ou toutes : nouvelle graine et nouvelle ancre.

    Args:
        channel: Chaîne à remélanger ; toutes si absent.

    Returns:
        Les noms des chaînes remélangées.
    """
    names = [c.name for c in load_channels(CONFIG)]
    targets = [channel] if channel else names
    state = load_state()
    for name in targets:
        state[name] = new_run()
    save_state(state)
    return targets

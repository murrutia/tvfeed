"""Programme des chaînes : état (graine, ancre), récupération et calcul des grilles.

Partagé par la ligne de commande et le serveur web.
"""

import json
import os
import random
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

from . import config
from .config import Channel, load_channels
from .schedule import Slot, anchor_at, build_playlist, build_schedule, position
from .sources import Video, get_videos

CONFIG = Path(os.environ.get("TVFEED_CONFIG", "channels.toml"))
"""Fichier de définition des chaînes (variable `TVFEED_CONFIG`)."""
DATA = Path(os.environ.get("TVFEED_DATA", "data"))
"""Dossier du cache et de l'état (variable `TVFEED_DATA`)."""
STATE = DATA / "state.json"
LATER = DATA / "later.json"


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


@dataclass
class Marked:
    """Vidéo marquée « à revoir ».

    Attributes:
        video: Vidéo marquée.
        channel: Chaîne d'où elle a été retirée.
        marked_at: Instant du marquage (ISO 8601).
        done: Vue jusqu'au bout depuis la liste : elle n'y apparaît plus, et ne
            revient pas non plus dans sa chaîne.
    """

    video: Video
    channel: str
    marked_at: str
    done: bool = False


def load_later() -> list[Marked]:
    """Lit les vidéos marquées depuis `data/later.json`, dans l'ordre de marquage."""
    if not LATER.exists():
        return []
    return [Marked(**{**m, "video": Video(**m["video"])}) for m in json.loads(LATER.read_text())]


def save_later(later: list[Marked]) -> None:
    """Enregistre les vidéos marquées dans `data/later.json`."""
    DATA.mkdir(parents=True, exist_ok=True)
    LATER.write_text(json.dumps([asdict(m) for m in later], indent=2, ensure_ascii=False))


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
    exclude = {m.video.id for m in load_later()}
    now = datetime.now().astimezone()
    guides = []
    for c in channels:
        run = state[c.name]
        playlist = build_playlist(videos[c.name], run["seed"], exclude)
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


def _channel(name: str) -> Channel:
    for c in load_channels(CONFIG):
        if c.name == name:
            return c
    raise KeyError(name)


def mark(channel: str, video_id: str) -> None:
    """Marque une vidéo « à revoir » : elle quitte sa chaîne, et la suivante démarre.

    L'ancre de la chaîne est recalée pour que la vidéo qui suivait la vidéo marquée
    commence maintenant ; le reste de la grille garde son ordre.

    Args:
        channel: Chaîne où passe la vidéo.
        video_id: Vidéo à marquer.

    Raises:
        KeyError: Si la chaîne n'existe pas ou si la vidéo n'est pas dans sa playlist.
    """
    c = _channel(channel)
    state, later = load_state(), load_later()
    exclude = {m.video.id for m in later}
    playlist = build_playlist(fetch_all([c], False)[c.name], state[c.name]["seed"], exclude)
    index = next((i for i, v in enumerate(playlist) if v.id == video_id), None)
    if index is None:
        raise KeyError(video_id)

    now = datetime.now().astimezone()
    video = playlist.pop(index)
    later.append(Marked(video, c.name, now.isoformat()))
    if playlist:
        # La vidéo suivante a pris la place de la vidéo marquée, au même indice.
        state[c.name]["anchor"] = anchor_at(playlist, index % len(playlist), 0, now).isoformat()
    save_later(later)
    save_state(state)


def unmark(video_id: str) -> None:
    """Retire une vidéo de la liste « à revoir » et la remet dans sa chaîne.

    La vidéo en cours sur cette chaîne reste à l'antenne, à la même position.

    Args:
        video_id: Vidéo à retirer de la liste.

    Raises:
        KeyError: Si la vidéo n'est pas dans la liste.
    """
    later = load_later()
    marked = next((m for m in later if m.video.id == video_id), None)
    if marked is None:
        raise KeyError(video_id)
    later.remove(marked)

    state = load_state()
    try:
        c = _channel(marked.channel)
    except KeyError:
        c = None  # Chaîne supprimée depuis : rien à recaler.
    if c and c.name in state:
        videos = fetch_all([c], False)[c.name]
        seed = state[c.name]["seed"]
        now = datetime.now().astimezone()
        before = build_playlist(videos, seed, {m.video.id for m in later} | {video_id})
        after = build_playlist(videos, seed, {m.video.id for m in later})
        if before:
            i, offset = position(before, datetime.fromisoformat(state[c.name]["anchor"]), now)
            current = before[i].id
            index = next(j for j, v in enumerate(after) if v.id == current)
            state[c.name]["anchor"] = anchor_at(after, index, offset, now).isoformat()
            save_state(state)
    save_later(later)


def mark_done(video_id: str) -> None:
    """Note une vidéo de la liste « à revoir » comme vue : elle n'y apparaît plus.

    Args:
        video_id: Vidéo vue.

    Raises:
        KeyError: Si la vidéo n'est pas dans la liste.
    """
    later = load_later()
    marked = next((m for m in later if m.video.id == video_id), None)
    if marked is None:
        raise KeyError(video_id)
    marked.done = True
    save_later(later)


def check_sources(urls: list[str], per_source: int) -> None:
    """Vérifie que des sources sont lisibles et contiennent des vidéos.

    Les vidéos récupérées restent en cache : la chaîne est ensuite prête tout de suite.

    Args:
        urls: Sources à vérifier.
        per_source: Nombre de vidéos à récupérer par source.

    Raises:
        ValueError: Pour la première source inaccessible ou sans vidéo.
    """

    def check(url: str) -> str | None:
        try:
            if not get_videos(url, per_source, DATA / "cache"):
                return f"{url} : aucune vidéo trouvée"
        except Exception as e:
            # Messages yt-dlp : « ERROR: [youtube:tab] x: ... (caused by ...) », trop bavards.
            message = str(e).split(" (caused by")[0].removeprefix("ERROR: ")
            return f"{url} : source illisible ({message.rsplit(': ', 1)[-1]})"
        return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        errors = [e for e in pool.map(check, urls) if e]
    if errors:
        raise ValueError(errors[0])


def save_channel(channel: Channel, previous_name: str | None = None) -> None:
    """Crée ou modifie une chaîne, après vérification des sources ajoutées.

    En cas de renommage, l'état de la chaîne (graine, ancre) et ses vidéos marquées
    suivent le nouveau nom : le programme ne change pas.

    Args:
        channel: Nouvelle définition de la chaîne.
        previous_name: Nom actuel de la chaîne à modifier ; création si absent.

    Raises:
        KeyError: Si `previous_name` ne correspond à aucune chaîne.
        ValueError: Si le nom est déjà pris ou si une source ajoutée est invalide.
    """
    old = _channel(previous_name) if previous_name else None
    known = set(old.sources) if old and old.per_source == channel.per_source else set()
    check_sources([u for u in channel.sources if u not in known], channel.per_source)
    config.upsert_channel(CONFIG, channel, previous_name)

    if previous_name and previous_name != channel.name:
        state = load_state()
        if previous_name in state:
            state[channel.name] = state.pop(previous_name)
            save_state(state)
        later = load_later()
        for m in later:
            if m.channel == previous_name:
                m.channel = channel.name
        save_later(later)


def delete_channel(name: str) -> None:
    """Supprime une chaîne et son état. Ses vidéos marquées restent dans la liste.

    Raises:
        KeyError: Si la chaîne n'existe pas.
    """
    config.delete_channel(CONFIG, name)
    state = load_state()
    if state.pop(name, None) is not None:
        save_state(state)

"""Construction de la grille d'une chaîne.

La grille est déterministe : une graine (ordre du mélange) et une ancre (instant où
la playlist a démarré) suffisent à savoir ce qui passe à n'importe quel moment.
La playlist tourne en boucle depuis l'ancre, ce qui donne l'avance « virtuelle » :
en allumant une chaîne, on tombe en cours de vidéo.
"""

import random
from dataclasses import dataclass
from datetime import datetime, timedelta

from .sources import Video


@dataclass
class Slot:
    """Créneau de la grille.

    Attributes:
        video: Vidéo diffusée.
        start: Début du créneau.
        end: Fin du créneau.
    """

    video: Video
    start: datetime
    end: datetime


def build_playlist(videos: list[Video], seed: int, exclude: set[str] = frozenset()) -> list[Video]:
    """Mélange les vidéos d'une chaîne de façon reproductible.

    Args:
        videos: Vidéos de toutes les sources de la chaîne, doublons possibles.
        seed: Graine du mélange.
        exclude: Identifiants des vidéos à retirer (vidéos marquées).

    Returns:
        Les vidéos sans doublon, dans un ordre qui ne dépend que de `seed`.
    """
    # Dédoublonnage + tri pour que le mélange ne dépende que de la graine.
    unique = sorted({v.id: v for v in videos}.values(), key=lambda v: v.id)
    random.Random(seed).shuffle(unique)
    # Filtrage après le mélange : retirer une vidéo ne change pas l'ordre des autres.
    return [v for v in unique if v.id not in exclude]


def position(playlist: list[Video], anchor: datetime, now: datetime) -> tuple[int, int]:
    """Situe l'instant `now` dans la playlist jouée en boucle depuis `anchor`.

    Args:
        playlist: Playlist de la chaîne, non vide.
        anchor: Instant où la playlist a démarré.
        now: Instant courant.

    Returns:
        L'indice de la vidéo en cours et la position dans cette vidéo, en secondes.
    """
    total = sum(v.duration for v in playlist)
    elapsed = int((now - anchor).total_seconds()) % total
    i = 0
    while elapsed >= playlist[i].duration:
        elapsed -= playlist[i].duration
        i += 1
    return i, elapsed


def anchor_at(playlist: list[Video], index: int, offset: float, now: datetime) -> datetime:
    """Ancre telle que la vidéo `index` soit à la position `offset` à l'instant `now`.

    Sert à modifier une playlist sans faire sauter ce qui passe à l'antenne.

    Args:
        playlist: Playlist de la chaîne.
        index: Indice de la vidéo qui doit être en cours.
        offset: Position voulue dans cette vidéo, en secondes.
        now: Instant courant.

    Returns:
        La nouvelle ancre.
    """
    before = sum(v.duration for v in playlist[:index])
    return now - timedelta(seconds=before + offset)


def build_schedule(
    playlist: list[Video], anchor: datetime, now: datetime, hours: float
) -> list[Slot]:
    """Calcule la grille à partir de la vidéo en cours.

    Args:
        playlist: Playlist de la chaîne, jouée en boucle.
        anchor: Instant où la playlist a démarré.
        now: Instant courant.
        hours: Durée couverte par la grille, en heures.

    Returns:
        Les créneaux successifs. Le premier est la vidéo en cours (commencée avant
        `now`) ; le dernier se termine après `now + hours`. Liste vide si la
        playlist est vide.
    """
    if not playlist:
        return []
    i, offset = position(playlist, anchor, now)
    start = now - timedelta(seconds=offset)

    limit = now + timedelta(hours=hours)
    slots = []
    while True:
        video = playlist[i % len(playlist)]
        end = start + timedelta(seconds=video.duration)
        slots.append(Slot(video, start, end))
        if end >= limit:
            return slots
        start, i = end, i + 1

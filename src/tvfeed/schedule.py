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
    video: Video
    start: datetime
    end: datetime


def build_playlist(videos: list[Video], seed: int) -> list[Video]:
    # Dédoublonnage + tri pour que le mélange ne dépende que de la graine.
    unique = sorted({v.id: v for v in videos}.values(), key=lambda v: v.id)
    random.Random(seed).shuffle(unique)
    return unique


def build_schedule(
    playlist: list[Video], anchor: datetime, now: datetime, hours: float
) -> list[Slot]:
    if not playlist:
        return []
    total = sum(v.duration for v in playlist)
    elapsed = int((now - anchor).total_seconds()) % total

    # Vidéo en cours et instant où elle a commencé.
    i, offset = 0, 0
    while offset + playlist[i].duration <= elapsed:
        offset += playlist[i].duration
        i += 1
    start = now - timedelta(seconds=elapsed - offset)

    limit = now + timedelta(hours=hours)
    slots = []
    while True:
        video = playlist[i % len(playlist)]
        end = start + timedelta(seconds=video.duration)
        slots.append(Slot(video, start, end))
        if end >= limit:
            return slots
        start, i = end, i + 1

"""Récupération des vidéos d'une source (chaîne YouTube, playlist...) via yt-dlp."""

import hashlib
import json
import re
import time
import urllib.parse
from dataclasses import asdict, dataclass
from pathlib import Path

from yt_dlp import YoutubeDL

CACHE_TTL = 6 * 3600
"""Durée de validité du cache, en secondes."""

# URL de chaîne sans onglet : on cible l'onglet "Vidéos" (exclut shorts et lives).
_CHANNEL_ROOT = re.compile(r"^https?://(www\.)?youtube\.com/(@[^/]+|channel/[^/]+|c/[^/]+)/?$")


@dataclass
class Video:
    """Vidéo programmable dans une grille.

    Attributes:
        id: Identifiant de la vidéo sur la plateforme.
        title: Titre de la vidéo.
        duration: Durée, en secondes.
        url: URL de lecture.
        source: Nom de la chaîne d'origine.
        thumbnail: URL de la vignette (vide si inconnue).
    """

    id: str
    title: str
    duration: int  # secondes
    url: str
    source: str
    thumbnail: str = ""


def normalize_url(url: str) -> str:
    """Redirige une URL de chaîne YouTube vers son onglet « Vidéos ».

    Args:
        url: URL de source quelconque.

    Returns:
        L'URL suivie de `/videos` si c'est la racine d'une chaîne, sinon l'URL inchangée.
    """
    if _CHANNEL_ROOT.match(url):
        return url.rstrip("/") + "/videos"
    return url


def _fetch(url: str, limit: int) -> list[Video]:
    """Interroge yt-dlp en mode « flat » (liste sans ouvrir chaque vidéo)."""
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
                thumbnail=e["thumbnails"][-1]["url"] if e.get("thumbnails") else "",
            )
        )
    return videos


@dataclass
class Chapter:
    """Chapitre d'une vidéo.

    Attributes:
        start: Début, en secondes.
        end: Fin, en secondes.
        title: Titre du chapitre.
    """

    start: float
    end: float
    title: str


def get_chapters(video_id: str, cache_dir: Path) -> list[Chapter]:
    """Renvoie les chapitres d'une vidéo YouTube, depuis le cache si possible.

    Les chapitres changent rarement : le cache n'expire pas.

    Args:
        video_id: Identifiant YouTube de la vidéo.
        cache_dir: Dossier du cache.

    Returns:
        Les chapitres dans l'ordre, liste vide si la vidéo n'en a pas.

    Raises:
        yt_dlp.utils.DownloadError: Si la vidéo est inaccessible.
    """
    path = cache_dir / "chapters" / f"{video_id}.json"
    if path.exists():
        return [Chapter(**c) for c in json.loads(path.read_text())]
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # Les chapitres viennent de la page ; inutile d'exécuter le JS du lecteur.
        "extractor_args": {"youtube": {"player_skip": ["js"]}},
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}", download=False, process=False
        )
    raw = info.get("chapters") or []
    # Sans traitement complet (`process=False`), yt-dlp ne calcule pas `end_time` :
    # un chapitre finit où commence le suivant, le dernier à la fin de la vidéo.
    ends = [c["start_time"] for c in raw[1:]] + [info.get("duration") or 0]
    chapters = [
        Chapter(start=c["start_time"], end=c.get("end_time") or end, title=c.get("title") or "")
        for c, end in zip(raw, ends)
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([asdict(c) for c in chapters]))
    return chapters


def get_videos(url: str, limit: int, cache_dir: Path, force: bool = False) -> list[Video]:
    """Renvoie les vidéos récentes d'une source, depuis le cache si possible.

    Args:
        url: URL de la source.
        limit: Nombre maximal de vidéos à récupérer.
        cache_dir: Dossier du cache.
        force: Ignore le cache et interroge toujours la plateforme.

    Returns:
        Les vidéos ayant une durée connue, les plus récentes d'abord.

    Raises:
        yt_dlp.utils.DownloadError: Si la source est inaccessible.
    """
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


@dataclass
class ChannelResult:
    """Chaîne YouTube trouvée par une recherche.

    Attributes:
        name: Nom de la chaîne.
        url: URL de la chaîne (forme `@handle` si connue).
        followers: Nombre d'abonnés, s'il est connu.
        description: Description de la chaîne.
        thumbnail: URL de l'avatar.
    """

    name: str
    url: str
    followers: int | None
    description: str
    thumbnail: str


def search_channels(query: str, limit: int = 6) -> list[ChannelResult]:
    """Cherche des chaînes YouTube (et non des vidéos) correspondant à une requête.

    Args:
        query: Texte recherché.
        limit: Nombre maximal de résultats.

    Returns:
        Les chaînes trouvées, dans l'ordre de pertinence de YouTube.
    """
    # `sp=EgIQAg==` : filtre « Chaînes » de la page de résultats YouTube.
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&sp=EgIQAg%3D%3D"
    opts = {"extract_flat": True, "playlistend": limit, "quiet": True, "no_warnings": True, "skip_download": True}
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    results = []
    for e in info.get("entries") or []:
        handle = e.get("uploader_id") or ""
        thumbnail = (e.get("thumbnails") or [{}])[-1].get("url", "")
        results.append(
            ChannelResult(
                name=e.get("channel") or e.get("title") or handle,
                url=f"https://www.youtube.com/{handle}" if handle.startswith("@") else e["url"],
                followers=e.get("channel_follower_count"),
                description=e.get("description") or "",
                thumbnail=f"https:{thumbnail}" if thumbnail.startswith("//") else thumbnail,
            )
        )
    return results

"""Environnement de test isolé : config et données dans un dossier temporaire, et
sources factices à la place de yt-dlp (aucun accès réseau)."""

from pathlib import Path

import pytest

from tvfeed import guide
from tvfeed.sources import Video

CHANNELS_TOML = """\
# Commentaire d'en-tête, à conserver.

[[channel]]
name = "Sciences"
themes = ["science"]
sources = ["https://src/a", "https://src/b"]

[[channel]]
name = "Histoire"
themes = ["histoire"]
per_source = 5
sources = ["https://src/c"]
"""


def make_videos(prefix: str, count: int) -> list[Video]:
    # Identifiants au format YouTube (11 caractères) et durées toutes différentes.
    return [
        Video(f"{prefix}{i:010d}", f"{prefix} {i}", 60 * (i + 1), f"https://v/{prefix}{i}", prefix)
        for i in range(count)
    ]


SOURCES = {
    "https://src/a": make_videos("a", 4),
    "https://src/b": make_videos("b", 3),
    "https://src/c": make_videos("c", 5),
    "https://src/new": make_videos("n", 2),
    "https://src/empty": [],
}


def fake_get_videos(url: str, limit: int, cache_dir: Path, force: bool = False) -> list[Video]:
    if url not in SOURCES:
        raise RuntimeError("HTTP Error 404: Not Found")
    return SOURCES[url][:limit]


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch) -> Path:
    """Redirige config et données vers `tmp_path` et remplace la récupération des vidéos."""
    config = tmp_path / "channels.toml"
    config.write_text(CHANNELS_TOML)
    data = tmp_path / "data"
    monkeypatch.setattr(guide, "CONFIG", config)
    monkeypatch.setattr(guide, "DATA", data)
    monkeypatch.setattr(guide, "STATE", data / "state.json")
    monkeypatch.setattr(guide, "LATER", data / "later.json")
    monkeypatch.setattr(guide, "get_videos", fake_get_videos)
    return tmp_path

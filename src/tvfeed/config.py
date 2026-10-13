"""Lecture de la définition des chaînes (`channels.toml`)."""

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PER_SOURCE = 30


@dataclass
class Channel:
    """Chaîne locale : un regroupement thématique de sources vidéo.

    Attributes:
        name: Titre de la chaîne, sert aussi d'identifiant.
        sources: URL des sources (chaîne YouTube, playlist...).
        themes: Thèmes de la chaîne.
        per_source: Nombre de vidéos récentes récupérées par source.
    """

    name: str
    sources: list[str]
    themes: list[str] = field(default_factory=list)
    per_source: int = DEFAULT_PER_SOURCE


def load_channels(path: Path) -> list[Channel]:
    """Charge les chaînes définies dans un fichier TOML.

    Args:
        path: Chemin du fichier, au format de `channels.toml`.

    Returns:
        Les chaînes, dans l'ordre du fichier.
    """
    with path.open("rb") as f:
        data = tomllib.load(f)
    return [
        Channel(
            name=c["name"],
            sources=c["sources"],
            themes=c.get("themes", []),
            per_source=c.get("per_source", DEFAULT_PER_SOURCE),
        )
        for c in data.get("channel", [])
    ]

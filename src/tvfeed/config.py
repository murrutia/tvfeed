"""Lecture et écriture de la définition des chaînes (`channels.toml`).

L'écriture passe par tomlkit, qui conserve les commentaires et la mise en forme du
fichier écrit à la main.
"""

import re
import threading
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

import tomlkit
from tomlkit.items import AoT, Table

DEFAULT_PER_SOURCE = 30
YOUTUBE = "youtube"
IPTV = "iptv"
ASPECT = re.compile(r"^\d+(\.\d+)?:\d+(\.\d+)?$")
"""Format d'image imposé : `16:9`, `4:3`, `1.85:1`…"""


@dataclass
class Channel:
    """Chaîne locale.

    Deux sortes de chaînes : `youtube` (vidéos de plusieurs sources, mélangées dans un
    programme) et `iptv` (une chaîne de télévision en direct, sans programme).

    Attributes:
        name: Titre de la chaîne, sert aussi d'identifiant.
        sources: URL des sources : chaînes YouTube ou playlists, ou pour une chaîne IPTV,
            flux HLS essayés dans l'ordre.
        themes: Thèmes de la chaîne.
        per_source: Nombre de vidéos récentes récupérées par source (YouTube).
        kind: Sorte de chaîne : `youtube` ou `iptv`.
        logo: URL du logo (IPTV).
        iptv_id: Identifiant de la chaîne dans le catalogue iptv-org (IPTV).
        aspect: Format d'image imposé (`4:3`…) pour corriger une image déformée ; vide
            pour garder celui de la vidéo.
        fill: Zoomer l'image pour remplir le lecteur (bords rognés), par exemple pour
            supprimer des bandes noires incrustées.
    """

    name: str
    sources: list[str]
    themes: list[str] = field(default_factory=list)
    per_source: int = DEFAULT_PER_SOURCE
    kind: str = YOUTUBE
    logo: str = ""
    iptv_id: str = ""
    aspect: str = ""
    fill: bool = False

    @property
    def is_iptv(self) -> bool:
        return self.kind == IPTV


def _channel(c: dict) -> Channel:
    """Chaîne décrite par une table `[[channel]]`."""
    return Channel(
        name=c["name"],
        sources=c["sources"],
        themes=c.get("themes", []),
        per_source=c.get("per_source", DEFAULT_PER_SOURCE),
        kind=c.get("kind", YOUTUBE),
        logo=c.get("logo", ""),
        iptv_id=c.get("iptv_id", ""),
        aspect=c.get("aspect", ""),
        fill=c.get("fill", False),
    )


def load_channels(path: Path) -> list[Channel]:
    """Charge les chaînes définies dans un fichier TOML.

    Args:
        path: Chemin du fichier, au format de `channels.toml`.

    Returns:
        Les chaînes, dans l'ordre du fichier.
    """
    with path.open("rb") as f:
        data = tomllib.load(f)
    return [_channel(c) for c in data.get("channel", [])]


# Les routes du serveur tournent dans des threads : on sérialise les écritures.
_lock = threading.Lock()


def _load_doc(path: Path) -> tuple[tomlkit.TOMLDocument, AoT]:
    doc = tomlkit.parse(path.read_text()) if path.exists() else tomlkit.document()
    if "channel" not in doc:
        doc.append("channel", tomlkit.aot())
    return doc, doc["channel"]


def _find(tables: AoT, name: str) -> Table | None:
    return next((t for t in tables if t["name"] == name), None)


def _set_optional(table: Table, key: str, value, default) -> None:
    """Écrit un champ facultatif, ou le retire s'il vaut sa valeur par défaut."""
    if value != default:
        table[key] = value
    elif key in table:
        del table[key]


def _fill(table: Table, channel: Channel) -> None:
    table["name"] = channel.name
    # Champs facultatifs : écrits seulement s'ils diffèrent de leur valeur par défaut.
    optional = {
        "kind": (channel.kind, YOUTUBE),
        "logo": (channel.logo, ""),
        "iptv_id": (channel.iptv_id, ""),
        "aspect": (channel.aspect, ""),
        "fill": (channel.fill, False),
    }
    for key, (value, default) in optional.items():
        _set_optional(table, key, value, default)
    table["themes"] = channel.themes
    if channel.per_source != DEFAULT_PER_SOURCE and not channel.is_iptv:
        table["per_source"] = channel.per_source
    elif "per_source" in table:
        del table["per_source"]
    sources = tomlkit.array()
    sources.extend(channel.sources)
    table["sources"] = sources.multiline(True)


def upsert_channel(path: Path, channel: Channel, previous_name: str | None = None) -> None:
    """Ajoute une chaîne, ou modifie celle nommée `previous_name` (renommage possible).

    Args:
        path: Fichier des chaînes.
        channel: Nouvelle définition de la chaîne.
        previous_name: Nom actuel de la chaîne à modifier ; ajout si absent.

    Raises:
        KeyError: Si `previous_name` ne correspond à aucune chaîne.
        ValueError: Si une autre chaîne porte déjà ce nom.
    """
    with _lock:
        doc, tables = _load_doc(path)
        if channel.name != previous_name and _find(tables, channel.name) is not None:
            raise ValueError(f"Une chaîne s'appelle déjà « {channel.name} »")
        if previous_name is None:
            table = tomlkit.table()
            _fill(table, channel)
            tables.append(table)
        else:
            table = _find(tables, previous_name)
            if table is None:
                raise KeyError(previous_name)
            _fill(table, channel)
        path.write_text(tomlkit.dumps(doc))


def delete_channel(path: Path, name: str) -> None:
    """Supprime une chaîne.

    Raises:
        KeyError: Si la chaîne n'existe pas.
    """
    with _lock:
        doc, tables = _load_doc(path)
        index = next((i for i, t in enumerate(tables) if t["name"] == name), None)
        if index is None:
            raise KeyError(name)
        del tables[index]
        path.write_text(tomlkit.dumps(doc))


def reorder_channels(path: Path, names: list[str]) -> None:
    """Réordonne les chaînes ; l'ordre donne leur numéro dans l'interface.

    Args:
        path: Fichier des chaînes.
        names: Tous les noms de chaînes, dans le nouvel ordre.

    Raises:
        ValueError: Si `names` ne contient pas exactement les chaînes existantes.
    """
    with _lock:
        doc, tables = _load_doc(path)
        by_name = {t["name"]: t for t in tables}
        if sorted(names) != sorted(by_name):
            raise ValueError("La liste ne correspond pas aux chaînes existantes")
        ordered = [by_name[n] for n in names]
        while len(tables):
            del tables[0]
        for t in ordered:
            tables.append(t)
        path.write_text(tomlkit.dumps(doc))


def set_display(path: Path, name: str, aspect: str, fill: bool) -> None:
    """Règle l'affichage de l'image d'une chaîne, sans toucher au reste de sa définition.

    Args:
        path: Fichier des chaînes.
        name: Nom de la chaîne.
        aspect: Format imposé (`4:3`…), ou vide pour celui de la vidéo.
        fill: Zoomer pour remplir le lecteur.

    Raises:
        KeyError: Si la chaîne n'existe pas.
        ValueError: Si le format est invalide.
    """
    if aspect and not ASPECT.match(aspect):
        raise ValueError(f"Format invalide : « {aspect} » (exemples : 16:9, 4:3, 1.85:1)")
    with _lock:
        doc, tables = _load_doc(path)
        table = _find(tables, name)
        if table is None:
            raise KeyError(name)
        # Seuls les champs d'affichage sont écrits : le reste garde sa mise en forme.
        _set_optional(table, "aspect", aspect, "")
        _set_optional(table, "fill", fill, False)
        path.write_text(tomlkit.dumps(doc))

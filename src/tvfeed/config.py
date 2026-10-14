"""Lecture et écriture de la définition des chaînes (`channels.toml`).

L'écriture passe par tomlkit, qui conserve les commentaires et la mise en forme du
fichier écrit à la main.
"""

import threading
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

import tomlkit
from tomlkit.items import AoT, Table

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


# Les routes du serveur tournent dans des threads : on sérialise les écritures.
_lock = threading.Lock()


def _load_doc(path: Path) -> tuple[tomlkit.TOMLDocument, AoT]:
    doc = tomlkit.parse(path.read_text()) if path.exists() else tomlkit.document()
    if "channel" not in doc:
        doc.append("channel", tomlkit.aot())
    return doc, doc["channel"]


def _find(tables: AoT, name: str) -> Table | None:
    return next((t for t in tables if t["name"] == name), None)


def _fill(table: Table, channel: Channel) -> None:
    table["name"] = channel.name
    table["themes"] = channel.themes
    if channel.per_source != DEFAULT_PER_SOURCE:
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

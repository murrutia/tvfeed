"""Aide à la création de chaînes : suggestion de thèmes et recherche de chaînes YouTube."""

import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict

from . import ai, guide
from .config import load_channels
from .sources import search_channels

TITLES_PER_SOURCE = 8
MIN_FOLLOWERS = 1000


def _titles(sources: list[str]) -> list[str]:
    """Titres de vidéos récentes des sources (depuis le cache si possible)."""

    def titles(url: str) -> list[str]:
        try:
            return [v.title for v in guide.get_videos(url, TITLES_PER_SOURCE, guide.DATA / "cache")]
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        return [t for ts in pool.map(titles, sources) for t in ts][:30]


def _key(url: str) -> str:
    """Clé de comparaison d'URL de chaîne : sans protocole, `www.`, onglet ni casse."""
    url = re.sub(r"^https?://(www\.)?", "", url.strip().lower()).rstrip("/")
    return re.sub(r"/(videos|streams|shorts|featured)$", "", url)


def suggest_themes(name: str, themes: list[str], sources: list[str]) -> list[str]:
    """Propose des thèmes pour une chaîne d'après les vidéos de ses sources (IA requise).

    Raises:
        RuntimeError: Si l'IA locale est indisponible.
    """
    return ai.suggest_themes(name, themes, _titles(sources))


def discover(name: str, themes: list[str], sources: list[str], use_ai: bool = True) -> dict:
    """Cherche des chaînes YouTube qui conviendraient à une chaîne locale.

    Avec l'IA, les requêtes sont formulées d'après le nom, les thèmes et les titres des
    sources ; sans, les thèmes (ou le nom) servent de requêtes.

    Args:
        name: Nom de la chaîne locale.
        themes: Ses thèmes.
        sources: Ses sources actuelles, exclues des résultats.
        use_ai: Utilise l'IA locale si elle est disponible.

    Returns:
        `queries` (requêtes utilisées), `ai` (IA utilisée ou non) et `channels` : les
        chaînes trouvées, les plus souvent trouvées d'abord, avec `used_in` (chaîne locale
        qui l'utilise déjà, le cas échéant).
    """
    queries: list[str] = []
    used_ai = False
    if use_ai and ai.model():
        try:
            queries = ai.search_queries(name, themes, _titles(sources))
            used_ai = bool(queries)
        except Exception:
            queries = []  # IA en erreur : on se rabat sur les thèmes.
    if not queries:
        queries = themes[:4] or [name]

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(search_channels, queries))

    excluded = {_key(u) for u in sources}
    used_in = {_key(u): c.name for c in load_channels(guide.CONFIG) for u in c.sources if c.name != name}
    found: dict[str, dict] = {}
    for rank, channels in enumerate(results):
        for position, c in enumerate(channels):
            key = _key(c.url)
            if key in excluded:
                continue
            entry = found.setdefault(key, {**asdict(c), "used_in": used_in.get(key), "hits": 0, "first": (position, rank)})
            entry["hits"] += 1
    # Trouvées par plusieurs requêtes d'abord ; les toutes petites chaînes (souvent
    # inactives ou hors sujet) en fin de liste ; sinon, l'ordre de YouTube.
    small = lambda e: (e["followers"] or 0) < MIN_FOLLOWERS
    ordered = sorted(found.values(), key=lambda e: (-e["hits"], small(e), e["first"]))
    for e in ordered:
        del e["hits"], e["first"]
    return {"queries": queries, "ai": used_ai, "channels": ordered}

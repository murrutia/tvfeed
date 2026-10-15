"""Chaînes de télévision en direct (IPTV), à partir du catalogue d'[iptv-org](https://github.com/iptv-org/iptv).

Le catalogue (chaînes, flux, logos, pays, catégories) est téléchargé depuis l'API publique
d'iptv-org et gardé en cache 24 h. Seuls les flux lisibles directement par un navigateur
sont retenus : ceux qui exigent un `Referer` ou un `User-Agent` particulier sont écartés.

iptv-org recense des flux accessibles publiquement ; tous ne sont pas des diffusions
officielles. Les flux sont triés pour proposer d'abord ceux servis en HTTPS par un nom de
domaine plutôt que par une adresse IP brute.
"""

import ipaddress
import json
import re
import threading
import time
import unicodedata
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import urlparse

API = "https://iptv-org.github.io/api"
CATALOG_TTL = 24 * 3600
"""Durée de validité du catalogue en cache, en secondes."""
FILES = ("channels", "streams", "logos", "countries", "categories")


@dataclass
class Stream:
    """Flux d'une chaîne.

    Attributes:
        url: URL du flux HLS (`.m3u8`).
        quality: Qualité annoncée (`720p`…), si connue.
    """

    url: str
    quality: str | None = None


@dataclass
class LiveChannel:
    """Chaîne du catalogue iptv-org ayant au moins un flux lisible.

    Attributes:
        id: Identifiant iptv-org (`Latina.pe`).
        name: Nom de la chaîne.
        country: Code du pays (`PE`).
        categories: Catégories iptv-org (`news`, `general`…).
        logo: URL du logo, si connu.
        streams: Flux, les plus fiables d'abord.
        alt_names: Autres noms de la chaîne.
    """

    id: str
    name: str
    country: str
    categories: list[str]
    logo: str
    streams: list[Stream]
    alt_names: list[str] = field(default_factory=list)


@dataclass
class Catalog:
    """Catalogue indexé : chaînes, pays et catégories."""

    channels: list[LiveChannel]
    countries: dict[str, dict]
    categories: dict[str, str]


_lock = threading.Lock()
_catalog: tuple[float, Catalog] | None = None


def _download(cache_dir: Path) -> dict[str, list]:
    """Fichiers de l'API iptv-org, depuis le cache s'il a moins de 24 h."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    data = {}
    for name in FILES:
        path = cache_dir / f"{name}.json"
        if not path.exists() or time.time() - path.stat().st_mtime > CATALOG_TTL:
            with urllib.request.urlopen(f"{API}/{name}.json", timeout=60) as res:
                path.write_bytes(res.read())
        data[name] = json.loads(path.read_text())
    return data


def _reliability(stream: Stream) -> tuple:
    """Clé de tri : HTTPS et nom de domaine d'abord, puis meilleure qualité."""
    host = urlparse(stream.url).hostname or ""
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    quality = int(re.sub(r"\D", "", stream.quality or "") or 0)
    return (not stream.url.startswith("https://"), is_ip, -quality)


def build_catalog(data: dict[str, list]) -> Catalog:
    """Indexe les fichiers de l'API iptv-org.

    Args:
        data: Contenu des fichiers `channels`, `streams`, `logos`, `countries`, `categories`.

    Returns:
        Les chaînes ouvertes, non réservées aux adultes et ayant au moins un flux lisible
        par un navigateur, triées par nom.
    """
    streams: dict[str, list[Stream]] = {}
    for s in data["streams"]:
        if s.get("channel") and not s.get("referrer") and not s.get("user_agent"):
            streams.setdefault(s["channel"], []).append(Stream(s["url"], s.get("quality")))
    logos: dict[str, str] = {}
    for logo in data["logos"]:
        # Premier logo de la chaîne elle-même (pas d'une déclinaison régionale).
        if logo.get("feed") is None:
            logos.setdefault(logo["channel"], logo["url"])
    channels = [
        LiveChannel(
            id=c["id"],
            name=c["name"],
            country=c.get("country") or "",
            categories=c.get("categories") or [],
            logo=logos.get(c["id"], ""),
            streams=sorted({s.url: s for s in streams[c["id"]]}.values(), key=_reliability),
            alt_names=c.get("alt_names") or [],
        )
        for c in data["channels"]
        if c["id"] in streams and not c.get("is_nsfw") and not c.get("closed")
    ]
    return Catalog(
        channels=sorted(channels, key=lambda c: _fold(c.name)),
        countries={c["code"]: c for c in data["countries"]},
        categories={c["id"]: c["name"] for c in data["categories"]},
    )


def catalog(cache_dir: Path) -> Catalog:
    """Catalogue iptv-org, gardé en mémoire et en cache disque 24 h.

    Raises:
        OSError: Si le catalogue n'est pas en cache et que l'API est injoignable.
    """
    global _catalog
    with _lock:
        if _catalog is None or time.time() - _catalog[0] > CATALOG_TTL:
            _catalog = (time.time(), build_catalog(_download(cache_dir)))
        return _catalog[1]


def _fold(text: str) -> str:
    """Minuscules sans accents, pour une recherche tolérante (« Perú » = « peru »)."""
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def search(cat: Catalog, query: str = "", country: str = "", category: str = "", limit: int = 60) -> list[dict]:
    """Cherche des chaînes par mots-clés, pays et catégorie.

    Chaque mot de la requête doit apparaître dans le nom, un autre nom, le pays ou une
    catégorie de la chaîne. Les chaînes dont le nom commence par la requête passent devant.

    Args:
        cat: Catalogue.
        query: Mots-clés (« latina », « peru noticias »…).
        country: Code pays (`PE`), ou vide pour tous.
        category: Identifiant de catégorie (`news`), ou vide pour toutes.
        limit: Nombre maximal de résultats.

    Returns:
        Les chaînes trouvées, avec le nom et le drapeau de leur pays.
    """
    words = _fold(query).split()
    q = " ".join(words)
    results = []
    for c in cat.channels:
        if country and c.country != country or category and category not in c.categories:
            continue
        place = cat.countries.get(c.country, {})
        names = _fold(" ".join([c.name, *c.alt_names]))
        haystack = " ".join([names, _fold(place.get("name", "")), c.country.lower(), *c.categories])
        if all(w in haystack for w in words):
            results.append((not _fold(c.name).startswith(q), q not in names, c))
    results.sort(key=lambda r: r[:2])
    return [
        {**asdict(c), "country_name": cat.countries.get(c.country, {}).get("name", c.country),
         "flag": cat.countries.get(c.country, {}).get("flag", "")}
        for *_, c in results[:limit]
    ]


def filters(cat: Catalog) -> dict:
    """Pays et catégories présents dans le catalogue, avec leur nombre de chaînes."""
    countries: dict[str, int] = {}
    categories: dict[str, int] = {}
    for c in cat.channels:
        countries[c.country] = countries.get(c.country, 0) + 1
        for k in c.categories:
            categories[k] = categories.get(k, 0) + 1
    return {
        "countries": sorted(
            ({"code": k, "name": cat.countries.get(k, {}).get("name", k), "flag": cat.countries.get(k, {}).get("flag", ""), "count": n}
             for k, n in countries.items() if k),
            key=lambda x: _fold(x["name"]),
        ),
        "categories": sorted(
            ({"id": k, "name": cat.categories.get(k, k), "count": n} for k, n in categories.items()),
            key=lambda x: x["name"],
        ),
    }


def check_stream(url: str) -> None:
    """Vérifie qu'un flux répond avec une liste de lecture HLS.

    Raises:
        ValueError: Si le flux est injoignable ou n'est pas une liste HLS.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as res:
            head = res.read(4096).decode("utf-8", "replace")
    except Exception as e:
        raise ValueError(f"{url} : flux injoignable ({e})") from e
    if "#EXTM3U" not in head:
        raise ValueError(f"{url} : ce n'est pas un flux HLS (.m3u8)")

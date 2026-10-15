"""Chaînes IPTV : catalogue iptv-org, recherche, place dans le programme."""

import pytest
from fastapi.testclient import TestClient

from tvfeed import guide, iptv
from tvfeed.config import IPTV, Channel, load_channels
from tvfeed.server import app

DATA = {
    "channels": [
        {"id": "Latina.pe", "name": "Latina", "country": "PE", "categories": ["general"]},
        {"id": "CanalPeru.pe", "name": "Canal Perú", "alt_names": ["TV Perú"], "country": "PE", "categories": ["news"]},
        {"id": "Noticias.ar", "name": "Noticias Ya", "country": "AR", "categories": ["news"]},
        {"id": "Adult.pe", "name": "Adult", "country": "PE", "categories": [], "is_nsfw": True},
        {"id": "Ferme.pe", "name": "Fermée", "country": "PE", "categories": [], "closed": "2020-01-01"},
        {"id": "Referer.pe", "name": "Avec referer", "country": "PE", "categories": []},
        {"id": "SansFlux.pe", "name": "Sans flux", "country": "PE", "categories": []},
    ],
    "streams": [
        {"channel": "Latina.pe", "url": "http://190.93.224.42/LATINA/index.m3u8", "quality": "1080p"},
        {"channel": "Latina.pe", "url": "http://latina.example/low.m3u8", "quality": "480p"},
        {"channel": "Latina.pe", "url": "https://latina.example/hd.m3u8", "quality": "720p"},
        {"channel": "CanalPeru.pe", "url": "https://peru.example/a.m3u8"},
        {"channel": "Noticias.ar", "url": "https://ar.example/a.m3u8"},
        {"channel": "Adult.pe", "url": "https://x.example/a.m3u8"},
        {"channel": "Ferme.pe", "url": "https://x.example/b.m3u8"},
        {"channel": "Referer.pe", "url": "https://x.example/c.m3u8", "referrer": "https://x.example/"},
    ],
    "logos": [
        {"channel": "Latina.pe", "feed": "HD", "url": "https://logo/feed.png"},
        {"channel": "Latina.pe", "feed": None, "url": "https://logo/latina.png"},
    ],
    "countries": [{"code": "PE", "name": "Peru", "flag": "🇵🇪"}, {"code": "AR", "name": "Argentina", "flag": "🇦🇷"}],
    "categories": [{"id": "general", "name": "General"}, {"id": "news", "name": "News"}],
}


@pytest.fixture
def catalog() -> iptv.Catalog:
    return iptv.build_catalog(DATA)


def test_catalog_keeps_only_watchable_channels(catalog):
    # Ni adulte, ni fermée, ni flux exigeant un Referer, ni chaîne sans flux.
    assert [c.id for c in catalog.channels] == ["CanalPeru.pe", "Latina.pe", "Noticias.ar"]


def test_streams_are_sorted_by_reliability_and_logo_is_the_main_one(catalog):
    latina = next(c for c in catalog.channels if c.id == "Latina.pe")
    # HTTPS d'abord, puis nom de domaine avant adresse IP, puis meilleure qualité.
    assert [s.url for s in latina.streams] == [
        "https://latina.example/hd.m3u8",
        "http://latina.example/low.m3u8",
        "http://190.93.224.42/LATINA/index.m3u8",
    ]
    assert latina.logo == "https://logo/latina.png"


@pytest.mark.parametrize(
    ("query", "country", "category", "expected"),
    [
        ("peru", "", "", ["Canal Perú", "Latina"]),  # accents ignorés, nom puis pays
        ("PÉRÚ", "", "", ["Canal Perú", "Latina"]),  # requête accentuée, pays « Peru »
        ("tv perú", "", "", ["Canal Perú"]),  # autre nom
        ("", "PE", "", ["Canal Perú", "Latina"]),
        ("", "", "news", ["Canal Perú", "Noticias Ya"]),
        ("noticias argentina", "", "", ["Noticias Ya"]),  # chaque mot, n'importe où
        ("lat", "", "", ["Latina"]),
    ],
)
def test_search(catalog, query, country, category, expected):
    assert [c["name"] for c in iptv.search(catalog, query, country, category)] == expected


def test_search_ranks_names_starting_with_the_query_first(catalog):
    assert [c["name"] for c in iptv.search(catalog, "canal")] == ["Canal Perú"]
    assert [c["name"] for c in iptv.search(catalog, "peru")][0] == "Canal Perú"
    assert iptv.search(catalog, "latina")[0]["flag"] == "🇵🇪"


def add_iptv_channel(monkeypatch, working=("https://ok/a.m3u8",)):
    def check(url):
        if url not in working:
            raise ValueError(f"{url} : flux injoignable")

    monkeypatch.setattr(iptv, "check_stream", check)
    guide.save_channel(Channel("Latina", ["https://mort/a.m3u8", "https://ok/a.m3u8"], ["pérou"], kind=IPTV, logo="https://logo"))


def test_iptv_channel_is_live_without_programme(monkeypatch):
    add_iptv_channel(monkeypatch)
    fetched = []
    real = guide.get_videos
    monkeypatch.setattr(guide, "get_videos", lambda url, *a, **k: fetched.append(url) or real(url, *a, **k))

    _, guides = guide.get_guide(1)

    latina = guides[-1]
    assert (latina.channel.name, latina.channel.kind, latina.slots) == ("Latina", IPTV, [])
    assert not any("m3u8" in url for url in fetched)  # flux jamais passés à yt-dlp
    assert "Latina" not in guide.load_state()
    assert "Latina" not in guide.shuffle()


def test_iptv_channel_is_saved_with_its_fields(monkeypatch):
    add_iptv_channel(monkeypatch)
    latina = load_channels(guide.CONFIG)[-1]
    assert (latina.kind, latina.logo, latina.per_source) == (IPTV, "https://logo", 30)
    assert "per_source" not in guide.CONFIG.read_text().split('name = "Latina"')[1]


def test_iptv_channel_needs_at_least_one_working_stream(monkeypatch):
    with pytest.raises(ValueError, match="injoignable"):
        add_iptv_channel(monkeypatch, working=())
    assert [c.name for c in load_channels(guide.CONFIG)] == ["Sciences", "Histoire"]


def test_guide_payload_exposes_streams(monkeypatch):
    add_iptv_channel(monkeypatch)
    latina = TestClient(app).get("/api/guide").json()["channels"][-1]
    assert latina["kind"] == "iptv"
    assert latina["streams"] == ["https://mort/a.m3u8", "https://ok/a.m3u8"]
    assert latina["logo"] == "https://logo"

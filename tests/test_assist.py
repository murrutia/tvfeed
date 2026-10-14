"""Aide à la création de chaînes : recherche de chaînes YouTube, IA locale facultative."""

import pytest
from fastapi.testclient import TestClient

from tvfeed import ai, assist
from tvfeed.server import app
from tvfeed.sources import ChannelResult


def channel(handle: str, followers: int | None = 50_000) -> ChannelResult:
    return ChannelResult(handle, f"https://www.youtube.com/@{handle}", followers, "", "")


SEARCH = {
    "astronomie": [channel("Astro"), channel("Tiny", 12), channel("Cosmos")],
    "espace": [channel("Cosmos"), channel("Fusee")],
    "requête ia": [channel("Ia")],
}


@pytest.fixture(autouse=True)
def fake_search(monkeypatch):
    queries = []

    def search(query):
        queries.append(query)
        return SEARCH.get(query, [])

    monkeypatch.setattr(assist, "search_channels", search)
    return queries


@pytest.fixture
def no_ai(monkeypatch):
    monkeypatch.setattr(ai, "model", lambda: None)


@pytest.fixture
def fake_ai(monkeypatch):
    monkeypatch.setattr(ai, "model", lambda: "fake")
    answers = {}
    monkeypatch.setattr(ai, "_ask", lambda prompt, schema: answers[next(iter(schema["properties"]))])
    return answers


def names(result: dict) -> list[str]:
    return [c["name"] for c in result["channels"]]


def test_without_ai_themes_are_the_queries(no_ai, fake_search):
    result = assist.discover("Astronomie", ["astronomie", "espace"], [])

    assert fake_search == ["astronomie", "espace"]
    assert result["ai"] is False
    # Trouvée par deux requêtes d'abord, toute petite chaîne en dernier.
    assert names(result) == ["Cosmos", "Astro", "Fusee", "Tiny"]


def test_current_sources_are_excluded_and_other_channels_flagged(no_ai, monkeypatch):
    sources = ["https://youtube.com/@cosmos/videos"]  # autre forme de la même URL
    assert "Cosmos" not in names(assist.discover("Nouvelle", ["astronomie"], sources))

    # Une source déjà utilisée par une autre chaîne locale est signalée, pas masquée.
    monkeypatch.setitem(SEARCH, "x", [ChannelResult("A", "https://src/a", None, "", "")])
    assert assist.discover("Nouvelle", ["x"], [])["channels"][0]["used_in"] == "Sciences"


def test_with_ai_queries_come_from_the_model(fake_ai, fake_search):
    fake_ai["queries"] = {"queries": ["requête ia", " "]}
    result = assist.discover("Astronomie", ["astronomie"], ["https://src/a"])

    assert fake_search == ["requête ia"]
    assert result["ai"] is True
    assert names(result) == ["Ia"]


def test_ai_failure_falls_back_to_themes(monkeypatch, fake_search):
    monkeypatch.setattr(ai, "model", lambda: "fake")
    monkeypatch.setattr(ai, "search_queries", lambda *a: 1 / 0)

    result = assist.discover("Astronomie", ["espace"], [])
    assert (fake_search, result["ai"]) == (["espace"], False)


def test_theme_suggestions_are_cleaned(fake_ai):
    fake_ai["themes"] = {"themes": ["Cosmos", "astronomie", " ", "cosmos", "Exoplanètes"]}
    assert assist.suggest_themes("Astronomie", ["astronomie"], ["https://src/a"]) == ["cosmos", "exoplanètes"]


def test_api_without_ai(no_ai):
    client = TestClient(app)
    assert client.get("/api/ai").json() == {"model": None}
    assert client.post("/api/assist/themes", json={"name": "X", "sources": ["https://src/a"]}).status_code == 503
    assert client.post("/api/assist/channels", json={}).status_code == 422
    assert names(client.post("/api/assist/channels", json={"name": "X", "themes": ["espace"]}).json()) == ["Cosmos", "Fusee"]

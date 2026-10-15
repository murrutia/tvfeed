"""Contrat de l'API utilisé par l'interface (web/src/lib/api.ts)."""

import pytest
from fastapi.testclient import TestClient

from tvfeed.server import app


@pytest.fixture
def client():
    return TestClient(app)


def test_guide_payload(client):
    data = client.get("/api/guide?hours=1").json()

    assert [c["name"] for c in data["channels"]] == ["Sciences", "Histoire"]
    slot = data["channels"][0]["slots"][0]
    assert set(slot) == {"id", "title", "source", "url", "thumbnail", "duration", "start", "end"}
    assert data["later"] == []


def test_mark_then_unmark(client):
    current = client.get("/api/guide").json()["channels"][0]["slots"][0]["id"]

    data = client.post(f"/api/channels/Sciences/videos/{current}/mark").json()
    assert [v["id"] for v in data["later"]] == [current]
    assert data["later"][0]["channel"] == "Sciences"

    data = client.delete(f"/api/later/{current}").json()
    assert data["later"] == []

    assert client.delete(f"/api/later/{current}").status_code == 404


@pytest.mark.parametrize("video_id", ["..%2F..%2Fetc", "short", "abcdefghijk.json"])
def test_invalid_video_ids_are_rejected(client, video_id):
    # L'identifiant devient un nom de fichier de cache : il est strictement validé.
    assert client.get(f"/api/videos/{video_id}/chapters").status_code in (400, 404)


def test_channel_crud(client):
    new = {"name": "Musique", "themes": ["musique"], "sources": ["https://src/new"], "per_source": 10}
    assert [c["name"] for c in client.post("/api/channels", json=new).json()][-1] == "Musique"

    response = client.post("/api/channels", json={**new, "name": "Autre", "sources": ["https://src/unknown"]})
    assert response.status_code == 422
    assert "https://src/unknown" in response.json()["detail"]

    assert client.post("/api/channels", json=new).status_code == 422  # nom déjà pris

    order = ["Musique", "Sciences", "Histoire"]
    assert [c["name"] for c in client.put("/api/channels/order", json={"names": order}).json()] == order

    assert [c["name"] for c in client.delete("/api/channels/Musique").json()] == ["Sciences", "Histoire"]
    assert client.delete("/api/channels/Musique").status_code == 404


def test_channel_display(client):
    data = client.put("/api/channels/Histoire/display", json={"aspect": "1.85:1", "fill": True}).json()
    assert [(c["name"], c["aspect"], c["fill"]) for c in data["channels"]] == [("Histoire", "1.85:1", True)]
    assert client.put("/api/channels/Histoire/display", json={"aspect": "4/3"}).status_code == 422
    assert client.put("/api/channels/Inconnue/display", json={}).status_code == 404

    # Modifier la chaîne depuis le formulaire conserve son affichage s'il est renvoyé.
    histoire = next(c for c in client.get("/api/channels").json() if c["name"] == "Histoire")
    client.put("/api/channels/Histoire", json={**histoire, "themes": ["récit"]})
    assert client.get("/api/guide").json()["channels"][1]["aspect"] == "1.85:1"

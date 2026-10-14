import pytest

from tests.conftest import CHANNELS_TOML
from tvfeed import guide
from tvfeed.config import Channel, delete_channel, load_channels, reorder_channels, upsert_channel


def test_edits_preserve_comments_and_formatting():
    path = guide.CONFIG
    upsert_channel(path, Channel("Musique", ["https://src/new"], ["musique"], per_source=10))
    reorder_channels(path, ["Musique", "Sciences", "Histoire"])
    reorder_channels(path, ["Sciences", "Histoire", "Musique"])
    delete_channel(path, "Musique")

    assert path.read_text() == CHANNELS_TOML


def test_upsert_writes_all_fields_and_renames():
    path = guide.CONFIG
    upsert_channel(path, Channel("Physique", ["https://src/a"], ["physique"], per_source=12), "Sciences")

    channels = {c.name: c for c in load_channels(path)}
    assert channels["Physique"] == Channel("Physique", ["https://src/a"], ["physique"], 12)
    assert "Sciences" not in channels


def test_invalid_edits_raise_and_leave_file_untouched():
    path = guide.CONFIG
    with pytest.raises(ValueError):
        upsert_channel(path, Channel("Histoire", ["https://src/a"]))  # nom déjà pris
    with pytest.raises(KeyError):
        upsert_channel(path, Channel("X", ["https://src/a"]), "Inconnue")
    with pytest.raises(ValueError):
        reorder_channels(path, ["Sciences"])  # liste incomplète
    with pytest.raises(KeyError):
        delete_channel(path, "Inconnue")
    assert path.read_text() == CHANNELS_TOML

import pytest

from tests.conftest import CHANNELS_TOML
from tvfeed import guide
from tvfeed.config import Channel, delete_channel, load_channels, reorder_channels, set_display, upsert_channel


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


def test_display_is_set_without_touching_the_rest():
    path = guide.CONFIG
    set_display(path, "Histoire", "4:3", True)
    histoire = load_channels(path)[1]
    assert (histoire.aspect, histoire.fill, histoire.per_source, histoire.sources) == ("4:3", True, 5, ["https://src/c"])

    set_display(path, "Histoire", "", False)  # retour aux valeurs par défaut : champs retirés
    assert path.read_text() == CHANNELS_TOML


def test_invalid_display_is_rejected():
    for aspect in ("4/3", "large", "16:"):
        with pytest.raises(ValueError):
            set_display(guide.CONFIG, "Histoire", aspect, False)
    with pytest.raises(KeyError):
        set_display(guide.CONFIG, "Inconnue", "4:3", False)
    assert guide.CONFIG.read_text() == CHANNELS_TOML

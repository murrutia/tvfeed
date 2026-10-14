"""Opérations sur le programme : marquage, retrait, gestion des chaînes.

Invariant central : modifier une playlist ne doit pas faire sauter ce qui passe à
l'antenne, sauf ce qui est voulu (la vidéo suivante démarre au marquage).
"""

from datetime import datetime, timedelta

import pytest

from tvfeed import guide
from tvfeed.config import Channel, load_channels


@pytest.fixture(autouse=True)
def mid_programme():
    """Chaînes démarrées il y a un moment : on est au milieu d'une vidéo, pas au début
    de la playlist (sinon un recalage oublié passerait inaperçu)."""
    guide.get_guide(1)
    state = guide.load_state()
    for run in state.values():
        run["anchor"] = (datetime.now().astimezone() - timedelta(seconds=1000.5)).isoformat()
    guide.save_state(state)


def on_air() -> dict[str, tuple[str, float]]:
    """Vidéo en cours et position dans la vidéo, par chaîne."""
    now, guides = guide.get_guide(1)
    return {g.channel.name: (g.slots[0].video.id, (now - g.slots[0].start).total_seconds()) for g in guides}


def schedule(name: str) -> list[str]:
    _, guides = guide.get_guide(1, channel=name)
    return [s.video.id for s in guides[0].slots]


def test_guide_is_stable_between_calls():
    first = on_air()
    second = on_air()
    for name in first:
        assert second[name][0] == first[name][0]
        assert second[name][1] == pytest.approx(first[name][1], abs=1)


def test_mark_removes_video_and_starts_the_next_one_now():
    before_all = on_air()
    current, following = schedule("Sciences")[:2]

    guide.mark("Sciences", current)

    assert before_all["Sciences"][1] > 5  # on marque bien en cours de vidéo
    after = on_air()
    assert after["Sciences"][0] == following
    assert after["Sciences"][1] == pytest.approx(0, abs=1)
    assert current not in schedule("Sciences")
    assert after["Histoire"][0] == before_all["Histoire"][0]  # autres chaînes intactes
    assert [m.video.id for m in guide.load_later()] == [current]


def test_unmark_restores_video_without_moving_the_current_one():
    current = schedule("Sciences")[0]
    guide.mark("Sciences", current)
    before = on_air()["Sciences"]

    guide.unmark(current)

    after = on_air()["Sciences"]
    assert after[0] == before[0]
    assert after[1] == pytest.approx(before[1], abs=1)
    assert guide.load_later() == []
    _, guides = guide.get_guide(4, channel="Sciences")
    assert guides[0].video_count == 7


def test_done_video_stays_out_of_its_channel():
    current = schedule("Sciences")[0]
    guide.mark("Sciences", current)
    guide.mark_done(current)

    assert guide.load_later()[0].done
    _, guides = guide.get_guide(4, channel="Sciences")
    assert guides[0].video_count == 6


def test_mark_unknown_video_raises():
    with pytest.raises(KeyError):
        guide.mark("Sciences", "zzzzzzzzzzz")


def test_rename_keeps_programme_and_marked_videos():
    current = schedule("Sciences")[0]
    guide.mark("Sciences", current)
    before = on_air()["Sciences"]
    channel = load_channels(guide.CONFIG)[0]

    guide.save_channel(Channel("Physique", channel.sources, channel.themes), previous_name="Sciences")

    after = on_air()
    assert "Sciences" not in after
    assert after["Physique"][0] == before[0]
    assert after["Physique"][1] == pytest.approx(before[1], abs=1)
    assert guide.load_later()[0].channel == "Physique"


def test_save_channel_rejects_unreadable_or_empty_sources():
    for url in ("https://src/unknown", "https://src/empty"):
        with pytest.raises(ValueError, match=url):
            guide.save_channel(Channel("Nouvelle", [url]))
    assert [c.name for c in load_channels(guide.CONFIG)] == ["Sciences", "Histoire"]


def test_delete_channel_removes_its_state():
    on_air()  # crée l'état des chaînes
    guide.delete_channel("Histoire")
    assert [c.name for c in load_channels(guide.CONFIG)] == ["Sciences"]
    assert "Histoire" not in guide.load_state()

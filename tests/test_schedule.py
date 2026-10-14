from datetime import datetime, timedelta, timezone

from tests.conftest import make_videos
from tvfeed.schedule import anchor_at, build_playlist, build_schedule, position

T0 = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
VIDEOS = make_videos("v", 6)  # durées 60, 120, …, 360 s ; total 1260 s


def test_playlist_depends_only_on_seed():
    shuffled = list(reversed(VIDEOS)) + VIDEOS[:2]  # ordre d'entrée différent, doublons
    assert build_playlist(shuffled, 42) == build_playlist(VIDEOS, 42)
    assert len(build_playlist(shuffled, 42)) == len(VIDEOS)
    assert build_playlist(VIDEOS, 42) != build_playlist(VIDEOS, 43)


def test_excluding_a_video_keeps_the_order_of_the_others():
    full = build_playlist(VIDEOS, 7)
    removed = full[2].id
    assert build_playlist(VIDEOS, 7, {removed}) == [v for v in full if v.id != removed]


def test_position_loops_from_anchor():
    playlist = VIDEOS
    assert position(playlist, T0, T0) == (0, 0)
    assert position(playlist, T0, T0 + timedelta(seconds=59)) == (0, 59)
    assert position(playlist, T0, T0 + timedelta(seconds=60)) == (1, 0)
    assert position(playlist, T0, T0 + timedelta(seconds=200)) == (2, 20)
    # Après un tour complet, on recommence au début.
    assert position(playlist, T0, T0 + timedelta(seconds=1260 + 200)) == (2, 20)


def test_anchor_at_puts_the_video_at_the_requested_offset():
    now = T0 + timedelta(hours=5)
    anchor = anchor_at(VIDEOS, 3, 42, now)
    assert position(VIDEOS, anchor, now) == (3, 42)


def test_schedule_starts_with_current_video_and_covers_the_hours():
    now = T0 + timedelta(seconds=200)  # 20 s dans la vidéo 2
    slots = build_schedule(VIDEOS, T0, now, hours=1)

    assert slots[0].video == VIDEOS[2]
    assert slots[0].start == now - timedelta(seconds=20)
    for a, b in zip(slots, slots[1:]):
        assert a.end == b.start
        assert a.end - a.start == timedelta(seconds=a.video.duration)
    assert slots[-1].end >= now + timedelta(hours=1)
    assert slots[-2].end < now + timedelta(hours=1)
    # La playlist tourne en boucle : la vidéo 0 revient après la dernière.
    assert slots[4].video == VIDEOS[0]


def test_schedule_of_empty_playlist_is_empty():
    assert build_schedule([], T0, T0, hours=4) == []

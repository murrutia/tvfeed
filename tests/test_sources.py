import pytest

from tvfeed import sources
from tvfeed.sources import get_chapters, normalize_url


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.youtube.com/@Micode", "https://www.youtube.com/@Micode/videos"),
        ("https://youtube.com/channel/UC123/", "https://youtube.com/channel/UC123/videos"),
        ("https://www.youtube.com/@Micode/streams", "https://www.youtube.com/@Micode/streams"),
        ("https://www.youtube.com/playlist?list=PL1", "https://www.youtube.com/playlist?list=PL1"),
    ],
)
def test_normalize_url_targets_videos_tab_of_bare_channels(url, expected):
    assert normalize_url(url) == expected


class FakeYoutubeDL:
    """Imite yt-dlp avec `process=False` : chapitres sans `end_time`."""

    info: dict = {}

    def __init__(self, opts):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def extract_info(self, url, download, process):
        return self.info


def test_chapter_ends_are_derived_and_cached(tmp_path, monkeypatch):
    FakeYoutubeDL.info = {
        "duration": 500,
        "chapters": [{"start_time": 0, "title": "Intro"}, {"start_time": 120, "title": "Suite"}],
    }
    monkeypatch.setattr(sources, "YoutubeDL", FakeYoutubeDL)

    chapters = get_chapters("abcdefghijk", tmp_path)
    assert [(c.start, c.end, c.title) for c in chapters] == [(0, 120, "Intro"), (120, 500, "Suite")]

    # Deuxième appel : depuis le cache, sans yt-dlp.
    monkeypatch.setattr(sources, "YoutubeDL", None)
    assert get_chapters("abcdefghijk", tmp_path) == chapters

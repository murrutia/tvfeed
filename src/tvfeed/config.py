import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PER_SOURCE = 30


@dataclass
class Channel:
    name: str
    sources: list[str]
    themes: list[str] = field(default_factory=list)
    per_source: int = DEFAULT_PER_SOURCE


def load_channels(path: Path) -> list[Channel]:
    with path.open("rb") as f:
        data = tomllib.load(f)
    return [
        Channel(
            name=c["name"],
            sources=c["sources"],
            themes=c.get("themes", []),
            per_source=c.get("per_source", DEFAULT_PER_SOURCE),
        )
        for c in data.get("channel", [])
    ]

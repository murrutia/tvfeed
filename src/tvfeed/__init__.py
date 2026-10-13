"""Interface en ligne de commande `tvfeed`."""

import argparse
import json
import os
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from .config import Channel, load_channels
from .schedule import build_playlist, build_schedule
from .sources import Video, get_videos

CONFIG = Path(os.environ.get("TVFEED_CONFIG", "channels.toml"))
DATA = Path(os.environ.get("TVFEED_DATA", "data"))
STATE = DATA / "state.json"


def load_state() -> dict:
    """Lit l'état des chaînes (graine et ancre) depuis `data/state.json`."""
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state: dict) -> None:
    """Enregistre l'état des chaînes dans `data/state.json`."""
    DATA.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2))


def new_run() -> dict:
    """Tire une nouvelle graine et place l'ancre à maintenant."""
    return {"seed": random.randrange(2**32), "anchor": datetime.now().astimezone().isoformat()}


def fetch_all(channels: list[Channel], force: bool) -> dict[str, list[Video]]:
    """Récupère toutes les sources en parallèle. Une source en erreur est ignorée."""
    jobs = {(c.name, url): c.per_source for c in channels for url in c.sources}
    result: dict[str, list[Video]] = {c.name: [] for c in channels}

    def job(key):
        name, url = key
        try:
            return name, get_videos(url, jobs[key], DATA / "cache", force)
        except Exception as e:
            print(f"! {url} : {e}")
            return name, []

    with ThreadPoolExecutor(max_workers=8) as pool:
        for name, videos in pool.map(job, jobs):
            result[name].extend(videos)
    return result


def fmt_duration(seconds: int) -> str:
    """Formate une durée en `m:ss` ou `h:mm:ss`."""
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"


def cmd_guide(args) -> None:
    """Commande `guide` : affiche le programme de chaque chaîne."""
    channels = load_channels(CONFIG)
    if args.channel:
        channels = [c for c in channels if c.name == args.channel]
    state = load_state()
    for c in channels:
        state.setdefault(c.name, new_run())
    save_state(state)

    videos = fetch_all(channels, args.refresh)
    now = datetime.now().astimezone()
    for c in channels:
        run = state[c.name]
        playlist = build_playlist(videos[c.name], run["seed"])
        slots = build_schedule(playlist, datetime.fromisoformat(run["anchor"]), now, args.hours)
        themes = f" ({', '.join(c.themes)})" if c.themes else ""
        print(f"\n=== {c.name}{themes} — {len(playlist)} vidéos ===")
        for i, s in enumerate(slots):
            hours = f"{s.start:%H:%M}–{s.end:%H:%M}"
            if i == 0:
                pos = fmt_duration(int((now - s.start).total_seconds()))
                print(f" ▶ {hours}  [{pos}/{fmt_duration(s.video.duration)}] {s.video.title} — {s.video.source}")
            else:
                print(f"   {hours}  {s.video.title} — {s.video.source}")


def cmd_shuffle(args) -> None:
    """Commande `shuffle` : remélange une chaîne, ou toutes."""
    names = [c.name for c in load_channels(CONFIG)]
    targets = [args.channel] if args.channel else names
    state = load_state()
    for name in targets:
        state[name] = new_run()
    save_state(state)
    print(f"Mélangé : {', '.join(targets)}")


def main() -> None:
    """Point d'entrée de la commande `tvfeed`."""
    parser = argparse.ArgumentParser(prog="tvfeed")
    sub = parser.add_subparsers(required=True)

    p = sub.add_parser("guide", help="afficher le programme télé")
    p.add_argument("--hours", type=float, default=4)
    p.add_argument("--channel")
    p.add_argument("--refresh", action="store_true", help="ignorer le cache")
    p.set_defaults(func=cmd_guide)

    p = sub.add_parser("shuffle", help="remélanger une chaîne (ou toutes)")
    p.add_argument("channel", nargs="?")
    p.set_defaults(func=cmd_shuffle)

    args = parser.parse_args()
    args.func(args)

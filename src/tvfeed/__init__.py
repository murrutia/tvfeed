"""Interface en ligne de commande `tvfeed`."""

import argparse

from . import guide


def fmt_duration(seconds: int) -> str:
    """Formate une durée en `m:ss` ou `h:mm:ss`."""
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02}:{s:02}" if h else f"{m}:{s:02}"


def cmd_guide(args) -> None:
    """Commande `guide` : affiche le programme de chaque chaîne."""
    now, guides = guide.get_guide(args.hours, args.channel, args.refresh)
    for g in guides:
        c = g.channel
        themes = f" ({', '.join(c.themes)})" if c.themes else ""
        if c.is_iptv:
            print(f"\n=== {c.name}{themes} — IPTV, en direct ===")
            continue
        print(f"\n=== {c.name}{themes} — {g.video_count} vidéos ===")
        for i, s in enumerate(g.slots):
            hours = f"{s.start:%H:%M}–{s.end:%H:%M}"
            if i == 0:
                pos = fmt_duration(int((now - s.start).total_seconds()))
                print(f" ▶ {hours}  [{pos}/{fmt_duration(s.video.duration)}] {s.video.title} — {s.video.source}")
            else:
                print(f"   {hours}  {s.video.title} — {s.video.source}")


def cmd_shuffle(args) -> None:
    """Commande `shuffle` : remélange une chaîne, ou toutes."""
    print(f"Mélangé : {', '.join(guide.shuffle(args.channel))}")


def cmd_serve(args) -> None:
    """Commande `serve` : lance le serveur web (API + interface)."""
    import uvicorn

    uvicorn.run("tvfeed.server:app", host=args.host, port=args.port, reload=args.reload)


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

    p = sub.add_parser("serve", help="lancer le serveur web")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--reload", action="store_true", help="recharger à chaque modification du code")
    p.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    args.func(args)

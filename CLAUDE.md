# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tvfeed` builds a personal "TV guide" from YouTube channels grouped into themed local channels. Current stage is a CLI prototype; README.md holds the feature roadmap (checkboxes) — keep it in sync when features land. A local web UI and Docker packaging are planned but not started.

## Commands

Python ≥3.12, managed with `uv`. No test suite or linter is configured yet.

```sh
uv run tvfeed guide                          # 4h guide for all channels
uv run tvfeed guide --hours 1 --channel Sciences
uv run tvfeed guide --refresh                # bypass cache
uv run tvfeed shuffle [channel]              # new seed + anchor for one/all channels
uv run zensical serve                        # docs preview on :8000
uv run zensical build                        # static docs into site/
```

Env vars: `TVFEED_CONFIG` (default `channels.toml`), `TVFEED_DATA` (default `data/`).

## Architecture

Pipeline: `channels.toml` → `config.load_channels` → `sources.get_videos` (yt-dlp, parallel) → `schedule.build_playlist` → `schedule.build_schedule` → printed guide. CLI and state handling live in `src/tvfeed/__init__.py`.

- **Fetching (`sources.py`)**: yt-dlp in `extract_flat` mode — no API key, no per-video page load. Bare channel URLs are rewritten to `/videos` (excludes shorts/lives). Entries without a duration or that are live/upcoming are dropped. Results cached as JSON in `data/cache/` keyed by sha1 of `url|limit`, TTL 6h. In `fetch_all`, a failing source is printed and skipped, not fatal.
- **Deterministic schedule (`schedule.py`)**: each channel has a `seed` and an `anchor` timestamp in `data/state.json`. The playlist is deduped, sorted by video id, then shuffled with `random.Random(seed)` so order depends only on the seed. It loops forever from the anchor, so the current video and offset are computed from `(now - anchor) % total_duration` — opening a channel lands mid-video and the guide is stable across runs. `shuffle` resets seed and anchor.
- Known limitation: when the cache refreshes and new videos appear, the playlist (and thus the grid) changes.

## Conventions

- Code comments, docstrings, CLI output, and docs are in **French**.
- Docstrings use **Google style**; the API reference in the docs is generated from them (mkdocstrings + `api-autonav` over `src/tvfeed`), so public functions/dataclasses need complete `Args`/`Returns`/`Attributes` sections.
- Docs live in `docs/` (configured by `zensical.toml`, nav is explicit there); `templates/` overrides mkdocstrings' French strings. `docs/fonctionnement.md` explains the design and should be updated with architectural changes.
- `data/` and `site/` are generated and gitignored.

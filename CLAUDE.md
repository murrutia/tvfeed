# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tvfeed` builds a personal "TV guide" from YouTube channels grouped into themed local channels. It has a CLI, a FastAPI server, a React + shadcn/ui web UI (`web/`) and Docker packaging. README.md holds the feature roadmap (checkboxes) — keep it in sync when features land.

## Commands

Python ≥3.12, managed with `uv`; web UI uses npm in `web/`. No test suite or linter is configured yet.

```sh
uv run tvfeed serve [--reload]               # API + built UI (web/dist) on :8080
npm --prefix web run dev                     # Vite on :5173, proxies /api to :8080
npm --prefix web run build                   # tsc + build into web/dist
docker compose up --build                    # full app on :8080
uv run tvfeed guide                          # 4h guide for all channels
uv run tvfeed guide --hours 1 --channel Sciences
uv run tvfeed guide --refresh                # bypass cache
uv run tvfeed shuffle [channel]              # new seed + anchor for one/all channels
uv run zensical serve                        # docs preview on :8000
uv run zensical build                        # static docs into site/
```

Env vars: `TVFEED_CONFIG` (default `channels.toml`), `TVFEED_DATA` (default `data/`), `TVFEED_WEB` (default `web/dist`).

## Architecture

Pipeline: `channels.toml` → `config.load_channels` → `sources.get_videos` (yt-dlp, parallel) → `schedule.build_playlist` → `schedule.build_schedule`, assembled by `guide.get_guide` (also owns `data/state.json` and `shuffle`). Both the CLI (`src/tvfeed/__init__.py`) and the server (`server.py`) call `guide`; keep business logic there, not in the CLI or routes.

- **Fetching (`sources.py`)**: yt-dlp in `extract_flat` mode — no API key, no per-video page load. Bare channel URLs are rewritten to `/videos` (excludes shorts/lives). Entries without a duration or that are live/upcoming are dropped. Results cached as JSON in `data/cache/` keyed by sha1 of `url|limit`, TTL 6h. In `fetch_all`, a failing source is printed and skipped, not fatal.
- **Deterministic schedule (`schedule.py`)**: each channel has a `seed` and an `anchor` timestamp in `data/state.json`. The playlist is deduped, sorted by video id, then shuffled with `random.Random(seed)` so order depends only on the seed. It loops forever from the anchor, so the current video and offset are computed from `(now - anchor) % total_duration` — opening a channel lands mid-video and the guide is stable across runs. `shuffle` resets seed and anchor.
- **Server (`server.py`)**: FastAPI, sync routes (run in threadpool, so blocking yt-dlp is fine). `GET /api/guide`, `POST /api/shuffle`, `POST /api/channels/{name}/shuffle` (returns only that channel), `GET /api/videos/{id}/chapters` (id validated by regex since it becomes a cache filename). Mounts `web/dist` at `/` if present. Nothing runs in the background: fetching happens only on request.
- **Web UI (`web/`)**: React 19 + Vite + Tailwind v4 + shadcn/ui (style `radix-nova`, `cn` from the `cn` package). API types in `web/src/lib/api.ts` must mirror `server.py` responses. The client advances the grid itself every second (drops ended slots) and refetches every 15 min. Dark mode follows the system via a script in `index.html`. Add components with `npx shadcn@latest add <name>` from `web/`; don't hand-edit `src/components/ui/`.
- **Chapters (`sources.get_chapters`)**: flat listing has no chapters, so they're fetched per video on demand with `process=False` + `player_skip: js` (~1 s). `end_time` isn't computed in that mode, so ends are derived from the next chapter's start / video duration. Cached forever in `data/cache/chapters/`.
- **Player (`web/src/components/player.tsx`)**: YouTube IFrame API (loaded once by `lib/youtube.ts`, types from `@types/youtube`). The YT player is created once on an imperatively created child element (the API replaces its target with an iframe), then fed via `loadVideoById`. On channel change and on video end it jumps to the live slot/offset (`goLive`). Live delay is only shown once playback actually started (`startedKey`); `pendingSeek` holds the seek target while the player buffers so rapid clicks chain correctly. Watched channel lives in `location.hash`. Embed errors (101/150 = owner forbids embedding) show an overlay with a YouTube link at the live offset.
- **Keyboard (`web/src/lib/keyboard.ts`)**: `useKeydown` (ignores modifier combos and form fields); `SHORTCUTS` feeds the help tooltip — keep it in sync with handlers in `App.tsx` (channels: ↑/↓, 1–9, Esc) and `player.tsx` (media keys). The player blurs the YouTube iframe whenever it takes focus so page shortcuts keep working.
- **Docker**: multi-stage — Node builds `web/dist`, final image is Python only; `compose.yaml` mounts `channels.toml` and `data/`.
- **Later list / channel 0 (`guide.mark`, `unmark`, `mark_done`)**: marked videos live in `data/later.json` (`Marked`: video, origin channel, `done`). All marked ids (done or not) are excluded from channel playlists. `build_playlist` shuffles the full list *then* filters `exclude`, so marking doesn't reorder other videos. Grid jumps are avoided by re-anchoring with `schedule.anchor_at`: `mark` makes the following video start now; `unmark` keeps the channel's current video at the same offset. The UI shows channel 0 only when the list is non-empty; it plays in marking order from 0 (no grid), and on end calls `done` then advances (`leaveLater` in `App.tsx`). `Player` takes a `Source` (`channel` | `later`) and a `resync` counter the page bumps to make it re-tune after programme changes.
- Known limitation: when the cache refreshes and new videos appear, the playlist (and thus the grid) changes.

## Conventions

- Code comments, docstrings, CLI output, UI text, and docs are in **French**.
- Docstrings use **Google style**; the API reference in the docs is generated from them (mkdocstrings + `api-autonav` over `src/tvfeed`), so public functions/dataclasses need complete `Args`/`Returns`/`Attributes` sections.
- Docs live in `docs/` (configured by `zensical.toml`, nav is explicit there); `templates/` overrides mkdocstrings' French strings. `docs/fonctionnement.md` explains the design and should be updated with architectural changes.
- `data/` and `site/` are generated and gitignored.

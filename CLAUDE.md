# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tvfeed` builds a personal "TV guide" from YouTube channels grouped into themed local channels. It has a CLI, a FastAPI server, a React + shadcn/ui web UI (`web/`) and Docker packaging. README.md holds the feature roadmap (checkboxes) — keep it in sync when features land.

## Commands

Python ≥3.12, managed with `uv`; web UI uses npm in `web/`. Backend tests with pytest; web lint with oxlint (`npm --prefix web run lint`).

```sh
uv run pytest                                # backend tests, offline (~0.5 s)
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
- **Keyboard (`web/src/lib/keyboard.ts`)**: `useKeydown` (ignores modifier combos and form fields); `SHORTCUTS` feeds the help tooltip — keep it in sync with handlers in `App.tsx` (channels: `/` opens the header picker, ↑/↓, 0–9, Esc) and `player.tsx` (media keys). The player blurs the YouTube iframe whenever it takes focus so page shortcuts keep working.
- **Docker**: multi-stage — Node builds `web/dist`, final image is Python only; `compose.yaml` mounts `channels.toml` (read-write: the UI edits it) and `data/`.
- **Channel management**: `config.upsert_channel` / `delete_channel` / `reorder_channels` rewrite `channels.toml` with tomlkit (comments/format preserved) under a module lock. `guide.save_channel` validates only *new* sources (or all if `per_source` changed) via `check_sources` (fetch through the cache), and on rename moves the `state.json` entry and `later.json` origin channel. API: `GET/POST /api/channels`, `PUT/DELETE /api/channels/{name}`, `PUT /api/channels/order` (declared before `{name}` routes). UI: `channel-manager.tsx` (Sheet) + `channel-form.tsx` (Dialog). In `App.tsx`, `load(call, partial)` replaces the guide unless `partial` (single-channel shuffle). `useKeydown` ignores events inside dialogs.
- **Display / aspect (`lib/aspect.ts`, `display-menu.tsx`)**: per-channel `aspect` (`""` = native, `"4:3"`, custom `W:H`, validated by `config.ASPECT`) and `fill` (zoom/crop) in `channels.toml`; `PUT /api/channels/{name}/display` (`config.set_display` writes only those keys). Player frame stays 16:9 with a centered 16:9 "stage" (`w-[min(100%,calc(100svh*16/9))]`) so fullscreen keeps proportions; fullscreen targets the frame, not the iframe/video (`F`). IPTV: `videoStyle` sizes the `<video>` (object-fit fill/contain/cover). YouTube: `iframeStyle` CSS-scales the whole iframe (assumes 16:9 source). `App.changeDisplay` updates the guide optimistically before saving (otherwise a second change sent stale props). The channel form passes `aspect`/`fill` through so editing a channel keeps them. Live-slot matching in `player.tsx` tolerates ±2 s on `start` (server recomputes slot times with sub-second drift on each reload).
- **Display modes (`App.tsx` `View`, `channel-views.tsx`, `lib/summary.ts`)**: `programme` (full rows, default), `grille` (tiles), `details` (compact list), switched by a shadcn ToggleGroup above the list and kept in `localStorage` (`tvfeed.view`). Compact views render `Summary` objects (`summarize` / `summarizeLater`: current + next video, or logo for IPTV). `ChannelLogo` positions its `<img>` absolutely (`padding: inherit`) because a % height doesn't resolve in an aspect-ratio box inside a grid.
- **Header channel picker (`channel-picker.tsx`)**: shadcn combobox (Popover + cmdk `Command`) with a custom `filter` (every word must appear in folded name/themes/current title; cmdk's default fuzzy filter matched far too much). Popover content has `role=dialog`, so `useKeydown` ignores typing inside it.
- **IPTV / live channels (`iptv.py`)**: a channel with `kind = "iptv"` in `channels.toml` (`Channel.is_iptv`); its `sources` are HLS stream URLs tried in order, plus `logo` and `iptv_id`. Written by `config._fill` only when non-default. `guide.get_guide` gives IPTV channels empty slots and never fetches/creates state for them; `shuffle` skips them; `save_channel` checks new streams with `iptv.check_stream` (at least one must answer). Catalog: iptv-org API files cached 24h in `data/cache/iptv/` + in-memory index (`iptv.catalog`); excludes nsfw/closed channels and streams needing a `referrer` (browsers can't set it); streams needing only a `user_agent` are kept (they want a browser UA, which the browser sends) but sorted last; then https > domain > IP > quality. Search folds accents (`_fold`) and also matches names without spaces. Endpoints `GET /api/iptv/filters`, `GET /api/iptv/search`. UI: `iptv-browser.tsx` (dialog, preview), `live-video.tsx` (hls.js + fallback to next stream on fatal error or 15 s without playback), `iptv-player.tsx`, `live-row.tsx`, `channel-logo.tsx`. No EPG.
- **Assist / local AI (`ai.py`, `assist.py`)**: optional Ollama over plain urllib (`TVFEED_OLLAMA_URL`, `TVFEED_AI_MODEL`; default = largest installed model; `ai.model()` returns `None` when unreachable → UI hides "Suggérer"). Structured output via Ollama `format` JSON schema. The LLM never proposes channels (small models hallucinate handles): it only writes search queries; `sources.search_channels` runs a real YouTube channel search (`sp=EgIQAg==`) via yt-dlp. `assist.discover` falls back to themes as queries without AI or on AI error, excludes current sources (`_key` normalizes URLs), flags `used_in` for sources of other local channels, ranks by hits then small channels (<1000 followers) last. Endpoints: `GET /api/ai`, `POST /api/assist/themes` (503 without AI), `POST /api/assist/channels`. Docker reaches host Ollama via `host.docker.internal` (Ollama must listen on 0.0.0.0).
- **Later list / channel 0 (`guide.mark`, `unmark`, `mark_done`)**: marked videos live in `data/later.json` (`Marked`: video, origin channel, `done`). All marked ids (done or not) are excluded from channel playlists. `build_playlist` shuffles the full list *then* filters `exclude`, so marking doesn't reorder other videos. Grid jumps are avoided by re-anchoring with `schedule.anchor_at`: `mark` makes the following video start now; `unmark` keeps the channel's current video at the same offset. The UI shows channel 0 only when the list is non-empty; it plays in marking order from 0 (no grid), and on end calls `done` then advances (`leaveLater` in `App.tsx`). `Player` takes a `Source` (`channel` | `later`) and a `resync` counter the page bumps to make it re-tune after programme changes.
- Known limitation: when the cache refreshes and new videos appear, the playlist (and thus the grid) changes.

## Tests

`tests/conftest.py` isolates every test: `guide.CONFIG/DATA/STATE/LATER` point to `tmp_path`, and `guide.get_videos` is replaced by fake sources (`SOURCES`; `https://src/unknown` raises, `https://src/empty` is empty) — no network. `test_guide.py` moves anchors into the past (`mid_programme`) so re-anchoring bugs aren't masked by a fresh anchor at offset 0. Cover new backend behaviour there; the frontend has no unit tests (mostly YouTube player integration, checked manually / via headless Chrome).

## Conventions

- Code comments, docstrings, CLI output, UI text, and docs are in **French**.
- Docstrings use **Google style**; the API reference in the docs is generated from them (mkdocstrings + `api-autonav` over `src/tvfeed`), so public functions/dataclasses need complete `Args`/`Returns`/`Attributes` sections.
- Docs live in `docs/` (configured by `zensical.toml`, nav is explicit there); `templates/` overrides mkdocstrings' French strings. `docs/fonctionnement.md` explains the design and should be updated with architectural changes.
- `data/` and `site/` are generated and gitignored.

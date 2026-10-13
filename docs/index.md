# tvfeed

Programme télé personnel : des chaînes thématiques construites à partir de chaînes YouTube,
avec une grille horaire comme à la télé.

## Installation

=== "Docker"

    ```sh
    docker compose up --build   # interface sur http://localhost:8080
    ```

    `channels.toml` et `data/` sont montés depuis le dossier courant.

=== "Local"

    ```sh
    uv sync && npm --prefix web install
    npm --prefix web run build   # compile l'interface dans web/dist
    uv run tvfeed serve          # interface + API sur http://localhost:8080
    ```

## Définir ses chaînes

Les chaînes se définissent dans `channels.toml`. Chaque chaîne regroupe plusieurs sources
(chaînes YouTube, playlists…) :

```toml
[[channel]]
name = "Sciences"
themes = ["science", "physique"]
per_source = 30  # vidéos récentes récupérées par source (optionnel)
sources = [
    "https://www.youtube.com/@ScienceEtonnante",
    "https://www.youtube.com/@ScienceClic",
]
```

## Ligne de commande

```sh
uv run tvfeed serve [--host H] [--port P] [--reload]   # serveur web
uv run tvfeed guide                # programme des 4 prochaines heures
uv run tvfeed guide --hours 1 --channel Sciences
uv run tvfeed guide --refresh      # ignorer le cache
uv run tvfeed shuffle [chaîne]     # remélanger une chaîne (ou toutes)
```

| Variable d'environnement | Défaut          | Rôle                                  |
| ------------------------ | --------------- | ------------------------------------- |
| `TVFEED_CONFIG`          | `channels.toml` | Fichier de définition des chaînes     |
| `TVFEED_DATA`            | `data`          | Dossier du cache et de l'état         |
| `TVFEED_WEB`             | `web/dist`      | Interface compilée servie sur `/`     |

## Développer l'interface

```sh
uv run tvfeed serve --reload   # API sur :8080
npm --prefix web run dev       # Vite sur :5173, redirige /api vers :8080
```

## Documentation

```sh
uv run zensical serve   # aperçu avec rechargement à chaud
uv run zensical build   # site statique dans site/
```

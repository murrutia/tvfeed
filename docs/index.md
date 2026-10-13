# tvfeed

Programme télé personnel : des chaînes thématiques construites à partir de chaînes YouTube,
avec une grille horaire comme à la télé.

## Installation

```sh
uv sync
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

## Utilisation

```sh
uv run tvfeed guide                # programme des 4 prochaines heures
uv run tvfeed guide --hours 1 --channel Sciences
uv run tvfeed guide --refresh      # ignorer le cache
uv run tvfeed shuffle [chaîne]     # remélanger une chaîne (ou toutes)
```

| Variable d'environnement | Défaut          | Rôle                                  |
| ------------------------ | --------------- | ------------------------------------- |
| `TVFEED_CONFIG`          | `channels.toml` | Fichier de définition des chaînes     |
| `TVFEED_DATA`            | `data`          | Dossier du cache et de l'état         |

## Documentation

```sh
uv run zensical serve   # aperçu avec rechargement à chaud
uv run zensical build   # site statique dans site/
```

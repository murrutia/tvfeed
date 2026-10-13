# Fonctionnement

## Vue d'ensemble

```mermaid
flowchart LR
    A[channels.toml] --> B[sources.get_videos]
    B -- yt-dlp --> C[(data/cache)]
    B --> D[schedule.build_playlist]
    E[(data/state.json)] --> D
    D --> F[schedule.build_schedule]
    F --> G[Grille affichée]
```

1. [`config`][tvfeed.config] lit les chaînes depuis `channels.toml`.
2. [`sources`][tvfeed.sources] récupère les vidéos de chaque source avec yt-dlp, en parallèle,
   sans clé d'API. Les résultats sont mis en cache 6 h dans `data/cache/`.
3. [`schedule`][tvfeed.schedule] mélange les vidéos de la chaîne et calcule la grille.

## Récupération des vidéos

yt-dlp est utilisé en mode « flat » : il lit la liste des vidéos sans ouvrir chaque page,
ce qui suffit pour obtenir titre et durée. Une URL de chaîne sans onglet est redirigée vers
l'onglet `/videos`, ce qui exclut les shorts et les lives. Les vidéos sans durée (live,
première à venir) sont ignorées.

## Grille déterministe

Chaque chaîne a, dans `data/state.json` :

- une **graine** qui fixe l'ordre du mélange ;
- une **ancre** : l'instant où la playlist a démarré.

La playlist tourne en boucle depuis l'ancre. Connaissant l'heure, on sait donc quelle vidéo
passe et où on en est : en allumant une chaîne, on tombe en cours de vidéo, et la grille
reste la même d'un lancement à l'autre. `tvfeed shuffle` tire une nouvelle graine et une
nouvelle ancre.

!!! warning "Limite connue"
    Quand le cache se rafraîchit et que de nouvelles vidéos apparaissent, la playlist change
    et la grille de la chaîne aussi.

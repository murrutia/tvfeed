# Video feed reader

## Idée du projet

Il y a longtemps j'avais eu une idée de projet : me créer une structure de télé avec différentes chaînes adaptées pour moi.
Les rares fois où je me retrouve seul chez quelqu'un qui a une télé (je n'ai pas de box TV chez moi), je zappe sur toutes les chaînes sans quasiment jamais trouver quelque chose qui m'intéresse. Du coup je me suis dit que je pourrais me créer mes programmes à moi. L'idée serait qu'ils seraient basés sur des chaînes YouTube diverses, regroupées par thèmes et que ça me créerait un programme télé que je pourrais consulter.
Les fonctionnalités seraient :
 - [ ] Création de chaîne
    - [x] Définir le titre
    - [x] Définir les thèmes
    - [x] Rajouter des chaînes YouTube (ou autre plateforme vidéo)
 - [ ] Création de programme/sommaire télé
    - [x] Pour chaque chaîne, créer une playlist pour les quelques heures à venir (disons 4)
    - [x] Pouvoir afficher, de par la durée des vidéos, à quelle heure commenceront les prochaines vidéos
    - [x] Avancer virtuellement dans la playlist. De cette manière, en choisissant une chaîne, j'arrive en cours de vidéo.
    - [x] Possibilité de naviguer dans la vidéo (revenir au début, sauter des passages, passer au chapitre suivant s'il y en a)
    - [ ] Possibilité de marquer une vidéo pour relire plus tard (ça pourrait être une chaîne spéciale pour les vidéos marquées)
- [x] Développer une interface utilisateur
    - [x] Page basée sur le framework visuel shadcn/ui
    - [x] Serveur local
    - [x] N'effectuerait les requêtes qu'à l'ouverture de l'interface. Pas besoin de tourner en permanence en arrière plan.
    - [x] Pouvoir relancer un shuffle du contenu des chaînes (par exemple si le programme ne me satisfait pas)
    - [x] Dans l'affichage du programme on aurait les vignettes des vidéos
    - [ ] Interface de gestion des chaînes
        - [ ] Listing des chaînes avec leur titre et thèmes/mots clés
        - [ ] Ajout et suppression de chaînes
        - [ ] Avec une IA locale
            - [ ] proposer des thèmes en fonction des chaînes déjà existantes
            - [ ] proposer des chaînes en fonction des thèmes existants
- [x] Navigation entre les chaînes
    - [x] Possibilité de passer à la chaîne suivante/précédente avec un raccourci clavier
- [ ] Contrôle depuis une "télécommande"
    - [ ] Déterminer la faisabilité de contrôler l'ordi avec une manette PS3 ou une app Android

## Choix de technologie

Il faudrait que je puisse le lancer avec un docker, le langage de programmation soit le plus simple possible, et que le serveur soit capable de gérer plusieurs chaînes de manière efficace. 
  
## Utilisation

Les chaînes se définissent dans `channels.toml` (titre, thèmes, sources). Les vidéos sont récupérées avec [yt-dlp](https://github.com/yt-dlp/yt-dlp), sans clé d'API YouTube, et mises en cache 6 h dans `data/cache/`.

### Avec Docker

```sh
docker compose up --build   # interface sur http://localhost:8080
```

`channels.toml` et `data/` sont montés depuis le dossier courant.

### En local

```sh
uv sync && npm --prefix web install
npm --prefix web run build         # compile l'interface dans web/dist
uv run tvfeed serve                # interface + API sur http://localhost:8080

uv run tvfeed guide                # programme des 4 prochaines heures, en ligne de commande
uv run tvfeed guide --hours 1 --channel Sciences
uv run tvfeed guide --refresh      # ignorer le cache
uv run tvfeed shuffle [chaîne]     # remélanger une chaîne (ou toutes)
```

Pour développer l'interface avec rechargement à chaud : `uv run tvfeed serve --reload` et `npm --prefix web run dev` (Vite sur http://localhost:5173, qui redirige `/api` vers le serveur).

Chaque chaîne a une graine de mélange et une ancre temporelle (`data/state.json`). La playlist tourne en boucle depuis l'ancre : le programme est donc stable entre deux lancements, et on tombe en cours de vidéo.

Limite connue : quand le cache se rafraîchit et que de nouvelles vidéos apparaissent, la grille de la chaîne change.

## Documentation

Documentation générée avec [Zensical](https://zensical.org) ; la référence d'API vient des docstrings (style Google) via mkdocstrings.

```sh
uv run zensical serve   # aperçu sur http://localhost:8000 avec rechargement à chaud
uv run zensical build   # site statique dans site/
```

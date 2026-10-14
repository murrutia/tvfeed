"""IA locale facultative, via [Ollama](https://ollama.com).

Si Ollama ne répond pas, l'application fonctionne sans : les suggestions de thèmes sont
indisponibles et la recherche de chaînes utilise directement les thèmes.

L'IA ne propose jamais de chaînes elle-même (un petit modèle en invente) : elle formule
des requêtes, et les chaînes viennent d'une vraie recherche YouTube.
"""

import json
import os
import urllib.request

OLLAMA_URL = os.environ.get("TVFEED_OLLAMA_URL", "http://localhost:11434")
"""Adresse d'Ollama (variable `TVFEED_OLLAMA_URL`)."""
MODEL = os.environ.get("TVFEED_AI_MODEL")
"""Modèle à utiliser (variable `TVFEED_AI_MODEL`) ; à défaut, le plus gros modèle installé."""

_STRINGS = {"type": "array", "items": {"type": "string"}}


def _request(path: str, body: dict | None = None, timeout: float = 120) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{OLLAMA_URL}{path}", data, {"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def model() -> str | None:
    """Modèle utilisable, ou `None` si Ollama ne répond pas ou n'a aucun modèle."""
    try:
        models = _request("/api/tags", timeout=1).get("models", [])
    except OSError:
        return None
    names = [m["name"] for m in models]
    if MODEL:
        return MODEL if MODEL in names else None
    return max(models, key=lambda m: m.get("size", 0))["name"] if models else None


def _ask(prompt: str, schema: dict) -> dict:
    """Pose une question au modèle et renvoie sa réponse JSON, conforme à `schema`.

    Raises:
        RuntimeError: Si aucun modèle n'est disponible.
    """
    name = model()
    if not name:
        raise RuntimeError("IA locale indisponible")
    body = {
        "model": name,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0.3},
        "messages": [{"role": "user", "content": prompt}],
    }
    return json.loads(_request("/api/chat", body)["message"]["content"])


def _describe(name: str, themes: list[str], titles: list[str]) -> str:
    lines = [f"Chaîne de télé personnelle « {name} »."]
    if themes:
        lines.append(f"Thèmes actuels : {', '.join(themes)}.")
    if titles:
        lines.append("Titres de vidéos récentes de ses sources :\n- " + "\n- ".join(titles))
    return "\n".join(lines)


def suggest_themes(name: str, themes: list[str], titles: list[str]) -> list[str]:
    """Propose des thèmes pour une chaîne, d'après ses titres de vidéos.

    Args:
        name: Nom de la chaîne.
        themes: Thèmes déjà choisis (non reproposés).
        titles: Titres de vidéos récentes des sources de la chaîne.

    Returns:
        Jusqu'à 6 nouveaux thèmes, en minuscules.
    """
    prompt = (
        _describe(name, themes, titles)
        + "\n\nPropose 6 thèmes courts (1 à 2 mots, en français, en minuscules) qui décrivent"
        " le contenu de cette chaîne. Pas de thème trop général comme « vidéo » ou « youtube »."
    )
    answer = _ask(prompt, {"type": "object", "properties": {"themes": _STRINGS}, "required": ["themes"]})
    known = {t.lower() for t in themes}
    result = []
    for t in answer.get("themes", []):
        t = str(t).strip().lower()
        if t and t not in known and t not in result:
            result.append(t)
    return result[:6]


def search_queries(name: str, themes: list[str], titles: list[str]) -> list[str]:
    """Formule des requêtes de recherche de chaînes YouTube pour une chaîne.

    Args:
        name: Nom de la chaîne.
        themes: Thèmes de la chaîne.
        titles: Titres de vidéos récentes de ses sources, pour le ton et la langue.

    Returns:
        Jusqu'à 4 requêtes.
    """
    prompt = (
        _describe(name, themes, titles)
        + "\n\nPropose 4 requêtes courtes (2 à 4 mots) pour trouver, avec la recherche de"
        " chaînes de YouTube, d'autres chaînes qui conviendraient à cette chaîne. Écris-les"
        " dans la langue des titres. N'utilise pas les mots « youtube », « chaîne » ni « vidéo »."
    )
    answer = _ask(prompt, {"type": "object", "properties": {"queries": _STRINGS}, "required": ["queries"]})
    return [q for q in (str(q).strip() for q in answer.get("queries", [])) if q][:4]

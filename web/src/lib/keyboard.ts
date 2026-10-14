import { useEffect, useRef } from "react"

/**
 * Écoute les touches au niveau de la page. Ignore les combinaisons avec Ctrl/Cmd/Alt
 * (raccourcis du navigateur) et la saisie dans un champ.
 */
export function useKeydown(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return
      ref.current(e)
    }
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
}

/** Raccourcis, affichés dans l'aide. */
export const SHORTCUTS = [
  { keys: ["↑", "↓"], label: "Chaîne précédente / suivante" },
  { keys: ["0"], label: "Vidéos à revoir" },
  { keys: ["1…9"], label: "Aller à la chaîne n" },
  { keys: ["Échap"], label: "Fermer le lecteur" },
  { keys: ["Espace"], label: "Lecture / pause" },
  { keys: ["←", "→"], label: "Reculer de 10 s / avancer de 30 s" },
  { keys: ["⇧ ←", "⇧ →"], label: "Chapitre précédent / suivant" },
  { keys: ["Début"], label: "Revenir au début" },
  { keys: ["D"], label: "Retour au direct" },
  { keys: ["M"], label: "Marquer à revoir (sort la vidéo de la chaîne)" },
]

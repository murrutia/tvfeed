import type { CSSProperties } from "react"

// Le cadre du lecteur est toujours en 16/9 ; la vidéo y est placée selon le réglage de la chaîne.
const FRAME = 16 / 9

/** Format « 4:3 », « 1.85:1 »… en rapport largeur / hauteur, ou `null` s'il est vide ou invalide. */
export function parseAspect(aspect: string): number | null {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim())
  if (!m || !Number(m[2])) return null
  return Number(m[1]) / Number(m[2])
}

/**
 * Taille de l'image dans le cadre, en fraction du cadre : entière avec des bandes noires
 * (`fill` faux), ou zoomée pour couvrir tout le cadre, bords rognés (`fill` vrai).
 */
function box(ratio: number, fill: boolean) {
  const wider = ratio >= FRAME
  if (wider !== fill) return { w: 1, h: FRAME / ratio }
  return { w: ratio / FRAME, h: 1 }
}

/** Style d'une balise vidéo : format imposé (image étirée) ou format d'origine. */
export function videoStyle(aspect: string, fill: boolean): CSSProperties {
  const ratio = parseAspect(aspect)
  if (!ratio) return { objectFit: fill ? "cover" : "contain" }
  const { w, h } = box(ratio, fill)
  return {
    position: "absolute",
    width: `${w * 100}%`,
    height: `${h * 100}%`,
    left: `${((1 - w) / 2) * 100}%`,
    top: `${((1 - h) / 2) * 100}%`,
    objectFit: "fill",
  }
}

/**
 * Style d'une iframe YouTube, qu'on ne peut pas styliser de l'intérieur : on la déforme
 * d'un bloc. On suppose une vidéo en 16/9, qui occupe alors toute l'iframe.
 */
export function iframeStyle(aspect: string, fill: boolean): CSSProperties {
  const ratio = parseAspect(aspect)
  if (!ratio) return {}
  const { w, h } = box(ratio, fill)
  return { transform: `scale(${w}, ${h})` }
}

export const ASPECTS = ["16:9", "4:3"] as const

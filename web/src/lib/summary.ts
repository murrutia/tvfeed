import type { ChannelGuide, LaterVideo } from "@/lib/api"

/** Ce qu'affichent les vues compactes (grille, détails) pour une chaîne. */
export type Summary = {
  /** Nom de la chaîne, ou clé de la chaîne 0. */
  key: string
  number: number
  name: string
  kind: "youtube" | "iptv" | "later"
  /** Vignette de la vidéo en cours, ou logo d'une chaîne IPTV. */
  image: string
  title?: string
  source?: string
  start?: Date
  end?: Date
  /** Titre de la vidéo suivante. */
  next?: string
}

export function summarize(channel: ChannelGuide, number: number, now: Date): Summary {
  const base = { key: channel.name, number, name: channel.name }
  if (channel.kind === "iptv") return { ...base, kind: "iptv", image: channel.logo }
  // Même règle que la vue programme : les créneaux terminés sont ignorés.
  const [current, next] = channel.slots.filter((s) => new Date(s.end) > now)
  return {
    ...base,
    kind: "youtube",
    image: current?.thumbnail ?? "",
    title: current?.title,
    source: current?.source,
    start: current && new Date(current.start),
    end: current && new Date(current.end),
    next: next?.title,
  }
}

export function summarizeLater(videos: LaterVideo[], key: string): Summary {
  const [first, second] = videos
  return {
    key,
    number: 0,
    name: "À revoir",
    kind: "later",
    image: first?.thumbnail ?? "",
    title: first?.title,
    source: first && `${first.source} · depuis ${first.channel}`,
    next: second?.title,
  }
}

/** Avancement de la vidéo en cours, en pourcentage. */
export function progress(summary: Summary, now: Date): number | null {
  if (!summary.start || !summary.end) return null
  return ((now.getTime() - summary.start.getTime()) / (summary.end.getTime() - summary.start.getTime())) * 100
}

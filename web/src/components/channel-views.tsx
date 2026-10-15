import { Radio } from "lucide-react"

import { ChannelLogo } from "@/components/channel-logo"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { Progress } from "@/components/ui/progress"
import { formatTime } from "@/lib/format"
import { progress, type Summary } from "@/lib/summary"
import { cn } from "@/lib/utils"

type Props = { summaries: Summary[]; now: Date; watching: string | null; onWatch: (s: Summary) => void }

/** Vue grille : une tuile par chaîne, vignette de la vidéo en cours et ses informations. */
export function ChannelGrid({ summaries, now, watching, onWatch }: Props) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {summaries.map((s) => {
        const pct = progress(s, now)
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => onWatch(s)}
              className={cn(
                "group flex h-full w-full cursor-pointer flex-col gap-2 rounded-xl text-left outline-offset-4",
                watching === s.key && "outline-2 outline-primary",
              )}
            >
              <span className="relative block overflow-hidden rounded-lg bg-muted">
                <Picture summary={s} className="aspect-video w-full transition-transform group-hover:scale-105" />
                {s.number <= 9 && <Kbd className="absolute top-2 left-2 shadow">{s.number}</Kbd>}
                <KindBadge summary={s} className="absolute top-2 right-2" />
                {pct !== null && <Progress value={pct} className="absolute inset-x-0 bottom-0 h-1 rounded-none" />}
              </span>
              <Info summary={s} />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Vue détails : une ligne par chaîne, micro-vignette et informations à droite. */
export function ChannelList({ summaries, now, watching, onWatch }: Props) {
  return (
    <Card className="gap-0 py-1">
      <ol className="divide-y">
        {summaries.map((s) => {
          const pct = progress(s, now)
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onWatch(s)}
                className={cn("flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50", watching === s.key && "bg-muted")}
              >
                <Kbd className={cn("shrink-0", s.number > 9 && "invisible")}>{s.number}</Kbd>
                <span className="relative w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Picture summary={s} className="aspect-video w-full" />
                  {pct !== null && <Progress value={pct} className="absolute inset-x-0 bottom-0 h-0.5 rounded-none" />}
                </span>
                <span className="w-32 shrink-0 truncate font-medium sm:w-40">{s.name}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <KindBadge summary={s} />
                    <span className="truncate text-sm">{s.title}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[timeRange(s), s.source].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {s.next && (
                  <span className="hidden w-56 shrink-0 truncate text-xs text-muted-foreground lg:block">Ensuite : {s.next}</span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function timeRange(s: Summary) {
  return s.start && s.end ? `${formatTime(s.start)}–${formatTime(s.end)}` : ""
}

function Picture({ summary, className }: { summary: Summary; className?: string }) {
  if (summary.kind === "iptv") return <ChannelLogo src={summary.image} className={cn("rounded-none p-3", className)} />
  if (!summary.image) return <span className={cn("block", className)} />
  return <img src={summary.image} alt="" loading="lazy" className={cn("object-cover", className)} />
}

function KindBadge({ summary, className }: { summary: Summary; className?: string }) {
  if (summary.kind === "iptv")
    return (
      <Badge variant="destructive" className={className}>
        <Radio data-icon="inline-start" />
        En direct
      </Badge>
    )
  return null
}

function Info({ summary: s }: { summary: Summary }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-medium">{s.name}</span>
      {s.title && <span className="line-clamp-2 text-sm leading-snug">{s.title}</span>}
      <span className="truncate text-xs text-muted-foreground">{[timeRange(s), s.source].filter(Boolean).join(" · ")}</span>
      {s.next && <span className="truncate text-xs text-muted-foreground">Ensuite : {s.next}</span>}
    </span>
  )
}

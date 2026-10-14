import { Play, Shuffle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { Progress } from "@/components/ui/progress"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ChannelGuide, Slot } from "@/lib/api"
import { formatDuration, formatTime } from "@/lib/format"

type Props = {
  /** Numéro de la chaîne, aussi raccourci clavier pour l'ouvrir (1 à 9). */
  number: number
  channel: ChannelGuide
  now: Date
  shuffling: boolean
  onShuffle: () => void
  onWatch: () => void
}

export function ChannelRow({ number, channel, now, shuffling, onShuffle, onWatch }: Props) {
  // Le programme est calculé par le serveur ; on avance dans la grille côté client
  // en masquant les créneaux déjà terminés.
  const slots = channel.slots.filter((s) => new Date(s.end) > now)
  const [current, ...upcoming] = slots

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {number <= 9 && <Kbd>{number}</Kbd>}
          {channel.name}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {channel.themes.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
          <span>{channel.video_count} vidéos</span>
        </CardDescription>
        <CardAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={onShuffle} disabled={shuffling} aria-label="Remélanger la chaîne">
                <Shuffle className={shuffling ? "animate-pulse" : undefined} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remélanger la chaîne</TooltipContent>
          </Tooltip>
        </CardAction>
      </CardHeader>
      <CardContent>
        {current ? (
          <div className="flex flex-col gap-4 md:flex-row">
            <NowPlaying slot={current} now={now} onWatch={onWatch} />
            <ScrollArea className="min-w-0 flex-1">
              <ol className="flex gap-3 pb-3">
                {upcoming.map((s) => (
                  <UpcomingSlot key={`${s.id}-${s.start}`} slot={s} />
                ))}
              </ol>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucune vidéo disponible pour cette chaîne.</p>
        )}
      </CardContent>
    </Card>
  )
}

function NowPlaying({ slot, now, onWatch }: { slot: Slot; now: Date; onWatch: () => void }) {
  const elapsed = (now.getTime() - new Date(slot.start).getTime()) / 1000

  return (
    <button type="button" onClick={onWatch} className="group flex w-full shrink-0 cursor-pointer flex-col gap-2 text-left md:w-80">
      <div className="relative overflow-hidden rounded-lg">
        <span className="absolute inset-0 z-10 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-12 fill-white text-white" />
        </span>
        <img src={slot.thumbnail} alt="" className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
        <Badge className="absolute top-2 left-2">En cours</Badge>
      </div>
      <Progress value={(elapsed / slot.duration) * 100} />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatTime(new Date(slot.start))}</span>
        <span>
          {formatDuration(elapsed)} / {formatDuration(slot.duration)}
        </span>
        <span>{formatTime(new Date(slot.end))}</span>
      </div>
      <div>
        <p className="line-clamp-2 font-medium group-hover:underline">{slot.title}</p>
        <p className="text-sm text-muted-foreground">{slot.source}</p>
      </div>
    </button>
  )
}

function UpcomingSlot({ slot }: { slot: Slot }) {
  return (
    <li className="flex w-44 shrink-0 flex-col gap-1.5">
      <img src={slot.thumbnail} alt="" loading="lazy" className="aspect-video w-full rounded-md object-cover" />
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {formatTime(new Date(slot.start))} · {formatDuration(slot.duration)}
      </span>
      <p className="line-clamp-2 text-sm leading-snug">{slot.title}</p>
      <p className="truncate text-xs text-muted-foreground">{slot.source}</p>
    </li>
  )
}

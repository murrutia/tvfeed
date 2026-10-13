import { Shuffle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ChannelGuide, Slot } from "@/lib/api"
import { formatDuration, formatTime } from "@/lib/format"

type Props = {
  channel: ChannelGuide
  now: Date
  shuffling: boolean
  onShuffle: () => void
}

export function ChannelRow({ channel, now, shuffling, onShuffle }: Props) {
  // Le programme est calculé par le serveur ; on avance dans la grille côté client
  // en masquant les créneaux déjà terminés.
  const slots = channel.slots.filter((s) => new Date(s.end) > now)
  const [current, ...upcoming] = slots

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{channel.name}</CardTitle>
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
            <NowPlaying slot={current} now={now} />
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

function NowPlaying({ slot, now }: { slot: Slot; now: Date }) {
  const elapsed = (now.getTime() - new Date(slot.start).getTime()) / 1000
  // Lien YouTube positionné à l'instant courant, en attendant le lecteur intégré.
  const href = `https://www.youtube.com/watch?v=${slot.id}&t=${Math.floor(elapsed)}s`

  return (
    <a href={href} target="_blank" rel="noreferrer" className="group flex w-full shrink-0 flex-col gap-2 md:w-80">
      <div className="relative overflow-hidden rounded-lg">
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
    </a>
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

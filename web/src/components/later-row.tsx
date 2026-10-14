import { BookmarkMinus, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { LaterVideo } from "@/lib/api"
import { formatDuration } from "@/lib/format"

type Props = {
  videos: LaterVideo[]
  onWatch: (videoId: string) => void
  onRemove: (videoId: string) => void
}

/** Chaîne 0 : les vidéos marquées « à revoir », dans l'ordre de marquage. */
export function LaterRow({ videos, onWatch, onRemove }: Props) {
  const total = videos.reduce((sum, v) => sum + v.duration, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Kbd>0</Kbd>
          À revoir
        </CardTitle>
        <CardDescription>
          {videos.length} vidéo{videos.length > 1 ? "s" : ""} · {formatDuration(total)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea>
          <ol className="flex gap-3 pb-3">
            {videos.map((v) => (
              <li key={v.id} className="group relative flex w-44 shrink-0 flex-col gap-1.5">
                <button type="button" onClick={() => onWatch(v.id)} className="flex cursor-pointer flex-col gap-1.5 text-left">
                  <span className="relative overflow-hidden rounded-md">
                    <img src={v.thumbnail} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="size-8 fill-white text-white" />
                    </span>
                  </span>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">
                    {formatDuration(v.duration)} · depuis {v.channel}
                  </span>
                  <span className="line-clamp-2 text-sm leading-snug">{v.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.source}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label="Remettre dans sa chaîne"
                      onClick={() => onRemove(v.id)}
                    >
                      <BookmarkMinus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remettre dans sa chaîne</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ol>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

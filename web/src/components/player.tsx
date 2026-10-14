import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  ListVideo,
  Radio,
  Rewind,
  RotateCcw,
  FastForward,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchChapters, liveSlot, type ChannelGuide, type Chapter, type Slot } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDuration, formatTime } from "@/lib/format"
import { loadYouTubeApi } from "@/lib/youtube"

// En deçà de cet écart avec la grille, on considère qu'on regarde « en direct ».
const LIVE_TOLERANCE = 5

type Props = {
  channel: ChannelGuide
  now: Date
  onZap: (delta: 1 | -1) => void
  onClose: () => void
}

/** Vidéo demandée au lecteur ; `key` force le rechargement d'une même vidéo. */
type Request = { slot: Slot; start: number; key: number }

export function Player({ channel, now, onZap, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const [ready, setReady] = useState(false)
  const [request, setRequest] = useState<Request | null>(null)
  const [time, setTime] = useState(0)
  // Clé de la dernière demande dont la lecture a réellement démarré : tant que la
  // vidéo charge, sa position (0) ne dit rien de l'écart avec le direct.
  const requestKey = useRef<number | null>(null)
  const [startedKey, setStartedKey] = useState<number | null>(null)
  const pendingSeek = useRef<{ time: number; until: number } | null>(null)
  // Chapitres associés à leur vidéo, pour ignorer ceux de la vidéo précédente.
  const [loaded, setLoaded] = useState<{ videoId: string; chapters: Chapter[] } | null>(null)

  // Comme à la télé : on rejoint la grille là où elle en est.
  const channelRef = useRef(channel)
  useEffect(() => {
    channelRef.current = channel
  })
  const goLive = useCallback(() => {
    const at = new Date()
    const slot = liveSlot(channelRef.current, at)
    if (slot) setRequest({ slot, start: (at.getTime() - new Date(slot.start).getTime()) / 1000, key: at.getTime() })
  }, [])

  // Création du lecteur, une seule fois. L'API remplace l'élément cible par une
  // iframe : on lui donne un élément créé à la main pour ne pas gêner React.
  useEffect(() => {
    let player: YT.Player | undefined
    let cancelled = false
    const container = containerRef.current!
    loadYouTubeApi().then((yt) => {
      if (cancelled) return
      const target = document.createElement("div")
      container.append(target)
      player = new yt.Player(target, {
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            playerRef.current = player!
            setReady(true)
          },
          // Fin de la vidéo : on revient au direct, qui a pu avancer entre-temps.
          onStateChange: (e) => {
            if (e.data === yt.PlayerState.ENDED) goLive()
            else if (e.data === yt.PlayerState.PLAYING || e.data === yt.PlayerState.PAUSED) {
              setStartedKey(requestKey.current)
            }
          },
        },
      })
    })
    return () => {
      cancelled = true
      player?.destroy()
      playerRef.current = null
      container.replaceChildren()
    }
  }, [goLive])

  // Changement de chaîne : on se cale sur le direct.
  useEffect(goLive, [channel.name, goLive])

  useEffect(() => {
    if (ready && request) {
      requestKey.current = request.key
      playerRef.current?.loadVideoById({ videoId: request.slot.id, startSeconds: Math.floor(request.start) })
    }
  }, [ready, request])

  // Position de lecture, pour les chapitres et l'écart avec le direct.
  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const current = playerRef.current?.getCurrentTime() ?? 0
      // Juste après un saut, le lecteur renvoie encore l'ancienne position le temps de
      // charger : on garde la cible pour que les clics suivants partent du bon endroit.
      const pending = pendingSeek.current
      if (pending && Date.now() < pending.until && Math.abs(current - pending.time) > 2) return
      pendingSeek.current = null
      setTime(current)
    }, 500)
    return () => clearInterval(id)
  }, [ready])

  const videoId = request?.slot.id
  useEffect(() => {
    if (!videoId) return
    const abort = new AbortController()
    fetchChapters(videoId, abort.signal).then((chapters) => setLoaded({ videoId, chapters }), () => {})
    return () => abort.abort()
  }, [videoId])

  const chapters = loaded && loaded.videoId === videoId ? loaded.chapters : []

  const seek = (seconds: number) => {
    const p = playerRef.current
    if (!p) return
    const t = Math.max(0, Math.min(seconds, p.getDuration() - 1))
    p.seekTo(t, true)
    pendingSeek.current = { time: t, until: Date.now() + 5000 }
    setTime(t)
  }

  const chapterIndex = chapters.findLastIndex((c) => c.start <= time)
  const prevChapter = () => {
    // Comme une télécommande : si le chapitre a commencé depuis un moment, on revient à son début.
    const current = chapters[chapterIndex]
    if (current && time - current.start > 3) seek(current.start)
    else if (chapterIndex > 0) seek(chapters[chapterIndex - 1].start)
  }
  const nextChapter = () => {
    const next = chapters[chapterIndex + 1]
    if (next) seek(next.start)
  }

  const live = liveSlot(channel, now)
  const slot = request?.slot
  const isLiveVideo = !!slot && !!live && slot.id === live.id && slot.start === live.start
  const delay = isLiveVideo ? (now.getTime() - new Date(live.start).getTime()) / 1000 - time : null
  const isLive = delay !== null && Math.abs(delay) < LIVE_TOLERANCE
  const started = !!request && startedKey === request.key

  return (
    <Card className="py-0">
      <CardContent className="grid gap-4 p-0 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div ref={containerRef} className="aspect-video w-full overflow-hidden bg-black lg:rounded-tl-xl [&_iframe]:size-full" />
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{channel.name}</span>
                  {!started ? (
                    <Badge variant="outline">Chargement…</Badge>
                  ) : isLive ? (
                    <Badge variant="destructive">
                      <Radio data-icon="inline-start" />
                      En direct
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {delay === null
                        ? "Hors grille"
                        : delay > 0
                          ? `Différé de ${formatDuration(delay)}`
                          : `En avance de ${formatDuration(-delay)}`}
                    </Badge>
                  )}
                  {slot && (
                    <span className="tabular-nums">
                      {formatTime(new Date(slot.start))}–{formatTime(new Date(slot.end))}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-lg font-medium leading-snug">{slot?.title ?? "Chargement…"}</p>
                <p className="text-sm text-muted-foreground">{slot?.source}</p>
              </div>
              <Control label="Fermer le lecteur" onClick={onClose}>
                <X />
              </Control>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Control label="Chaîne précédente" onClick={() => onZap(-1)}>
                <ChevronUp />
              </Control>
              <Control label="Chaîne suivante" onClick={() => onZap(1)}>
                <ChevronDown />
              </Control>
              <span className="mx-1 h-6 w-px bg-border" />
              <Control label="Revenir au début" onClick={() => seek(0)} disabled={!ready}>
                <RotateCcw />
              </Control>
              <Control label="Chapitre précédent" onClick={prevChapter} disabled={!chapters.length}>
                <SkipBack />
              </Control>
              <Control label="Reculer de 10 s" onClick={() => seek(time - 10)} disabled={!ready}>
                <Rewind />
              </Control>
              <span className="w-24 text-center text-sm text-muted-foreground tabular-nums">
                {formatDuration(time)} / {formatDuration(slot?.duration ?? 0)}
              </span>
              <Control label="Avancer de 30 s" onClick={() => seek(time + 30)} disabled={!ready}>
                <FastForward />
              </Control>
              <Control label="Chapitre suivant" onClick={nextChapter} disabled={chapterIndex + 1 >= chapters.length}>
                <SkipForward />
              </Control>
              <Button variant="outline" className="ml-auto" onClick={goLive} disabled={!started || isLive}>
                <Radio data-icon="inline-start" />
                Retour au direct
              </Button>
            </div>
          </div>
        </div>
        <Chapters chapters={chapters} current={chapterIndex} onSelect={(c) => seek(c.start)} />
      </CardContent>
    </Card>
  )
}

function Control({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Chapters({ chapters, current, onSelect }: { chapters: Chapter[]; current: number; onSelect: (c: Chapter) => void }) {
  return (
    <div className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l">
      <p className="flex items-center gap-2 px-4 pt-4 pb-2 text-sm font-medium">
        <ListVideo className="size-4" />
        Chapitres
      </p>
      {chapters.length ? (
        // Hauteur fixe en colonne, pour ne pas étirer la carte au-delà du lecteur.
        <ScrollArea className="h-64 lg:h-0 lg:flex-1">
          <ol className="flex flex-col gap-0.5 px-2 pb-4">
            {chapters.map((c, i) => (
              <li key={c.start}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    "flex w-full gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    i === current && "bg-muted font-medium",
                  )}
                >
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{formatDuration(c.start)}</span>
                  <span className="line-clamp-2">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </ScrollArea>
      ) : (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Pas de chapitres pour cette vidéo.</p>
      )}
    </div>
  )
}

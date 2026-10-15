import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookmarkMinus,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronsRight,
  ChevronUp,
  ExternalLink,
  ListVideo,
  Radio,
  Rewind,
  RotateCcw,
  FastForward,
  Maximize,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react"

import { DisplayMenu } from "@/components/display-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchChapters, liveSlot, type ChannelGuide, type Chapter, type LaterVideo, type Slot, type Video } from "@/lib/api"
import { cn } from "@/lib/utils"
import { formatDuration, formatTime } from "@/lib/format"
import { iframeStyle } from "@/lib/aspect"
import { useKeydown } from "@/lib/keyboard"
import { loadYouTubeApi } from "@/lib/youtube"

// Codes d'erreur du lecteur : vidéo introuvable/privée, intégration interdite par l'auteur.
const ERROR_MESSAGES: Record<number, string> = {
  100: "Cette vidéo est introuvable ou privée.",
  101: "L'auteur de cette vidéo interdit sa lecture en dehors de YouTube.",
  150: "L'auteur de cette vidéo interdit sa lecture en dehors de YouTube.",
}

// En deçà de cet écart avec la grille, on considère qu'on regarde « en direct ».
const LIVE_TOLERANCE = 5

/** Ce que lit le lecteur : une chaîne calée sur la grille, ou la liste « à revoir ». */
export type Source =
  | {
      kind: "channel"
      channel: ChannelGuide
      onMark: (videoId: string) => void
      /** Enregistre le réglage de l'image de la chaîne. */
      onDisplay: (display: { aspect: string; fill: boolean }) => void
    }
  | {
      kind: "later"
      videos: LaterVideo[]
      /** Vidéo choisie dans la liste ; la première si absente. */
      selected: string | null
      onSelect: (videoId: string) => void
      onDone: (videoId: string) => void
      onRemove: (videoId: string) => void
    }

type Props = {
  source: Source
  now: Date
  /** Incrémenté par la page pour forcer le lecteur à se recaler (après un marquage, un remélange…). */
  resync: number
  onZap: (delta: 1 | -1) => void
  onClose: () => void
}

/**
 * Vidéo demandée au lecteur ; `slot` est le créneau de la grille quand on regarde une
 * chaîne. `key` force le rechargement d'une même vidéo.
 */
type Request = { video: Video; slot?: Slot; start: number; key: number }

export function Player({ source, now, resync, onZap, onClose }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const [ready, setReady] = useState(false)
  const [request, setRequest] = useState<Request | null>(null)
  const [time, setTime] = useState(0)
  // Clé de la dernière demande dont la lecture a réellement démarré : tant que la
  // vidéo charge, sa position (0) ne dit rien de l'écart avec le direct.
  const requestRef = useRef<Request | null>(null)
  const [startedKey, setStartedKey] = useState<number | null>(null)
  const [error, setError] = useState<{ key: number | null; code: number } | null>(null)
  const pendingSeek = useRef<{ time: number; until: number } | null>(null)
  // Chapitres associés à leur vidéo, pour ignorer ceux de la vidéo précédente.
  const [loaded, setLoaded] = useState<{ videoId: string; chapters: Chapter[] } | null>(null)

  const sourceRef = useRef(source)
  useEffect(() => {
    sourceRef.current = source
  })

  // Chaîne : comme à la télé, on rejoint la grille là où elle en est.
  // Liste « à revoir » : la vidéo choisie, depuis le début.
  const tune = useCallback(() => {
    const src = sourceRef.current
    const at = new Date()
    if (src.kind === "channel") {
      const slot = liveSlot(src.channel, at)
      if (slot) setRequest({ video: slot, slot, start: (at.getTime() - new Date(slot.start).getTime()) / 1000, key: at.getTime() })
    } else {
      const video = src.videos.find((v) => v.id === src.selected) ?? src.videos[0]
      if (video) setRequest({ video, start: 0, key: at.getTime() })
    }
  }, [])

  const onEnded = useCallback(() => {
    const src = sourceRef.current
    // Liste : la vidéo est vue, la page passe à la suivante. Chaîne : retour au direct,
    // qui a pu avancer si on a fait pause ou reculé.
    if (src.kind === "later" && requestRef.current) src.onDone(requestRef.current.video.id)
    else tune()
  }, [tune])

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
          onStateChange: (e) => {
            if (e.data === yt.PlayerState.ENDED) onEnded()
            else if (e.data === yt.PlayerState.PLAYING || e.data === yt.PlayerState.PAUSED) {
              setStartedKey(requestRef.current?.key ?? null)
            }
          },
          onError: (e) => setError({ key: requestRef.current?.key ?? null, code: e.data }),
        },
      })
    })
    return () => {
      cancelled = true
      player?.destroy()
      playerRef.current = null
      container.replaceChildren()
    }
  }, [onEnded])

  // Un clic dans l'iframe YouTube lui donne le focus clavier, et nos raccourcis ne
  // reçoivent plus rien : on rend le focus à la page.
  useEffect(() => {
    const onBlur = () =>
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur()
      })
    window.addEventListener("blur", onBlur)
    return () => window.removeEventListener("blur", onBlur)
  }, [])

  // Changement de chaîne ou recalage demandé par la page.
  const sourceKey = source.kind === "channel" ? source.channel.name : "later"
  useEffect(tune, [sourceKey, resync, tune])

  useEffect(() => {
    if (ready && request) {
      requestRef.current = request
      playerRef.current?.loadVideoById({ videoId: request.video.id, startSeconds: Math.floor(request.start) })
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

  const videoId = request?.video.id
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

  const togglePlay = () => {
    const p = playerRef.current
    if (!p) return
    if (p.getPlayerState() === YT.PlayerState.PLAYING) p.pauseVideo()
    else p.playVideo()
  }

  useKeydown((e) => {
    const actions: Record<string, () => void> = {
      " ": togglePlay,
      ArrowLeft: e.shiftKey ? prevChapter : () => seek(time - 10),
      ArrowRight: e.shiftKey ? nextChapter : () => seek(time + 30),
      Home: () => seek(0),
      // Plein écran du cadre (et non de l'iframe) : le format de la chaîne s'y applique.
      f: () => frameRef.current?.requestFullscreen().catch(() => {}),
      ...(source.kind === "channel" && {
        d: tune,
        m: () => request && source.onMark(request.video.id),
      }),
    }
    const action = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key]
    if (!action || !ready) return
    // Empêche le défilement de la page et l'activation du bouton qui a le focus.
    e.preventDefault()
    action()
  })

  const live = source.kind === "channel" ? liveSlot(source.channel, now) : undefined
  const video = request?.video
  const slot = request?.slot
  // Même créneau que le direct : les heures recalculées par le serveur à chaque
  // rechargement du programme peuvent différer de quelques fractions de seconde.
  const isLiveVideo =
    !!slot && !!live && slot.id === live.id && Math.abs(new Date(slot.start).getTime() - new Date(live.start).getTime()) < 2000
  const delay = isLiveVideo ? (now.getTime() - new Date(live.start).getTime()) / 1000 - time : null
  const isLive = delay !== null && Math.abs(delay) < LIVE_TOLERANCE
  const started = !!request && startedKey === request.key
  const errorMessage = request && error?.key === request.key ? (ERROR_MESSAGES[error.code] ?? "Lecture impossible.") : null
  // Lien de secours : la vidéo sur YouTube, à l'instant prévu par la grille.
  const youtubeUrl =
    video &&
    `https://www.youtube.com/watch?v=${video.id}&t=${Math.floor(slot && isLiveVideo ? (now.getTime() - new Date(slot.start).getTime()) / 1000 : request!.start)}s`
  const laterIndex = source.kind === "later" && video ? source.videos.findIndex((v) => v.id === video.id) : -1

  return (
    <Card className="py-0">
      <CardContent className="grid gap-4 p-0 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div ref={frameRef} className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black lg:rounded-tl-xl">
            <div className="relative aspect-video w-[min(100%,calc(100svh*16/9))] overflow-hidden">
              <div
                ref={containerRef}
                className="size-full [&_iframe]:size-full"
                style={source.kind === "channel" ? iframeStyle(source.channel.aspect, source.channel.fill) : undefined}
              />
            </div>
            {errorMessage && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
                <p>{errorMessage}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {youtubeUrl && (
                    <Button asChild variant="secondary">
                      <a href={youtubeUrl} target="_blank" rel="noreferrer">
                        <ExternalLink data-icon="inline-start" />
                        Regarder sur YouTube
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" className="text-foreground" onClick={() => onZap(1)}>
                    <ChevronDown data-icon="inline-start" />
                    Chaîne suivante
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {source.kind === "channel" ? source.channel.name : "À revoir"}
                  </span>
                  {source.kind === "later" ? (
                    <>
                      {laterIndex >= 0 && (
                        <Badge variant="outline" className="tabular-nums">
                          {laterIndex + 1} / {source.videos.length}
                        </Badge>
                      )}
                      {laterIndex >= 0 && <span>depuis {source.videos[laterIndex].channel}</span>}
                    </>
                  ) : errorMessage ? (
                    <Badge variant="outline">Indisponible</Badge>
                  ) : !started ? (
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
                <p className="mt-1 line-clamp-2 text-lg font-medium leading-snug">{video?.title ?? "Chargement…"}</p>
                <p className="text-sm text-muted-foreground">{video?.source}</p>
              </div>
              <Control shortcut="Échap" label="Fermer le lecteur" onClick={onClose}>
                <X />
              </Control>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Control shortcut="↑" label="Chaîne précédente" onClick={() => onZap(-1)}>
                <ChevronUp />
              </Control>
              <Control shortcut="↓" label="Chaîne suivante" onClick={() => onZap(1)}>
                <ChevronDown />
              </Control>
              <span className="mx-1 h-6 w-px bg-border" />
              <Control shortcut="Début" label="Revenir au début" onClick={() => seek(0)} disabled={!ready}>
                <RotateCcw />
              </Control>
              <Control shortcut="⇧ ←" label="Chapitre précédent" onClick={prevChapter} disabled={!chapters.length}>
                <SkipBack />
              </Control>
              <Control shortcut="←" label="Reculer de 10 s" onClick={() => seek(time - 10)} disabled={!ready}>
                <Rewind />
              </Control>
              <span className="w-24 text-center text-sm text-muted-foreground tabular-nums">
                {formatDuration(time)} / {formatDuration(video?.duration ?? 0)}
              </span>
              <Control shortcut="→" label="Avancer de 30 s" onClick={() => seek(time + 30)} disabled={!ready}>
                <FastForward />
              </Control>
              <Control shortcut="⇧ →" label="Chapitre suivant" onClick={nextChapter} disabled={chapterIndex + 1 >= chapters.length}>
                <SkipForward />
              </Control>
              <Control shortcut="F" label="Plein écran" onClick={() => frameRef.current?.requestFullscreen().catch(() => {})}>
                <Maximize />
              </Control>
              {source.kind === "channel" && (
                <DisplayMenu aspect={source.channel.aspect} fill={source.channel.fill} onChange={source.onDisplay} />
              )}
              {source.kind === "channel" ? (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => video && source.onMark(video.id)} disabled={!video}>
                    <BookmarkPlus data-icon="inline-start" />
                    À revoir
                    <Kbd>M</Kbd>
                  </Button>
                  <Button variant="outline" onClick={tune} disabled={!started || isLive}>
                    <Radio data-icon="inline-start" />
                    Retour au direct
                    <Kbd>D</Kbd>
                  </Button>
                </div>
              ) : (
                <div className="ml-auto flex flex-wrap gap-1">
                  <Control
                    label="Vidéo suivante de la liste"
                    onClick={() => source.onSelect(source.videos[(laterIndex + 1) % source.videos.length].id)}
                    disabled={source.videos.length < 2}
                  >
                    <ChevronsRight />
                  </Control>
                  <Button variant="outline" onClick={() => video && source.onRemove(video.id)} disabled={!video}>
                    <BookmarkMinus data-icon="inline-start" />
                    Remettre dans sa chaîne
                  </Button>
                  <Button variant="outline" onClick={() => video && source.onDone(video.id)} disabled={!video}>
                    <Check data-icon="inline-start" />
                    Vue
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        <Chapters chapters={chapters} current={chapterIndex} onSelect={(c) => seek(c.start)} />
      </CardContent>
    </Card>
  )
}

export function Control({
  label,
  shortcut,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string; shortcut?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
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

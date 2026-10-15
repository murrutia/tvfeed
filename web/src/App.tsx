import { useCallback, useEffect, useState } from "react"
import { Keyboard, Shuffle, SlidersHorizontal } from "lucide-react"

import { ChannelManager } from "@/components/channel-manager"
import { ChannelPicker } from "@/components/channel-picker"
import { ChannelRow } from "@/components/channel-row"
import { IptvPlayer } from "@/components/iptv-player"
import { LiveRow } from "@/components/live-row"
import { LaterRow } from "@/components/later-row"
import { Player, type Source } from "@/components/player"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fetchGuide, markDone, markVideo, shuffleAll, shuffleChannel, unmarkVideo, type Guide } from "@/lib/api"
import { formatTime } from "@/lib/format"
import { SHORTCUTS, useKeydown } from "@/lib/keyboard"

// Le serveur ne travaille qu'à la demande : on recharge le programme de temps en
// temps pour qu'il couvre toujours les heures à venir.
const REFRESH_MS = 15 * 60 * 1000

/** Identifiant de la chaîne 0 (« à revoir ») dans l'URL et la navigation. */
const LATER = "a-revoir"

export default function App() {
  const [guide, setGuide] = useState<Guide | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Chaîne en cours de mélange ; "*" pour toutes.
  const [shuffling, setShuffling] = useState<string | null>(null)
  // Chaîne regardée, conservée dans l'URL (#Sciences) pour survivre à un rechargement.
  const [watching, setWatching] = useState(() => decodeURIComponent(location.hash.slice(1)) || null)
  // Vidéo choisie dans la liste « à revoir ».
  const [laterSelected, setLaterSelected] = useState<string | null>(null)
  // Incrémenté pour que le lecteur se recale après un changement de programme.
  const [resync, setResync] = useState(0)
  const [managing, setManaging] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    history.replaceState(null, "", watching ? `#${encodeURIComponent(watching)}` : location.pathname)
  }, [watching])

  function watch(name: string) {
    setWatching(name)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function zap(delta: 1 | -1) {
    if (!guide || !watching) return
    const names = [...(guide.later.length ? [LATER] : []), ...guide.channels.map((c) => c.name)]
    const i = names.indexOf(watching)
    setWatching(names[(i + delta + names.length) % names.length])
  }

  const watched = guide?.channels.find((c) => c.name === watching)

  useKeydown((e) => {
    if (!guide) return
    if (e.key === "/") {
      e.preventDefault() // sinon « / » s'écrit dans le champ de recherche qui s'ouvre
      setPicking(true)
    } else if (e.key === "0") {
      if (guide.later.length) watchLater(null)
    } else if (/^[1-9]$/.test(e.key)) {
      const channel = guide.channels[Number(e.key) - 1]
      if (channel) watch(channel.name)
    } else if (watching && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault() // pas de défilement de la page
      zap(e.key === "ArrowUp" ? -1 : 1)
    } else if (watching && e.key === "Escape") {
      setWatching(null)
    }
  })

  /** Charge un programme ; `partial` : la réponse ne contient que les chaînes modifiées. */
  const load = useCallback(async (call: () => Promise<Guide>, partial = false) => {
    try {
      const next = await call()
      setGuide((prev) => {
        if (!prev || !partial) return next
        // Remélange d'une seule chaîne : on remplace uniquement celle-ci.
        const updated = new Map(next.channels.map((c) => [c.name, c]))
        return { ...next, channels: prev.channels.map((c) => updated.get(c.name) ?? c) }
      })
      setError(null)
      return next
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    load(fetchGuide)
    const refresh = setInterval(() => load(fetchGuide), REFRESH_MS)
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [load])

  async function shuffle(name: string | null) {
    setShuffling(name ?? "*")
    await load(name ? () => shuffleChannel(name) : shuffleAll, name !== null)
    setShuffling(null)
    if (watching && watching !== LATER && (!name || name === watching)) setResync((r) => r + 1)
  }

  function watchLater(videoId: string | null) {
    setLaterSelected(videoId)
    setResync((r) => r + 1)
    watch(LATER)
  }

  /** Retire une vidéo de la liste (vue ou remise dans sa chaîne) et passe à la suivante. */
  async function leaveLater(videoId: string, call: (id: string) => Promise<Guide>) {
    const list = guide?.later ?? []
    const i = list.findIndex((v) => v.id === videoId)
    const following = list[i + 1] ?? list[i - 1]
    const next = await load(() => call(videoId))
    if (watching !== LATER) return
    if (!next?.later.length) setWatching(null)
    else if ((laterSelected ?? list[0]?.id) === videoId) {
      // C'était la vidéo en cours de lecture : on enchaîne sur la suivante.
      setLaterSelected(following?.id ?? null)
      setResync((r) => r + 1)
    }
  }

  let source: Source | null = null
  // Les chaînes IPTV ont leur propre lecteur (direct uniquement), voir plus bas.
  if (watched && watched.kind !== "iptv") {
    source = {
      kind: "channel",
      channel: watched,
      onMark: async (videoId) => {
        // La vidéo quitte la chaîne et la suivante démarre : on se recale sur le direct.
        await load(() => markVideo(watched.name, videoId))
        setResync((r) => r + 1)
      },
    }
  } else if (watching === LATER && guide?.later.length) {
    source = {
      kind: "later",
      videos: guide.later,
      selected: laterSelected,
      onSelect: (videoId) => watchLater(videoId),
      onDone: (videoId) => leaveLater(videoId, markDone),
      onRemove: (videoId) => leaveLater(videoId, unmarkVideo),
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <h1 className="text-xl font-semibold tracking-tight">tvfeed</h1>
          <span className="text-muted-foreground tabular-nums">{formatTime(now)}</span>
          {guide && (
            <ChannelPicker
              channels={guide.channels}
              laterCount={guide.later.length}
              now={now}
              watching={watching}
              laterKey={LATER}
              open={picking}
              onOpenChange={setPicking}
              onWatch={watch}
              onWatchLater={() => watchLater(null)}
            />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Raccourcis clavier">
                <Keyboard />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="p-3">
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                {SHORTCUTS.map((s) => (
                  <div key={s.label} className="contents">
                    <dt className="flex gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dt>
                    <dd>{s.label}</dd>
                  </div>
                ))}
              </dl>
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={() => setManaging(true)}>
            <SlidersHorizontal data-icon="inline-start" />
            Chaînes
          </Button>
          <Button variant="outline" onClick={() => shuffle(null)} disabled={shuffling !== null}>
            <Shuffle data-icon="inline-start" />
            Tout remélanger
          </Button>
        </div>
      </header>
      <ChannelManager
        open={managing}
        onOpenChange={setManaging}
        onChanged={({ renamed, deleted }) => {
          if (renamed && watching === renamed[0]) setWatching(renamed[1])
          if (deleted && watching === deleted) setWatching(null)
          load(fetchGuide)
        }}
      />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Impossible de charger le programme : {error}
          </p>
        )}
        {watched?.kind === "iptv" && <IptvPlayer channel={watched} onZap={zap} onClose={() => setWatching(null)} />}
        {source && <Player source={source} now={now} resync={resync} onZap={zap} onClose={() => setWatching(null)} />}
        {guide && guide.later.length > 0 && (
          <LaterRow videos={guide.later} onWatch={watchLater} onRemove={(id) => leaveLater(id, unmarkVideo)} />
        )}
        {guide
          ? guide.channels.map((c, i) =>
              c.kind === "iptv" ? (
                <LiveRow key={c.name} number={i + 1} channel={c} onWatch={() => watch(c.name)} />
              ) : (
                <ChannelRow
                  key={c.name}
                  number={i + 1}
                  channel={c}
                  now={now}
                  shuffling={shuffling === c.name || shuffling === "*"}
                  onShuffle={() => shuffle(c.name)}
                  onWatch={() => watch(c.name)}
                />
              ),
            )
          : !error && Array.from({ length: 3 }, (_, i) => <ChannelSkeleton key={i} />)}
      </main>
    </div>
  )
}

function ChannelSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="flex gap-4">
        <Skeleton className="aspect-video w-80" />
        <Skeleton className="aspect-video w-44" />
        <Skeleton className="aspect-video w-44" />
      </CardContent>
    </Card>
  )
}

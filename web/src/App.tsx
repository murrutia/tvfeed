import { useCallback, useEffect, useState } from "react"
import { Shuffle } from "lucide-react"

import { ChannelRow } from "@/components/channel-row"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchGuide, shuffleAll, shuffleChannel, type Guide } from "@/lib/api"
import { formatTime } from "@/lib/format"

// Le serveur ne travaille qu'à la demande : on recharge le programme de temps en
// temps pour qu'il couvre toujours les heures à venir.
const REFRESH_MS = 15 * 60 * 1000

export default function App() {
  const [guide, setGuide] = useState<Guide | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  // Chaîne en cours de mélange ; "*" pour toutes.
  const [shuffling, setShuffling] = useState<string | null>(null)

  const load = useCallback(async (call: () => Promise<Guide>) => {
    try {
      const next = await call()
      setGuide((prev) => {
        if (!prev || next.channels.length === prev.channels.length) return next
        // Remélange d'une seule chaîne : on remplace uniquement celle-ci.
        const updated = new Map(next.channels.map((c) => [c.name, c]))
        return { ...prev, channels: prev.channels.map((c) => updated.get(c.name) ?? c) }
      })
      setError(null)
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
    await load(name ? () => shuffleChannel(name) : shuffleAll)
    setShuffling(null)
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <h1 className="text-xl font-semibold tracking-tight">tvfeed</h1>
          <span className="text-muted-foreground tabular-nums">{formatTime(now)}</span>
          <Button variant="outline" className="ml-auto" onClick={() => shuffle(null)} disabled={shuffling !== null}>
            <Shuffle data-icon="inline-start" />
            Tout remélanger
          </Button>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Impossible de charger le programme : {error}
          </p>
        )}
        {guide
          ? guide.channels.map((c) => (
              <ChannelRow
                key={c.name}
                channel={c}
                now={now}
                shuffling={shuffling === c.name || shuffling === "*"}
                onShuffle={() => shuffle(c.name)}
              />
            ))
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

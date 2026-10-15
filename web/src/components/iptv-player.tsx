import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, LoaderCircle, Maximize, Pause, Play, Radio, Volume2, VolumeX, X } from "lucide-react"

import { ChannelLogo } from "@/components/channel-logo"
import { LiveVideo, type LiveStatus } from "@/components/live-video"
import { Control } from "@/components/player"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ChannelGuide } from "@/lib/api"
import { useKeydown } from "@/lib/keyboard"

type Props = {
  channel: ChannelGuide
  onZap: (delta: 1 | -1) => void
  onClose: () => void
}

/** Lecteur d'une chaîne IPTV : direct uniquement, sans programme ni chapitres. */
export function IptvPlayer({ channel, onZap, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<LiveStatus>({ index: 0, state: "loading" })
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const sync = () => {
      setPaused(video.paused)
      setMuted(video.muted)
    }
    for (const e of ["play", "pause", "volumechange"]) video.addEventListener(e, sync)
    return () => {
      for (const e of ["play", "pause", "volumechange"]) video.removeEventListener(e, sync)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [])
  const toggleMute = () => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)
  const fullscreen = () => videoRef.current?.requestFullscreen().catch(() => {})

  useKeydown((e) => {
    if (e.key === " ") {
      e.preventDefault()
      togglePlay()
    }
  })

  const streamLabel = channel.streams.length > 1 ? `flux ${status.index + 1} / ${channel.streams.length}` : null

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-3 p-0">
        <div className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-t-xl">
          <LiveVideo streams={channel.streams} videoRef={videoRef} onStatus={setStatus} />
          {status.state === "loading" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <LoaderCircle className="size-10 animate-spin text-white/80" />
            </div>
          )}
          {status.state === "failed" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
              <p>Aucun flux de cette chaîne ne répond pour le moment.</p>
              <Button variant="outline" className="text-foreground" onClick={() => onZap(1)}>
                <ChevronDown data-icon="inline-start" />
                Chaîne suivante
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex items-start gap-3">
            <ChannelLogo src={channel.logo} className="size-12" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {status.state === "playing" ? (
                  <Badge variant="destructive">
                    <Radio data-icon="inline-start" />
                    En direct
                  </Badge>
                ) : (
                  <Badge variant="outline">{status.state === "failed" ? "Indisponible" : "Connexion…"}</Badge>
                )}
                {streamLabel && <span className="tabular-nums">{streamLabel}</span>}
                {channel.themes.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-lg font-medium">{channel.name}</p>
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
            <Control shortcut="Espace" label={paused ? "Lecture" : "Pause"} onClick={togglePlay}>
              {paused ? <Play /> : <Pause />}
            </Control>
            <Control label={muted ? "Rétablir le son" : "Couper le son"} onClick={toggleMute}>
              {muted ? <VolumeX /> : <Volume2 />}
            </Control>
            <Control label="Plein écran" onClick={fullscreen}>
              <Maximize />
            </Control>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

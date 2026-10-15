import { useEffect, useState, type RefObject } from "react"
import Hls from "hls.js"

import { cn } from "@/lib/utils"

// Un flux qui n'a pas démarré dans ce délai est considéré comme mort : on passe au suivant.
const START_TIMEOUT_MS = 15_000

export type LiveStatus = { index: number; state: "loading" | "playing" | "failed" }

type Props = {
  /** Flux HLS, essayés dans l'ordre. */
  streams: string[]
  videoRef: RefObject<HTMLVideoElement | null>
  muted?: boolean
  className?: string
  onStatus?: (status: LiveStatus) => void
}

/**
 * Vidéo en direct (HLS) avec repli automatique sur le flux suivant en cas d'erreur.
 * hls.js partout, sauf là où le navigateur lit le HLS lui-même (Safari).
 */
export function LiveVideo({ streams, videoRef, muted, className, onStatus }: Props) {
  const key = streams.join("\n")
  const [status, setStatus] = useState<LiveStatus & { key: string }>({ key, index: 0, state: "loading" })
  const current = status.key === key ? status : { key, index: 0, state: "loading" as const }

  useEffect(() => {
    onStatus?.({ index: current.index, state: current.state })
  }, [current.index, current.state, onStatus])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const urls = key.split("\n").filter(Boolean)
    let hls: Hls | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let index = -1

    const report = (state: LiveStatus["state"]) => setStatus({ key, index: Math.max(index, 0), state })
    const onPlaying = () => {
      clearTimeout(timer)
      report("playing")
    }

    function next() {
      clearTimeout(timer)
      hls?.destroy()
      hls = null
      index += 1
      if (index >= urls.length) {
        video!.removeAttribute("src")
        report("failed")
        return
      }
      report("loading")
      timer = setTimeout(next, START_TIMEOUT_MS)
      const url = urls[index]
      if (Hls.isSupported()) {
        hls = new Hls({ liveDurationInfinity: true })
        hls.on(Hls.Events.ERROR, (_, data) => data.fatal && next())
        hls.loadSource(url)
        hls.attachMedia(video!)
      } else {
        video!.src = url
      }
      video!.play().catch(() => {})
    }

    const onError = () => !hls && next() // Lecture native (Safari) : erreur du flux.
    video.addEventListener("playing", onPlaying)
    video.addEventListener("error", onError)
    next()
    return () => {
      clearTimeout(timer)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("error", onError)
      hls?.destroy()
      video.removeAttribute("src")
      video.load()
    }
  }, [key, videoRef])

  return <video ref={videoRef} muted={muted} playsInline autoPlay className={cn("size-full bg-black", className)} />
}

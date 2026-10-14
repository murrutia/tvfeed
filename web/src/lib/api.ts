// Types et appels de l'API servie par `tvfeed serve` (voir src/tvfeed/server.py).

export type Slot = {
  id: string
  title: string
  source: string
  url: string
  thumbnail: string
  duration: number
  start: string
  end: string
}

export type ChannelGuide = {
  name: string
  themes: string[]
  video_count: number
  slots: Slot[]
}

export type Guide = {
  now: string
  channels: ChannelGuide[]
}

const HOURS = 4

async function request(method: string, path: string): Promise<Guide> {
  const res = await fetch(`/api${path}?hours=${HOURS}`, { method })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const fetchGuide = () => request("GET", "/guide")
export const shuffleAll = () => request("POST", "/shuffle")
export const shuffleChannel = (name: string) =>
  request("POST", `/channels/${encodeURIComponent(name)}/shuffle`)

export type Chapter = {
  start: number
  end: number
  title: string
}

export async function fetchChapters(videoId: string, signal?: AbortSignal): Promise<Chapter[]> {
  const res = await fetch(`/api/videos/${videoId}/chapters`, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

/** Créneau diffusé à l'instant `now`. */
export function liveSlot(channel: ChannelGuide, now: Date): Slot | undefined {
  return channel.slots.find((s) => new Date(s.start) <= now && now < new Date(s.end))
}

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

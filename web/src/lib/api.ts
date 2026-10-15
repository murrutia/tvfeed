// Types et appels de l'API servie par `tvfeed serve` (voir src/tvfeed/server.py).

export type Video = {
  id: string
  title: string
  source: string
  url: string
  thumbnail: string
  duration: number
}

export type Slot = Video & {
  start: string
  end: string
}

/** Vidéo de la liste « à revoir » (chaîne 0). */
export type LaterVideo = Video & {
  /** Chaîne d'où elle a été retirée. */
  channel: string
  marked_at: string
}

/** `youtube` : programme de vidéos ; `iptv` : télévision en direct, sans programme. */
export type ChannelKind = "youtube" | "iptv"

export type ChannelGuide = {
  name: string
  kind: ChannelKind
  themes: string[]
  video_count: number
  slots: Slot[]
  /** Chaîne IPTV : flux HLS à essayer dans l'ordre. */
  streams: string[]
  logo: string
}

export type Guide = {
  now: string
  channels: ChannelGuide[]
  later: LaterVideo[]
}

const HOURS = 4

/** Lève une erreur avec le message renvoyé par l'API (`detail`) s'il y en a un. */
async function check(res: Response) {
  if (res.ok) return res
  const body = await res.json().catch(() => null)
  const detail = body?.detail
  throw new Error(typeof detail === "string" ? detail : `${res.status} ${res.statusText}`)
}

async function request(method: string, path: string): Promise<Guide> {
  const res = await check(await fetch(`/api${path}?hours=${HOURS}`, { method }))
  return res.json()
}

export const fetchGuide = () => request("GET", "/guide")
export const shuffleAll = () => request("POST", "/shuffle")
export const shuffleChannel = (name: string) =>
  request("POST", `/channels/${encodeURIComponent(name)}/shuffle`)
export const markVideo = (channel: string, videoId: string) =>
  request("POST", `/channels/${encodeURIComponent(channel)}/videos/${videoId}/mark`)
export const unmarkVideo = (videoId: string) => request("DELETE", `/later/${videoId}`)
export const markDone = (videoId: string) => request("POST", `/later/${videoId}/done`)

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

/** Définition d'une chaîne (contenu de `channels.toml`). */
export type ChannelDef = {
  name: string
  themes: string[]
  /** Sources YouTube, ou flux HLS pour une chaîne IPTV. */
  sources: string[]
  per_source: number
  kind?: ChannelKind
  logo?: string
  iptv_id?: string
}

async function channelsRequest(method: string, path: string, body?: unknown): Promise<ChannelDef[]> {
  const res = await check(
    await fetch(`/api/channels${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  return res.json()
}

export const listChannels = () => channelsRequest("GET", "")
export const createChannel = (channel: ChannelDef) => channelsRequest("POST", "", channel)
export const updateChannel = (name: string, channel: ChannelDef) =>
  channelsRequest("PUT", `/${encodeURIComponent(name)}`, channel)
export const deleteChannel = (name: string) => channelsRequest("DELETE", `/${encodeURIComponent(name)}`)
export const reorderChannels = (names: string[]) => channelsRequest("PUT", "/order", { names })

/** Chaîne YouTube trouvée par la recherche d'aide à la création. */
export type FoundChannel = {
  name: string
  url: string
  followers: number | null
  description: string
  thumbnail: string
  /** Chaîne locale qui utilise déjà cette source. */
  used_in: string | null
}

export type Discovery = { queries: string[]; ai: boolean; channels: FoundChannel[] }

type Draft = { name: string; themes: string[]; sources: string[] }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await check(
    await fetch(`/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  )
  return res.json()
}

/** Modèle d'IA locale disponible, ou `null`. */
export const fetchAiModel = async (): Promise<string | null> =>
  (await (await check(await fetch("/api/ai"))).json()).model

export const suggestThemes = async (draft: Draft) => (await post<{ themes: string[] }>("/assist/themes", draft)).themes
export const discoverChannels = (draft: Draft) => post<Discovery>("/assist/channels", draft)

/** Chaîne du catalogue iptv-org. */
export type IptvChannel = {
  id: string
  name: string
  country: string
  country_name: string
  flag: string
  categories: string[]
  logo: string
  streams: { url: string; quality: string | null }[]
}

export type IptvFilters = {
  countries: { code: string; name: string; flag: string; count: number }[]
  categories: { id: string; name: string; count: number }[]
}

export const fetchIptvFilters = async (): Promise<IptvFilters> => (await check(await fetch("/api/iptv/filters"))).json()

export async function searchIptv(params: { q: string; country: string; category: string }, signal?: AbortSignal): Promise<IptvChannel[]> {
  const query = new URLSearchParams(params)
  return (await check(await fetch(`/api/iptv/search?${query}`, { signal }))).json()
}

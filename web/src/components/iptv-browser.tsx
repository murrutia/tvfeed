import { useEffect, useRef, useState } from "react"
import { Check, LoaderCircle, Play, Plus, Square } from "lucide-react"

import { ChannelLogo } from "@/components/channel-logo"
import { LiveVideo, type LiveStatus } from "@/components/live-video"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchIptvFilters, searchIptv, type ChannelDef, type IptvChannel, type IptvFilters } from "@/lib/api"

// Valeur « tous » des listes déroulantes (Radix n'accepte pas de valeur vide).
const ALL = "all"
// Dernier pays choisi, retenu d'une ouverture à l'autre (confort uniquement).
const COUNTRY_KEY = "tvfeed.iptv.country"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chaînes locales existantes, pour signaler celles déjà ajoutées. */
  existing: ChannelDef[]
  /** Ajoute la chaîne ; une erreur levée est affichée sous la chaîne concernée. */
  onAdd: (channel: ChannelDef) => Promise<void>
}

/** Recherche dans le catalogue iptv-org, aperçu d'un flux et ajout de chaînes en direct. */
export function IptvBrowser({ open, onOpenChange, existing, onAdd }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajouter une chaîne en direct (IPTV)</DialogTitle>
          <DialogDescription>
            Chaînes du catalogue{" "}
            <a href="https://github.com/iptv-org/iptv" target="_blank" rel="noreferrer" className="underline">
              iptv-org
            </a>
            , sans programme : on les regarde en direct. Testez le flux avant de l'ajouter.
          </DialogDescription>
        </DialogHeader>
        {open && <Browser existing={existing} onAdd={onAdd} />}
      </DialogContent>
    </Dialog>
  )
}

function readCountry() {
  try {
    return localStorage.getItem(COUNTRY_KEY) || ALL
  } catch {
    return ALL
  }
}

function Browser({ existing, onAdd }: Omit<Props, "open" | "onOpenChange">) {
  const [filters, setFilters] = useState<IptvFilters | null>(null)
  const [query, setQuery] = useState("")
  const [country, setCountry] = useState(readCountry)
  const [category, setCategory] = useState(ALL)
  const [results, setResults] = useState<IptvChannel[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<IptvChannel | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [addErrors, setAddErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchIptvFilters().then(setFilters, (e) => setError(String(e)))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COUNTRY_KEY, country)
    } catch {
      // Stockage indisponible : le choix ne sera simplement pas retenu.
    }
  }, [country])

  // Recherche à la frappe, avec un léger délai ; une recherche dépassée est annulée.
  useEffect(() => {
    const abort = new AbortController()
    const timer = setTimeout(() => {
      setSearching(true)
      searchIptv({ q: query, country: country === ALL ? "" : country, category: category === ALL ? "" : category }, abort.signal)
        .then((r) => {
          setResults(r)
          setError(null)
        })
        .catch((e) => !abort.signal.aborted && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => !abort.signal.aborted && setSearching(false))
    }, 250)
    return () => {
      clearTimeout(timer)
      abort.abort()
    }
  }, [query, country, category])

  const added = new Set(existing.map((c) => c.iptv_id).filter(Boolean))
  const categoryName = (id: string) => filters?.categories.find((c) => c.id === id)?.name ?? id

  async function add(c: IptvChannel) {
    setAdding(c.id)
    setAddErrors((errors) => {
      const next = { ...errors }
      delete next[c.id]
      return next
    })
    try {
      await onAdd({
        name: c.name,
        kind: "iptv",
        logo: c.logo,
        iptv_id: c.id,
        themes: [c.country_name, ...c.categories.map(categoryName)].filter(Boolean),
        sources: c.streams.map((s) => s.url),
        per_source: 30,
      })
    } catch (e) {
      setAddErrors((errors) => ({ ...errors, [c.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom de la chaîne, pays, thème…"
          className="min-w-48 flex-1"
          autoFocus
        />
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="w-44" aria-label="Pays">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tous les pays</SelectItem>
            {filters?.countries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" aria-label="Catégorie">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Toutes catégories</SelectItem>
            {filters?.categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preview && <Preview key={preview.id} channel={preview} onStop={() => setPreview(null)} />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {results === null && (
          <li className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Chargement du catalogue…
          </li>
        )}
        {results?.length === 0 && !searching && <li className="p-2 text-sm text-muted-foreground">Aucune chaîne trouvée.</li>}
        {results?.map((c) => {
          const isAdded = added.has(c.id)
          const isPreviewed = preview?.id === c.id
          return (
            <li key={c.id} className="flex flex-col gap-1 rounded-md p-2 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <ChannelLogo src={c.logo} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span>
                      {c.flag} {c.country_name}
                    </span>
                    {c.categories.map((k) => (
                      <Badge key={k} variant="secondary">
                        {categoryName(k)}
                      </Badge>
                    ))}
                    <span>
                      · {c.streams.length} flux{c.streams[0]?.quality ? ` · ${c.streams[0].quality}` : ""}
                    </span>
                  </p>
                </div>
                <Button type="button" size="xs" variant="ghost" onClick={() => setPreview(isPreviewed ? null : c)}>
                  {isPreviewed ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                  {isPreviewed ? "Arrêter" : "Tester"}
                </Button>
                <Button type="button" size="xs" variant={isAdded ? "secondary" : "outline"} disabled={isAdded || adding !== null} onClick={() => add(c)}>
                  {adding === c.id ? (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  ) : isAdded ? (
                    <Check data-icon="inline-start" />
                  ) : (
                    <Plus data-icon="inline-start" />
                  )}
                  {isAdded ? "Ajoutée" : "Ajouter"}
                </Button>
              </div>
              {addErrors[c.id] && <p className="pl-13 text-xs break-words text-destructive">{addErrors[c.id]}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Preview({ channel, onStop }: { channel: IptvChannel; onStop: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<LiveStatus>({ index: 0, state: "loading" })
  const label = {
    loading: `Connexion au flux ${status.index + 1} / ${channel.streams.length}…`,
    playing: `En direct · flux ${status.index + 1} / ${channel.streams.length}`,
    failed: "Aucun flux ne répond pour le moment.",
  }[status.state]

  return (
    <div className="flex gap-3 rounded-lg border p-2">
      <div className="relative aspect-video w-56 shrink-0 overflow-hidden rounded-md bg-black">
        <LiveVideo streams={channel.streams.map((s) => s.url)} videoRef={videoRef} onStatus={setStatus} />
        {status.state === "loading" && (
          <LoaderCircle className="absolute inset-0 m-auto size-6 animate-spin text-white/80" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-1">
        <div>
          <p className="text-sm font-medium">{channel.name}</p>
          <p className={status.state === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{label}</p>
        </div>
        <Button type="button" size="xs" variant="outline" className="self-start" onClick={onStop}>
          <Square data-icon="inline-start" />
          Arrêter l'aperçu
        </Button>
      </div>
    </div>
  )
}

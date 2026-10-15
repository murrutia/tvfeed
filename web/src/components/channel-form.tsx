import { useState } from "react"
import { Check, LoaderCircle, Plus, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { discoverChannels, suggestThemes, type ChannelDef, type Discovery } from "@/lib/api"

const DEFAULT_PER_SOURCE = 30

const followersFormat = new Intl.NumberFormat("fr-FR", { notation: "compact" })

type Props = {
  /** Chaîne à modifier ; formulaire de création si absente. */
  channel?: ChannelDef
  open: boolean
  /** Modèle d'IA locale, ou `null` : sans IA, pas de suggestion de thèmes. */
  aiModel: string | null
  onOpenChange: (open: boolean) => void
  /** Enregistre la chaîne ; une erreur levée est affichée dans le formulaire. */
  onSubmit: (channel: ChannelDef) => Promise<void>
}

export function ChannelForm({ channel, open, aiModel, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {/* Remonté à chaque ouverture : les champs repartent de la chaîne éditée. */}
        {open && <FormBody channel={channel} aiModel={aiModel} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function FormBody({ channel, aiModel, onCancel, onSubmit }: Omit<Props, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [name, setName] = useState(channel?.name ?? "")
  const [themes, setThemes] = useState(channel?.themes.join(", ") ?? "")
  const [sources, setSources] = useState(channel?.sources.join("\n") ?? "")
  const [perSource, setPerSource] = useState(channel?.per_source ?? DEFAULT_PER_SOURCE)
  const isIptv = channel?.kind === "iptv"
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Aide à la création : thèmes proposés par l'IA, chaînes YouTube trouvées.
  const [suggested, setSuggested] = useState<string[] | null>(null)
  const [discovery, setDiscovery] = useState<Discovery | null>(null)
  const [assisting, setAssisting] = useState<"themes" | "channels" | null>(null)
  const [assistError, setAssistError] = useState<string | null>(null)

  const themeList = themes.split(",").map((t) => t.trim()).filter(Boolean)
  const sourceList = sources.split("\n").map((s) => s.trim()).filter(Boolean)
  const draft = () => ({ name: name.trim(), themes: themeList, sources: sourceList })

  async function assist<T>(kind: "themes" | "channels", call: () => Promise<T>, done: (result: T) => void) {
    setAssisting(kind)
    setAssistError(null)
    try {
      done(await call())
    } catch (e) {
      setAssistError(e instanceof Error ? e.message : String(e))
    } finally {
      setAssisting(null)
    }
  }

  // Mises à jour fonctionnelles : plusieurs ajouts rapprochés ne s'écrasent pas.
  const addTheme = (theme: string) => setThemes((prev) => [...prev.split(","), theme].map((t) => t.trim()).filter(Boolean).join(", "))
  const addSource = (url: string) => setSources((prev) => [...prev.split("\n"), url].map((s) => s.trim()).filter(Boolean).join("\n"))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        // Une chaîne IPTV garde sa sorte, son logo et son identifiant iptv-org.
        kind: channel?.kind,
        logo: channel?.logo,
        iptv_id: channel?.iptv_id,
        name: name.trim(),
        themes: themeList,
        sources: sourceList,
        per_source: perSource,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{channel ? `Modifier « ${channel.name} »` : "Nouvelle chaîne"}</DialogTitle>
        <DialogDescription>Une chaîne regroupe plusieurs sources vidéo, mélangées dans un même programme.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-name">Nom</Label>
        <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="channel-themes">Thèmes</Label>
          {aiModel && !isIptv && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={assisting !== null || sourceList.length === 0}
              title={sourceList.length ? `Proposés par ${aiModel} d'après les vidéos des sources` : "Ajoutez d'abord des sources"}
              onClick={() => assist("themes", () => suggestThemes(draft()), setSuggested)}
            >
              {assisting === "themes" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              Suggérer
            </Button>
          )}
        </div>
        <Input
          id="channel-themes"
          value={themes}
          onChange={(e) => setThemes(e.target.value)}
          placeholder="science, physique, vulgarisation"
        />
        <p className="text-xs text-muted-foreground">Séparés par des virgules.</p>
        {suggested && (
          <div className="flex flex-wrap gap-1">
            {suggested.length === 0 && <span className="text-xs text-muted-foreground">Aucune suggestion.</span>}
            {suggested.map((t) => {
              const added = themeList.includes(t)
              return (
                <Badge key={t} asChild variant={added ? "secondary" : "outline"}>
                  <button type="button" onClick={() => !added && addTheme(t)} disabled={added}>
                    {added ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                    {t}
                  </button>
                </Badge>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="channel-sources">{isIptv ? "Flux" : "Sources"}</Label>
          {!isIptv && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={assisting !== null || (!name.trim() && themeList.length === 0)}
              title={
                aiModel ? `Requêtes formulées par ${aiModel}, résultats de YouTube` : "Recherche YouTube à partir des thèmes"
              }
              onClick={() => assist("channels", () => discoverChannels(draft()), setDiscovery)}
            >
              {assisting === "channels" ? <LoaderCircle className="animate-spin" /> : <Search />}
              Trouver des chaînes
            </Button>
          )}
        </div>
        <Textarea
          id="channel-sources"
          value={sources}
          onChange={(e) => setSources(e.target.value)}
          required
          rows={5}
          className="font-mono text-xs"
          placeholder="https://www.youtube.com/@ScienceEtonnante"
        />
        <p className="text-xs text-muted-foreground">
          {isIptv
            ? "Une URL de flux HLS (.m3u8) par ligne, essayées dans l'ordre : les suivantes servent de secours."
            : "Une URL par ligne : chaîne YouTube ou playlist. Les nouvelles sources sont vérifiées à l'enregistrement."}
        </p>
        {discovery && <Discoveries discovery={discovery} sources={sourceList} onAdd={addSource} />}
      </div>
      {!isIptv && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-per-source">Vidéos récentes par source</Label>
          <Input
            id="channel-per-source"
            type="number"
            min={1}
            max={200}
            value={perSource}
            onChange={(e) => setPerSource(Number(e.target.value))}
            className="w-24"
          />
        </div>
      )}
      {assistError && <p className="text-sm text-destructive">{assistError}</p>}
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm break-words text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
          {saving ? "Vérification des sources…" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function Discoveries({ discovery, sources, onAdd }: { discovery: Discovery; sources: string[]; onAdd: (url: string) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        {discovery.ai ? "Requêtes proposées par l'IA" : "Recherche"} : {discovery.queries.map((q) => `« ${q} »`).join(", ")}
      </p>
      {discovery.channels.length === 0 && <p className="text-sm text-muted-foreground">Aucune chaîne trouvée.</p>}
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {discovery.channels.map((c) => {
          const added = sources.includes(c.url)
          return (
            <li key={c.url} className="flex items-start gap-3 rounded-md p-1.5 hover:bg-muted/50">
              <img src={c.thumbnail} alt="" loading="lazy" className="size-9 shrink-0 rounded-full bg-muted" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                  <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {c.name}
                  </a>
                  {c.followers !== null && (
                    <span className="text-xs font-normal text-muted-foreground">{followersFormat.format(c.followers)} abonnés</span>
                  )}
                  {c.used_in && <Badge variant="secondary">dans « {c.used_in} »</Badge>}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
              </div>
              <Button type="button" size="xs" variant={added ? "secondary" : "outline"} disabled={added} onClick={() => onAdd(c.url)}>
                {added ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                {added ? "Ajoutée" : "Ajouter"}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

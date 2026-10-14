import { useState } from "react"
import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ChannelDef } from "@/lib/api"

const DEFAULT_PER_SOURCE = 30

type Props = {
  /** Chaîne à modifier ; formulaire de création si absente. */
  channel?: ChannelDef
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Enregistre la chaîne ; une erreur levée est affichée dans le formulaire. */
  onSubmit: (channel: ChannelDef) => Promise<void>
}

export function ChannelForm({ channel, open, onOpenChange, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Remonté à chaque ouverture : les champs repartent de la chaîne éditée. */}
        {open && <FormBody channel={channel} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function FormBody({ channel, onCancel, onSubmit }: Omit<Props, "open" | "onOpenChange"> & { onCancel: () => void }) {
  const [name, setName] = useState(channel?.name ?? "")
  const [themes, setThemes] = useState(channel?.themes.join(", ") ?? "")
  const [sources, setSources] = useState(channel?.sources.join("\n") ?? "")
  const [perSource, setPerSource] = useState(channel?.per_source ?? DEFAULT_PER_SOURCE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        themes: themes.split(",").map((t) => t.trim()).filter(Boolean),
        sources: sources.split("\n").map((s) => s.trim()).filter(Boolean),
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
        <Label htmlFor="channel-themes">Thèmes</Label>
        <Input
          id="channel-themes"
          value={themes}
          onChange={(e) => setThemes(e.target.value)}
          placeholder="science, physique, vulgarisation"
        />
        <p className="text-xs text-muted-foreground">Séparés par des virgules.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-sources">Sources</Label>
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
          Une URL par ligne : chaîne YouTube ou playlist. Les nouvelles sources sont vérifiées à l'enregistrement.
        </p>
      </div>
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

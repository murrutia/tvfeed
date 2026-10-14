import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"

import { ChannelForm } from "@/components/channel-form"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  createChannel,
  deleteChannel,
  listChannels,
  reorderChannels,
  updateChannel,
  type ChannelDef,
} from "@/lib/api"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Appelé après chaque modification, pour recharger le programme. */
  onChanged: (change: { renamed?: [string, string]; deleted?: string }) => void
}

/** Panneau de gestion des chaînes : liste, ajout, modification, suppression, ordre. */
export function ChannelManager({ open, onOpenChange, onChanged }: Props) {
  const [channels, setChannels] = useState<ChannelDef[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Formulaire ouvert : `null` pour une création, la chaîne pour une modification.
  const [editing, setEditing] = useState<ChannelDef | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<ChannelDef | null>(null)

  useEffect(() => {
    if (open) listChannels().then(setChannels, (e) => setError(String(e)))
  }, [open])

  async function run(call: () => Promise<ChannelDef[]>, change: Parameters<Props["onChanged"]>[0] = {}) {
    try {
      setChannels(await call())
      setError(null)
      onChanged(change)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function save(channel: ChannelDef) {
    const previous = editing
    // Les erreurs remontent au formulaire, qui les affiche et reste ouvert.
    setChannels(previous ? await updateChannel(previous.name, channel) : await createChannel(channel))
    setEditing(undefined)
    onChanged(previous && previous.name !== channel.name ? { renamed: [previous.name, channel.name] } : {})
  }

  function move(index: number, delta: -1 | 1) {
    if (!channels) return
    const names = channels.map((c) => c.name)
    ;[names[index], names[index + delta]] = [names[index + delta], names[index]]
    run(() => reorderChannels(names))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Chaînes</SheetTitle>
          <SheetDescription>L'ordre donne le numéro de la chaîne, et donc son raccourci clavier.</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
          <Button onClick={() => setEditing(null)} className="self-start">
            <Plus data-icon="inline-start" />
            Nouvelle chaîne
          </Button>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <ol className="flex flex-col gap-2">
            {channels?.map((c, i) => (
              <li key={c.name} className="flex items-start gap-3 rounded-lg border p-3">
                <Kbd className="mt-0.5">{i + 1}</Kbd>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  {c.themes.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.themes.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {c.sources.length} source{c.sources.length > 1 ? "s" : ""} · {c.per_source} vidéos par source
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Action label="Monter" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp />
                  </Action>
                  <Action label="Descendre" onClick={() => move(i, 1)} disabled={i === channels.length - 1}>
                    <ArrowDown />
                  </Action>
                  <Action label="Modifier" onClick={() => setEditing(c)}>
                    <Pencil />
                  </Action>
                  <Action label="Supprimer" onClick={() => setDeleting(c)}>
                    <Trash2 />
                  </Action>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </SheetContent>

      <ChannelForm
        channel={editing ?? undefined}
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onSubmit={save}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleting?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La chaîne et son programme disparaissent. Ses vidéos marquées « à revoir » restent dans la liste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleting && run(() => deleteChannel(deleting.name), { deleted: deleting.name })}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}

function Action({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

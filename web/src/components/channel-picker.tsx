import { Bookmark, Check, ChevronsUpDown } from "lucide-react"

import { ChannelLogo } from "@/components/channel-logo"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { liveSlot, type ChannelGuide } from "@/lib/api"

/** Minuscules sans accents : « perú » = « Peru ». */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase()

/**
 * Filtre de recherche : chaque mot doit apparaître dans le nom ou les mots-clés (thèmes,
 * émission en cours). Le filtre par défaut de cmdk, approximatif, retient trop de chaînes.
 */
function filter(value: string, search: string, keywords: string[] = []) {
  const words = fold(search).split(/\s+/).filter(Boolean)
  const name = fold(value)
  const text = [name, ...keywords.map(fold)].join(" ")
  if (!words.every((w) => text.includes(w))) return 0
  return name.startsWith(words.join(" ")) ? 1 : 0.5 // le nom d'abord
}

type Props = {
  channels: ChannelGuide[]
  /** Nombre de vidéos à revoir ; la chaîne 0 n'apparaît que s'il y en a. */
  laterCount: number
  now: Date
  /** Chaîne regardée (son nom, ou `laterKey` pour la chaîne 0). */
  watching: string | null
  laterKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onWatch: (name: string) => void
  onWatchLater: () => void
}

/** Menu de l'en-tête : toutes les chaînes, avec recherche par nom, thème ou programme en cours. */
export function ChannelPicker({ channels, laterCount, now, watching, laterKey, open, onOpenChange, onWatch, onWatchLater }: Props) {
  const index = channels.findIndex((c) => c.name === watching)
  const label = watching === laterKey ? "À revoir" : index >= 0 ? channels[index].name : null

  function choose(action: () => void) {
    onOpenChange(false)
    action()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-56 justify-between font-normal">
          <span className="flex min-w-0 items-center gap-2">
            {label && <Kbd>{watching === laterKey ? 0 : index + 1}</Kbd>}
            <span className="truncate">{label ?? "Choisir une chaîne…"}</span>
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <Command filter={filter}>
          <CommandInput placeholder="Chaîne, thème, émission…" />
          <CommandList className="max-h-[70svh]">
            <CommandEmpty>Aucune chaîne trouvée.</CommandEmpty>
            {laterCount > 0 && (
              <CommandGroup>
                <CommandItem value={laterKey} keywords={["à revoir", "revoir", "marquées"]} onSelect={() => choose(onWatchLater)}>
                  <Kbd>0</Kbd>
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                    <Bookmark className="size-4" />
                  </span>
                  <Entry title="À revoir" subtitle={`${laterCount} vidéo${laterCount > 1 ? "s" : ""}`} />
                  {watching === laterKey && <Check className="ml-auto" />}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Chaînes">
              {channels.map((c, i) => {
                const slot = c.kind === "iptv" ? undefined : liveSlot(c, now)
                return (
                  <CommandItem
                    key={c.name}
                    value={c.name}
                    keywords={[...c.themes, slot?.title ?? "", slot?.source ?? "", c.kind === "iptv" ? "direct iptv" : ""]}
                    onSelect={() => choose(() => onWatch(c.name))}
                  >
                    <Kbd className={i >= 9 ? "invisible" : undefined}>{i + 1}</Kbd>
                    {c.kind === "iptv" ? (
                      <ChannelLogo src={c.logo} className="size-8 p-0.5" />
                    ) : (
                      <img src={slot?.thumbnail} alt="" className="h-8 w-14 shrink-0 rounded object-cover" />
                    )}
                    <Entry title={c.name} subtitle={c.kind === "iptv" ? "En direct" : slot?.title} />
                    {watching === c.name && <Check className="ml-auto" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function Entry({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{title}</span>
      {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
    </span>
  )
}

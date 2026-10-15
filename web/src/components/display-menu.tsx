import { useState } from "react"
import { Ratio } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { ASPECTS, parseAspect } from "@/lib/aspect"

type Display = { aspect: string; fill: boolean }

type Props = Display & {
  /** Enregistre le réglage avec la chaîne. */
  onChange: (display: Display) => void
}

/** Réglage de l'image d'une chaîne : format imposé et remplissage du lecteur. */
export function DisplayMenu({ aspect, fill, onChange }: Props) {
  const [custom, setCustom] = useState("")
  const isCustom = aspect !== "" && !(ASPECTS as readonly string[]).includes(aspect)
  const customValid = parseAspect(custom) !== null

  return (
    <Popover onOpenChange={(open) => open && setCustom(isCustom ? aspect : "")}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Format de l'image">
          <Ratio data-icon="inline-start" />
          {aspect || "Auto"}
          {fill && " · rempli"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3">
        <p className="text-sm font-medium">Format de l'image</p>
        <div className="grid grid-cols-3 gap-1">
          {["", ...ASPECTS].map((a) => (
            <Button key={a} size="sm" variant={aspect === a ? "secondary" : "outline"} onClick={() => onChange({ aspect: a, fill })}>
              {a || "Auto"}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (customValid) onChange({ aspect: custom.trim(), fill })
          }}
        >
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Personnalisé : 21:9, 1.85:1…"
            aria-invalid={custom !== "" && !customValid}
            className="h-8"
          />
          <Button type="submit" size="sm" variant={isCustom ? "secondary" : "outline"} disabled={!customValid}>
            OK
          </Button>
        </form>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="display-fill" className="flex flex-col items-start gap-0.5">
            Remplir le lecteur
            <span className="text-xs font-normal text-muted-foreground">Zoom, bords rognés : enlève les bandes noires.</span>
          </Label>
          <Switch id="display-fill" checked={fill} onCheckedChange={(f) => onChange({ aspect, fill: f })} />
        </div>
        <p className="text-xs text-muted-foreground">
          Un format imposé étire l'image : utile pour corriger une image écrasée. Réglage retenu pour cette chaîne.
        </p>
      </PopoverContent>
    </Popover>
  )
}

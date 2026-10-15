import { useState } from "react"
import { Radio } from "lucide-react"

import { cn } from "@/lib/utils"

/** Logo d'une chaîne en direct, sur fond blanc ; icône de repli s'il manque ou ne charge pas. */
export function ChannelLogo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1", className)}>
      {src && failed !== src ? (
        // Positionné dans la boîte (avec sa marge intérieure) : une hauteur en % ne se
        // résout pas quand la boîte tire sa hauteur de ses proportions (aspect-video).
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
          style={{ padding: "inherit" }}
          className="absolute inset-0 size-full object-contain"
        />
      ) : (
        <Radio className="size-1/2 text-black/50" />
      )}
    </span>
  )
}

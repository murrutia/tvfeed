import { useState } from "react"
import { Radio } from "lucide-react"

import { cn } from "@/lib/utils"

/** Logo d'une chaîne en direct, sur fond blanc ; icône de repli s'il manque ou ne charge pas. */
export function ChannelLogo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1", className)}>
      {src && failed !== src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="max-h-full max-w-full object-contain" />
      ) : (
        <Radio className="size-1/2 text-black/50" />
      )}
    </span>
  )
}

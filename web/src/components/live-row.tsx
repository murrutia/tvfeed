import { Play, Radio } from "lucide-react"

import { ChannelLogo } from "@/components/channel-logo"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Kbd } from "@/components/ui/kbd"
import type { ChannelGuide } from "@/lib/api"

type Props = {
  number: number
  channel: ChannelGuide
  onWatch: () => void
}

/** Chaîne IPTV dans la grille : en direct, sans programme. */
export function LiveRow({ number, channel, onWatch }: Props) {
  return (
    <Card className="py-0">
      <button type="button" onClick={onWatch} className="group flex cursor-pointer items-center gap-4 p-4 text-left">
        <span className="relative size-16 shrink-0">
          <ChannelLogo src={channel.logo} className="size-full rounded-lg p-1.5" />
          <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-7 fill-white text-white" />
          </span>
        </span>
        <CardHeader className="flex-1 p-0">
          <CardTitle className="flex items-center gap-2 text-lg">
            {number <= 9 && <Kbd>{number}</Kbd>}
            {channel.name}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-1.5">
            <Badge variant="destructive">
              <Radio data-icon="inline-start" />
              En direct
            </Badge>
            {channel.themes.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </CardDescription>
        </CardHeader>
      </button>
    </Card>
  )
}

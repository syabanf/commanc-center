import { CAMERAS, PLANTS, fmtClock } from '@gpi/fixtures'
import type { Camera } from '@gpi/types'
import {
  Banner,
  Chip,
  ChipRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PageHeader,
  StatusDot,
  cn,
} from '@gpi/ui'
import { Cctv, VideoOff } from 'lucide-react'
import { useState } from 'react'
import { useSearchParam } from '../../lib/use-search-param'
import { plantById, useNow } from '../../state/live'

const SITES = ['all', ...PLANTS.map((p) => p.id)]

export function CctvPage() {
  const [site, setSite] = useSearchParam<string>('site', 'all', SITES)
  const [focused, setFocused] = useState<Camera | null>(null)
  const now = useNow(1000)
  const cameras = CAMERAS.filter((c) => site === 'all' || c.plantId === site)
  const offline = cameras.filter((c) => !c.online).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="CCTV"
        description="Watch the four site cameras at each plant. The same tiles run on the video wall."
      />
      <Banner tone="info" title="Camera tiles are placeholders">
        Live video connects once each site recorder is surveyed and reachable over the VPN (RTSP or ONVIF).
      </Banner>
      <ChipRow>
        {SITES.map((id) => (
          <Chip
            key={id}
            variant="filter"
            active={site === id}
            count={CAMERAS.filter((c) => id === 'all' || c.plantId === id).length}
            onClick={() => setSite(id)}
          >
            {id === 'all' ? 'All sites' : plantById.get(id)!.name}
          </Chip>
        ))}
      </ChipRow>
      <p className="text-xs text-muted">
        {cameras.length - offline} of {cameras.length} cameras online
      </p>
      <div className="gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 grid grid-cols-1">
        {cameras.map((camera) => (
          <CameraTile key={camera.id} camera={camera} now={now} onOpen={() => setFocused(camera)} />
        ))}
      </div>
      <Dialog open={focused !== null} onOpenChange={(open) => !open && setFocused(null)}>
        <DialogContent size="xl">
          {focused && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {plantById.get(focused.plantId)!.name} · {focused.name}
                </DialogTitle>
                <DialogDescription>
                  {focused.online ? 'Recorder reachable. Stream placeholder.' : 'No signal from this camera.'}
                </DialogDescription>
              </DialogHeader>
              <CameraFeed camera={focused} now={now} large />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CameraTile({ camera, now, onOpen }: { camera: Camera; now: number; onOpen: () => void }) {
  const plant = plantById.get(camera.plantId)!
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${plant.name} ${camera.name}, ${camera.online ? 'online' : 'no signal'}. Open larger view`}
      className="overflow-hidden rounded-card bg-card text-left shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
    >
      <CameraFeed camera={camera} now={now} />
      <span className="gap-2 p-4 flex items-center justify-between">
        <span className="min-w-0">
          <span className="text-sm font-semibold block truncate">{camera.name}</span>
          <span className="text-xs block font-mono text-muted">
            {plant.code} · {plant.name}
          </span>
        </span>
        <StatusDot tone={camera.online ? 'success' : 'danger'} />
      </span>
    </button>
  )
}

function CameraFeed({ camera, now, large = false }: { camera: Camera; now: number; large?: boolean }) {
  return (
    <span
      className={cn(
        'aspect-video relative flex w-full items-center justify-center bg-ink text-on-ink-muted',
        large && 'rounded-2xl',
      )}
    >
      {camera.online ? <Cctv className="size-10 opacity-40" /> : <VideoOff className="size-10 opacity-60" />}
      <span className="left-3 top-3 gap-1.5 bg-white/10 px-2 py-0.5 font-bold tracking-wider text-white absolute flex items-center rounded-full text-[10px] uppercase">
        {camera.online ? (
          <>
            <StatusDot tone="accent" pulse /> Live
          </>
        ) : (
          'No signal'
        )}
      </span>
      {camera.online && (
        <span className="bottom-3 right-3 text-white/80 absolute font-mono text-[11px] tabular-nums">
          {fmtClock(now)}
        </span>
      )}
    </span>
  )
}

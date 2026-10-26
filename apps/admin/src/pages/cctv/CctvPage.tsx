import { CAMERAS, PLANTS } from '@gpi/fixtures'
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
  cn,
} from '@gpi/ui'
import { Cctv, VideoOff } from 'lucide-react'
import { useState } from 'react'
import { useSearchParam } from '../../lib/use-search-param'
import { plantById } from '../../state/live'

const SITES = ['all', ...PLANTS.map((p) => p.id)]

export function CctvPage() {
  const [site, setSite] = useSearchParam<string>('site', 'all', SITES)
  const [focused, setFocused] = useState<Camera | null>(null)
  const cameras = CAMERAS.filter((c) => site === 'all' || c.plantId === site)
  const offline = cameras.filter((c) => !c.online).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Camera readiness"
        description="Review the four planned camera positions at each plant."
      />
      <Banner tone="info" title="Video previews are unavailable">
        Camera connection states are simulated. Video can be shown after each site recorder is surveyed and
        connected over the VPN.
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
        {cameras.length - offline} of {cameras.length} connections marked available in the demo
      </p>
      <div className="gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4 grid grid-cols-1">
        {cameras.map((camera) => (
          <CameraTile key={camera.id} camera={camera} onOpen={() => setFocused(camera)} />
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
                  {focused.online
                    ? 'Connection marked available in demo. No video stream.'
                    : 'Connection marked unavailable in demo. No video stream.'}
                </DialogDescription>
              </DialogHeader>
              <CameraFeed camera={focused} large />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CameraTile({ camera, onOpen }: { camera: Camera; onOpen: () => void }) {
  const plant = plantById.get(camera.plantId)!
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${plant.name} ${camera.name}, ${camera.online ? 'connection marked available' : 'connection marked unavailable'} in demo, no video stream. Open larger view`}
      className="overflow-hidden rounded-card bg-card text-left shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
    >
      <CameraFeed camera={camera} />
      <span className="gap-2 p-4 flex items-center justify-between">
        <span className="min-w-0">
          <span className="text-sm font-semibold block truncate">{camera.name}</span>
          <span className="text-xs block font-mono text-muted">
            {plant.code} · {plant.name}
          </span>
        </span>
      </span>
    </button>
  )
}

function CameraFeed({ camera, large = false }: { camera: Camera; large?: boolean }) {
  return (
    <span
      className={cn(
        'aspect-video relative flex w-full items-center justify-center bg-ink text-on-ink-muted',
        large && 'rounded-2xl',
      )}
    >
      {camera.online ? <Cctv className="size-10 opacity-40" /> : <VideoOff className="size-10 opacity-60" />}
      <span className="left-3 top-3 gap-1.5 bg-white/10 px-2 py-0.5 font-bold tracking-wider text-white absolute flex items-center rounded-full text-[10px] uppercase">
        {camera.online ? 'Demo connection available' : 'Demo connection unavailable'}
      </span>
      <span className="bottom-3 right-3 text-white/80 absolute text-[11px]">No video stream</span>
    </span>
  )
}

import {
  DOOR_SWING_M,
  FURNITURE,
  HEAT_W,
  PLANTS,
  ROOM,
  SCADA_EVENTS,
  VIDEO_WALL,
  fmtClock,
  fmtNumber,
  fmtTimeMs,
  heatLoadW,
  isOpen,
  isSuppressed,
  linkLatency,
  roomChecks,
  seatZone,
  videoWallSize,
} from '@gpi/fixtures'
import { Button, EmptyState, KeyValue, SegmentedControl } from '@gpi/ui'
import { Box, Maximize2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useLive } from '../../state/live'
import { useStore } from '../../state/store'
import {
  MONITOR_TILES,
  type RoomKey,
  type RoomScene,
  WALL_TILES,
  type WallData,
  type WallTile,
  createRoomScene,
} from './room-scene'

const VIEWS = ['overview', 'op-1', 'eng', 'plan'] as const
type View = (typeof VIEWS)[number]

const TILE: Record<WallTile, { label: string; to: string; shows: string }> = {
  fleet: { label: 'Fleet output', to: paths.overview, shows: 'Live fleet MW against the 300 MW plan' },
  plants: { label: 'Plants', to: paths.plants, shows: 'Output and data age for the five plants' },
  alarms: { label: 'Alarms', to: paths.alarms(), shows: 'Critical and open alarm counts, latest alarm' },
  events: { label: 'Event list', to: paths.events(), shows: 'Latest Sequence of Events records' },
  fuel: { label: 'Fuel', to: paths.fuel, shows: 'HFO day tank level per plant' },
  links: {
    label: 'Starlink links',
    to: paths.dataHealth('link'),
    shows: 'Link state and round trip per plant',
  },
}

const m = (v: number, digits = 1) => `${v.toFixed(digits)} m`

/** Details and the next action for whatever is selected in the room. */
function describe(key: RoomKey) {
  const checks = Object.fromEntries(roomChecks().map((c) => [c.id, c]))
  const furniture = (id: string) => FURNITURE.find((f) => f.id === id)!
  if (key.startsWith('panel:')) {
    const i = Number(key.slice(6))
    const tile = TILE[WALL_TILES[i]!]
    return {
      kicker: `Video wall · panel ${i + 1} of ${WALL_TILES.length}`,
      title: tile.label,
      items: [
        { label: 'Shows', value: tile.shows },
        {
          label: 'Panel',
          value: `${VIDEO_WALL.diagonalIn}-inch, ${m(VIDEO_WALL.panelW, 2)} × ${m(VIDEO_WALL.panelH, 2)}`,
        },
      ],
      link: { label: `Open ${tile.label.toLowerCase()}`, to: tile.to },
    }
  }
  if (key.startsWith('monitor:')) {
    const [, deskId, index] = key.split(':')
    const desk = furniture(deskId!)
    const tile =
      TILE[desk.kind === 'engineering' ? (Number(index) ? 'links' : 'events') : MONITOR_TILES[Number(index)]!]
    return {
      kicker: `${desk.label} · ${Number(index) ? 'right' : 'left'} monitor`,
      title: tile.label,
      items: [{ label: 'Shows', value: tile.shows }],
      link: { label: `Open ${tile.label.toLowerCase()}`, to: tile.to },
    }
  }
  if (key.startsWith('desk:') || key.startsWith('chair:')) {
    const desk = furniture(key.split(':')[1]!)
    const s = seatZone(desk)
    return {
      kicker: key.startsWith('chair:') ? 'Chair' : 'Workstation',
      title: desk.label,
      items: [
        { label: 'Desk', value: `${m(desk.box.w)} × ${m(desk.box.d)}` },
        { label: 'Monitors', value: `${desk.monitors} plus the video wall` },
        { label: 'Seat zone', value: `${m(s.x1 - s.x0)} × ${m(s.z1 - s.z0)}` },
        {
          label: 'Faces',
          value:
            desk.facing === 'left'
              ? `Left wall, ${checks.distance!.value} from the video wall`
              : `Video wall at ${checks.angle!.value}`,
        },
      ],
      seat: desk.id,
    }
  }
  if (key === 'rack') {
    const rack = furniture('rack')
    return {
      kicker: 'Equipment',
      title: rack.label,
      items: [
        { label: 'Size', value: `${m(rack.box.w)} × ${m(rack.box.d)} × ${m(rack.box.h)}` },
        { label: 'Holds', value: 'Switches, firewall, VPN gateway and UPS for the room' },
        { label: 'Heat', value: `${fmtNumber(HEAT_W.rack)} W planning figure` },
      ],
      link: { label: 'Open platform rules', to: paths.system('platform') },
    }
  }
  if (key === 'door') {
    const door = furniture('door')
    return {
      kicker: 'Back wall',
      title: 'Door',
      items: [
        { label: 'Opening', value: `${m(door.box.w)} × ${m(door.box.h)}` },
        { label: 'Swing', value: `${m(DOOR_SWING_M)} leaf · ${checks.door!.value.toLowerCase()}` },
      ],
    }
  }
  if (key === 'ac') {
    return {
      kicker: 'Right wall',
      title: 'Split air conditioner',
      items: [
        { label: 'Room load', value: `${fmtNumber(heatLoadW() / 1000, 1)} kW` },
        { label: 'Size for', value: `${fmtNumber((heatLoadW() * 1.2) / 1000, 1)} kW or more` },
      ],
    }
  }
  if (key === 'lights') {
    return {
      kicker: 'Ceiling',
      title: 'Light panels',
      items: [{ label: 'Lighting', value: 'Dimmable, glare-free; screens read best at 300 to 500 lux' }],
    }
  }
  const wall = videoWallSize()
  const walls: Record<string, { title: string; value: string }> = {
    'wall:front': {
      title: 'Front wall',
      value: `Video wall ${m(wall.w, 2)} × ${m(wall.h, 2)}, bottom at ${m(VIDEO_WALL.bottomM)}`,
    },
    'wall:left': { title: 'Left wall', value: 'Engineering desk along the back half' },
    'wall:right': { title: 'Right wall', value: 'Split air conditioner' },
    'wall:back': { title: 'Back wall', value: 'Door and the network rack' },
  }
  if (walls[key])
    return { kicker: 'Wall', title: walls[key]!.title, items: [{ label: 'Holds', value: walls[key]!.value }] }
  return {
    kicker: 'Room',
    title: 'Command Center room, Al Khobar',
    items: [
      { label: 'Size', value: `${m(ROOM.lengthM)} × ${m(ROOM.widthM)} × ${m(ROOM.heightM)}` },
      { label: 'Floor', value: `${fmtNumber(ROOM.lengthM * ROOM.widthM, 1)} m²` },
      { label: 'Volume', value: `${fmtNumber(ROOM.lengthM * ROOM.widthM * ROOM.heightM)} m³` },
    ],
  }
}

/** Live content for the video wall and desk monitors. */
function useWallData(): WallData {
  const { now, fleet, byPlant } = useLive()
  const { alarms } = useStore().state
  return useMemo(() => {
    const open = alarms.filter((a) => isOpen(a) && !isSuppressed(a))
    const latest = [...open].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))[0]
    return {
      clock: fmtClock(now),
      fleetMw: fleet.mw,
      capacityMw: fleet.capacityMw,
      plants: PLANTS.map((p) => {
        const r = byPlant.get(p.id)!
        return {
          code: p.code,
          name: p.name,
          mw: r.mw,
          capacityMw: p.capacityMw,
          fresh: r.freshness === 'fresh',
          link: p.link,
          latencyMs: linkLatency(p, now),
          tank: r.tankLevel,
        }
      }),
      critical: open.filter((a) => a.priority === 'critical').length,
      open: open.length,
      latestAlarm: latest ? latest.message : null,
      events: SCADA_EVENTS.slice(0, 5).map((e) => ({
        time: fmtTimeMs(e.sourceAt).slice(0, 8),
        tag: e.tag,
        message: e.message,
      })),
    }
  }, [now, fleet, byPlant, alarms])
}

export function RoomView() {
  const navigate = useNavigate()
  const mount = useRef<HTMLDivElement>(null)
  const room = useRef<RoomScene | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<RoomKey | null>(null)
  const [view, setView] = useState<View>('overview')
  const data = useWallData()

  useEffect(() => {
    if (!mount.current) return
    try {
      room.current = createRoomScene(mount.current, setSelected)
    } catch {
      setFailed(true)
      return
    }
    return () => {
      room.current?.dispose()
      room.current = null
    }
  }, [])
  useEffect(() => room.current?.updateScreens(data), [data])
  useEffect(() => room.current?.select(selected), [selected])

  const go = (next: View) => {
    setView(next)
    if (next === 'overview') room.current?.overview()
    else if (next === 'plan') room.current?.plan()
    else room.current?.seat(next)
  }

  if (failed) {
    return (
      <EmptyState
        icon={<Box />}
        title="3D view needs WebGL"
        description="This browser cannot draw the room model. The equipment list below holds the same layout."
      />
    )
  }

  const info = selected ? describe(selected) : null
  return (
    <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
      <div className="min-w-0 space-y-3">
        <SegmentedControl
          aria-label="Room view"
          size="sm"
          value={view}
          onChange={(v) => go(v as View)}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'op-1', label: 'Operator seat' },
            { value: 'eng', label: 'Engineer seat' },
            { value: 'plan', label: 'Plan' },
          ]}
        />
        <div className="rounded-2xl relative overflow-hidden bg-surface-2">
          <div
            ref={mount}
            role="img"
            aria-label={`3D model of the Command Center room, ${ROOM.lengthM} by ${ROOM.widthM} by ${ROOM.heightM} metres`}
            className="sm:aspect-[16/10] @container relative aspect-[4/3] w-full"
          />
          <Button
            size="sm"
            variant="secondary"
            className="right-3 top-3 absolute"
            aria-label="Reset view"
            onClick={() => go('overview')}
          >
            <Maximize2 />
            <span className="sm:inline hidden">Reset view</span>
          </Button>
        </div>
        <p className="text-xs text-muted">
          Drag to orbit, scroll or pinch to zoom. Select any panel, monitor, desk, chair, wall or piece of
          equipment to see it and open what it shows.
        </p>
      </div>
      <aside className="min-w-0" aria-label="Selected item">
        <div className="rounded-2xl p-4 space-y-3 bg-surface-2">
          {info ? (
            <>
              <div className="gap-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">
                    {info.kicker}
                  </p>
                  <h3 className="text-lg font-semibold">{info.title}</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Clear
                </Button>
              </div>
              <KeyValue bare items={info.items} />
              <div className="gap-2 flex flex-wrap">
                {'seat' in info && info.seat && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setView(info.seat === 'eng' ? 'eng' : 'op-1')
                      room.current?.seat(info.seat!)
                    }}
                  >
                    Sit here
                  </Button>
                )}
                {'link' in info && info.link && (
                  <Button size="sm" variant="outline" onClick={() => navigate(info.link!.to)}>
                    {info.link.label}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Select anything in the room. Video wall panels and monitors open the console page they show.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

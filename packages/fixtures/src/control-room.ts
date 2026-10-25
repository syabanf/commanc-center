// The GPI Command Center room in Al Khobar. Room size from GPI: 5.0 m long, 3.6 m wide, 3.0 m high.
// The furniture layout is a proposal sized to the SCADA specification (section 6: at least two operator
// workstations, an engineering and administration workstation, and video-wall capability).
// Coordinates are metres on the floor: x across the width (0 at the left wall, facing the video wall),
// z along the length (0 at the video wall), y up.

export const ROOM = { lengthM: 5, widthM: 3.6, heightM: 3 } as const

export interface Box3 {
  x: number
  z: number
  w: number
  d: number
  h: number
}

export type FurnitureKind = 'operator' | 'engineering' | 'rack' | 'door'

export interface Furniture {
  id: string
  kind: FurnitureKind
  label: string
  box: Box3
  /** Which way the seated person looks: at the video wall, or at the left wall. */
  facing?: 'wall' | 'left'
  monitors?: number
}

/** Six 46-inch panels, three across and two high, centred on the front wall. */
export const VIDEO_WALL = {
  cols: 3,
  rows: 2,
  panelW: 1.02,
  panelH: 0.575,
  bottomM: 0.9,
  diagonalIn: 46,
} as const
export const videoWallSize = () => ({
  w: VIDEO_WALL.cols * VIDEO_WALL.panelW,
  h: VIDEO_WALL.rows * VIDEO_WALL.panelH,
})

/** Depth a seated person and chair take up behind the desk. */
export const CHAIR_ZONE_M = 0.7
/** Seated eye height, and how far the eyes sit behind the desk edge nearest the screen. */
export const EYE = { y: 1.2, behindEdge: 1.2 }
/** Swing radius of the door leaf. */
export const DOOR_SWING_M = 0.9

const DESK = { w: 1.6, d: 0.8, h: 0.75 }

export const FURNITURE: Furniture[] = [
  {
    id: 'op-1',
    kind: 'operator',
    label: 'Operator workstation 1',
    facing: 'wall',
    monitors: 2,
    box: { x: 0.15, z: 1.9, ...DESK },
  },
  {
    id: 'op-2',
    kind: 'operator',
    label: 'Operator workstation 2',
    facing: 'wall',
    monitors: 2,
    box: { x: 1.85, z: 1.9, ...DESK },
  },
  {
    id: 'eng',
    kind: 'engineering',
    label: 'Engineering and administration workstation',
    facing: 'left',
    monitors: 2,
    box: { x: 0.05, z: 3.7, w: 0.8, d: 1.25, h: 0.75 },
  },
  {
    id: 'rack',
    kind: 'rack',
    label: 'Network, firewall and UPS rack',
    box: { x: 2.95, z: 4.15, w: 0.6, d: 0.8, h: 2 },
  },
  { id: 'door', kind: 'door', label: 'Door', box: { x: 1.6, z: 4.95, w: 0.9, d: 0.05, h: 2.1 } },
]

/** Floor taken by the chair behind a desk, as an x/z rectangle. */
export function seatZone(f: Furniture) {
  const { x, z, w, d } = f.box
  return f.facing === 'left'
    ? { x0: x + w, x1: x + w + CHAIR_ZONE_M, z0: z, z1: z + d }
    : { x0: x, x1: x + w, z0: z + d, z1: z + d + CHAIR_ZONE_M }
}

type Rect = { x0: number; x1: number; z0: number; z1: number }
const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
const footprint = ({ box }: Furniture): Rect => ({
  x0: box.x,
  x1: box.x + box.w,
  z0: box.z,
  z1: box.z + box.d,
})

/** Planning heat gains in watts until the equipment list fixes them. */
export const HEAT_W = { panel: 150, workstation: 300, person: 100, rack: 1500 } as const

/** Sensible heat load of the room: panels, workstations, one person per desk and the rack. */
export function heatLoadW(furniture: Furniture[] = FURNITURE): number {
  const desks = furniture.filter((f) => f.monitors).length
  const racks = furniture.filter((f) => f.kind === 'rack').length
  return (
    VIDEO_WALL.cols * VIDEO_WALL.rows * HEAT_W.panel +
    desks * (HEAT_W.workstation + HEAT_W.person) +
    racks * HEAT_W.rack
  )
}

export type CheckTone = 'ok' | 'warning'
export interface RoomCheck {
  id: string
  label: string
  value: string
  target: string
  tone: CheckTone
  note: string
}

const deg = (rad: number) => (rad * 180) / Math.PI
const fmt = (v: number, unit: string, digits = 1) => `${v.toFixed(digits)} ${unit}`

/**
 * Layout checks against common control-room planning guidance (ISO 11064). They inform the room design;
 * they are not a compliance assessment.
 */
export function roomChecks(furniture: Furniture[] = FURNITURE): RoomCheck[] {
  const wall = videoWallSize()
  const front = furniture.filter((f) => f.kind === 'operator')
  const desks = furniture.filter((f) => f.kind === 'operator' || f.kind === 'engineering')
  const eng = furniture.find((f) => f.kind === 'engineering')!
  const door = furniture.find((f) => f.kind === 'door')!
  const rack = furniture.find((f) => f.kind === 'rack')!

  const frontEye = Math.min(...front.map((f) => f.box.z)) + EYE.behindEdge
  const angle = deg(2 * Math.atan(wall.w / 2 / frontEye))
  const engEye = eng.box.z + eng.box.d / 2
  const chairsEnd = Math.max(...front.map((f) => seatZone(f).z1))
  const walkway = ROOM.lengthM - chairsEnd
  const swing: Rect = {
    x0: door.box.x,
    x1: door.box.x + DOOR_SWING_M,
    z0: ROOM.lengthM - DOOR_SWING_M,
    z1: ROOM.lengthM,
  }
  const swingBlocked = [footprint(rack), seatZone(eng), footprint(eng)].some((r) => overlaps(swing, r))
  const area = ROOM.lengthM * ROOM.widthM
  const perSeat = area / desks.length
  const wallTop = VIDEO_WALL.bottomM + wall.h

  return [
    {
      id: 'angle',
      label: 'Video wall angle from the operators',
      value: fmt(angle, '°', 0),
      target: 'Up to 60°',
      tone: angle <= 60 ? 'ok' : 'warning',
      note:
        angle <= 60
          ? `Seated ${fmt(frontEye, 'm')} from the wall, operators see all six panels without turning their heads.`
          : 'Operators turn their heads to read the outer panels; move the desks back or use smaller panels.',
    },
    {
      id: 'distance',
      label: 'Viewing distance from the engineering desk',
      value: fmt(engEye, 'm'),
      target: 'Up to 6 m for 46-inch panels',
      tone: engEye <= 6 ? 'ok' : 'warning',
      note: 'The engineering desk faces the side wall, so the engineer turns to read the video wall.',
    },
    {
      id: 'walkway',
      label: 'Walkway behind the operators',
      value: fmt(walkway, 'm', 2),
      target: 'At least 0.9 m',
      tone: walkway >= 0.9 ? 'ok' : 'warning',
      note: 'Clear path from the door to both operator chairs.',
    },
    {
      id: 'door',
      label: 'Door swing',
      value: swingBlocked ? 'Blocked' : 'Clear',
      target: `${fmt(DOOR_SWING_M, 'm')} leaf swings freely`,
      tone: swingBlocked ? 'warning' : 'ok',
      note: swingBlocked
        ? 'The door leaf hits furniture when it opens.'
        : 'The door opens between the engineering chair and the rack.',
    },
    {
      id: 'area',
      label: 'Floor area per workstation',
      value: fmt(perSeat, 'm²'),
      target: '9 to 15 m² per workstation',
      tone: perSeat >= 9 ? 'ok' : 'warning',
      note: `${fmt(area, 'm²')} for ${desks.length} workstations: enough for daily monitoring, tight for an incident team or visitors.`,
    },
    {
      id: 'cooling',
      label: 'Cooling load',
      value: fmt(heatLoadW(furniture) / 1000, 'kW'),
      target: 'Air conditioning rated 20% above',
      tone: 'ok',
      note: `Size the split unit for at least ${fmt((heatLoadW(furniture) * 1.2) / 1000, 'kW')}. Planning figures until the equipment list arrives.`,
    },
    {
      id: 'headroom',
      label: 'Headroom above the video wall',
      value: fmt(ROOM.heightM - wallTop, 'm', 2),
      target: 'Room for cable trays and lights',
      tone: 'ok',
      note: `Wall top at ${fmt(wallTop, 'm', 2)} under a ${fmt(ROOM.heightM, 'm')} ceiling.`,
    },
  ]
}

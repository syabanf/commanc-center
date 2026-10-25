import type { Plant, SiteZoneKind, Unit } from '@gpi/types'
import { transformerCount } from './scada'

// Schematic site plans for the drill-down. Zone positions follow a typical HFO plant arrangement and wait
// for the as-built drawings from each EPC contractor; only the unit count per hall comes from the seed.

export const PLAN_SIZE = { width: 1000, height: 600 }

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SiteLayout {
  zones: { kind: SiteZoneKind; rect: Rect }[]
  units: { unitId: string; rect: Rect }[]
  /** Camera pins by the camera's seeded name. */
  cameras: { name: string; x: number; y: number }[]
  dayTank: { cx: number; cy: number; r: number }
  storageTanks: { cx: number; cy: number; r: number }[]
  transformers: Rect[]
}

const ZONES: Record<SiteZoneKind, Rect> = {
  engine_hall: { x: 30, y: 40, w: 560, h: 270 },
  fuel_treatment: { x: 30, y: 340, w: 270, h: 120 },
  workshop: { x: 320, y: 340, w: 270, h: 120 },
  tank_farm: { x: 620, y: 40, w: 350, h: 220 },
  switchyard: { x: 620, y: 290, w: 350, h: 170 },
  gate: { x: 30, y: 490, w: 200, h: 80 },
  control_room: { x: 250, y: 490, w: 340, h: 80 },
}

export function siteLayout(plant: Plant, units: Unit[]): SiteLayout {
  const hall = ZONES.engine_hall
  const own = units.filter((u) => u.plantId === plant.id)
  const rows = own.length > 6 ? 2 : 1
  const perRow = Math.ceil(own.length / rows)
  const pad = 20
  const top = 56
  const gap = 12
  const w = (hall.w - pad * 2 - gap * (perRow - 1)) / perRow
  const h = (hall.h - top - pad - gap * (rows - 1)) / rows
  const tanks = ZONES.tank_farm
  const yard = ZONES.switchyard
  const transformers = transformerCount(own.length)
  const tw = (yard.w - 40 - 10 * (transformers - 1)) / transformers

  return {
    zones: (Object.entries(ZONES) as [SiteZoneKind, Rect][]).map(([kind, rect]) => ({ kind, rect })),
    units: own.map((u, i) => ({
      unitId: u.id,
      rect: {
        x: hall.x + pad + (i % perRow) * (w + gap),
        y: hall.y + top + Math.floor(i / perRow) * (h + gap),
        w,
        h,
      },
    })),
    cameras: [
      { name: 'Main gate', x: ZONES.gate.x + ZONES.gate.w - 18, y: ZONES.gate.y + 18 },
      { name: 'Engine hall', x: hall.x + hall.w - 18, y: hall.y + 18 },
      { name: 'Tank farm', x: tanks.x + tanks.w - 18, y: tanks.y + 18 },
      { name: 'MV switchyard', x: yard.x + yard.w - 18, y: yard.y + 18 },
    ],
    dayTank: { cx: tanks.x + 90, cy: tanks.y + 125, r: 62 },
    storageTanks: [
      { cx: tanks.x + 215, cy: tanks.y + 125, r: 48 },
      { cx: tanks.x + 300, cy: tanks.y + 125, r: 38 },
    ],
    transformers: Array.from({ length: transformers }, (_, i) => ({
      x: yard.x + 20 + i * (tw + 10),
      y: yard.y + 60,
      w: tw,
      h: 56,
    })),
  }
}

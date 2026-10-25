import { type PlantReading, transformerCount } from '@gpi/fixtures'
import type { Unit } from '@gpi/types'

// The electrical model behind the single-line diagram, shared by the 2D diagram and the 3D view:
// one incomer per generator on an 11 kV bus in two sections, step-up transformers, two 33 kV feeders.

/** Station auxiliaries draw this share of generation before export. */
export const AUX_SHARE = 0.03

export type BreakerState = 'closed' | 'open' | 'tripped' | 'racked_out'
export const BREAKER_LABEL: Record<BreakerState, string> = {
  closed: 'Closed',
  open: 'Open',
  tripped: 'Tripped',
  racked_out: 'Open, local',
}

export interface Breaker {
  tag: string
  feeds: string
  state: BreakerState
  local: boolean
  kw: number
  kvar: number
  amps: number
  /** The generator behind an incomer breaker. */
  unitId?: string
}

export interface Transformer {
  tag: string
  mva: number
  load: number
  oil: number
  winding: number
}

export const breakerOf = (u: Unit): BreakerState =>
  u.state === 'running'
    ? 'closed'
    : u.state === 'tripped'
      ? 'tripped'
      : u.state === 'maintenance'
        ? 'racked_out'
        : 'open'

export function singleLineModel(units: Unit[], reading: PlantReading) {
  const t = transformerCount(units.length)
  const live = reading.mw > 0
  const tanPhi = reading.powerFactor ? Math.tan(Math.acos(reading.powerFactor)) : 0
  const kv33 = reading.voltageKv * 3
  const exportMw = reading.mw * (1 - AUX_SHARE)
  const amps = (kw: number, kv: number) => (kw && kv ? kw / (Math.sqrt(3) * kv * reading.powerFactor) : 0)

  const unitBreakers: Breaker[] = units.map((u) => {
    const kw = (reading.units.find((r) => r.unitId === u.id)?.mw ?? 0) * 1000
    return {
      tag: `52-G${u.code.split('-G')[1]}`,
      feeds: u.code,
      state: breakerOf(u),
      local: u.state === 'maintenance',
      kw,
      kvar: kw * tanPhi,
      amps: amps(kw, reading.voltageKv),
      unitId: u.id,
    }
  })
  const trafoKw = (exportMw * 1000) / t
  const trafoBreakers: Breaker[] = Array.from({ length: t }, (_, i) => ({
    tag: `52-T${i + 1}`,
    feeds: `Transformer T${i + 1}, 11/33 kV`,
    state: 'closed',
    local: false,
    kw: trafoKw,
    kvar: trafoKw * tanPhi,
    amps: live ? amps(trafoKw, kv33) : 0,
  }))
  const feederBreakers: Breaker[] = [0, 1].map((i) => ({
    tag: `52-F${i + 1}`,
    feeds: `33 kV line to grid ${i + 1}`,
    state: 'closed',
    local: false,
    kw: (exportMw * 1000) / 2,
    kvar: ((exportMw * 1000) / 2) * tanPhi,
    amps: live ? amps((exportMw * 1000) / 2, kv33) : 0,
  }))
  const rating = units.reduce((s, u) => s + u.ratingMw, 0) / t
  const transformers: Transformer[] = Array.from({ length: t }, (_, i) => {
    const load = live ? trafoKw / 1000 / (rating * 1.25) : 0
    const oil = live ? 38 + 34 * load + (i % 2) * 2 : 31
    return {
      tag: `T${i + 1}`,
      mva: Math.round(rating * 1.25),
      load,
      oil,
      winding: oil + (live ? 13 * load : 0),
    }
  })

  return {
    live,
    kv33,
    exportMw,
    /** Index of the first unit on bus section B. */
    half: Math.ceil(units.length / 2),
    unitBreakers,
    trafoBreakers,
    feederBreakers,
    breakers: [...feederBreakers, ...trafoBreakers, ...unitBreakers],
    transformers,
  }
}
export type SingleLineModel = ReturnType<typeof singleLineModel>

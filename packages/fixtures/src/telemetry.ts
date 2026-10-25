import type { Plant, Unit } from '@gpi/types'
import { FIXTURE_NOW, HOUR } from './clock'

// Simulated live readings. Each value is a pure function of time and the unit id, so every screen
// shows the same number for the same instant, and a stale site shows the values from its last sample.

/** Proposed refresh for operating values (Q22): a sample every 5 s on a healthy link. */
export const SAMPLE_MS = 5_000
/** A sample older than this shows a late warning; older than STALE_MS it counts as stale. */
export const LATE_MS = 15_000
export const STALE_MS = 60_000
/** HFO density used to turn kilograms into litres. */
const HFO_KG_PER_L = 0.96

export type Freshness = 'fresh' | 'late' | 'stale'

export interface UnitReading {
  unitId: string
  mw: number
  exhaustC: number
  lubeBar: number
  coolantC: number
}

export interface PlantReading {
  plantId: string
  sampledAt: number
  ageMs: number
  freshness: Freshness
  mw: number
  /** Rating of commissioned units that are not tripped or in maintenance. */
  availableMw: number
  running: number
  commissioned: number
  voltageKv: number
  currentA: number
  frequencyHz: number
  powerFactor: number
  fuelSupplyLph: number
  fuelReturnLph: number
  fuelNetLph: number
  /** Specific fuel consumption in g/kWh; null while nothing runs. */
  sfc: number | null
  tankLevel: number
  units: UnitReading[]
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

const wave = (t: number, key: string, periodMs: number, amp: number) =>
  Math.sin((2 * Math.PI * t) / periodMs + hash(key) * 2 * Math.PI) * amp

/** Daily load shape: lowest before dawn, highest in the afternoon. */
const diurnal = (t: number) => 0.92 + 0.08 * Math.sin(((t / HOUR + 3 - 9) / 24) * 2 * Math.PI)

const SFC_BIAS: Record<string, number> = { 'pl-um': 12, 'pl-ag': 6 }

export function sampleTime(plant: Plant, now: number): number {
  if (plant.link === 'offline') return plant.frozenAt ? Date.parse(plant.frozenAt) : now
  if (plant.link === 'degraded') return Math.floor((now - 35_000) / 10_000) * 10_000
  return Math.floor(now / SAMPLE_MS) * SAMPLE_MS
}

export function freshnessOf(ageMs: number): Freshness {
  if (ageMs > STALE_MS) return 'stale'
  if (ageMs > LATE_MS) return 'late'
  return 'fresh'
}

export function unitReading(unit: Unit, t: number): UnitReading {
  const running = unit.state === 'running'
  const mw = running ? unit.ratingMw * unit.load * diurnal(t) * (1 + wave(t, unit.id, 7 * 60_000, 0.015)) : 0
  return {
    unitId: unit.id,
    mw,
    exhaustC: running ? 438 + unit.exhaustBiasC + wave(t, `${unit.id}e`, 5 * 60_000, 9) : 42,
    lubeBar: running ? (unit.id === 'un-jm-4' ? 3.9 : 4.7) + wave(t, `${unit.id}l`, 3 * 60_000, 0.12) : 0,
    coolantC: running ? 84 + wave(t, `${unit.id}c`, 9 * 60_000, 2.5) : 38,
  }
}

export function plantReading(plant: Plant, units: Unit[], now: number): PlantReading {
  const t = sampleTime(plant, now)
  const own = units.filter((u) => u.plantId === plant.id)
  const readings = own.map((u) => unitReading(u, t))
  const mw = readings.reduce((sum, r) => sum + r.mw, 0)
  const commissioned = own.filter((u) => u.state !== 'not_commissioned')
  const availableMw = commissioned
    .filter((u) => u.state === 'running' || u.state === 'standby')
    .reduce((sum, u) => sum + u.ratingMw, 0)
  const sfc = mw > 0 ? 212 + (SFC_BIAS[plant.id] ?? 0) + wave(t, `${plant.id}s`, 11 * 60_000, 3) : null
  const fuelNetLph = sfc === null ? 0 : (mw * 1000 * sfc) / 1000 / HFO_KG_PER_L
  const powerFactor = mw > 0 ? 0.86 + wave(t, `${plant.id}pf`, 13 * 60_000, 0.02) : 0
  const voltageKv = mw > 0 || plant.link !== 'offline' ? 11 + wave(t, `${plant.id}v`, 4 * 60_000, 0.08) : 0
  const burnedM3 = (fuelNetLph * Math.max(0, t - FIXTURE_NOW)) / HOUR / 1000
  return {
    plantId: plant.id,
    sampledAt: t,
    ageMs: now - t,
    freshness: freshnessOf(now - t),
    mw,
    availableMw,
    running: own.filter((u) => u.state === 'running').length,
    commissioned: commissioned.length,
    voltageKv,
    currentA: mw > 0 ? (mw * 1e6) / (Math.sqrt(3) * voltageKv * 1000 * powerFactor) : 0,
    frequencyHz: mw > 0 ? 50 + wave(t, `${plant.id}f`, 2 * 60_000, 0.04) : 0,
    powerFactor,
    fuelSupplyLph: fuelNetLph * 1.32,
    fuelReturnLph: fuelNetLph * 0.32,
    fuelNetLph,
    sfc,
    tankLevel: Math.max(0, plant.tankLevel - burnedM3 / plant.tankCapacityM3),
    units: readings,
  }
}

/** Hourly MW for the last `hours`, ending at the latest sample. */
export function plantTrend(
  plant: Plant,
  units: Unit[],
  now: number,
  hours = 24,
): { at: number; mw: number }[] {
  const end = sampleTime(plant, now)
  return Array.from({ length: hours }, (_, i) => {
    const at = end - (hours - 1 - i) * HOUR
    const mw = units.filter((u) => u.plantId === plant.id).reduce((sum, u) => sum + unitReading(u, at).mw, 0)
    return { at, mw }
  })
}

export interface FleetSummary {
  mw: number
  capacityMw: number
  availableMw: number
  running: number
  commissioned: number
  fuelNetLph: number
  sfc: number | null
  late: number
  stale: number
}

export function fleetSummary(plants: Plant[], readings: PlantReading[]): FleetSummary {
  const mw = readings.reduce((sum, r) => sum + r.mw, 0)
  const fuelNetLph = readings.reduce((sum, r) => sum + r.fuelNetLph, 0)
  return {
    mw,
    capacityMw: plants.reduce((sum, p) => sum + p.capacityMw, 0),
    availableMw: readings.reduce((sum, r) => sum + r.availableMw, 0),
    running: readings.reduce((sum, r) => sum + r.running, 0),
    commissioned: readings.reduce((sum, r) => sum + r.commissioned, 0),
    fuelNetLph,
    sfc: mw > 0 ? (fuelNetLph * HFO_KG_PER_L * 1000) / (mw * 1000) : null,
    late: readings.filter((r) => r.freshness === 'late').length,
    stale: readings.filter((r) => r.freshness === 'stale').length,
  }
}

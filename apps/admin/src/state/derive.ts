import {
  ALARM_HISTORY,
  DAILY_ENERGY,
  DAY,
  ESCALATION_RULES,
  HOUR,
  PLANTS,
  UNITS,
  latestProgress,
  plantTrend,
  startOfDay,
  toMs,
} from '@gpi/fixtures'
import type { AppState, PlantReading } from '@gpi/fixtures'
import type { AlarmRecord, Plant } from '@gpi/types'

/** Rating of commissioned units, for one plant or the fleet. */
export function commissionedMw(plantId?: string): number {
  return UNITS.filter((u) => u.state !== 'not_commissioned' && (!plantId || u.plantId === plantId)).reduce(
    (sum, u) => sum + u.ratingMw,
    0,
  )
}

/** Energy since midnight in MWh, from the hourly trend. */
export function todayMwh(now: number, plantId?: string): number {
  const hours = Math.max(1, Math.ceil((now - startOfDay(now)) / HOUR))
  return PLANTS.filter((p) => !plantId || p.id === plantId).reduce(
    (sum, plant) => sum + plantTrend(plant, UNITS, now, hours).reduce((s, point) => s + point.mw, 0),
    0,
  )
}

/** Daily history rows inside the last `days` days. */
export function energyRows(days: number, now: number, plantId?: string) {
  const from = startOfDay(now) - days * DAY
  return DAILY_ENERGY.filter((row) => toMs(row.date) >= from && (!plantId || row.plantId === plantId))
}

export function energyTotals(days: number, now: number, plantId?: string) {
  const rows = energyRows(days, now, plantId)
  const mwh = rows.reduce((sum, r) => sum + r.mwh, 0)
  const fuelM3 = rows.reduce((sum, r) => sum + r.fuelM3, 0)
  return {
    mwh,
    fuelM3,
    availability: rows.length ? rows.reduce((sum, r) => sum + r.availability, 0) / rows.length : null,
    /** g/kWh, with HFO at 0.96 kg/L. */
    sfc: mwh > 0 ? (fuelM3 * 960) / mwh : null,
  }
}

/** Fleet MWh and HFO m³ per day for the last `days` days, oldest first. */
export function dailyFleet(days: number, now: number) {
  const byDate = new Map<string, { date: string; mwh: number; fuelM3: number }>()
  for (const row of energyRows(days, now)) {
    const day = byDate.get(row.date) ?? { date: row.date, mwh: 0, fuelM3: 0 }
    byDate.set(row.date, { date: row.date, mwh: day.mwh + row.mwh, fuelM3: day.fuelM3 + row.fuelM3 })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Latest recorded construction progress, or 100% for a plant handed over to O&M. */
export function projectProgress(state: AppState, plantId: string): number {
  return (
    latestProgress(state, plantId) ?? (PLANTS.find((p) => p.id === plantId)?.phase === 'operating' ? 1 : 0)
  )
}

/** Reference SFC for fleet comparisons, g/kWh. A planning figure until OEM curves are supplied. */
export const SFC_BASELINE = 215
/** Availability the O&M contracts aim for. A planning figure until GPI confirms it. */
export const AVAILABILITY_TARGET = 0.9
/** Level 1 response time from the escalation matrix, in minutes. */
export const ACK_TARGET_MIN = ESCALATION_RULES[0]!.responseMin

/** Hours the HFO stock lasts at the current burn rate, or null while nothing burns. */
export function supplyHours(reading: PlantReading, plant: Plant): number | null {
  return reading.fuelNetLph > 0
    ? (reading.tankLevel * plant.tankCapacityM3 * 1000) / reading.fuelNetLph
    : null
}

/** Closed alarms raised in the window `[now - fromDays, now - toDays)`. */
export function alarmHistory(now: number, fromDays: number, toDays = 0): AlarmRecord[] {
  return ALARM_HISTORY.filter((a) => {
    const at = toMs(a.raisedAt)
    return at >= now - fromDays * DAY && at < now - toDays * DAY
  })
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Count of records per key, largest first. */
export function countBy<T>(rows: T[], key: (row: T) => string): [string, number][] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

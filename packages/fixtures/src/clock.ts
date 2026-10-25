/** Every relative time in the seed is measured from this instant (Khobar and Yemen are both UTC+3). */
export const FIXTURE_NOW = Date.parse('2026-10-19T08:00:00+03:00')

const bootMs = Date.now()

/** App clock: starts at FIXTURE_NOW and ticks in real time, so timers move while the seed stays consistent. */
export function nowMs(): number {
  return FIXTURE_NOW + (Date.now() - bootMs)
}

export function nowIso(): string {
  return new Date(nowMs()).toISOString()
}

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function toMs(iso: string): number {
  return Date.parse(iso)
}

/** ISO time `minutes` before FIXTURE_NOW. */
export function ago(minutes: number): string {
  return new Date(FIXTURE_NOW - minutes * MINUTE).toISOString()
}

export function startOfDay(ms: number): number {
  const d = new Date(ms + 3 * HOUR)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 3 * HOUR
}

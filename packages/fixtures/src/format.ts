import { nowMs, toMs } from './clock'

// All dates render in Arabia Standard Time, the time zone of Khobar and the Yemen sites.
const TZ = 'Asia/Riyadh'
const date = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})
const precise = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  })
const preciseLocal = precise(TZ)
const preciseUtc = precise('UTC')
const utcClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' })
const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })

type When = string | number
const ms = (value: When) => (typeof value === 'number' ? value : toMs(value))

export const fmtDate = (value: When) => date.format(ms(value))
export const fmtShortDate = (value: When) => shortDate.format(ms(value))
export const fmtTime = (value: When) => time.format(ms(value))
export const fmtClock = (value: When) => clock.format(ms(value))
/** Local time with milliseconds, for Sequence of Events records. */
export const fmtTimeMs = (value: When) => preciseLocal.format(ms(value))
/** UTC with milliseconds; the common time reference across plants (spec 5). */
export const fmtUtcMs = (value: When) => `${preciseUtc.format(ms(value))} UTC`
export const fmtUtcClock = (value: When) => `${utcClock.format(ms(value))} UTC`
export const fmtWeekday = (value: When) => weekday.format(ms(value))
export const fmtDateTime = (value: When) => `${fmtDate(value)}, ${fmtTime(value)}`
/** `2026-09` → `Sep 2026`. */
export const fmtMonth = (key: string) => month.format(Date.parse(`${key}-01T00:00:00Z`))

export function fmtNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function fmtPercent(fraction: number, digits = 0): string {
  return `${fmtNumber(fraction * 100, digits)}%`
}

export function fmtUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${fmtNumber(value / 1_000_000, 2)}M`
  if (Math.abs(value) >= 1_000) return `$${fmtNumber(value / 1_000, 0)}k`
  return `$${fmtNumber(value)}`
}

export function fmtDuration(totalMs: number): string {
  const minutes = Math.max(0, Math.round(totalMs / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

export function fmtAgo(value: When, now = nowMs()): string {
  const seconds = Math.round((now - ms(value)) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86_400)} d ago`
}

import type { ReactNode } from 'react'
import { fmtNumber } from '@gpi/fixtures'
import { cn } from '@gpi/ui'

export type GaugeStatus = 'normal' | 'high' | 'low' | 'unknown'

const STATUS: Record<GaugeStatus, { label: string; pill: string; text: string }> = {
  normal: { label: 'Normal', pill: 'bg-success-soft text-success', text: 'text-success' },
  high: { label: 'Above limit', pill: 'bg-accent-soft text-accent-strong', text: 'text-accent-strong' },
  low: { label: 'Below limit', pill: 'bg-info-soft text-info', text: 'text-info' },
  unknown: { label: 'No reading', pill: 'bg-surface text-muted', text: 'text-muted' },
}

export interface GaugePoint {
  key: string
  name: string
  kind: string
  unit: string
  value: number | null
  min: number
  max: number
  digits?: number
}

export function gaugeStatus({ value, min, max }: Pick<GaugePoint, 'value' | 'min' | 'max'>): GaugeStatus {
  if (value === null) return 'unknown'
  if (value > max) return 'high'
  if (value < min) return 'low'
  return 'normal'
}

const CX = 100
const CY = 100
const R = 72
const polar = (deg: number, r = R) => {
  const rad = (deg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}
const arc = (from: number, to: number) => {
  const a = polar(from)
  const b = polar(to)
  return `M${a.x} ${a.y}A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`
}

/** 270° dial: below the band in info, inside it in success, above it in accent, with an ink needle. */
function RadialGauge({ point }: { point: GaugePoint }) {
  const span = Math.max(10, (point.max - point.min) * 0.25)
  const lo = point.min - span
  const hi = point.max + span
  const angle = (v: number) => 135 + (270 * (Math.min(hi, Math.max(lo, v)) - lo)) / (hi - lo)
  const status = gaugeStatus(point)
  const needle = point.value === null ? null : polar(angle(point.value), 52)
  const value = point.value === null ? 'None' : fmtNumber(point.value, point.digits ?? 0)
  const minLabel = polar(angle(point.min), 50)
  const maxLabel = polar(angle(point.max), 50)
  return (
    <div className="flex w-full max-w-[220px] flex-col items-center">
      <svg
        viewBox="0 0 200 172"
        className="w-full"
        role="img"
        aria-label={`${point.name}: ${value} ${point.unit}, ${STATUS[status].label}`}
      >
        <path d={arc(135, 405)} className="fill-none stroke-border" strokeWidth={16} strokeLinecap="round" />
        <path
          d={arc(135, angle(point.min))}
          className="fill-none stroke-info"
          strokeWidth={16}
          strokeLinecap="round"
        />
        <path
          d={arc(angle(point.min), angle(point.max))}
          className="fill-none stroke-success"
          strokeWidth={16}
        />
        <path
          d={arc(angle(point.max), 405)}
          className="fill-none stroke-accent"
          strokeWidth={16}
          strokeLinecap="round"
        />
        <text
          x={minLabel.x}
          y={minLabel.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-semibold fill-muted text-[11px]"
        >
          {point.min}
        </text>
        <text
          x={maxLabel.x}
          y={maxLabel.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-semibold fill-muted text-[11px]"
        >
          {point.max}
        </text>
        {needle && (
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            className="stroke-ink"
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}
        <circle cx={CX} cy={CY} r={8} className="fill-ink" />
        <circle cx={CX} cy={CY} r={3.5} className="fill-white" />
        <text
          x={CX}
          y={146}
          textAnchor="middle"
          className="font-bold fill-foreground text-[26px] tabular-nums"
        >
          {value}
        </text>
        <text x={CX} y={166} textAnchor="middle" className="font-medium fill-muted text-[12px]">
          {point.unit}
        </text>
      </svg>
      <span className={cn('mt-1 px-3 py-1 text-xs font-semibold rounded-full', STATUS[status].pill)}>
        {STATUS[status].label}
      </span>
    </div>
  )
}

export function SensorPointCard({
  point,
  footer,
  actions,
}: {
  point: GaugePoint
  footer: string
  /** Buttons under the footer, for example the trend and the limit rule. */
  actions?: ReactNode
}) {
  const status = gaugeStatus(point)
  return (
    <div className="p-4 rounded-[22px] bg-card shadow-card">
      <div className="gap-2 flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{point.name}</p>
          <p className="text-xs truncate text-muted">{point.kind}</p>
        </div>
        <span className={cn('text-xs font-semibold shrink-0', STATUS[status].text)}>
          {STATUS[status].label}
        </span>
      </div>
      <div className="mt-3 flex justify-center">
        <RadialGauge point={point} />
      </div>
      <p className="mt-3 pt-3 text-xs border-t border-border text-muted">
        Limits {point.min} to {point.max} {point.unit} · {footer}
      </p>
      {actions && <div className="mt-3 gap-2 flex flex-wrap">{actions}</div>}
    </div>
  )
}

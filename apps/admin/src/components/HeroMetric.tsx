import { cn } from '@gpi/ui'

/** Draft exhaust gas limit from the alarm register, pending approval. */
export const EXHAUST_LIMIT_C = 500

/**
 * A number on an ink hero, with its unit beside it at the baseline. `text` sets a word value
 * (a name, a reading with its limit) smaller so it wraps instead of truncating on a phone.
 */
export function HeroMetric({
  label,
  value,
  unit,
  text = false,
}: {
  label: string
  value: string
  unit?: string
  text?: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-on-ink-muted">{label}</p>
      <p className="mt-1 gap-1.5 flex items-end leading-none">
        <span className={cn('font-bold tabular-nums', text ? 'text-lg leading-snug' : 'text-3xl truncate')}>
          {value}
        </span>
        {unit && <span className="pb-0.5 text-xs font-semibold text-on-ink-muted">{unit}</span>}
      </p>
    </div>
  )
}

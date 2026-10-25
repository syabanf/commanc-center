import { fmtAgo } from '@gpi/fixtures'
import { ALARM_KIND_LABEL, type Alarm } from '@gpi/types'
import { IconTile } from '@gpi/ui'
import { Siren } from 'lucide-react'
import { Link } from 'react-router'
import { plantById, unitById } from '../state/live'
import { PRIORITY_TONE, PriorityBadge } from './badges'
import { paths } from './links'

export function AlarmRow({ alarm, now }: { alarm: Alarm; now: number }) {
  const plant = plantById.get(alarm.plantId)
  const unit = alarm.unitId ? unitById.get(alarm.unitId) : null
  return (
    <Link
      to={paths.alarm(alarm.id)}
      className="gap-3 rounded-2xl p-3 flex items-start bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
    >
      <IconTile size="sm" tone={PRIORITY_TONE[alarm.priority]}>
        <Siren />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="gap-2 flex flex-wrap items-center">
          <span className="text-sm font-semibold">{ALARM_KIND_LABEL[alarm.kind]}</span>
          <PriorityBadge priority={alarm.priority} />
        </span>
        <span className="mt-0.5 text-xs block truncate text-muted">
          {plant?.name}
          {unit ? ` · ${unit.code}` : ''} · {alarm.reading}
        </span>
      </span>
      <span className="font-medium shrink-0 text-[11px] text-muted">{fmtAgo(alarm.raisedAt, now)}</span>
    </Link>
  )
}

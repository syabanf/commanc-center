import type { Freshness } from '@gpi/fixtures'
import {
  ALARM_PRIORITY_LABEL,
  ALARM_STATUS_LABEL,
  AUX_STATE_LABEL,
  type AlarmPriority,
  type AuxState,
  type AlarmStatus,
  LINK_STATE_LABEL,
  type LinkState,
  MILESTONE_STATE_LABEL,
  type MilestoneState,
  PLANT_PHASE_LABEL,
  type PlantPhase,
  SOURCE_STATE_LABEL,
  type SourceState,
  UNIT_STATE_LABEL,
  type UnitState,
} from '@gpi/types'
import { Badge, type BadgeProps, type Tone } from '@gpi/ui'

type Variant = NonNullable<BadgeProps['variant']>

export const PRIORITY_VARIANT: Record<AlarmPriority, Variant> = {
  critical: 'accent',
  high: 'danger',
  medium: 'warning',
  low: 'muted',
}
export const PRIORITY_TONE: Record<AlarmPriority, Tone> = {
  critical: 'danger',
  high: 'danger',
  medium: 'warning',
  low: 'default',
}
const STATUS_VARIANT: Record<AlarmStatus, Variant> = {
  new: 'danger',
  acknowledged: 'warning',
  assigned: 'info',
  resolved: 'success',
  closed: 'muted',
}
const UNIT_VARIANT: Record<UnitState, Variant> = {
  running: 'success',
  standby: 'info',
  tripped: 'danger',
  maintenance: 'warning',
  not_commissioned: 'muted',
}
const PHASE_VARIANT: Record<PlantPhase, Variant> = {
  operating: 'success',
  commissioning: 'info',
  construction: 'warning',
}
const SOURCE_VARIANT: Record<SourceState, Variant> = {
  connected: 'success',
  degraded: 'warning',
  offline: 'danger',
  pending_survey: 'muted',
}
const MILESTONE_VARIANT: Record<MilestoneState, Variant> = {
  done: 'success',
  in_progress: 'info',
  upcoming: 'muted',
  delayed: 'danger',
}

export const PriorityBadge = ({ priority }: { priority: AlarmPriority }) => (
  <Badge variant={PRIORITY_VARIANT[priority]}>{ALARM_PRIORITY_LABEL[priority]}</Badge>
)
export const AlarmStatusBadge = ({ status }: { status: AlarmStatus }) => (
  <Badge variant={STATUS_VARIANT[status]} dot>
    {ALARM_STATUS_LABEL[status]}
  </Badge>
)
export const UnitStateBadge = ({ state }: { state: UnitState }) => (
  <Badge variant={UNIT_VARIANT[state]} dot>
    {UNIT_STATE_LABEL[state]}
  </Badge>
)
export const PhaseBadge = ({ phase }: { phase: PlantPhase }) => (
  <Badge variant={PHASE_VARIANT[phase]}>{PLANT_PHASE_LABEL[phase]}</Badge>
)
export const SourceStateBadge = ({ state }: { state: SourceState }) => (
  <Badge variant={SOURCE_VARIANT[state]} dot>
    {SOURCE_STATE_LABEL[state]}
  </Badge>
)
export const MilestoneBadge = ({ state }: { state: MilestoneState }) => (
  <Badge variant={MILESTONE_VARIANT[state]}>{MILESTONE_STATE_LABEL[state]}</Badge>
)
export const LinkBadge = ({ link }: { link: LinkState }) => (
  <Badge variant={link === 'online' ? 'success' : link === 'degraded' ? 'warning' : 'danger'} dot>
    {LINK_STATE_LABEL[link]}
  </Badge>
)

const AUX_VARIANT: Record<AuxState, Variant> = {
  normal: 'success',
  warning: 'warning',
  alarm: 'danger',
  no_data: 'muted',
  not_integrated: 'muted',
}
export const AuxStateBadge = ({ state }: { state: AuxState }) => (
  <Badge variant={AUX_VARIANT[state]} dot>
    {AUX_STATE_LABEL[state]}
  </Badge>
)

const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: 'Current sample',
  late: 'Late data',
  stale: 'Stale data',
}
/** Stale-data warning (Q22): every live number names how old its sample is. */
export const FreshnessBadge = ({ freshness }: { freshness: Freshness }) => (
  <Badge variant={freshness === 'fresh' ? 'success' : freshness === 'late' ? 'warning' : 'danger'} dot>
    {FRESHNESS_LABEL[freshness]}
  </Badge>
)

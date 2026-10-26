import {
  ALARM_RULES,
  ESCALATION_RULES,
  SCADA_EVENTS,
  assignBlocker,
  closeBlocker,
  escalationDueAt,
  isSuppressed,
  fmtDateTime,
  fmtDuration,
  fmtTime,
  isOpen,
  resolveBlocker,
  toMs,
} from '@gpi/fixtures'
import {
  ALARM_KIND_LABEL,
  ALARM_STATUS_FLOW,
  ALARM_STATUS_LABEL,
  ALARM_VERB_LABEL,
  ESCALATION_LABEL,
  SCADA_EVENT_LABEL,
  type Alarm,
  type AlarmStatus,
} from '@gpi/types'
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  type StepState,
  Steps,
  cn,
} from '@gpi/ui'
import { ArrowRight, MessageSquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { AlarmStatusBadge, PriorityBadge } from '../../components/badges'
import { HeroMetric } from '../../components/HeroMetric'
import { paths } from '../../components/links'
import { NotFoundCard } from '../../components/NotFoundCard'
import { personName, plantById, unitById, useAct, useNow } from '../../state/live'
import { useStore } from '../../state/store'
import { AssignDialog, type TextAction, TextActionDialog } from './dialogs'

type Pending = 'assign' | TextAction | null

const NEXT_LABEL: Partial<Record<AlarmStatus, string>> = {
  new: 'Acknowledge',
  acknowledged: 'Assign owner',
  assigned: 'Resolve',
  resolved: 'Close incident',
}

export function AlarmDetailPage() {
  const { id = '' } = useParams()
  const alarm = useStore().state.alarms.find((a) => a.id === id)
  const { can } = useAuth()
  const act = useAct()
  const now = useNow(30_000)
  const [pending, setPending] = useState<Pending>(null)

  if (!alarm) return <NotFoundCard title="Alarm not found" fallback={paths.alarms()} />
  const plant = plantById.get(alarm.plantId)!
  const unit = alarm.unitId ? unitById.get(alarm.unitId) : null
  const rule = ALARM_RULES.find((r) => r.kind === alarm.kind)
  const dueAt = escalationDueAt(alarm)
  const closedAt = [...alarm.history].reverse().find((e) => e.verb === 'resolved')?.at
  const openFor = (closedAt ? toMs(closedAt) : now) - toMs(alarm.raisedAt)
  const relatedEvents = SCADA_EVENTS.filter(
    (event) =>
      event.plantId === alarm.plantId &&
      (!alarm.unitId || event.unitId === alarm.unitId) &&
      Math.abs(toMs(event.sourceAt) - toMs(alarm.raisedAt)) <= 2 * 60 * 60_000,
  )
    .sort((a, b) => Number(b.firstOut) - Number(a.firstOut) || a.sourceAt.localeCompare(b.sourceAt))
    .slice(0, 3)
  const eventQuery = `?site=${alarm.plantId}${alarm.unitId ? `&unit=${alarm.unitId}` : ''}`

  // The next lifecycle step, shown only to roles that may take it.
  const next: { label: string; run: () => void; blocker: string | null } | null = (() => {
    const label = NEXT_LABEL[alarm.status]
    if (!label) return null
    if (alarm.status === 'new' && can('alarm.acknowledge'))
      return {
        label,
        blocker: null,
        run: () =>
          act(
            { type: 'alarms/acknowledge', id: alarm.id },
            { title: 'Alarm acknowledged', description: `${alarm.code} · ${plant.name}` },
          ),
      }
    if (alarm.status === 'acknowledged' && can('alarm.assign'))
      return { label, blocker: assignBlocker(alarm), run: () => setPending('assign') }
    if (alarm.status === 'assigned' && can('alarm.resolve'))
      return { label, blocker: resolveBlocker(alarm), run: () => setPending('resolve') }
    if (alarm.status === 'resolved' && can('alarm.close'))
      return { label, blocker: closeBlocker(alarm), run: () => setPending('close') }
    return null
  })()
  const waitingOn = !next && isOpen(alarm) ? WAITING[alarm.status] : null

  const flowIndex = ALARM_STATUS_FLOW.indexOf(alarm.status)
  const steps = ALARM_STATUS_FLOW.map((status, i) => {
    const verb = status === 'new' ? 'raised' : status
    const event = [...alarm.history].reverse().find((e) => e.verb === verb)
    const state: StepState =
      i < flowIndex || (status === 'closed' && alarm.status === 'closed')
        ? 'done'
        : i === flowIndex
          ? 'current'
          : 'upcoming'
    return {
      key: status,
      label: ALARM_STATUS_LABEL[status],
      state,
      hint: event ? fmtTime(event.at) : undefined,
    }
  })

  return (
    <div className="space-y-5">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={paths.alarms()} />
        <div className="gap-2 flex flex-wrap items-center">
          {isOpen(alarm) && (can('alarm.acknowledge') || can('alarm.resolve')) && (
            <Button variant="outline" onClick={() => setPending('note')}>
              <MessageSquarePlus />
              Add note
            </Button>
          )}
          {next && (
            <Button onClick={next.run} disabled={next.blocker !== null} title={next.blocker ?? undefined}>
              {next.label}
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>

      {waitingOn && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Waiting on {waitingOn}.</span> Your role can follow this alarm but
          not move it on.
        </Card>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {alarm.code} · {ALARM_KIND_LABEL[alarm.kind]}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{alarm.message}</h1>
            <p className="mt-1 gap-x-2 text-sm flex flex-wrap items-center text-on-ink-muted">
              <Link to={paths.plant(plant.id)} className="font-semibold text-on-ink hover:text-accent">
                {plant.name}
              </Link>
              {unit && (
                <>
                  ·
                  <Link
                    to={paths.unit(plant.id, unit.id)}
                    className="text-xs font-semibold font-mono text-on-ink hover:text-accent"
                  >
                    {unit.code}
                  </Link>
                </>
              )}
              · raised {fmtDateTime(alarm.raisedAt)}
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <PriorityBadge priority={alarm.priority} />
            <AlarmStatusBadge status={alarm.status} />
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric label="Reading" value={alarm.reading} text />
          <HeroMetric label={closedAt ? 'Time to resolve' : 'Open for'} value={fmtDuration(openFor)} text />
          <HeroMetric
            label="Escalation"
            value={`Level ${alarm.escalation} · ${ESCALATION_LABEL[alarm.escalation]}`}
            text
          />
          <HeroMetric label="Owner" value={personName(alarm.assigneeId)} text />
        </div>
        {dueAt !== null && (
          <p
            className={cn(
              'mt-4 rounded-2xl px-3 py-2 text-sm',
              dueAt < now + 10 * 60_000 ? 'bg-accent/20' : 'bg-white/10',
            )}
          >
            Escalates to {ESCALATION_LABEL[(alarm.escalation + 1) as 2 | 3]} at {fmtTime(dueAt)} unless
            someone takes ownership.
          </p>
        )}
        {isSuppressed(alarm) && isOpen(alarm) && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Suppressed: {unit?.code} is out of service for maintenance, so this alarm stays off the counters
            and does not escalate.
          </p>
        )}
        {!isOpen(alarm) && (
          <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
            Read-only record. The Command Center logs actions; it never operates plant equipment.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps steps={steps} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investigate this alarm</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted">
            No approved response procedure is available in this demo. Check the source data and coordinate the
            response with the site crew.
          </p>
          <div className="gap-3 flex flex-wrap">
            {unit && (
              <Button asChild variant="outline" size="sm">
                <Link to={paths.unit(plant.id, unit.id)}>Unit readings</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link
                to={paths.site3D(
                  plant.id,
                  unit
                    ? `unit:${unit.id}`
                    : alarm.kind === 'comms_loss'
                      ? 'link'
                      : alarm.kind === 'low_tank_level' || alarm.kind === 'fuel_imbalance'
                        ? 'tank'
                        : 'export',
                )}
              >
                View equipment in 3D
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={paths.plant(plant.id, 'trend')}>Plant trend</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={paths.events(eventQuery)}>Event sequence</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={paths.dataHealth(alarm.kind === 'comms_loss' ? 'link' : 'sources')}>Data health</Link>
            </Button>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Events within two hours of this alarm
            </p>
            {relatedEvents.length ? (
              <ul className="space-y-3">
                {relatedEvents.map((event) => (
                  <li
                    key={event.id}
                    className="gap-3 rounded-2xl px-4 py-3 text-sm flex items-start bg-surface-2"
                  >
                    <span className="w-14 text-xs shrink-0 font-mono text-muted tabular-nums">
                      {fmtTime(event.sourceAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{SCADA_EVENT_LABEL[event.kind]}</span> · {event.message}
                    </span>
                    {event.firstOut && <Badge variant="danger">First-out</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No matching source event in this window.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              labelWidth="md"
              items={[
                {
                  label: 'Rule',
                  value: rule
                    ? `${rule.condition}${rule.delaySec ? `, after ${rule.delaySec} s` : ''}`
                    : 'None',
                },
                { label: 'Rule status', value: rule?.approved ? 'Approved' : 'Draft, pending O&M approval' },
                { label: 'Plant', value: plant.name },
                { label: 'Unit', value: unit?.code ?? 'Plant level' },
                { label: 'Owner', value: personName(alarm.assigneeId) },
                { label: 'Resolution', value: alarm.resolution ?? 'Not yet' },
                { label: 'Post-incident', value: alarm.postIncident ?? 'Not yet' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Escalation path</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ESCALATION_RULES.map((r) => (
              <div
                key={r.level}
                aria-current={r.level === alarm.escalation ? 'step' : undefined}
                className={cn(
                  'gap-3 rounded-2xl p-3 text-sm flex items-center justify-between',
                  r.level === alarm.escalation ? 'bg-ink text-on-ink' : 'bg-surface-2',
                )}
              >
                <span>
                  <span className="font-semibold block">
                    Level {r.level} · {ESCALATION_LABEL[r.level]}
                  </span>
                  <span
                    className={cn(
                      'text-xs block',
                      r.level === alarm.escalation ? 'text-on-ink-muted' : 'text-muted',
                    )}
                  >
                    {r.owner} · {r.channels}
                  </span>
                </span>
                <span className="text-xs font-semibold shrink-0 tabular-nums">{r.responseMin} min</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">
              Proposed matrix. Owners and response times still need GPI agreement.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {[...alarm.history].reverse().map((event, i) => (
              <li key={i} className="gap-3 flex">
                <span
                  aria-hidden="true"
                  className={cn('mt-1.5 size-2 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-silver')}
                />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{ALARM_VERB_LABEL[event.verb]}</span>
                  <span className="text-muted">
                    {' '}
                    · {personName(event.by)} · {fmtDateTime(event.at)}
                  </span>
                  {event.note && <span className="mt-0.5 block text-body/80">{event.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <AssignDialog
        alarm={alarm}
        open={pending === 'assign'}
        onOpenChange={(open) => !open && setPending(null)}
      />
      <TextActionDialog
        alarm={alarm}
        action={pending === 'assign' ? null : pending}
        onOpenChange={(open) => !open && setPending(null)}
      />
    </div>
  )
}

const WAITING: Partial<Record<Alarm['status'], string>> = {
  new: 'the Command Center operator to acknowledge it',
  acknowledged: 'the Command Center operator to assign an owner',
  assigned: 'the owner to resolve it',
}

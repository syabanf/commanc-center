import { HOUR, PLANTS, fmtAgo, isSuppressed, toMs } from '@gpi/fixtures'
import {
  ALARM_KIND_LABEL,
  ALARM_PRIORITIES,
  ALARM_PRIORITY_LABEL,
  ALARM_STATUS_LABEL,
  ESCALATION_LABEL,
  OPEN_ALARM_STATUSES,
  type Alarm,
  type AlarmKind,
  type AlarmStatus,
  type EscalationLevel,
} from '@gpi/types'
import {
  type Column,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
} from '@gpi/ui'
import { CircleCheck, Download, Search, Siren, UserRoundCheck, Wrench } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { AlarmStatusBadge, PriorityBadge } from '../../components/badges'
import { ActiveFilters, FilterButton, QuickViews } from '../../components/FilterPanel'
import { paths } from '../../components/links'
import { type FilterGroup, type QuickView, useFilters } from '../../lib/use-filters'
import { downloadCsv } from '../../lib/csv'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { useSearchParam } from '../../lib/use-search-param'
import { personName, plantById, unitById, useNow } from '../../state/live'
import { useStore } from '../../state/store'

const STATUS_FILTERS = ['open', 'new', 'acknowledged', 'assigned', 'resolved', 'closed', 'all'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
const RAISED_WITHIN: Record<string, { label: string; ms: number }> = {
  '1h': { label: 'Last hour', ms: HOUR },
  '24h': { label: 'Last 24 h', ms: 24 * HOUR },
  '7d': { label: 'Last 7 days', ms: 7 * 24 * HOUR },
}

const QUICK_VIEWS: QuickView[] = [
  {
    id: 'unowned',
    label: 'Unowned critical and high',
    selection: { priority: ['critical', 'high'], owner: ['unassigned'] },
  },
  { id: 'mine', label: 'Assigned to me', selection: { owner: ['me'] } },
  { id: 'escalated', label: 'Escalated', selection: { level: ['2', '3'] } },
  { id: 'today', label: 'Last 24 h', selection: { raised: ['24h'] } },
  { id: 'comms', label: 'Communication losses', selection: { kind: ['comms_loss'] } },
]

const statusMatches = (a: Alarm, f: StatusFilter) =>
  f === 'all' || (f === 'open' ? OPEN_ALARM_STATUSES.includes(a.status) : a.status === f)

export function AlarmsPage() {
  const { alarms } = useStore().state
  const now = useNow(30_000)
  const navigate = useNavigate()
  const [status, setStatus] = useSearchParam<StatusFilter>('status', 'open', STATUS_FILTERS)
  const [query, setQuery] = useHistoryState('query', '')
  const table = useTableHistory()
  const { user, can } = useAuth()

  const groups: FilterGroup<Alarm>[] = [
    {
      id: 'site',
      label: 'Plant',
      options: PLANTS.map((p) => ({ value: p.id, label: p.name })),
      match: (a, v) => a.plantId === v,
    },
    {
      id: 'priority',
      label: 'Priority',
      options: ALARM_PRIORITIES.map((p) => ({ value: p, label: ALARM_PRIORITY_LABEL[p] })),
      match: (a, v) => a.priority === v,
    },
    {
      id: 'kind',
      label: 'Cause',
      options: (Object.keys(ALARM_KIND_LABEL) as AlarmKind[]).map((k) => ({
        value: k,
        label: ALARM_KIND_LABEL[k],
      })),
      match: (a, v) => a.kind === v,
    },
    {
      id: 'owner',
      label: 'Owner',
      options: [
        { value: 'me', label: 'Assigned to me' },
        { value: 'unassigned', label: 'Unassigned' },
        { value: 'others', label: 'Assigned to others' },
      ],
      match: (a, v) =>
        v === 'me'
          ? a.assigneeId === user.id
          : v === 'unassigned'
            ? !a.assigneeId
            : !!a.assigneeId && a.assigneeId !== user.id,
    },
    {
      id: 'level',
      label: 'Escalation',
      options: ([1, 2, 3] as EscalationLevel[]).map((l) => ({
        value: String(l),
        label: `Level ${l} · ${ESCALATION_LABEL[l]}`,
      })),
      match: (a, v) => String(a.escalation) === v,
    },
    {
      id: 'suppression',
      label: 'Out of service',
      options: [{ value: 'suppressed', label: 'Show suppressed alarms' }],
      match: (a) => isSuppressed(a),
    },
    {
      id: 'raised',
      label: 'Raised',
      options: Object.entries(RAISED_WITHIN).map(([value, r]) => ({ value, label: r.label })),
      match: (a, v) => now - toMs(a.raisedAt) <= RAISED_WITHIN[v]!.ms,
    },
  ]

  const q = query.trim().toLowerCase()
  const searched = alarms.filter(
    (a) =>
      !q ||
      `${a.code} ${a.message} ${a.reading} ${plantById.get(a.plantId)?.name} ${a.unitId ? unitById.get(a.unitId)?.code : ''}`
        .toLowerCase()
        .includes(q),
  )
  const inStatus = searched.filter((a) => statusMatches(a, status))
  const filters = useFilters(inStatus, groups)
  // Spec 4.2: alarms from equipment out of service stay hidden until someone asks for them.
  const showSuppressed = filters.selected.suppression!.length > 0
  const visible = showSuppressed ? filters.rows : filters.rows.filter((a) => !isSuppressed(a))
  const suppressedCount = inStatus.filter((a) => filters.matches(a) && isSuppressed(a)).length
  // Spec 4.2: alarm reports by plant, equipment, priority and period, from the current filters.
  const exportCsv = () =>
    downloadCsv(
      'gpi-alarms.csv',
      [
        'Code',
        'Raised (UTC)',
        'Plant',
        'Unit',
        'Cause',
        'Priority',
        'Status',
        'Owner',
        'Escalation level',
        'Reading',
      ],
      visible.map((a) => [
        a.code,
        a.raisedAt,
        plantById.get(a.plantId)?.name ?? '',
        a.unitId ? (unitById.get(a.unitId)?.code ?? '') : '',
        ALARM_KIND_LABEL[a.kind],
        ALARM_PRIORITY_LABEL[a.priority],
        ALARM_STATUS_LABEL[a.status],
        personName(a.assigneeId),
        a.escalation,
        a.reading,
      ]),
    )
  const count = (s: AlarmStatus) =>
    searched.filter((a) => a.status === s && filters.matches(a) && (showSuppressed || !isSuppressed(a)))
      .length
  const tile = (s: AlarmStatus) => () => setStatus(status === s ? 'open' : s)

  const columns: Column<Alarm>[] = [
    {
      id: 'code',
      header: 'Alarm',
      sortValue: (a) => a.code,
      cell: (a) => (
        <button
          type="button"
          className="text-left focus-visible:outline-none"
          onClick={() => navigate(paths.alarm(a.id))}
        >
          <span className="text-xs block font-mono text-muted">{a.code}</span>
          <span className="gap-1.5 flex flex-wrap items-center">
            <span className="font-semibold">{ALARM_KIND_LABEL[a.kind]}</span>
            {isSuppressed(a) && <Badge variant="muted">Suppressed</Badge>}
          </span>
          <span className="max-w-xs text-xs block truncate text-muted">{a.reading}</span>
        </button>
      ),
    },
    {
      id: 'plant',
      header: 'Plant',
      hideBelow: 'md',
      sortValue: (a) => plantById.get(a.plantId)?.name ?? '',
      cell: (a) => (
        <span>
          {plantById.get(a.plantId)?.name}
          {a.unitId && (
            <span className="text-xs block font-mono text-muted">{unitById.get(a.unitId)?.code}</span>
          )}
        </span>
      ),
    },
    {
      id: 'priority',
      header: 'Priority',
      sortValue: (a) => ALARM_PRIORITIES.indexOf(a.priority),
      cell: (a) => <PriorityBadge priority={a.priority} />,
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (a) => a.status,
      cell: (a) => <AlarmStatusBadge status={a.status} />,
    },
    {
      id: 'owner',
      header: 'Owner',
      hideBelow: 'lg',
      sortValue: (a) => personName(a.assigneeId),
      cell: (a) => (
        <span>
          {personName(a.assigneeId)}
          <span className="text-xs block text-muted">
            Level {a.escalation} · {ESCALATION_LABEL[a.escalation]}
          </span>
        </span>
      ),
    },
    {
      id: 'raised',
      header: 'Raised',
      align: 'right',
      sortValue: (a) => a.raisedAt,
      cell: (a) => <span className="whitespace-nowrap text-muted">{fmtAgo(a.raisedAt, now)}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Alarms"
        description="Acknowledge, assign and resolve plant alarms, and review closed incidents with their post-incident notes."
        actions={
          can('report.export') && (
            <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
              <Download />
              Export CSV
            </Button>
          )
        }
      />
      <div className="mb-4 gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Not acknowledged"
          value={count('new')}
          icon={<Siren />}
          tone={count('new') ? 'danger' : 'success'}
          onClick={tile('new')}
          hint="Waiting for the Command Center"
        />
        <StatCard
          label="Acknowledged"
          value={count('acknowledged')}
          icon={<UserRoundCheck />}
          tone="warning"
          onClick={tile('acknowledged')}
          hint="No owner yet"
        />
        <StatCard
          label="Assigned"
          value={count('assigned')}
          icon={<Wrench />}
          tone="info"
          onClick={tile('assigned')}
          hint="Site crews working on it"
        />
        <StatCard
          label="Resolved"
          value={count('resolved')}
          icon={<CircleCheck />}
          tone="success"
          onClick={tile('resolved')}
          hint="Waiting to be closed"
        />
      </div>
      <div className="mb-4 gap-2 flex flex-wrap items-center">
        <Input
          className="sm:w-72 w-full"
          variant="pill"
          leftIcon={<Search />}
          placeholder="Search code, message, unit or plant"
          aria-label="Search alarms"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <NativeSelect
          className="sm:w-44 w-full"
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          options={STATUS_FILTERS.map((s) => ({
            value: s,
            label: s === 'open' ? 'Open' : s === 'all' ? 'Any status' : ALARM_STATUS_LABEL[s],
          }))}
        />
        <FilterButton filters={filters} total={inStatus.length} />
      </div>
      <div className="mb-4 space-y-3">
        <QuickViews filters={filters} views={QUICK_VIEWS} />
        <ActiveFilters filters={filters} />
        {!showSuppressed && suppressedCount > 0 && (
          <p className="text-xs text-muted">
            {suppressedCount} {suppressedCount === 1 ? 'alarm' : 'alarms'} from equipment out of service{' '}
            {suppressedCount === 1 ? 'is' : 'are'} suppressed.{' '}
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto"
              onClick={() => filters.toggle('suppression', 'suppressed')}
            >
              Show
            </Button>
          </p>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        getRowKey={(a) => a.id}
        onRowClick={(a) => navigate(paths.alarm(a.id))}
        initialSort={{ id: 'raised', desc: true }}
        pageSize={15}
        resetPageKey={`${status}|${filters.key}|${q}`}
        empty={
          <EmptyState
            icon={<CircleCheck />}
            title="No alarms match"
            description="Change the filters, or wait for the sites to report new events."
            action={
              filters.activeCount ? (
                <Button variant="outline" onClick={filters.clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
        {...table}
      />
    </div>
  )
}

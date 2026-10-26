import {
  PLANTS,
  SCADA_EVENTS,
  UNITS,
  SPEC,
  fmtDate,
  fmtDuration,
  fmtTimeMs,
  fmtUtcMs,
  isBackfilled,
  toMs,
} from '@gpi/fixtures'
import {
  EQUIPMENT_GROUP_LABEL,
  type EquipmentGroup,
  SCADA_EVENT_LABEL,
  type ScadaEvent,
  type ScadaEventKind,
} from '@gpi/types'
import { Badge, Button, type Column, DataTable, EmptyState, Input, PageHeader, StatCard } from '@gpi/ui'
import { Box, CircleCheck, Download, History, ListOrdered, Search, Zap } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ActiveFilters, FilterButton, QuickViews } from '../../components/FilterPanel'
import { paths } from '../../components/links'
import { downloadCsv } from '../../lib/csv'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { type FilterGroup, type QuickView, useFilters } from '../../lib/use-filters'
import { plantById } from '../../state/live'

const delayOf = (e: ScadaEvent) => toMs(e.receivedAt) - toMs(e.sourceAt)
const fmtDelay = (ms: number) => (ms < 60_000 ? `+${(ms / 1000).toFixed(1)} s` : `+${fmtDuration(ms)}`)

const GROUPS: FilterGroup<ScadaEvent>[] = [
  {
    id: 'site',
    label: 'Plant',
    options: PLANTS.map((p) => ({ value: p.id, label: p.name })),
    match: (e, v) => e.plantId === v,
  },
  {
    id: 'unit',
    label: 'Unit',
    options: UNITS.map((u) => ({ value: u.id, label: u.code })),
    match: (e, v) => e.unitId === v,
  },
  {
    id: 'group',
    label: 'Equipment',
    options: (Object.keys(EQUIPMENT_GROUP_LABEL) as EquipmentGroup[]).map((g) => ({
      value: g,
      label: EQUIPMENT_GROUP_LABEL[g],
    })),
    match: (e, v) => e.group === v,
  },
  {
    id: 'kind',
    label: 'Event',
    options: (Object.keys(SCADA_EVENT_LABEL) as ScadaEventKind[]).map((k) => ({
      value: k,
      label: SCADA_EVENT_LABEL[k],
    })),
    match: (e, v) => e.kind === v,
  },
  {
    id: 'delivery',
    label: 'Delivery',
    options: [
      { value: 'live', label: 'Arrived live' },
      { value: 'backfilled', label: 'Back-filled after an outage' },
    ],
    match: (e, v) => (v === 'backfilled') === isBackfilled(e),
  },
  {
    id: 'firstout',
    label: 'Trip sequences',
    options: [{ value: 'yes', label: 'First-out only' }],
    match: (e) => e.firstOut,
  },
]

const QUICK_VIEWS: QuickView[] = [
  { id: 'trips', label: 'Protection trips', selection: { kind: ['protection_trip'] } },
  { id: 'breakers', label: 'Breaker operations', selection: { kind: ['breaker_open', 'breaker_close'] } },
  { id: 'firstout', label: 'First-out', selection: { firstout: ['yes'] } },
  { id: 'backfilled', label: 'Back-filled', selection: { delivery: ['backfilled'] } },
  { id: 'link', label: 'Starlink link', selection: { group: ['communication'] } },
]

export function EventsPage() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [query, setQuery] = useHistoryState('query', '')
  const table = useTableHistory()
  const q = query.trim().toLowerCase()
  const searched = SCADA_EVENTS.filter(
    (e) => !q || `${e.tag} ${e.message} ${plantById.get(e.plantId)?.name}`.toLowerCase().includes(q),
  )
  const filters = useFilters(searched, GROUPS)
  const open = (e: ScadaEvent) =>
    navigate(e.unitId ? paths.unit(e.plantId, e.unitId) : paths.plant(e.plantId, 'sld'))

  const exportCsv = () =>
    downloadCsv(
      `gpi-events-${fmtDate(Date.now()).replace(/ /g, '-')}.csv`,
      ['Source time (UTC)', 'Received (UTC)', 'Plant', 'Tag', 'Equipment', 'Event', 'Message', 'First-out'],
      filters.rows.map((e) => [
        e.sourceAt,
        e.receivedAt,
        plantById.get(e.plantId)!.name,
        e.tag,
        EQUIPMENT_GROUP_LABEL[e.group],
        SCADA_EVENT_LABEL[e.kind],
        e.message,
        e.firstOut ? 'yes' : '',
      ]),
    )

  const columns: Column<ScadaEvent>[] = [
    {
      id: 'source',
      header: 'Source time',
      sortValue: (e) => e.sourceAt,
      cell: (e) => (
        <button type="button" className="text-left focus-visible:outline-none" onClick={() => open(e)}>
          <span className="text-xs font-semibold block font-mono tabular-nums">{fmtTimeMs(e.sourceAt)}</span>
          <span className="block font-mono text-[11px] text-muted tabular-nums">{fmtUtcMs(e.sourceAt)}</span>
        </button>
      ),
    },
    {
      id: 'event',
      header: 'Event',
      sortValue: (e) => e.kind,
      cell: (e) => (
        <span className="block">
          <span className="gap-1.5 flex flex-wrap items-center">
            <span className="font-semibold">{SCADA_EVENT_LABEL[e.kind]}</span>
            {e.firstOut && <Badge variant="danger">First-out</Badge>}
          </span>
          <span className="max-w-md text-xs block text-muted">{e.message}</span>
        </span>
      ),
    },
    {
      id: 'plant',
      header: 'Plant',
      hideBelow: 'md',
      sortValue: (e) => plantById.get(e.plantId)!.name,
      cell: (e) => (
        <span>
          {plantById.get(e.plantId)!.name}
          <span className="text-xs block text-muted">{EQUIPMENT_GROUP_LABEL[e.group]}</span>
        </span>
      ),
    },
    {
      id: 'tag',
      header: 'Tag',
      hideBelow: 'sm',
      sortValue: (e) => e.tag,
      cell: (e) => <span className="text-xs font-mono">{e.tag}</span>,
    },
    {
      id: 'delivery',
      header: 'Arrived',
      align: 'right',
      hideBelow: 'lg',
      sortValue: delayOf,
      cell: (e) =>
        isBackfilled(e) ? (
          <span className="gap-1 inline-flex flex-col items-end">
            <Badge variant="warning">Back-filled</Badge>
            <span className="text-xs text-muted tabular-nums">{fmtDelay(delayOf(e))}</span>
          </span>
        ) : (
          <span className="text-xs text-muted tabular-nums">{fmtDelay(delayOf(e))}</span>
        ),
    },
    {
      id: 'replay',
      header: <span className="sr-only">Replay</span>,
      align: 'right',
      cell: (e) => (
        <Button
          size="sm"
          variant="outline"
          aria-label={`Replay ${e.tag} in 3D`}
          onClick={(ev) => {
            ev.stopPropagation()
            navigate(paths.replay(e.plantId, e.id))
          }}
        >
          <Box />
          <span className="lg:inline hidden">Replay in 3D</span>
        </Button>
      ),
    },
  ]

  const count = (pred: (e: ScadaEvent) => boolean) =>
    searched.filter((e) => filters.matches(e) && pred(e)).length

  return (
    <div>
      <PageHeader
        title="Events"
        description={`Sequence of Events from every plant, time-stamped at the source device to ${SPEC.soeResolutionMs} ms and kept in order when a link drops.`}
        actions={
          can('report.export') && (
            <Button variant="outline" onClick={exportCsv} disabled={!filters.rows.length}>
              <Download />
              Export CSV
            </Button>
          )
        }
      />
      <div className="mb-4 gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Events"
          value={count(() => true)}
          icon={<ListOrdered />}
          hint="Last 26 hours"
          onClick={filters.clear}
        />
        <StatCard
          label="Protection trips"
          value={count((e) => e.kind === 'protection_trip')}
          icon={<Zap />}
          tone="danger"
          hint="Relay operations"
          onClick={() => filters.apply({ kind: ['protection_trip'] })}
        />
        <StatCard
          label="First-out events"
          value={count((e) => e.firstOut)}
          icon={<CircleCheck />}
          tone="warning"
          hint="Where each trip began"
          onClick={() => filters.apply({ firstout: ['yes'] })}
        />
        <StatCard
          label="Back-filled"
          value={count(isBackfilled)}
          icon={<History />}
          tone="info"
          hint="Arrived after a link outage"
          onClick={() => filters.apply({ delivery: ['backfilled'] })}
        />
      </div>
      <div className="mb-4 gap-2 flex flex-wrap items-center">
        <Input
          className="sm:w-80 w-full"
          variant="pill"
          leftIcon={<Search />}
          placeholder="Search tag, message or plant"
          aria-label="Search events"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterButton filters={filters} total={searched.length} />
      </div>
      <div className="mb-4 space-y-3">
        <QuickViews filters={filters} views={QUICK_VIEWS} />
        <ActiveFilters filters={filters} />
      </div>
      <DataTable
        columns={columns}
        rows={filters.rows}
        getRowKey={(e) => e.id}
        onRowClick={open}
        initialSort={{ id: 'source', desc: true }}
        pageSize={20}
        resetPageKey={`${filters.key}|${q}`}
        empty={
          <EmptyState
            icon={<CircleCheck />}
            title="No events match"
            description="Change the filters or the search."
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
      <p className="mt-3 text-xs text-muted">
        Times show Khobar local time with UTC below, the common reference for all plants. Protection relays
        and generator controllers stamp events via PTP or IRIG-B; a back-filled event keeps its original
        source time.
      </p>
    </div>
  )
}

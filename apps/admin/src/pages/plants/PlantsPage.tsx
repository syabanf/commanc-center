import { PLANTS, UNITS, fmtAgo, fmtNumber, fmtPercent, plantTrend } from '@gpi/fixtures'
import { LINK_STATE_LABEL, REGION_LABEL, type LinkState, type Plant, type Region } from '@gpi/types'
import {
  Chip,
  ChipRow,
  type Column,
  DataTable,
  Input,
  PageHeader,
  ProgressBar,
  Sparkline,
  StatCard,
} from '@gpi/ui'
import { Factory, HardHat, RadioTower, Search, Wrench } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { FreshnessBadge, LinkBadge, PhaseBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { ActiveFilters, FilterButton } from '../../components/FilterPanel'
import { useHistoryState, useTableHistory } from '../../lib/history-state'
import { type FilterGroup, useFilters } from '../../lib/use-filters'
import { useLive } from '../../state/live'

type Filter = 'all' | 'operating' | 'commissioning' | 'construction' | 'late'

const PLANT_FILTERS: FilterGroup<Plant>[] = [
  {
    id: 'region',
    label: 'Region',
    options: (Object.keys(REGION_LABEL) as Region[]).map((r) => ({ value: r, label: REGION_LABEL[r] })),
    match: (p, v) => p.region === v,
  },
  {
    id: 'link',
    label: 'Site link',
    options: (Object.keys(LINK_STATE_LABEL) as LinkState[]).map((l) => ({
      value: l,
      label: LINK_STATE_LABEL[l],
    })),
    match: (p, v) => p.link === v,
  },
  {
    id: 'size',
    label: 'Planned capacity',
    options: [
      { value: 'small', label: 'Up to 40 MW' },
      { value: 'mid', label: '41 to 60 MW' },
      { value: 'large', label: 'Over 60 MW' },
    ],
    match: (p, v) =>
      v === 'small'
        ? p.capacityMw <= 40
        : v === 'mid'
          ? p.capacityMw > 40 && p.capacityMw <= 60
          : p.capacityMw > 60,
  },
]

export function PlantsPage() {
  const { now, byPlant } = useLive()
  const navigate = useNavigate()
  const [filter, setFilter] = useHistoryState<Filter>('filter', 'all')
  const table = useTableHistory()
  const [query, setQuery] = useHistoryState('query', '')
  const q = query.trim().toLowerCase()
  const searched = PLANTS.filter(
    (p) => !q || `${p.name} ${p.code} ${p.contractor} ${REGION_LABEL[p.region]}`.toLowerCase().includes(q),
  )
  const filters = useFilters(searched, PLANT_FILTERS)
  const trends = useMemo(
    () => new Map(PLANTS.map((p) => [p.id, plantTrend(p, UNITS, now).map((t) => t.mw)])),
    [now],
  )

  const isLate = (p: Plant) => byPlant.get(p.id)!.freshness !== 'fresh'
  const matches = (p: Plant, f: Filter) => f === 'all' || (f === 'late' ? isLate(p) : p.phase === f)
  const count = (f: Filter) => filters.rows.filter((p) => matches(p, f)).length
  const rows = filters.rows.filter((p) => matches(p, filter))
  const toggle = (f: Filter) => setFilter(filter === f ? 'all' : f)

  const columns: Column<Plant>[] = [
    {
      id: 'plant',
      header: 'Plant',
      sortValue: (p) => p.name,
      cell: (p) => (
        <button
          type="button"
          className="text-left focus-visible:outline-none"
          onClick={() => navigate(paths.plant(p.id))}
        >
          <span className="font-semibold block">{p.name}</span>
          <span className="text-xs block font-mono text-muted">
            {p.code} · {REGION_LABEL[p.region]}
          </span>
        </button>
      ),
    },
    {
      id: 'phase',
      header: 'Phase',
      sortValue: (p) => p.phase,
      cell: (p) => <PhaseBadge phase={p.phase} />,
      hideBelow: 'sm',
    },
    {
      id: 'output',
      header: 'Output',
      align: 'right',
      sortValue: (p) => byPlant.get(p.id)!.mw,
      cell: (p) => {
        const r = byPlant.get(p.id)!
        return (
          <span className="min-w-28 gap-1 inline-flex flex-col items-end">
            <span className="font-semibold tabular-nums">
              {fmtNumber(r.mw, 1)} <span className="text-muted">/ {p.capacityMw} MW</span>
            </span>
            <ProgressBar value={r.mw / p.capacityMw} size="xs" aria-label={`${p.name} output`} />
          </span>
        )
      },
    },
    {
      id: 'trend',
      header: 'Last 24 h',
      hideBelow: 'xl',
      cell: (p) => (
        <Sparkline
          data={trends.get(p.id)!}
          height={32}
          area
          className="w-28"
          format={(v) => `${fmtNumber(v, 1)} MW`}
          ariaLabel={`${p.name} output over the last 24 hours`}
        />
      ),
    },
    {
      id: 'units',
      header: 'Units running',
      align: 'right',
      hideBelow: 'md',
      sortValue: (p) => byPlant.get(p.id)!.running,
      cell: (p) => {
        const r = byPlant.get(p.id)!
        return (
          <span className="tabular-nums">
            {r.commissioned ? `${r.running} of ${r.commissioned}` : 'None commissioned'}
          </span>
        )
      },
    },
    {
      id: 'tank',
      header: 'HFO tank',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (p) => byPlant.get(p.id)!.tankLevel,
      cell: (p) => {
        const level = byPlant.get(p.id)!.tankLevel
        return (
          <span
            className={
              level > 0 && level < 0.25 ? 'font-semibold text-accent-strong tabular-nums' : 'tabular-nums'
            }
          >
            {level ? fmtPercent(level) : 'Empty'}
          </span>
        )
      },
    },
    {
      id: 'link',
      header: 'Link',
      hideBelow: 'md',
      sortValue: (p) => p.link,
      cell: (p) => <LinkBadge link={p.link} />,
    },
    {
      id: 'sample',
      header: 'Latest sample',
      sortValue: (p) => byPlant.get(p.id)!.ageMs,
      cell: (p) => {
        const r = byPlant.get(p.id)!
        return (
          <span className="gap-1 flex flex-col items-start">
            <FreshnessBadge freshness={r.freshness} />
            <span className="text-xs text-muted">{fmtAgo(r.sampledAt, now)}</span>
          </span>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Plants"
        description="Compare the five Yemen sites and open one to see its units, fuel and data sources."
      />
      <div className="mb-4 gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Operating"
          value={count('operating')}
          icon={<Factory />}
          tone="success"
          onClick={() => toggle('operating')}
          hint={filter === 'operating' ? 'Filter on' : 'Show only these'}
        />
        <StatCard
          label="Commissioning"
          value={count('commissioning')}
          icon={<Wrench />}
          tone="info"
          onClick={() => toggle('commissioning')}
          hint={filter === 'commissioning' ? 'Filter on' : 'Show only these'}
        />
        <StatCard
          label="Construction"
          value={count('construction')}
          icon={<HardHat />}
          tone="warning"
          onClick={() => toggle('construction')}
          hint={filter === 'construction' ? 'Filter on' : 'Show only these'}
        />
        <StatCard
          label="Reporting late"
          value={count('late')}
          icon={<RadioTower />}
          tone={count('late') ? 'danger' : 'success'}
          onClick={() => toggle('late')}
          hint={filter === 'late' ? 'Filter on' : 'Sample older than 15 s'}
        />
      </div>
      <div className="mb-4 gap-2 flex flex-wrap items-center">
        <Input
          className="sm:w-72 w-full"
          variant="pill"
          leftIcon={<Search />}
          placeholder="Search plant, code or contractor"
          aria-label="Search plants"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <FilterButton filters={filters} total={searched.length} />
      </div>
      <ActiveFilters filters={filters} className="mb-4" />
      <ChipRow className="mb-4">
        {(['all', 'operating', 'commissioning', 'construction', 'late'] as Filter[]).map((f) => (
          <Chip key={f} variant="filter" active={filter === f} count={count(f)} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All plants' : f === 'late' ? 'Reporting late' : f[0]!.toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </ChipRow>
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(p) => p.id}
        onRowClick={(p) => navigate(paths.plant(p.id))}
        pageSize={0}
        resetPageKey={`${filter}|${filters.key}|${q}`}
        {...table}
      />
      <p className="mt-3 text-xs text-muted">
        Phases are as reported by the project team and wait for a signed site status report. Capacities are
        planned targets.
      </p>
    </div>
  )
}

import {
  AUX_SYSTEMS,
  LATE_MS,
  UNITS,
  fmtAgo,
  fmtDuration,
  fmtNumber,
  fmtPercent,
  fmtTime,
  isOpen,
  plantTrend,
} from '@gpi/fixtures'
import type { PlantReading, UnitReading } from '@gpi/fixtures'
import { AUX_SYSTEM_LABEL, LINK_STATE_LABEL, REGION_LABEL, type Unit } from '@gpi/types'
import {
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  CountBadge,
  DataTable,
  EmptyState,
  KeyValue,
  LineChart,
  ProgressBar,
  UnderlineTabs,
  cn,
  SegmentedControl,
} from '@gpi/ui'
import { Cctv, CircleCheck, HardHat, Siren } from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { AlarmRow } from '../../components/AlarmRow'
import { BackButton } from '../../components/BackButton'
import { EXHAUST_LIMIT_C, HeroMetric } from '../../components/HeroMetric'
import {
  AuxStateBadge,
  FreshnessBadge,
  PhaseBadge,
  SourceStateBadge,
  UnitStateBadge,
} from '../../components/badges'
import { paths } from '../../components/links'
import { InsightsCard } from '../../components/InsightList'
import { NotFoundCard } from '../../components/NotFoundCard'
import { useSearchParam } from '../../lib/use-search-param'
import { useInsights } from '../../state/insights'
import { plantById, sourcesOf, unitsOf, useLive } from '../../state/live'
import { useStore } from '../../state/store'
import { SingleLine } from './SingleLine'
import { SitePlan } from './SitePlan'

const TABS = ['plan', 'sld', 'units', 'electrical', 'aux', 'fuel', 'trend', 'sources'] as const
type Tab = (typeof TABS)[number]
const PLAN_VIEWS = ['2d', '3d'] as const
type PlanView = (typeof PLAN_VIEWS)[number]
/** Three.js loads only when someone opens the 3D view. */
const Site3D = lazy(() => import('./Site3D').then((m) => ({ default: m.Site3D })))

export function PlantDetailPage() {
  const { id = '' } = useParams()
  const plant = plantById.get(id)
  const { now, byPlant } = useLive()
  const { alarms } = useStore().state
  const navigate = useNavigate()
  const { hash } = useLocation()
  const insights = useInsights()
  const [tab, setTab] = useSearchParam<Tab>('tab', 'plan', TABS)
  const [planView, setPlanView] = useSearchParam<PlanView>('view', '2d', PLAN_VIEWS)
  const trend = useMemo(() => (plant ? plantTrend(plant, UNITS, now) : []), [plant, now])

  useEffect(() => {
    if (hash !== '#site-view') return
    const frame = requestAnimationFrame(() => document.getElementById('site-view')?.scrollIntoView())
    return () => cancelAnimationFrame(frame)
  }, [hash])

  if (!plant) return <NotFoundCard title="Plant not found" fallback={paths.plants} />
  const reading = byPlant.get(plant.id)!
  const units = unitsOf(plant.id)
  const open = alarms.filter((a) => a.plantId === plant.id && isOpen(a))
  const sources = sourcesOf(plant.id)

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={paths.plants} />
        <div className="gap-2 flex flex-wrap items-center">
          <Button variant="outline" onClick={() => navigate(paths.cctv(plant.id))}>
            <Cctv />
            Cameras
          </Button>
          <Button variant="outline" onClick={() => navigate(paths.project(plant.id))}>
            <HardHat />
            Project
          </Button>
          {open.length > 0 && (
            <Button onClick={() => navigate(paths.alarms(`?site=${plant.id}`))}>
              <Siren />
              {open.length} open {open.length === 1 ? 'alarm' : 'alarms'}
            </Button>
          )}
        </div>
      </div>

      {reading.ageMs > LATE_MS && (
        <Banner
          tone={reading.freshness === 'stale' ? 'danger' : 'warning'}
          title={`Data from ${plant.name} is ${reading.ageMs < 60_000 ? `${Math.round(reading.ageMs / 1000)} s` : fmtDuration(reading.ageMs)} old`}
        >
          {plant.link === 'offline'
            ? 'The site link stopped reporting. Values below are from the last sample and do not reflect the plant now.'
            : `Starlink round trip is ${fmtNumber(plant.latencyMs)} ms, so samples arrive late. Treat values as approximate.`}
        </Banner>
      )}

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {plant.code} · {REGION_LABEL[plant.region]}, Yemen · {plant.contractor}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{plant.name}</h1>
            <p className="mt-1 text-sm text-on-ink-muted">
              {plant.capacityMw} MW planned · {units.length} × {units[0]?.ratingMw} MW HFO engines · link{' '}
              {LINK_STATE_LABEL[plant.link].toLowerCase()}
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <PhaseBadge phase={plant.phase} />
            <FreshnessBadge freshness={reading.freshness} />
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric label="Output" value={fmtNumber(reading.mw, 1)} unit="MW" />
          <HeroMetric label="Available" value={fmtNumber(reading.availableMw)} unit="MW" />
          <HeroMetric
            label="Units running"
            value={reading.commissioned ? `${reading.running}/${reading.commissioned}` : 'None'}
            unit={reading.commissioned ? 'commissioned' : ''}
          />
          <HeroMetric
            label="Frequency"
            value={reading.frequencyHz ? fmtNumber(reading.frequencyHz, 2) : 'None'}
            unit={reading.frequencyHz ? 'Hz' : ''}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1.5 text-xs flex items-center justify-between text-on-ink-muted">
            <span>Output against planned capacity</span>
            <span className="tabular-nums">{fmtPercent(reading.mw / plant.capacityMw)}</span>
          </div>
          <ProgressBar
            value={reading.mw / plant.capacityMw}
            tone="white"
            aria-label="Output against planned capacity"
          />
        </div>
        <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm">
          Read-only view. Sample taken {fmtTime(reading.sampledAt)}, {fmtAgo(reading.sampledAt, now)}. Phase
          as reported, pending a signed site status report.
        </p>
      </Card>

      <InsightsCard
        title={`Insights for ${plant.name}`}
        description="Findings from this plant's live readings and its last 30 days."
        insights={insights.filter((i) => i.plantId === plant.id)}
      />

      <Card id="site-view">
        <UnderlineTabs
          className="px-5 pt-2"
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          items={[
            { value: 'plan', label: 'Site plan' },
            { value: 'sld', label: 'Single line' },
            { value: 'units', label: 'Units', count: units.length },
            { value: 'electrical', label: 'Electrical' },
            { value: 'aux', label: 'Auxiliaries' },
            { value: 'fuel', label: 'Fuel' },
            { value: 'trend', label: '24 h trend' },
            { value: 'sources', label: 'Data sources', count: sources.length },
          ]}
        />
        <div className="p-5">
          {tab === 'plan' && (
            <div className="space-y-4">
              <SegmentedControl
                aria-label="Site plan view"
                size="sm"
                value={planView}
                onChange={(v) => setPlanView(v as PlanView)}
                options={[
                  { value: '2d', label: '2D plan' },
                  { value: '3d', label: '3D view' },
                ]}
              />
              {planView === '2d' ? (
                <SitePlan plant={plant} reading={reading} now={now} />
              ) : (
                <Suspense
                  fallback={
                    <div className="sm:aspect-[16/9] rounded-2xl animate-pulse aspect-[4/3] bg-surface-2" />
                  }
                >
                  <Site3D plant={plant} reading={reading} />
                </Suspense>
              )}
            </div>
          )}
          {tab === 'units' && <UnitsTable units={units} reading={reading} plantId={plant.id} />}
          {tab === 'sld' && <SingleLine plant={plant} reading={reading} />}
          {tab === 'electrical' && <ElectricalPanel reading={reading} />}
          {tab === 'aux' && <AuxPanel plantId={plant.id} />}
          {tab === 'fuel' && <FuelPanel reading={reading} tankCapacityM3={plant.tankCapacityM3} />}
          {tab === 'trend' &&
            (reading.commissioned ? (
              <LineChart
                data={trend.map((t) => ({ label: fmtTime(t.at), value: t.mw }))}
                area
                height={240}
                format={(v) => `${fmtNumber(v, 1)} MW`}
                referenceLines={[{ value: reading.availableMw, label: 'Available', tone: 'muted' }]}
                ariaLabel={`${plant.name} output over the last 24 hours`}
              />
            ) : (
              <EmptyState
                compact
                title="No generation yet"
                description="The trend starts when the first unit is commissioned."
              />
            ))}
          {tab === 'sources' && (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="gap-2 rounded-2xl p-3 flex flex-wrap items-start justify-between bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-semibold block">{s.name}</span>
                    <span className="text-xs block text-muted">{s.note}</span>
                    <span className="mt-1 text-xs block font-mono text-muted">{s.protocol}</span>
                  </span>
                  <SourceStateBadge state={s.state} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          action={
            <Button variant="outline" size="sm" onClick={() => navigate(paths.alarms(`?site=${plant.id}`))}>
              View all
            </Button>
          }
        >
          <CardTitle className="gap-2 flex items-center">
            Open alarms <CountBadge count={open.length} />
          </CardTitle>
          <CardDescription>Everything not resolved yet at {plant.name}.</CardDescription>
        </CardHeader>
        <CardContent className="gap-2 md:grid-cols-2 grid grid-cols-1">
          {open.length === 0 ? (
            <EmptyState
              compact
              className="md:col-span-2"
              icon={<CircleCheck />}
              title="No open alarms at this plant"
            />
          ) : (
            open.map((alarm) => <AlarmRow key={alarm.id} alarm={alarm} now={now} />)
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function UnitsTable({ units, reading, plantId }: { units: Unit[]; reading: PlantReading; plantId: string }) {
  const navigate = useNavigate()
  const live = new Map<string, UnitReading>(reading.units.map((u) => [u.unitId, u]))
  const columns: Column<Unit>[] = [
    {
      id: 'code',
      header: 'Unit',
      sortValue: (u) => u.code,
      cell: (u) => (
        <button
          type="button"
          className="text-left focus-visible:outline-none"
          onClick={() => navigate(paths.unit(plantId, u.id))}
        >
          <span className="text-sm font-semibold block font-mono">{u.code}</span>
          <span className="text-xs block text-muted">
            {u.ratingMw} MW · {u.controller}
          </span>
        </button>
      ),
    },
    {
      id: 'state',
      header: 'State',
      sortValue: (u) => u.state,
      cell: (u) => <UnitStateBadge state={u.state} />,
    },
    {
      id: 'mw',
      header: 'Output',
      align: 'right',
      sortValue: (u) => live.get(u.id)!.mw,
      cell: (u) => <span className="tabular-nums">{fmtNumber(live.get(u.id)!.mw, 2)} MW</span>,
    },
    {
      id: 'exhaust',
      header: 'Exhaust',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (u) => live.get(u.id)!.exhaustC,
      cell: (u) => {
        const r = live.get(u.id)!
        if (u.state !== 'running') return <span className="text-muted">None</span>
        return (
          <span
            className={cn('tabular-nums', r.exhaustC > EXHAUST_LIMIT_C && 'font-semibold text-accent-strong')}
          >
            {fmtNumber(r.exhaustC)} °C
          </span>
        )
      },
    },
    {
      id: 'lube',
      header: 'Lube oil',
      align: 'right',
      hideBelow: 'md',
      sortValue: (u) => live.get(u.id)!.lubeBar,
      cell: (u) =>
        u.state === 'running' ? (
          <span className="tabular-nums">{fmtNumber(live.get(u.id)!.lubeBar, 1)} bar</span>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    {
      id: 'hours',
      header: 'Run hours',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (u) => u.runHours,
      cell: (u) => <span className="tabular-nums">{fmtNumber(u.runHours)} h</span>,
    },
  ]
  return (
    <DataTable
      columns={columns}
      rows={units}
      getRowKey={(u) => u.id}
      onRowClick={(u) => navigate(paths.unit(plantId, u.id))}
      pageSize={0}
    />
  )
}

/** Auxiliary systems (spec 3.4) at their common status level. */
function AuxPanel({ plantId }: { plantId: string }) {
  const systems = AUX_SYSTEMS.filter((s) => s.plantId === plantId)
  return (
    <div className="space-y-3">
      <ul className="gap-2 sm:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
        {systems.map((s) => (
          <li key={s.kind} className="gap-2 rounded-2xl p-3 flex items-start justify-between bg-surface-2">
            <span className="min-w-0">
              <span className="text-sm font-semibold block">{AUX_SYSTEM_LABEL[s.kind]}</span>
              <span className="text-xs block text-muted">{s.value}</span>
            </span>
            <AuxStateBadge state={s.state} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        Common status per system, as the basic monitoring scope sets out. CCTV stays off the SCADA network,
        and field instruments are outside the SCADA supply.
      </p>
    </div>
  )
}

function ElectricalPanel({ reading }: { reading: PlantReading }) {
  const live = reading.mw > 0
  return (
    <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
      <KeyValue
        labelWidth="lg"
        className="bg-surface-2 shadow-none"
        items={[
          {
            label: 'MV bus voltage',
            value: reading.voltageKv ? `${fmtNumber(reading.voltageKv, 2)} kV` : 'No reading',
          },
          { label: 'Plant current', value: live ? `${fmtNumber(reading.currentA)} A` : 'None' },
          { label: 'Frequency', value: live ? `${fmtNumber(reading.frequencyHz, 2)} Hz` : 'None' },
          { label: 'Power factor', value: live ? fmtNumber(reading.powerFactor, 2) : 'None' },
        ]}
      />
      <KeyValue
        labelWidth="lg"
        className="bg-surface-2 shadow-none"
        items={[
          { label: 'Active power', value: `${fmtNumber(reading.mw, 2)} MW` },
          { label: 'Generator breakers closed', value: `${reading.running} of ${reading.commissioned}` },
          { label: 'Transformer condition', value: 'Not instrumented yet' },
          { label: 'Source', value: 'MV SCADA and DSE 8610 controllers' },
        ]}
      />
    </div>
  )
}

function FuelPanel({ reading, tankCapacityM3 }: { reading: PlantReading; tankCapacityM3: number }) {
  const low = reading.tankLevel > 0 && reading.tankLevel < 0.25
  return (
    <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
      <KeyValue
        labelWidth="lg"
        className="bg-surface-2 shadow-none"
        items={[
          { label: 'HFO supply', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` },
          { label: 'HFO return', value: `${fmtNumber(reading.fuelReturnLph)} L/h` },
          { label: 'Net consumption', value: `${fmtNumber(reading.fuelNetLph)} L/h` },
          {
            label: 'Specific fuel',
            value: reading.sfc === null ? 'None' : `${fmtNumber(reading.sfc)} g/kWh`,
          },
        ]}
      />
      <div className="rounded-2xl p-5 bg-surface-2">
        <p className="text-sm font-semibold">HFO day tank</p>
        <p className="mt-2 gap-2 flex items-end leading-none">
          <span className={cn('text-5xl font-bold tabular-nums', low && 'text-accent')}>
            {fmtPercent(reading.tankLevel)}
          </span>
          <span className="pb-1 text-sm font-semibold text-muted">
            {fmtNumber(reading.tankLevel * tankCapacityM3)} of {fmtNumber(tankCapacityM3)} m³
          </span>
        </p>
        <ProgressBar
          className="mt-4"
          value={reading.tankLevel}
          tone={low ? 'accent' : 'ink'}
          size="md"
          aria-label="Tank level"
        />
        <p className="mt-2 text-xs text-muted">
          {low ? 'Below the 25% alarm level. Check the next delivery.' : 'Alarm level 25%.'} UNUM/Technoton
          gateway.
        </p>
      </div>
    </div>
  )
}

import {
  BILLING,
  PLANTS,
  UNITS,
  fmtAgo,
  fmtDuration,
  fmtMonth,
  fmtNumber,
  fmtPercent,
  fmtShortDate,
  fmtTime,
  fmtUsd,
  isOpen,
  isSuppressed,
  plantTrend,
  toMs,
} from '@gpi/fixtures'
import { ALARM_PRIORITIES, type Alarm } from '@gpi/types'
import {
  BarList,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ColumnChart,
  CountBadge,
  EmptyState,
  IconTile,
  PillTabs,
  ProgressBar,
  Sparkline,
  StatCard,
  StatusDot,
  cn,
} from '@gpi/ui'
import { ArrowRight, Banknote, CircleCheck, Fuel, Gauge, RadioTower, Siren, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlarmRow } from '../../components/AlarmRow'
import { InsightsCard } from '../../components/InsightList'
import { FreshnessBadge, PhaseBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { MapLegend, YemenMap } from '../../components/YemenMap'
import { usePersistentState } from '../../lib/storage'
import { commissionedMw, dailyFleet, energyTotals, projectProgress, todayMwh } from '../../state/derive'
import { useInsights } from '../../state/insights'
import { plantById, useLive } from '../../state/live'
import { useStore } from '../../state/store'

type View = 'operations' | 'management'
const VIEWS = [
  { value: 'operations', label: 'Operations' },
  { value: 'management', label: 'Management' },
]

const byUrgency = (a: Alarm, b: Alarm) =>
  ALARM_PRIORITIES.indexOf(a.priority) - ALARM_PRIORITIES.indexOf(b.priority) ||
  b.raisedAt.localeCompare(a.raisedAt)

export function OverviewPage() {
  const [view, setView] = usePersistentState<View>('gpi.admin.overview', 'operations')
  const { now } = useLive()
  const { alarms } = useStore().state
  const active = alarms.filter((alarm) => isOpen(alarm) && !isSuppressed(alarm))
  const criticalCount = active.filter((alarm) => alarm.priority === 'critical').length
  const newCount = active.filter((alarm) => alarm.status === 'new').length
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Fleet overview</h1>
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <PillTabs items={VIEWS} value={view} onValueChange={(v) => setView(v as View)} />
        <p className="text-xs md:block hidden text-muted">
          5 plants · 300 MW planned · values every 5 s · updated {fmtTime(now)}
        </p>
      </div>
      {view === 'operations' ? (
        <OperationsView />
      ) : (
        <>
          {(criticalCount > 0 || newCount > 0) && (
            <Card className="gap-3 p-4 flex flex-wrap items-center justify-between">
              <div>
                <p className="font-semibold">Operational attention</p>
                <p className="text-xs text-muted">
                  Open alarms still need action while you review management figures.
                </p>
              </div>
              <div className="gap-2 flex flex-wrap">
                {criticalCount > 0 && (
                  <Button asChild size="sm">
                    <Link to={paths.alarms('?priority=critical')}>{criticalCount} critical</Link>
                  </Button>
                )}
                {newCount > 0 && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={paths.alarms('?status=new')}>{newCount} not acknowledged</Link>
                  </Button>
                )}
              </div>
            </Card>
          )}
          <ManagementView />
        </>
      )}
    </div>
  )
}

function OperationsView() {
  const { now, fleet, readings, byPlant } = useLive()
  const insights = useInsights()
  const { alarms } = useStore().state
  const navigate = useNavigate()
  const open = useMemo(() => alarms.filter((a) => isOpen(a) && !isSuppressed(a)).sort(byUrgency), [alarms])
  const critical = open.find((a) => a.priority === 'critical')
  const trend = useMemo(() => {
    const series = PLANTS.map((p) => plantTrend(p, UNITS, now))
    return series[0]!.map((point, i) => ({
      at: point.at,
      mw: series.reduce((sum, s) => sum + (s[i]?.mw ?? 0), 0),
    }))
  }, [now])
  const energy = todayMwh(now)
  const lowTanks = readings.filter((r) => r.tankLevel > 0 && r.tankLevel < 0.25).length
  const fleetCommissionedMw = commissionedMw()

  const attention = [
    {
      key: 'critical',
      label: 'Critical alarms',
      count: open.filter((a) => a.priority === 'critical').length,
      to: paths.alarms('?priority=critical'),
      icon: <Siren />,
      urgent: true,
    },
    {
      key: 'new',
      label: 'Not acknowledged',
      count: open.filter((a) => a.status === 'new').length,
      to: paths.alarms('?status=new'),
      icon: <Siren />,
      urgent: true,
    },
    {
      key: 'late',
      label: 'Sites reporting late',
      count: fleet.late + fleet.stale,
      to: paths.dataHealth(),
      icon: <RadioTower />,
      urgent: false,
    },
    {
      key: 'tanks',
      label: 'Tanks below 25%',
      count: lowTanks,
      to: paths.fuel,
      icon: <Fuel />,
      urgent: false,
    },
  ]

  return (
    <>
      <Card className="p-4" aria-labelledby="attention-title">
        <div className="gap-3 flex flex-wrap items-center justify-between">
          <div>
            <p id="attention-title" className="font-semibold">
              Attention required
            </p>
            <p className="text-xs text-muted">Open the queue that needs action first.</p>
          </div>
          <div className="gap-2 sm:w-auto sm:grid-cols-4 grid w-full grid-cols-2">
            {attention.map((tile) => (
              <Link
                key={tile.key}
                to={tile.to}
                className={cn(
                  'min-w-32 gap-3 rounded-2xl px-3 py-2.5 [&_svg]:size-4 flex items-center transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                  tile.urgent && tile.count > 0
                    ? 'bg-accent-soft text-accent-strong hover:bg-accent-soft/70'
                    : 'bg-surface text-foreground hover:bg-surface-2',
                )}
              >
                {tile.icon}
                <span className="min-w-0">
                  <span className="text-lg font-bold block leading-none tabular-nums">{tile.count}</span>
                  <span className="font-semibold block truncate text-[11px]">{tile.label}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid grid-cols-1">
        <Card variant="ink" className="p-5 flex flex-col">
          <div className="gap-3 flex flex-wrap items-start justify-between">
            <div>
              <p className="gap-2 font-semibold tracking-wider flex items-center text-[11px] text-on-ink-muted uppercase">
                <StatusDot tone="accent" pulse /> Simulated fleet output
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight">Five plants, one view</p>
              <p className="text-sm text-on-ink-muted">
                {fleet.running} of {fleet.commissioned} commissioned units running ·{' '}
                {fmtNumber(fleetCommissionedMw)} MW commissioned
              </p>
            </div>
          </div>
          <div className="mt-6 gap-2 flex items-end leading-none">
            <span className="text-6xl font-bold tracking-tight tabular-nums">{fmtNumber(fleet.mw, 1)}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">
              MW of {fleetCommissionedMw} MW commissioned
            </span>
          </div>
          <div className="mt-4">
            <div className="mb-1.5 text-xs flex items-center justify-between text-on-ink-muted">
              <span>Share of commissioned capacity</span>
              <span className="tabular-nums">{fmtPercent(fleet.mw / fleetCommissionedMw)}</span>
            </div>
            <ProgressBar
              value={fleet.mw / fleetCommissionedMw}
              tone="white"
              aria-label="Fleet output against commissioned capacity"
            />
          </div>
          <div className="mt-5 gap-3 sm:grid-cols-4 grid grid-cols-2">
            <InkMetric label="Available" value={fmtNumber(fleet.availableMw)} unit="MW" />
            <InkMetric label="Net fuel" value={fmtNumber(fleet.fuelNetLph / 1000, 1)} unit="m³/h" />
            <InkMetric
              label="Specific fuel"
              value={fleet.sfc === null ? 'None' : fmtNumber(fleet.sfc)}
              unit="g/kWh"
            />
            <InkMetric label="Today" value={fmtNumber(energy)} unit="MWh" />
          </div>
          <Sparkline
            className="mt-5"
            data={trend.map((t) => t.mw)}
            labels={trend.map((t) => fmtTime(t.at))}
            tone="white"
            area
            height={56}
            format={(v) => `${fmtNumber(v, 1)} MW`}
            ariaLabel="Fleet output over the last 24 hours"
          />
          <div className="gap-2 pt-5 mt-auto flex flex-wrap items-center justify-between">
            <span className="text-xs text-on-ink-muted">
              Last 24 h, hourly · {fleet.capacityMw} MW planned · Aden is under construction
            </span>
            <Button variant="onInk" size="sm" onClick={() => navigate(paths.plants)}>
              Open plants
              <ArrowRight />
            </Button>
          </div>
        </Card>

        <div className="gap-3 sm:gap-4 grid grid-cols-1">
          {critical ? (
            <Card variant="accent" className="p-5 flex flex-col">
              <p className="font-semibold tracking-wider text-white/80 text-[11px] uppercase">
                Critical alarm · {plantById.get(critical.plantId)?.name}
              </p>
              <p className="mt-2 text-xl font-bold leading-snug">{critical.message}</p>
              <div className="mt-4 gap-2 flex items-end leading-none">
                <span className="text-5xl font-bold tabular-nums">
                  {fmtDuration(now - toMs(critical.raisedAt))}
                </span>
                <span className="pb-1 text-sm font-semibold text-white/80">open</span>
              </div>
              <p className="mt-2 text-sm text-white/80">
                {critical.reading} · {critical.status === 'new' ? 'not acknowledged yet' : 'acknowledged'}
              </p>
              <div className="pt-4 mt-auto">
                <Button variant="onInk" size="sm" onClick={() => navigate(paths.alarm(critical.id))}>
                  Open alarm
                  <ArrowRight />
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="gap-4 p-5 flex items-center">
              <IconTile tone="success" size="lg">
                <CircleCheck />
              </IconTile>
              <div>
                <p className="font-semibold">No critical alarm open</p>
                <p className="text-sm text-muted">Trips and protection events show here first.</p>
              </div>
            </Card>
          )}
          <div className="gap-3 sm:gap-4 grid grid-cols-2">
            <StatCard
              label="Unit availability"
              value={fmtPercent(fleet.availableMw / fleetCommissionedMw)}
              hint="Running or standby, by MW"
              icon={<Gauge />}
              tone="ink"
            />
            <StatCard
              label="Open alarms"
              value={open.length}
              hint={`${open.filter((a) => a.status === 'new').length} not acknowledged`}
              icon={<Siren />}
              tone="info"
              onClick={() => navigate(paths.alarms())}
            />
          </div>
        </div>
      </div>

      <InsightsCard
        title="Insights"
        description="What the console found in simulated readings and the last 30 days, most urgent first."
        insights={insights.filter((i) => i.area !== 'commercial')}
      />

      <div className="gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Plant locations</CardTitle>
            <CardDescription>Positions are approximate until GPI supplies site coordinates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <YemenMap />
            <MapLegend />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            action={
              <Button variant="outline" size="sm" onClick={() => navigate(paths.plants)}>
                View all
              </Button>
            }
          >
            <CardTitle>Sites</CardTitle>
            <CardDescription>
              Output against planned capacity and the age of the latest sample.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {PLANTS.map((plant) => {
              const r = byPlant.get(plant.id)!
              return (
                <Link
                  key={plant.id}
                  to={paths.plant(plant.id)}
                  className="rounded-2xl p-3 block bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                >
                  <div className="gap-2 flex flex-wrap items-center justify-between">
                    <span className="min-w-0 gap-2 flex items-center">
                      <span className="text-xs font-semibold font-mono text-muted">{plant.code}</span>
                      <span className="text-sm font-semibold truncate">{plant.name}</span>
                      <PhaseBadge phase={plant.phase} />
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {fmtNumber(r.mw, 1)}{' '}
                      <span className="font-semibold text-muted">/ {plant.capacityMw} MW</span>
                    </span>
                  </div>
                  <ProgressBar
                    className="mt-2"
                    value={r.mw / plant.capacityMw}
                    tone="ink"
                    aria-label={`${plant.name} output`}
                  />
                  <div className="mt-2 gap-x-3 gap-y-1 flex flex-wrap items-center text-[11px] text-muted">
                    <FreshnessBadge freshness={r.freshness} />
                    <span>Sample {fmtAgo(r.sampledAt, now)}</span>
                    <span>
                      {r.running} of {r.commissioned} units running
                    </span>
                  </div>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader
            action={
              <Button variant="outline" size="sm" onClick={() => navigate(paths.alarms())}>
                View all
              </Button>
            }
          >
            <CardTitle className="gap-2 flex items-center">
              Active alarms <CountBadge count={open.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {open.length === 0 ? (
              <EmptyState
                compact
                icon={<CircleCheck />}
                title="No open alarms"
                description="New alarms appear here as the sites report them."
              />
            ) : (
              open.slice(0, 5).map((alarm) => <AlarmRow key={alarm.id} alarm={alarm} now={now} />)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Output by plant</CardTitle>
            <CardDescription>
              Simulated MW. The plant furthest below its commissioned capacity is in accent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Simulated output by plant"
              max={100}
              items={readings.map((r) => {
                const plant = plantById.get(r.plantId)!
                const gap = r.commissioned ? r.mw / commissionedMw(plant.id) : 1
                return {
                  key: plant.id,
                  label: plant.name,
                  value: r.mw,
                  display: `${fmtNumber(r.mw, 1)} MW`,
                  hint: r.commissioned ? `${fmtPercent(gap)} of commissioned` : 'No unit commissioned',
                  emphasis: r.commissioned > 0 && gap < 0.6,
                  onClick: () => navigate(paths.plant(plant.id)),
                }
              })}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function InkMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3">
      <p className="font-semibold text-[11px] text-on-ink-muted">{label}</p>
      <p className="mt-1 gap-1 flex items-end leading-none">
        <span className="text-xl font-bold tabular-nums">{value}</span>
        <span className="pb-0.5 text-xs font-semibold text-on-ink-muted">{unit}</span>
      </p>
    </div>
  )
}

function ManagementView() {
  const insights = useInsights()
  const { now } = useLive()
  const state = useStore().state
  const navigate = useNavigate()
  const week = energyTotals(7, now)
  const month = energyTotals(30, now)
  const daily = dailyFleet(30, now)
  const lastBill = BILLING[BILLING.length - 1]!
  const billed = BILLING.reduce((s, b) => s + b.billedUsd, 0)
  const collected = BILLING.reduce((s, b) => s + b.collectedUsd, 0)
  const exceptions = state.alarms
    .filter((a) => isOpen(a) && (a.priority === 'critical' || a.priority === 'high'))
    .sort(byUrgency)

  return (
    <>
      <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Energy, last 7 days"
          value={fmtNumber(week.mwh)}
          unit="MWh"
          hint={`Availability ${week.availability === null ? 'None' : fmtPercent(week.availability)}`}
          icon={<Zap />}
          tone="ink"
        />
        <StatCard
          label="Energy, last 30 days"
          value={fmtNumber(month.mwh)}
          unit="MWh"
          hint={`${fmtNumber(month.fuelM3)} m³ HFO burned`}
          icon={<Zap />}
        />
        <StatCard
          label={`Billed, ${fmtMonth(lastBill.month)}`}
          value={fmtUsd(lastBill.billedUsd)}
          hint={`Collected ${fmtUsd(lastBill.collectedUsd)}`}
          icon={<Banknote />}
          tone="info"
          onClick={() => navigate(paths.reports)}
        />
        <StatCard
          label="Collection rate, 5 months"
          value={fmtPercent(collected / billed)}
          hint={`${fmtUsd(billed - collected)} outstanding`}
          icon={<Banknote />}
          tone={collected / billed < 0.8 ? 'warning' : 'success'}
          onClick={() => navigate(paths.reports)}
        />
      </div>

      <InsightsCard
        title="For management"
        description="Commercial, project and performance findings that need a decision."
        insights={insights.filter((i) => i.area !== 'data' && i.area !== 'alarms')}
      />

      <div className="gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Daily energy, fleet</CardTitle>
            <CardDescription>MWh per day for the last 30 days. Today is in accent.</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={daily.map((d, i) => ({
                label: fmtShortDate(d.date),
                value: d.mwh,
                highlight: i === daily.length - 1,
              }))}
              tone="muted"
              height={220}
              format={(v) => `${fmtNumber(v)} MWh`}
              ariaLabel="Fleet energy per day, last 30 days"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader
            action={
              <Button variant="outline" size="sm" onClick={() => navigate(paths.projects)}>
                Projects
              </Button>
            }
          >
            <CardTitle>Project progress</CardTitle>
            <CardDescription>Construction and commissioning, as last reported by each site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PLANTS.map((plant) => {
              const progress = projectProgress(state, plant.id)
              return (
                <Link
                  key={plant.id}
                  to={paths.project(plant.id)}
                  className="rounded-2xl p-3 block bg-surface-2 transition-colors hover:bg-surface"
                >
                  <span className="gap-2 text-sm flex items-center justify-between">
                    <span className="font-semibold">{plant.name}</span>
                    <span className="font-bold tabular-nums">{fmtPercent(progress)}</span>
                  </span>
                  <ProgressBar
                    className="mt-2"
                    value={progress}
                    tone={progress === 1 ? 'success' : 'ink'}
                    aria-label={`${plant.name} project progress`}
                  />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          action={
            <Button variant="outline" size="sm" onClick={() => navigate(paths.alarms())}>
              All alarms
            </Button>
          }
        >
          <CardTitle className="gap-2 flex items-center">
            Key exceptions <CountBadge count={exceptions.length} />
          </CardTitle>
          <CardDescription>Critical and high alarms still open.</CardDescription>
        </CardHeader>
        <CardContent className="gap-2 md:grid-cols-2 grid grid-cols-1">
          {exceptions.length === 0 ? (
            <EmptyState
              compact
              className="md:col-span-2"
              icon={<CircleCheck />}
              title="No critical or high alarm open"
            />
          ) : (
            exceptions.map((alarm) => <AlarmRow key={alarm.id} alarm={alarm} now={now} />)
          )}
        </CardContent>
      </Card>
    </>
  )
}

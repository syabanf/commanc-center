import {
  DAILY_ENERGY,
  DAY,
  HOUR,
  PLANTS,
  fmtDate,
  fmtNumber,
  fmtPercent,
  fmtShortDate,
  startOfDay,
  toMs,
} from '@gpi/fixtures'
import { ALARM_KIND_LABEL, ALARM_PRIORITIES, ALARM_PRIORITY_LABEL, type AlarmKind } from '@gpi/types'
import {
  BarList,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  ColumnChart,
  Donut,
  EmptyState,
  LineChart,
  PageHeader,
  SplitStats,
  StatCard,
  cn,
} from '@gpi/ui'
import { Activity, CircleCheck, Fuel, Lightbulb, Timer } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ActiveFilters, FilterButton } from '../../components/FilterPanel'
import { InsightList } from '../../components/InsightList'
import { paths } from '../../components/links'
import { type FilterGroup, useFilters } from '../../lib/use-filters'
import { useSearchParam } from '../../lib/use-search-param'
import {
  ACK_TARGET_MIN,
  AVAILABILITY_TARGET,
  SFC_BASELINE,
  alarmHistory,
  commissionedMw,
  countBy,
  dailyFleet,
  energyRows,
  energyTotals,
  median,
  supplyHours,
} from '../../state/derive'
import { INSIGHT_AREA_LABEL, type Insight, type InsightArea, useInsights } from '../../state/insights'
import { plantById, useLive } from '../../state/live'

const AREAS = ['all', ...(Object.keys(INSIGHT_AREA_LABEL) as InsightArea[])] as const
type Area = (typeof AREAS)[number]
/** Areas with a chart section below the findings. */
const CHARTED: Area[] = ['generation', 'fuel', 'alarms']
const AST_OFFSET = 3 * HOUR
const FEED_LIMIT = 6
const INSIGHT_FILTERS: FilterGroup<Insight>[] = [
  {
    id: 'severity',
    label: 'Severity',
    options: [
      { value: 'act', label: 'Needs action' },
      { value: 'info', label: 'For information' },
    ],
    match: (i, v) => (v === 'act') === (i.tone === 'danger' || i.tone === 'warning'),
  },
  {
    id: 'plant',
    label: 'Plant',
    options: [
      { value: 'fleet', label: 'Fleet-wide' },
      ...PLANTS.map((p) => ({ value: p.id, label: p.name })),
    ],
    match: (i, v) => (v === 'fleet' ? i.plantId === null : i.plantId === v),
  },
]

export function InsightsPage() {
  const insights = useInsights()
  const { now } = useLive()
  const [area, setArea] = useSearchParam<Area>('area', 'all', AREAS)
  const [expanded, setExpanded] = useState(false)
  const filters = useFilters(insights, INSIGHT_FILTERS)
  const shown = area === 'all' ? filters.rows : filters.rows.filter((i) => i.area === area)
  const toAct = insights.filter((i) => i.tone === 'danger' || i.tone === 'warning').length
  const month = energyTotals(30, now)
  const urgent = alarmHistory(now, 30).filter((a) => a.priority === 'critical' || a.priority === 'high')
  const ackMedian = median(urgent.map((a) => a.ackMin))
  const sections = area === 'all' ? CHARTED : CHARTED.filter((a) => a === area)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insights"
        description="Findings the console draws from live readings and the last 30 days, with the charts behind each one."
      />
      <div className="gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
        <StatCard
          label="Findings to act on"
          value={toAct}
          hint={`${insights.length - toAct} for information`}
          icon={<Lightbulb />}
          tone={toAct ? 'danger' : 'success'}
        />
        <StatCard
          label="Availability, 30 days"
          value={month.availability === null ? 'No data' : fmtPercent(month.availability, 1)}
          hint={`Target ${fmtPercent(AVAILABILITY_TARGET)}`}
          icon={<Activity />}
          tone={(month.availability ?? 0) >= AVAILABILITY_TARGET ? 'success' : 'warning'}
          onClick={() => setArea('generation')}
        />
        <StatCard
          label="Fuel per kWh, 30 days"
          value={month.sfc === null ? 'No data' : fmtNumber(month.sfc)}
          unit="g/kWh"
          hint={`Baseline ${SFC_BASELINE} g/kWh`}
          icon={<Fuel />}
          tone={(month.sfc ?? 0) > SFC_BASELINE ? 'warning' : 'success'}
          onClick={() => setArea('fuel')}
        />
        <StatCard
          label="Median time to acknowledge"
          value={ackMedian === null ? 'No data' : fmtNumber(ackMedian)}
          unit="min"
          hint={`Critical and high, target ${ACK_TARGET_MIN} min`}
          icon={<Timer />}
          tone={(ackMedian ?? 0) <= ACK_TARGET_MIN ? 'success' : 'warning'}
          onClick={() => setArea('alarms')}
        />
      </div>

      <div className="gap-4 lg:grid-cols-3 grid grid-cols-1">
        <Card className="lg:col-span-2">
          <CardHeader action={<FilterButton filters={filters} total={insights.length} />}>
            <CardTitle>Findings</CardTitle>
            <CardDescription>
              Most urgent first. Open a finding to see the plant, unit or alarm behind it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActiveFilters filters={filters} />
            <ChipRow>
              {AREAS.map((a) => (
                <Chip
                  key={a}
                  variant="filter"
                  active={area === a}
                  count={a === 'all' ? filters.rows.length : filters.rows.filter((i) => i.area === a).length}
                  onClick={() => setArea(a)}
                >
                  {a === 'all' ? 'All' : INSIGHT_AREA_LABEL[a]}
                </Chip>
              ))}
            </ChipRow>
            {shown.length ? (
              <>
                <InsightList insights={expanded ? shown : shown.slice(0, FEED_LIMIT)} />
                {shown.length > FEED_LIMIT && (
                  <Button variant="soft" className="w-full" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'Show fewer' : `Show all ${shown.length} findings`}
                  </Button>
                )}
              </>
            ) : (
              <EmptyState
                icon={<CircleCheck />}
                title="Nothing to flag here"
                description="Every reading in this area sits inside its limits."
              />
            )}
          </CardContent>
        </Card>
        <CapacityCard />
      </div>

      {sections.includes('generation') && <GenerationSection now={now} />}
      {sections.includes('fuel') && <FuelSection now={now} />}
      {sections.includes('alarms') && <AlarmSection now={now} />}
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="pt-2 text-lg font-bold tracking-tight">{children}</h2>
}

/** Where the planned capacity goes right now: generating, spare, out of service or not built yet. */
function CapacityCard() {
  const { byPlant, fleet } = useLive()
  const segments = (plantId?: string) => {
    const planned = plantId ? plantById.get(plantId)!.capacityMw : fleet.capacityMw
    const r = plantId ? byPlant.get(plantId)! : fleet
    const rated = commissionedMw(plantId)
    return {
      planned,
      parts: [
        { key: 'gen', label: 'Generating', value: r.mw, className: 'bg-ink' },
        {
          key: 'spare',
          label: 'Available, idle',
          value: Math.max(0, r.availableMw - r.mw),
          className: 'bg-info',
        },
        {
          key: 'out',
          label: 'Tripped or in maintenance',
          value: rated - r.availableMw,
          className: 'bg-accent',
        },
        { key: 'pending', label: 'Not commissioned', value: planned - rated, className: 'bg-chart-muted' },
      ],
    }
  }
  const total = segments()
  const largest = Math.max(...PLANTS.map((p) => p.capacityMw))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where the {total.planned} MW goes</CardTitle>
        <CardDescription>Planned capacity split by what each megawatt is doing now.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <StackBar parts={total.parts} planned={total.planned} label="Fleet" tall />
        <ul className="gap-2 text-sm grid grid-cols-1">
          {total.parts.map((p) => (
            <li key={p.key} className="gap-2 flex items-center">
              <span className={cn('size-2.5 shrink-0 rounded-full', p.className)} />
              <span className="flex-1">{p.label}</span>
              <span className="font-semibold tabular-nums">{fmtNumber(p.value, 1)} MW</span>
            </li>
          ))}
        </ul>
        <div className="space-y-3 pt-4 border-t">
          {PLANTS.map((plant) => (
            <StackBar
              key={plant.id}
              label={plant.name}
              planned={plant.capacityMw}
              parts={segments(plant.id).parts}
              share={plant.capacityMw / largest}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function StackBar({
  parts,
  planned,
  label,
  tall = false,
  share = 1,
}: {
  parts: { key: string; label: string; value: number; className: string }[]
  planned: number
  label: string
  tall?: boolean
  /** Bar length as a share of the row, so smaller plants draw shorter bars. */
  share?: number
}) {
  const summary = parts.map((p) => `${p.label} ${fmtNumber(p.value, 1)} MW`).join(', ')
  return (
    <div>
      {!tall && (
        <div className="mb-1 text-xs flex justify-between">
          <span className="font-semibold">{label}</span>
          <span className="text-muted tabular-nums">{planned} MW</span>
        </div>
      )}
      <div
        role="img"
        aria-label={`${label}: ${summary}`}
        className={cn('gap-0.5 flex overflow-hidden rounded-full bg-surface', tall ? 'h-5' : 'h-2.5')}
        style={{ width: `${share * 100}%` }}
      >
        {parts.map((p) =>
          p.value > 0.05 ? (
            <span key={p.key} className={p.className} style={{ flexGrow: p.value, flexBasis: 0 }} />
          ) : null,
        )}
      </div>
    </div>
  )
}

function GenerationSection({ now }: { now: number }) {
  const operating = PLANTS.filter((p) => commissionedMw(p.id) > 0)
  const factor = operating.map((plant) => {
    const rows = energyRows(30, now, plant.id)
    const mwh = rows.reduce((s, r) => s + r.mwh, 0)
    return { plant, value: rows.length ? mwh / (commissionedMw(plant.id) * 24 * rows.length) : 0 }
  })
  const best = factor.reduce((a, b) => (b.value > a.value ? b : a), factor[0]!)

  return (
    <>
      <SectionTitle>Generation</SectionTitle>
      <AvailabilityHeatmap now={now} />
      <Card>
        <CardHeader>
          <CardTitle>Capacity factor, 30 days</CardTitle>
          <CardDescription>
            Energy delivered against what the commissioned units could make running flat out.{' '}
            {best.plant.name} leads at {fmtPercent(best.value)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BarList
            ariaLabel="Capacity factor by plant"
            max={1}
            items={factor
              .sort((a, b) => b.value - a.value)
              .map(({ plant, value }) => ({
                key: plant.id,
                label: plant.name,
                hint: `${commissionedMw(plant.id)} MW commissioned`,
                value,
                display: fmtPercent(value),
              }))}
          />
        </CardContent>
      </Card>
    </>
  )
}

function availabilityClass(value: number | undefined) {
  if (value === undefined) return 'bg-surface'
  if (value < 0.85) return 'bg-accent'
  if (value < AVAILABILITY_TARGET) return 'bg-ink/35'
  if (value < 0.95) return 'bg-ink/65'
  return 'bg-ink'
}

/** One row per plant, one cell per day, shaded by availability. Days below 85% take the accent. */
function AvailabilityHeatmap({ now }: { now: number }) {
  const days = Array.from({ length: 30 }, (_, i) => new Date(startOfDay(now) - (30 - i) * DAY).toISOString())
  const plants = PLANTS.filter((p) => DAILY_ENERGY.some((d) => d.plantId === p.id))
  const lookup = new Map(DAILY_ENERGY.map((d) => [`${d.plantId}|${d.date}`, d.availability]))
  const below = DAILY_ENERGY.filter((d) => toMs(d.date) >= toMs(days[0]!) && d.availability < 0.85)
  const worst = countBy(below, (d) => d.plantId)[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Availability by day</CardTitle>
        <CardDescription>
          {below.length
            ? `${below.length} plant-days fell below 85% in the last 30 days, ${worst![1]} of them at ${plantById.get(worst![0])!.name}.`
            : 'Every plant stayed above 85% on every day of the last 30.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label={`Daily availability for ${plants.map((p) => p.name).join(', ')} over the last 30 days`}
          className="gap-1 sm:grid-cols-[8rem_1fr] grid grid-cols-[5.5rem_1fr] items-center"
        >
          {plants.map((plant) => (
            <div key={plant.id} className="contents">
              <span className="text-xs font-semibold truncate">{plant.name}</span>
              <span className="gap-0.5 sm:gap-1 grid grid-cols-[repeat(30,minmax(0,1fr))]">
                {days.map((date) => {
                  const value = lookup.get(`${plant.id}|${date}`)
                  return (
                    <span
                      key={date}
                      title={`${plant.name}, ${fmtDate(date)}: ${value === undefined ? 'no data' : fmtPercent(value, 1)}`}
                      className={cn('h-6 rounded-[4px]', availabilityClass(value))}
                    />
                  )
                })}
              </span>
            </div>
          ))}
          <span />
          <span className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{fmtShortDate(days[0]!)}</span>
            <span>{fmtShortDate(days[days.length - 1]!)}</span>
          </span>
        </div>
        <div className="mt-4 gap-x-4 gap-y-2 text-xs flex flex-wrap text-muted">
          {[
            ['bg-ink', '95% and up'],
            ['bg-ink/65', '90 to 95%'],
            ['bg-ink/35', '85 to 90%'],
            ['bg-accent', 'Below 85%'],
            ['bg-surface', 'Not running yet'],
          ].map(([className, label]) => (
            <span key={label} className="gap-1.5 flex items-center">
              <span className={cn('size-3 rounded-[3px]', className)} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FuelSection({ now }: { now: number }) {
  const { byPlant } = useLive()
  const trend = dailyFleet(30, now).map((d) => ({
    label: fmtShortDate(d.date),
    value: d.mwh ? (d.fuelM3 * 960) / d.mwh : null,
  }))
  const burning = PLANTS.map((plant) => ({ plant, sfc: energyTotals(30, now, plant.id).sfc })).filter(
    (row): row is { plant: (typeof PLANTS)[number]; sfc: number } => row.sfc !== null,
  )
  const supply = PLANTS.map((plant) => ({ plant, hours: supplyHours(byPlant.get(plant.id)!, plant) })).filter(
    (row): row is { plant: (typeof PLANTS)[number]; hours: number } => row.hours !== null,
  )

  return (
    <>
      <SectionTitle>Fuel</SectionTitle>
      <Card>
        <CardHeader>
          <CardTitle>Fleet fuel per kWh, 30 days</CardTitle>
          <CardDescription>
            Daily HFO burned per kWh sent out. Days above the {SFC_BASELINE} g/kWh baseline cost extra fuel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineChart
            data={trend}
            height={220}
            area
            format={(v) => `${fmtNumber(v)} g/kWh`}
            referenceLines={[{ value: SFC_BASELINE, label: 'Baseline', tone: 'warning' }]}
            ariaLabel="Fleet specific fuel consumption per day over the last 30 days"
          />
        </CardContent>
      </Card>
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Fuel per kWh by plant</CardTitle>
            <CardDescription>30-day average. Plants above the baseline are in accent.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Specific fuel consumption by plant"
              max={260}
              items={burning
                .sort((a, b) => b.sfc - a.sfc)
                .map(({ plant, sfc }) => ({
                  key: plant.id,
                  label: plant.name,
                  value: sfc,
                  display: `${fmtNumber(sfc)} g/kWh`,
                  hint: sfc > SFC_BASELINE ? `+${fmtPercent(sfc / SFC_BASELINE - 1, 1)}` : undefined,
                  emphasis: sfc > SFC_BASELINE,
                }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hours of HFO supply</CardTitle>
            <CardDescription>
              Tank stock at today&apos;s burn rate. Under 72 hours is in accent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Hours of fuel supply by plant"
              max={168}
              items={supply
                .sort((a, b) => a.hours - b.hours)
                .map(({ plant, hours }) => ({
                  key: plant.id,
                  label: plant.name,
                  value: Math.min(hours, 168),
                  display: hours > 168 ? 'Over a week' : `${fmtNumber(hours)} h`,
                  emphasis: hours < 72,
                }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

const DONUT_COLORS = [
  'var(--color-accent)',
  'var(--color-ink)',
  'var(--color-info)',
  'var(--color-chart-muted)',
  'var(--color-silver)',
]

function AlarmSection({ now }: { now: number }) {
  const rows = alarmHistory(now, 30)
  const start = startOfDay(now) - 30 * DAY
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const from = start + i * DAY
    const day = rows.filter((a) => toMs(a.raisedAt) >= from && toMs(a.raisedAt) < from + DAY)
    return {
      label: fmtShortDate(from),
      value: day.length,
      highlight: day.some((a) => a.priority === 'critical'),
    }
  })
  const perHour = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    value: rows.filter((a) => Math.floor(((toMs(a.raisedAt) + AST_OFFSET) % DAY) / HOUR) === hour).length,
  }))
  const peak = perHour.reduce((a, b) => (b.value > a.value ? b : a))
  const causes = countBy(rows, (a) => a.kind)
  const cumulative = causes.map((_, i) => causes.slice(0, i + 1).reduce((s, [, n]) => s + n, 0) / rows.length)
  const byPlant = countBy(rows, (a) => a.plantId)
  const navigate = useNavigate()

  return (
    <>
      <SectionTitle>Alarms</SectionTitle>
      <Card>
        <CardContent className="pt-5">
          <SplitStats
            items={[
              { label: 'Closed alarms, 30 days', value: rows.length },
              {
                label: 'Median to acknowledge',
                value: `${fmtNumber(median(rows.map((a) => a.ackMin)) ?? 0)} min`,
              },
              {
                label: 'Median to resolve',
                value: `${fmtNumber((median(rows.map((a) => a.resolveMin)) ?? 0) / 60, 1)} h`,
              },
              {
                label: `Acknowledged in ${ACK_TARGET_MIN} min`,
                value: fmtPercent(
                  rows.filter((a) => a.ackMin <= ACK_TARGET_MIN).length / Math.max(1, rows.length),
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Alarms per day</CardTitle>
          <CardDescription>Days with a critical alarm are in accent.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColumnChart
            data={perDay}
            height={200}
            tone="muted"
            ariaLabel="Closed alarms per day over the last 30 days"
          />
        </CardContent>
      </Card>
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Top causes</CardTitle>
            <CardDescription>
              The first {Math.min(2, causes.length)} causes account for{' '}
              {fmtPercent(cumulative[Math.min(2, causes.length) - 1] ?? 0)} of all alarms. Fix those first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Alarms by cause"
              items={causes.map(([kind, count], i) => ({
                key: kind,
                label: ALARM_KIND_LABEL[kind as AlarmKind],
                value: count,
                hint: `${fmtPercent(cumulative[i]!)} cumulative`,
                emphasis: i === 0,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Alarms by plant</CardTitle>
            <CardDescription>Share of the last 30 days. Select a plant to open its alarms.</CardDescription>
          </CardHeader>
          <CardContent className="gap-6 sm:flex-row flex flex-col items-center">
            <Donut
              segments={byPlant.map(([plantId, count], i) => ({
                key: plantId,
                label: plantById.get(plantId)!.name,
                value: count,
                color: DONUT_COLORS[i % DONUT_COLORS.length]!,
              }))}
              centerValue={rows.length}
              centerLabel="alarms"
              ariaLabel="Alarms by plant over the last 30 days"
            />
            <BarList
              className="w-full flex-1"
              ariaLabel="Alarms by plant"
              items={byPlant.map(([plantId, count], i) => ({
                key: plantId,
                label: (
                  <span className="gap-2 inline-flex items-center">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                    />
                    {plantById.get(plantId)!.name}
                  </span>
                ),
                value: count,
                emphasis: i === 0,
                onClick: () => navigate(paths.alarms(`?site=${plantId}`)),
              }))}
            />
          </CardContent>
        </Card>
      </div>
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>When alarms happen</CardTitle>
            <CardDescription>
              Alarms by hour of day, Khobar time. The busiest hour is {peak.label} with {peak.value} alarms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={perHour.map((h) => ({ ...h, highlight: h.label === peak.label }))}
              height={180}
              tone="muted"
              ariaLabel="Alarms by hour of day"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Time to acknowledge by priority</CardTitle>
            <CardDescription>
              Median minutes over 30 days. Priorities slower than the {ACK_TARGET_MIN} min level 1 target are
              in accent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Median time to acknowledge by priority"
              items={ALARM_PRIORITIES.flatMap((priority) => {
                const group = rows.filter((a) => a.priority === priority)
                const m = median(group.map((a) => a.ackMin))
                return m === null
                  ? []
                  : [
                      {
                        key: priority,
                        label: ALARM_PRIORITY_LABEL[priority],
                        hint: `${group.length} alarms`,
                        value: m,
                        display: `${fmtNumber(m)} min`,
                        emphasis: m > ACK_TARGET_MIN,
                      },
                    ]
              })}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

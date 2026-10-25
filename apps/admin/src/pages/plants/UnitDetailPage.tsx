import { SCADA_EVENTS, UNITS, fmtAgo, fmtNumber, fmtPercent, isOpen, plantReading } from '@gpi/fixtures'
import { ALARM_KIND_LABEL, type AlarmKind } from '@gpi/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
} from '@gpi/ui'
import {
  Box,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  History,
  LineChart,
  ListOrdered,
  Map as MapIcon,
  Network,
  Siren,
  SlidersHorizontal,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { AlarmRow } from '../../components/AlarmRow'
import { BackButton } from '../../components/BackButton'
import { FreshnessBadge, UnitStateBadge } from '../../components/badges'
import { type GaugePoint, SensorPointCard } from '../../components/Gauge'
import { EXHAUST_LIMIT_C, HeroMetric } from '../../components/HeroMetric'
import { paths } from '../../components/links'
import { NotFoundCard } from '../../components/NotFoundCard'
import { downloadCsv } from '../../lib/csv'
import { plantById, unitById, unitsOf, useLive } from '../../state/live'
import { useStore } from '../../state/store'

/** The alarm each live point raises, so its card can open those alarms. */
const POINT_ALARM: Partial<Record<string, AlarmKind>> = {
  exhaust: 'high_exhaust_temp',
  lube: 'low_lube_pressure',
}

const linkClass = 'font-semibold text-info underline-offset-4 hover:underline'

export function UnitDetailPage() {
  const { plantId = '', unitId = '' } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const plant = plantById.get(plantId)
  const unit = unitById.get(unitId)
  const { now } = useLive()
  const { alarms } = useStore().state

  if (!plant || !unit || unit.plantId !== plant.id)
    return <NotFoundCard title="Unit not found" fallback={paths.plants} />
  const reading = plantReading(plant, UNITS, now)
  const live = reading.units.find((u) => u.unitId === unit.id)!
  const running = unit.state === 'running'
  const history = alarms.filter((a) => a.unitId === unit.id)
  const open = history.filter(isOpen)
  const footer = `Sample ${fmtAgo(reading.sampledAt, now)} · draft limits`
  const siblings = unitsOf(plant.id)
  const index = siblings.findIndex((u) => u.id === unit.id)
  const prev = siblings[index - 1]
  const next = siblings[index + 1]
  const events = SCADA_EVENTS.filter((e) => e.unitId === unit.id)
  const firstOut = events.find((e) => e.firstOut)
  const n = unit.code.split('-G')[1]

  const points: GaugePoint[] = [
    {
      key: 'exhaust',
      name: 'Exhaust gas temperature',
      kind: 'Turbocharger inlet, mean',
      unit: '°C',
      value: running ? live.exhaustC : null,
      min: 380,
      max: EXHAUST_LIMIT_C,
    },
    {
      key: 'lube',
      name: 'Lube oil pressure',
      kind: 'Engine inlet',
      unit: 'bar',
      value: running ? live.lubeBar : null,
      min: 4,
      max: 6,
      digits: 1,
    },
    {
      key: 'coolant',
      name: 'Jacket water temperature',
      kind: 'Engine outlet',
      unit: '°C',
      value: running ? live.coolantC : null,
      min: 70,
      max: 92,
    },
  ]

  const exportCsv = () =>
    downloadCsv(
      `gpi-${unit.code.toLowerCase()}.csv`,
      ['Field', 'Value'],
      [
        ['Unit', unit.code],
        ['Plant', plant.name],
        ['State', unit.state],
        ['Output (MW)', live.mw.toFixed(2)],
        ['Exhaust (°C)', running ? live.exhaustC.toFixed(0) : ''],
        ['Lube oil (bar)', running ? live.lubeBar.toFixed(1) : ''],
        ['Jacket water (°C)', running ? live.coolantC.toFixed(0) : ''],
        ['Run hours', unit.runHours],
        ['Sampled (UTC)', new Date(reading.sampledAt).toISOString()],
        ...history.map((a) => [`Alarm ${a.code}`, `${ALARM_KIND_LABEL[a.kind]}, ${a.status}, ${a.raisedAt}`]),
      ],
    )

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={paths.plant(plant.id)} />
        <div className="gap-2 flex items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={!prev}
            aria-label={prev ? `Previous unit, ${prev.code}` : 'No previous unit'}
            onClick={() => prev && navigate(paths.unit(plant.id, prev.id), { replace: true })}
          >
            <ChevronLeft />
            <span className="sm:inline hidden">{prev?.code ?? 'First unit'}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!next}
            aria-label={next ? `Next unit, ${next.code}` : 'No next unit'}
            onClick={() => next && navigate(paths.unit(plant.id, next.id), { replace: true })}
          >
            <span className="sm:inline hidden">{next?.code ?? 'Last unit'}</span>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {plant.code} · {plant.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight font-mono">{unit.code}</h1>
            <p className="mt-1 text-sm text-on-ink-muted">
              {unit.ratingMw} MW · {unit.engine} · {unit.controller}
            </p>
          </div>
          <div className="gap-2 flex flex-wrap">
            <UnitStateBadge state={unit.state} />
            <FreshnessBadge freshness={reading.freshness} />
          </div>
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric label="Output" value={fmtNumber(live.mw, 2)} unit="MW" />
          <HeroMetric label="Load" value={running ? fmtPercent(live.mw / unit.ratingMw) : 'None'} />
          <HeroMetric label="Run hours" value={fmtNumber(unit.runHours)} unit="h" />
          <HeroMetric label="Alarms, all time" value={String(history.length)} />
        </div>
        {unit.state === 'tripped' && (
          <p className="mt-4 rounded-2xl px-3 py-2 text-sm bg-accent/20">
            The unit tripped and is off load. Restart decisions stay with the site crew; the Command Center
            monitors only.
          </p>
        )}
        <div className="mt-4 gap-2 flex flex-wrap" aria-label="Show this unit">
          <Button
            size="sm"
            variant="onInk"
            onClick={() => navigate(`${paths.plant(plant.id)}?zone=engine_hall`)}
          >
            <MapIcon />
            Site plan
          </Button>
          <Button size="sm" variant="onInk" onClick={() => navigate(paths.plant(plant.id, 'sld'))}>
            <Network />
            Single line, 52-G{n}
          </Button>
          <Button size="sm" variant="onInk" onClick={() => navigate(`${paths.plant(plant.id)}?view=3d`)}>
            <Box />
            3D view
          </Button>
          <Button
            size="sm"
            variant="onInk"
            onClick={() => navigate(paths.events(`?site=${plant.id}&group=generator`))}
          >
            <ListOrdered />
            Events
          </Button>
          {firstOut && (
            <Button size="sm" variant="onInk" onClick={() => navigate(paths.replay(plant.id, firstOut.id))}>
              <History />
              Replay the trip in 3D
            </Button>
          )}
          {can('report.export') && (
            <Button size="sm" variant="onInk" onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          action={
            <Button size="sm" variant="outline" onClick={() => navigate(paths.plant(plant.id, 'trend'))}>
              <LineChart />
              Plant trend
            </Button>
          }
        >
          <CardTitle>Live points</CardTitle>
          <CardDescription>
            Each engine reading against its draft limit. Limits wait for O&M and owner's engineer approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
          {points.map((point) => {
            const kind = POINT_ALARM[point.key]
            const raised = kind ? history.filter((a) => a.kind === kind).length : 0
            return (
              <SensorPointCard
                key={point.key}
                point={point}
                footer={footer}
                actions={
                  <>
                    <Button size="sm" variant="soft" onClick={() => navigate(paths.system('alarms'))}>
                      <SlidersHorizontal />
                      Limit rule
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() =>
                        navigate(paths.alarms(`?status=all&site=${plant.id}${kind ? `&kind=${kind}` : ''}`))
                      }
                    >
                      <Siren />
                      {raised ? `${raised} ${raised === 1 ? 'alarm' : 'alarms'}` : 'Alarms'}
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => navigate(paths.plant(plant.id, 'trend'))}>
                      <LineChart />
                      Trend
                    </Button>
                  </>
                }
              />
            )
          })}
        </CardContent>
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <KeyValue
          labelWidth="lg"
          items={[
            {
              label: 'Plant',
              value: (
                <Link to={paths.plant(plant.id)} className={linkClass}>
                  {plant.name}
                </Link>
              ),
            },
            { label: 'Rating', value: `${unit.ratingMw} MW` },
            { label: 'Engine', value: unit.engine },
            {
              label: 'Controller',
              value: (
                <Link to={paths.plant(plant.id, 'sources')} className={linkClass}>
                  {unit.controller}, synchronisation and protection
                </Link>
              ),
            },
            {
              label: 'Breaker',
              value: (
                <Link to={paths.plant(plant.id, 'sld')} className={linkClass}>
                  52-G{n} on the 11 kV bus
                </Link>
              ),
            },
            {
              label: 'Fuel metering',
              value: (
                <Link to={paths.plant(plant.id, 'fuel')} className={linkClass}>
                  UNUM/Technoton flow meters, supply and return
                </Link>
              ),
            },
            {
              label: 'Asset register',
              value: (
                <Link to={paths.project(plant.id)} className={linkClass}>
                  Make and model pending the final asset register
                </Link>
              ),
            },
          ]}
        />
        <Card>
          <CardHeader
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(paths.alarms(`?status=all&site=${plant.id}`))}
              >
                View all
              </Button>
            }
          >
            <CardTitle>Alarm history</CardTitle>
            <CardDescription>
              {open.length ? `${open.length} open on this unit.` : 'Nothing open on this unit.'} Select an
              alarm to act on it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length === 0 ? (
              <EmptyState
                compact
                icon={<CircleCheck />}
                title="No alarms on this unit"
                action={
                  <Button size="sm" variant="outline" onClick={() => navigate(paths.system('alarms'))}>
                    See the alarm register
                  </Button>
                }
              />
            ) : (
              history.map((alarm) => <AlarmRow key={alarm.id} alarm={alarm} now={now} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

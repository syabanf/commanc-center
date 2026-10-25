import { type PlantReading, fmtNumber, fmtPercent } from '@gpi/fixtures'
import type { Plant, Unit } from '@gpi/types'
import { Badge, type Column, DataTable, SegmentedControl, cn } from '@gpi/ui'
import { type KeyboardEvent, Suspense, lazy } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useSearchParam } from '../../lib/use-search-param'
import { unitsOf } from '../../state/live'
import {
  BREAKER_LABEL,
  type Breaker,
  type BreakerState,
  type Transformer,
  singleLineModel,
} from './single-line-model'

const W = 1000
const BUS_33 = 110
const BUS_11 = 330
/** Evenly spread `count` points across [from, to]. */
const spread = (count: number, from: number, to: number) =>
  Array.from({ length: count }, (_, i) => from + ((i + 0.5) * (to - from)) / count)

/**
 * Single-line diagram (spec 4.1): 33 kV export feeders, step-up transformers, the 11 kV bus in two
 * sections with a coupler, and one incomer per generator. Filled breakers are closed, hollow ones open.
 */
const VIEWS = ['2d', '3d'] as const
type View = (typeof VIEWS)[number]
/** Three.js loads only when someone opens the 3D view. */
const SingleLine3D = lazy(() => import('./sld3d/SingleLine3D').then((m) => ({ default: m.SingleLine3D })))

/** Single line tab: the 2D diagram, or the same circuit as a 3D model. */
export function SingleLine({ plant, reading }: { plant: Plant; reading: PlantReading }) {
  const [view, setView] = useSearchParam<View>('sldview', '2d', VIEWS)
  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="Single line view"
        size="sm"
        value={view}
        onChange={(v) => setView(v as View)}
        options={[
          { value: '2d', label: '2D diagram' },
          { value: '3d', label: '3D view' },
        ]}
      />
      {view === '2d' ? (
        <SingleLineDiagram plant={plant} reading={reading} />
      ) : (
        <Suspense
          fallback={<div className="sm:aspect-[16/9] animate-pulse rounded-2xl aspect-[4/3] bg-surface-2" />}
        >
          <SingleLine3D plant={plant} reading={reading} />
        </Suspense>
      )}
    </div>
  )
}

function SingleLineDiagram({ plant, reading }: { plant: Plant; reading: PlantReading }) {
  const navigate = useNavigate()
  const units = unitsOf(plant.id)
  const {
    live,
    kv33,
    exportMw,
    half,
    unitBreakers,
    breakers,
    transformers: trafos,
  } = singleLineModel(units, reading)
  const t = trafos.length
  const unitX = spread(units.length, 40, W - 40)
  const trafoX = spread(t, 80, W - 80)
  const feederX = [W * 0.3, W * 0.7]
  const couplerX = (unitX[half - 1]! + unitX[half]!) / 2

  const wire = (on: boolean) => cn('fill-none', on ? 'stroke-ink' : 'stroke-silver')
  const open = (u: Unit) => () => navigate(paths.unit(plant.id, u.id))
  const keyOpen = (u: Unit) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate(paths.unit(plant.id, u.id))
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-2 sm:p-3 overflow-x-auto bg-surface-2">
        <svg
          viewBox={`0 0 ${W} 520`}
          className="block h-auto w-full min-w-[640px]"
          role="group"
          aria-label={`Single-line diagram of ${plant.name}: ${fmtNumber(exportMw, 1)} MW export at ${fmtNumber(kv33, 1)} kV`}
        >
          <text x={20} y={BUS_33 - 12} className="fill-muted" style={{ fontSize: 14 }}>
            33 kV bus · {live ? `${fmtNumber(kv33, 1)} kV` : 'dead'}
          </text>
          <line x1={20} x2={W - 20} y1={BUS_33} y2={BUS_33} strokeWidth={6} className={wire(live)} />

          {feederX.map((x, i) => (
            <g key={`f${i}`}>
              <line x1={x} x2={x} y1={18} y2={BUS_33} strokeWidth={3} className={wire(live)} />
              <BreakerMark x={x} y={60} state="closed" tag={`52-F${i + 1}`} />
              <text x={x + 18} y={30} className="fill-muted" style={{ fontSize: 13 }}>
                Grid line {i + 1} · {fmtNumber(exportMw / 2, 1)} MW
              </text>
            </g>
          ))}

          {trafoX.map((x, i) => (
            <g key={`t${i}`}>
              <line x1={x} x2={x} y1={BUS_33} y2={BUS_11} strokeWidth={3} className={wire(live)} />
              <BreakerMark x={x} y={150} state="closed" tag={`52-T${i + 1}H`} />
              <circle
                cx={x}
                cy={205}
                r={17}
                strokeWidth={3}
                className={cn('fill-surface-2', live ? 'stroke-ink' : 'stroke-silver')}
              />
              <circle
                cx={x}
                cy={229}
                r={17}
                strokeWidth={3}
                className={cn('fill-none', live ? 'stroke-ink' : 'stroke-silver')}
              />
              <text x={x + 26} y={222} className="font-semibold fill-foreground" style={{ fontSize: 14 }}>
                T{i + 1}
              </text>
              <text x={x + 26} y={240} className="fill-muted" style={{ fontSize: 12 }}>
                {fmtPercent(trafos[i]!.load)} · {fmtNumber(trafos[i]!.oil)} °C
              </text>
              <BreakerMark x={x} y={285} state="closed" tag={`52-T${i + 1}`} />
            </g>
          ))}

          <text x={20} y={BUS_11 - 12} className="fill-muted" style={{ fontSize: 14 }}>
            11 kV bus A
          </text>
          <text x={W - 20} y={BUS_11 - 12} textAnchor="end" className="fill-muted" style={{ fontSize: 14 }}>
            11 kV bus B ·{' '}
            {live ? `${fmtNumber(reading.voltageKv, 2)} kV, ${fmtNumber(reading.frequencyHz, 2)} Hz` : 'dead'}
          </text>
          <line x1={20} x2={couplerX - 16} y1={BUS_11} y2={BUS_11} strokeWidth={6} className={wire(live)} />
          <line
            x1={couplerX + 16}
            x2={W - 20}
            y1={BUS_11}
            y2={BUS_11}
            strokeWidth={6}
            className={wire(live)}
          />
          <BreakerMark x={couplerX} y={BUS_11} state="closed" tag="52-BC" />

          {units.map((u, i) => {
            const x = unitX[i]!
            const b = unitBreakers[i]!
            const on = b.state === 'closed'
            const unbuilt = u.state === 'not_commissioned'
            return (
              <g
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={open(u)}
                onKeyDown={keyOpen(u)}
                aria-label={`${u.code}, breaker ${b.tag} ${BREAKER_LABEL[b.state].toLowerCase()}, ${fmtNumber(b.kw)} kW. Open unit`}
                className="group cursor-pointer outline-none"
              >
                <line
                  x1={x}
                  x2={x}
                  y1={BUS_11}
                  y2={438}
                  strokeWidth={3}
                  className={wire(on)}
                  strokeDasharray={unbuilt ? '6 5' : undefined}
                />
                <BreakerMark x={x} y={380} state={b.state} tag={b.tag} dashed={unbuilt} />
                <circle
                  cx={x}
                  cy={460}
                  r={22}
                  strokeWidth={3}
                  strokeDasharray={unbuilt ? '6 5' : undefined}
                  className={cn(
                    'transition-colors group-hover:fill-surface group-focus-visible:stroke-accent',
                    on
                      ? 'fill-card stroke-ink'
                      : b.state === 'tripped'
                        ? 'fill-card stroke-accent'
                        : 'fill-card stroke-silver',
                  )}
                />
                <text
                  x={x}
                  y={466}
                  textAnchor="middle"
                  className="font-bold fill-foreground"
                  style={{ fontSize: 15 }}
                >
                  G{u.code.split('-G')[1]}
                </text>
                <text x={x} y={505} textAnchor="middle" className="fill-muted" style={{ fontSize: 12 }}>
                  {on ? `${fmtNumber(b.kw / 1000, 1)} MW` : BREAKER_LABEL[b.state]}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="gap-x-4 gap-y-2 text-xs flex flex-wrap text-muted">
        <Swatch className="bg-ink">Breaker closed</Swatch>
        <Swatch className="border-2 border-ink bg-card">Breaker open</Swatch>
        <Swatch className="bg-accent-strong">Tripped</Swatch>
        <Swatch className="border-2 border-warning bg-warning-soft">Open, selector local</Swatch>
        <span>Live bus in ink, dead in grey. Breaker tags follow ANSI device numbers.</span>
      </div>

      <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] grid grid-cols-1">
        <section aria-labelledby="trafo-title">
          <h3 id="trafo-title" className="mb-2 text-sm font-semibold">
            Transformer monitoring
          </h3>
          <DataTable columns={TRAFO_COLUMNS} rows={trafos} getRowKey={(r) => r.tag} pageSize={0} />
        </section>
        <section aria-labelledby="breaker-title">
          <h3 id="breaker-title" className="mb-2 text-sm font-semibold">
            Breakers
          </h3>
          <DataTable columns={BREAKER_COLUMNS} rows={breakers} getRowKey={(b) => b.tag} pageSize={0} />
        </section>
      </div>
    </div>
  )
}

function Swatch({ className, children }: { className: string; children: string }) {
  return (
    <span className="gap-1.5 flex items-center">
      <span className={cn('size-3 rounded-[3px]', className)} />
      {children}
    </span>
  )
}

const BREAKER_FILL: Record<BreakerState, string> = {
  closed: 'fill-ink stroke-ink',
  open: 'fill-card stroke-ink',
  tripped: 'fill-accent-strong stroke-accent-strong',
  racked_out: 'fill-warning-soft stroke-warning',
}

function BreakerMark({
  x,
  y,
  state,
  tag,
  dashed = false,
}: {
  x: number
  y: number
  state: BreakerState
  tag: string
  dashed?: boolean
}) {
  return (
    <g>
      <title>{`${tag}: ${BREAKER_LABEL[state]}`}</title>
      <rect
        x={x - 11}
        y={y - 11}
        width={22}
        height={22}
        rx={4}
        strokeWidth={2.5}
        strokeDasharray={dashed ? '4 3' : undefined}
        className={dashed ? 'fill-card stroke-silver' : BREAKER_FILL[state]}
      />
      <text x={x - 18} y={y + 5} textAnchor="end" className="fill-muted font-mono" style={{ fontSize: 11 }}>
        {tag}
      </text>
    </g>
  )
}

const TRAFO_COLUMNS: Column<Transformer>[] = [
  { id: 'tag', header: 'Unit', cell: (r) => <span className="font-semibold">{r.tag}</span> },
  {
    id: 'mva',
    header: 'Rating',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{r.mva} MVA</span>,
  },
  {
    id: 'load',
    header: 'Load',
    align: 'right',
    cell: (r) => <span className="tabular-nums">{fmtPercent(r.load)}</span>,
  },
  {
    id: 'oil',
    header: 'Oil / winding',
    align: 'right',
    cell: (r) => (
      <span className="tabular-nums">
        {fmtNumber(r.oil)} / {fmtNumber(r.winding)} °C
      </span>
    ),
  },
]

const BREAKER_COLUMNS: Column<Breaker>[] = [
  {
    id: 'tag',
    header: 'Breaker',
    cell: (b) => (
      <span>
        <span className="text-xs font-semibold block font-mono">{b.tag}</span>
        <span className="text-xs block text-muted">{b.feeds}</span>
      </span>
    ),
  },
  {
    id: 'state',
    header: 'State',
    cell: (b) => (
      <Badge
        variant={
          b.state === 'closed'
            ? 'ink'
            : b.state === 'tripped'
              ? 'danger'
              : b.state === 'racked_out'
                ? 'warning'
                : 'muted'
        }
      >
        {BREAKER_LABEL[b.state]}
      </Badge>
    ),
  },
  {
    id: 'selector',
    header: 'Selector',
    hideBelow: 'sm',
    cell: (b) => (
      <span className={b.local ? 'font-semibold text-warning' : 'text-muted'}>
        {b.local ? 'Local' : 'Remote'}
      </span>
    ),
  },
  {
    id: 'tcs',
    header: 'Trip circuit',
    hideBelow: 'md',
    cell: () => <span className="font-semibold text-success">Healthy</span>,
  },
  {
    id: 'kw',
    header: 'kW / kVAr',
    align: 'right',
    cell: (b) => (
      <span className="tabular-nums">
        {fmtNumber(b.kw)} <span className="text-muted">/ {fmtNumber(b.kvar)}</span>
      </span>
    ),
  },
  {
    id: 'a',
    header: 'Current',
    align: 'right',
    hideBelow: 'lg',
    cell: (b) => <span className="tabular-nums">{fmtNumber(b.amps)} A</span>,
  },
]

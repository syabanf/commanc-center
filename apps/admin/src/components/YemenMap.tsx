import { MAP_SIZE, PLANTS, fmtNumber, isOpen, mapPoint } from '@gpi/fixtures'
import { LINK_STATE_LABEL, PLANT_PHASE_LABEL } from '@gpi/types'
import { Tooltip, cn } from '@gpi/ui'
import { Link } from 'react-router'
import { useLive } from '../state/live'
import { useStore } from '../state/store'
import { paths } from './links'

// Simplified mainland outline (lon, lat), clockwise from the Saudi border on the Red Sea.
const OUTLINE: [number, number][] = [
  [42.75, 16.4],
  [43.2, 17.35],
  [43.9, 17.3],
  [44.6, 17.45],
  [45.4, 17.35],
  [46.4, 17.25],
  [47.0, 16.95],
  [47.6, 17.5],
  [48.2, 18.2],
  [49.1, 18.6],
  [50.8, 18.8],
  [52.0, 19.0],
  [52.6, 18.0],
  [53.1, 16.65],
  [52.2, 15.95],
  [52.2, 15.6],
  [51.3, 15.25],
  [50.1, 14.85],
  [49.1, 14.5],
  [48.7, 14.05],
  [47.9, 14.0],
  [46.7, 13.45],
  [45.7, 13.35],
  [45.0, 12.8],
  [44.2, 12.62],
  [43.5, 12.65],
  [43.25, 13.3],
  [43.1, 14.1],
  [42.9, 14.8],
  [42.75, 15.3],
  [42.65, 16.0],
]
const OUTLINE_PATH = `M${OUTLINE.map(([lon, lat]) => {
  const p = mapPoint(lon, lat)
  return `${p.x},${p.y}`
}).join('L')}Z`
const HADRAMOUT = mapPoint(48.9, 15.1)

type MarkerState = 'alarm' | 'stale' | 'late' | 'normal'
const MARKER: Record<MarkerState, string> = {
  alarm: 'bg-accent-strong text-white animate-pulse',
  stale: 'bg-silver text-white',
  late: 'bg-warning-soft text-ink',
  normal: 'bg-ink text-white',
}

/** Five-site overview map (Q24): position, output, alarm state and link health per plant. */
export function YemenMap({ className }: { className?: string }) {
  const { byPlant } = useLive()
  const { alarms } = useStore().state

  return (
    <div
      className={cn('relative w-full', className)}
      style={{ aspectRatio: `${MAP_SIZE.width} / ${MAP_SIZE.height}` }}
    >
      <svg
        viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
        className="inset-0 absolute size-full"
        role="img"
        aria-label="Map of Yemen with the five GPI plants"
      >
        <path
          d={OUTLINE_PATH}
          className="fill-surface-2 stroke-border"
          strokeWidth={3}
          strokeLinejoin="round"
        />
        <text
          x={HADRAMOUT.x}
          y={HADRAMOUT.y + 40}
          textAnchor="middle"
          className="font-semibold tracking-widest fill-muted text-[22px] uppercase"
        >
          Hadramout
        </text>
        <text x={120} y={70} className="font-semibold fill-muted text-[22px]">
          Saudi Arabia
        </text>
        <text x={330} y={640} className="font-semibold fill-silver text-[22px] italic">
          Gulf of Aden
        </text>
      </svg>
      <span className="right-2 top-2 px-3 py-1 font-semibold absolute rounded-full bg-card text-[11px] text-muted shadow-card">
        Khobar HQ ↗ 1,350 km
      </span>
      {PLANTS.map((plant) => {
        const reading = byPlant.get(plant.id)!
        const hasAlarm = alarms.some(
          (a) => a.plantId === plant.id && isOpen(a) && (a.priority === 'critical' || a.priority === 'high'),
        )
        const state: MarkerState = hasAlarm
          ? 'alarm'
          : reading.freshness === 'stale'
            ? 'stale'
            : reading.freshness === 'late'
              ? 'late'
              : 'normal'
        const label = `${plant.name}: ${fmtNumber(reading.mw, 1)} of ${plant.capacityMw} MW, ${PLANT_PHASE_LABEL[plant.phase]}, link ${LINK_STATE_LABEL[plant.link].toLowerCase()}`
        return (
          <div
            key={plant.id}
            className="gap-1.5 absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
            style={{
              left: `${(plant.map.x / MAP_SIZE.width) * 100}%`,
              top: `${(plant.map.y / MAP_SIZE.height) * 100}%`,
            }}
          >
            <Tooltip content={label}>
              <Link
                to={paths.plant(plant.id)}
                aria-label={label}
                className={cn(
                  'size-8 font-bold flex items-center justify-center rounded-full text-[10px] shadow-float ring-2 ring-card transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-accent/40 focus-visible:outline-none',
                  MARKER[state],
                )}
              >
                {plant.code}
              </Link>
            </Tooltip>
            <span
              aria-hidden="true"
              className="ml-1.5 px-2 py-0.5 font-semibold pointer-events-none absolute left-full rounded-full bg-card/90 text-[10px] whitespace-nowrap tabular-nums shadow-card"
            >
              {fmtNumber(reading.mw, 0)} MW
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function MapLegend() {
  const items: [MarkerState, string][] = [
    ['normal', 'Current sample'],
    ['late', 'Late data'],
    ['stale', 'Stale or offline'],
    ['alarm', 'Critical or high alarm'],
  ]
  return (
    <ul className="gap-x-4 gap-y-1 text-xs flex flex-wrap text-muted">
      {items.map(([state, label]) => (
        <li key={state} className="gap-1.5 flex items-center">
          <span
            aria-hidden="true"
            className={cn('size-2.5 rounded-full', MARKER[state].replace('animate-pulse', ''))}
          />
          {label}
        </li>
      ))}
    </ul>
  )
}

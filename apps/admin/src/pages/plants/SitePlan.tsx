import {
  CAMERAS,
  PLAN_SIZE,
  type PlantReading,
  UNITS,
  fmtNumber,
  fmtPercent,
  isOpen,
  siteLayout,
} from '@gpi/fixtures'
import {
  type Alarm,
  type AlarmKind,
  type Plant,
  SITE_ZONE_LABEL,
  type SiteZoneKind,
  UNIT_STATE_LABEL,
} from '@gpi/types'
import { Button, Chip, ChipRow, EmptyState, KeyValue, cn } from '@gpi/ui'
import { ArrowRight, Cctv, CircleCheck } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlarmRow } from '../../components/AlarmRow'
import { ZoneLine } from './ZoneLine'
import { SourceStateBadge, UnitStateBadge } from '../../components/badges'
import { EXHAUST_LIMIT_C } from '../../components/HeroMetric'
import { paths } from '../../components/links'
import { useSearchParam } from '../../lib/use-search-param'
import { supplyHours } from '../../state/derive'
import { sourcesOf, unitById, unitsOf } from '../../state/live'
import { useStore } from '../../state/store'

const ZONES = Object.keys(SITE_ZONE_LABEL) as SiteZoneKind[]
type Status = 'danger' | 'warning' | 'ok' | 'idle'

/** Where each alarm kind shows up on the plan. */
const ALARM_ZONE: Record<AlarmKind, SiteZoneKind> = {
  generator_trip: 'engine_hall',
  high_exhaust_temp: 'engine_hall',
  low_lube_pressure: 'engine_hall',
  generation_drop: 'engine_hall',
  breaker_event: 'switchyard',
  comms_loss: 'control_room',
  low_tank_level: 'tank_farm',
  fuel_imbalance: 'fuel_treatment',
}

const STATUS_DOT: Record<Status, string> = {
  danger: 'fill-accent',
  warning: 'fill-warning',
  ok: 'fill-success',
  idle: 'fill-silver',
}

const STATUS_LABEL: Record<Status, string> = {
  danger: 'needs attention',
  warning: 'warning',
  ok: 'normal',
  idle: 'idle',
}

const UNIT_FILL = {
  running: 'fill-ink',
  standby: 'fill-surface stroke-silver',
  tripped: 'fill-accent-strong',
  maintenance: 'fill-warning-soft stroke-warning',
  not_commissioned: 'fill-none stroke-silver [stroke-dasharray:6_5]',
} as const

/**
 * Schematic plan of one plant. Zones take the colour of their worst state; select a zone to see its live
 * values and alarms, or a genset to open the unit page.
 */
export function SitePlan({ plant, reading, now }: { plant: Plant; reading: PlantReading; now: number }) {
  const { alarms } = useStore().state
  const [zone, setZone] = useSearchParam<SiteZoneKind>('zone', 'engine_hall', ZONES)
  /** The element the line below the plan preselects, for example the generator just clicked. */
  const [focus, setFocus] = useState<string | null>(null)
  const layout = useMemo(() => siteLayout(plant, UNITS), [plant])
  const units = unitsOf(plant.id)
  const cameras = CAMERAS.filter((c) => c.plantId === plant.id)
  const sources = sourcesOf(plant.id)
  const open = alarms.filter((a) => a.plantId === plant.id && isOpen(a))
  const flowing = reading.mw > 0

  const status = (kind: SiteZoneKind): Status => {
    const zoneAlarms = open.filter((a) => ALARM_ZONE[a.kind] === kind)
    if (zoneAlarms.some((a) => a.priority === 'critical' || a.priority === 'high')) return 'danger'
    if (zoneAlarms.length) return 'warning'
    switch (kind) {
      case 'engine_hall':
        if (units.some((u) => u.state === 'tripped')) return 'danger'
        if (units.some((u) => u.state === 'maintenance')) return 'warning'
        return reading.running ? 'ok' : 'idle'
      case 'tank_farm':
        if (!reading.tankLevel) return 'idle'
        return reading.tankLevel < 0.25 ? 'danger' : 'ok'
      case 'switchyard':
      case 'fuel_treatment':
        return flowing ? 'ok' : 'idle'
      case 'control_room':
        if (sources.some((s) => s.state === 'offline')) return 'danger'
        return sources.some((s) => s.state === 'degraded') ? 'warning' : 'ok'
      case 'gate':
        return cameras.every((c) => c.online) ? 'ok' : 'warning'
      case 'workshop':
        return units.some((u) => u.state === 'maintenance') ? 'warning' : 'ok'
    }
  }

  const inShop = units.filter((u) => u.state === 'maintenance').length
  const captions: Partial<Record<SiteZoneKind, string[]>> = {
    fuel_treatment: flowing
      ? [`Net burn ${fmtNumber(reading.fuelNetLph)} L/h`, `${fmtNumber(reading.sfc ?? 0)} g/kWh`]
      : ['No fuel flow'],
    workshop: [inShop ? `${inShop} ${inShop === 1 ? 'unit' : 'units'} in maintenance` : 'No units waiting'],
    gate: [`${cameras.filter((c) => c.online).length} of ${cameras.length} cameras online`],
  }

  const activate = (action: () => void) => ({
    role: 'button',
    tabIndex: 0,
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      action()
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      action()
    },
  })

  return (
    <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl p-2 sm:p-3 bg-surface-2">
          <svg
            viewBox={`0 0 ${PLAN_SIZE.width} ${PLAN_SIZE.height}`}
            className="block h-auto w-full"
            role="group"
            aria-label={`Site plan of ${plant.name}`}
          >
            {/* Fuel from the tank farm through treatment to the engines, then power out through the switchyard. */}
            <g className={cn('fill-none', flowing ? 'stroke-info' : 'stroke-silver')} strokeWidth={4}>
              <path d="M620 200 H600 V325 H200 V340" strokeDasharray="10 7" />
              <path d="M90 340 V310" strokeDasharray="10 7" />
            </g>
            <g className={cn('fill-none', flowing ? 'stroke-ink' : 'stroke-silver')} strokeWidth={5}>
              <path d="M590 290 H612 V375 H620" />
              <path d="M970 375 H996" markerEnd="url(#arrow)" />
            </g>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 z" className={flowing ? 'fill-ink' : 'fill-silver'} />
              </marker>
            </defs>

            {layout.zones.map(({ kind, rect }) => {
              const selected = zone === kind
              return (
                <g
                  key={kind}
                  {...activate(() => {
                    setZone(kind)
                    setFocus(null)
                  })}
                  aria-label={`${SITE_ZONE_LABEL[kind]}, ${STATUS_LABEL[status(kind)]}`}
                  aria-pressed={selected}
                  className="group cursor-pointer outline-none"
                >
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx={18}
                    className={cn(
                      'transition-colors group-hover:fill-surface group-focus-visible:stroke-accent',
                      selected ? 'fill-card stroke-ink' : 'fill-card stroke-border',
                    )}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  <circle cx={rect.x + 22} cy={rect.y + 26} r={6} className={STATUS_DOT[status(kind)]} />
                  <text
                    x={rect.x + 36}
                    y={rect.y + 32}
                    className="font-semibold fill-foreground"
                    style={{ fontSize: 17 }}
                  >
                    {SITE_ZONE_LABEL[kind]}
                  </text>
                  {captions[kind]?.map((line, i) => (
                    <text
                      key={line}
                      x={rect.x + 22}
                      y={rect.y + 62 + i * 24}
                      className="fill-muted"
                      style={{ fontSize: 15 }}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              )
            })}

            {layout.units.map(({ unitId, rect }) => {
              const unit = unitById.get(unitId)!
              const r = reading.units.find((u) => u.unitId === unitId)
              const hot = !!r && r.mw > 0 && r.exhaustC > EXHAUST_LIMIT_C
              const onInk = unit.state === 'running' || unit.state === 'tripped'
              const load = r && unit.ratingMw ? r.mw / unit.ratingMw : 0
              return (
                <g
                  key={unitId}
                  {...activate(() => {
                    setZone('engine_hall')
                    setFocus(`gen:${unitId}`)
                  })}
                  aria-label={`${unit.code}, ${UNIT_STATE_LABEL[unit.state]}, ${fmtNumber(r?.mw ?? 0, 1)} MW. Show on the single line`}
                  className="group cursor-pointer outline-none"
                >
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    rx={12}
                    strokeWidth={hot ? 4 : 2}
                    className={cn(
                      UNIT_FILL[unit.state],
                      hot && 'stroke-accent',
                      unit.state === 'tripped' && 'animate-pulse',
                      'transition-opacity group-hover:opacity-85 group-focus-visible:stroke-accent',
                    )}
                  />
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 - 4}
                    textAnchor="middle"
                    className={cn('font-bold', onInk ? 'fill-white' : 'fill-foreground')}
                    style={{ fontSize: 16 }}
                  >
                    {unit.code.split('-')[1]}
                  </text>
                  <text
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2 + 16}
                    textAnchor="middle"
                    className={onInk ? 'fill-on-ink-muted' : 'fill-muted'}
                    style={{ fontSize: 13 }}
                  >
                    {unit.state === 'running'
                      ? `${fmtNumber(r?.mw ?? 0, 1)} MW`
                      : UNIT_STATE_LABEL[unit.state]}
                  </text>
                  {unit.state === 'running' && (
                    <>
                      <rect
                        x={rect.x + 10}
                        y={rect.y + rect.h - 16}
                        width={rect.w - 20}
                        height={5}
                        rx={2.5}
                        className="fill-white/20"
                      />
                      <rect
                        x={rect.x + 10}
                        y={rect.y + rect.h - 16}
                        width={(rect.w - 20) * Math.min(1, load)}
                        height={5}
                        rx={2.5}
                        className="fill-white"
                      />
                    </>
                  )}
                </g>
              )
            })}

            <TankGlyph
              {...layout.dayTank}
              level={reading.tankLevel}
              label="Day tank"
              low={reading.tankLevel < 0.25}
            />
            {layout.storageTanks.map((t, i) => (
              <TankGlyph key={i} {...t} level={null} label={`Storage ${i + 1}`} />
            ))}

            {layout.transformers.map((t, i) => (
              <g key={i} className="pointer-events-none">
                <rect
                  x={t.x}
                  y={t.y}
                  width={t.w}
                  height={t.h}
                  rx={10}
                  className={flowing ? 'fill-ink' : 'fill-silver'}
                />
                <text
                  x={t.x + t.w / 2}
                  y={t.y + t.h / 2 + 5}
                  textAnchor="middle"
                  className="fill-white font-bold"
                  style={{ fontSize: 14 }}
                >
                  T{i + 1}
                </text>
              </g>
            ))}
            <text x={640} y={445} className="pointer-events-none fill-muted" style={{ fontSize: 14 }}>
              {flowing
                ? `${fmtNumber(reading.mw, 1)} MW at ${fmtNumber(reading.voltageKv, 1)} kV, ${fmtNumber(reading.frequencyHz, 2)} Hz`
                : 'No export'}
            </text>

            <g className="pointer-events-none">
              {sources.map((s, i) => (
                <circle
                  key={s.id}
                  cx={286 + i * 22}
                  cy={545}
                  r={7}
                  className={
                    s.state === 'connected'
                      ? 'fill-success'
                      : s.state === 'degraded'
                        ? 'fill-warning'
                        : s.state === 'offline'
                          ? 'fill-accent'
                          : 'fill-silver'
                  }
                />
              ))}
              <text x={286 + sources.length * 22} y={550} className="fill-muted" style={{ fontSize: 13 }}>
                {sources.filter((s) => s.state === 'connected').length} of {sources.length} interfaces up
              </text>
            </g>

            {layout.cameras.map((pin) => {
              const camera = cameras.find((c) => c.name === pin.name)
              if (!camera) return null
              return (
                <g
                  key={camera.id}
                  {...activate(() => {
                    setZone('gate')
                    setFocus(`camera:${camera.id}`)
                  })}
                  aria-label={`Camera ${camera.name}, ${camera.online ? 'online' : 'offline'}. Show on the single line`}
                  className="cursor-pointer outline-none"
                >
                  <circle
                    cx={pin.x}
                    cy={pin.y}
                    r={13}
                    className={camera.online ? 'fill-ink' : 'fill-silver'}
                  />
                  <Cctv
                    x={pin.x - 7}
                    y={pin.y - 7}
                    width={14}
                    height={14}
                    className="text-white"
                    aria-hidden="true"
                  />
                </g>
              )
            })}
          </svg>
        </div>
        <PlanLegend />
        <ZoneLine zone={zone} plant={plant} reading={reading} focus={focus} />
      </div>

      <aside className="min-w-0 space-y-3" aria-label={`${SITE_ZONE_LABEL[zone]} details`}>
        <ChipRow className="xl:hidden">
          {ZONES.map((z) => (
            <Chip key={z} variant="filter" active={zone === z} onClick={() => setZone(z)}>
              {SITE_ZONE_LABEL[z]}
            </Chip>
          ))}
        </ChipRow>
        <div className="rounded-2xl p-4 bg-surface-2">
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Zone</p>
          <h3 className="text-lg font-semibold">{SITE_ZONE_LABEL[zone]}</h3>
          <div className="mt-3">
            <ZoneDetail zone={zone} plant={plant} reading={reading} />
          </div>
        </div>
        <ZoneAlarms alarms={open.filter((a) => ALARM_ZONE[a.kind] === zone)} now={now} />
      </aside>
    </div>
  )
}

function TankGlyph({
  cx,
  cy,
  r,
  level,
  label,
  low = false,
}: {
  cx: number
  cy: number
  r: number
  level: number | null
  label: string
  low?: boolean
}) {
  const id = `tank-${cx}-${cy}`
  const fillHeight = level === null ? 0 : 2 * r * level
  return (
    <g className="pointer-events-none">
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} className="fill-surface" />
      {level !== null && (
        <rect
          x={cx - r}
          y={cy + r - fillHeight}
          width={2 * r}
          height={fillHeight}
          clipPath={`url(#${id})`}
          className={low ? 'fill-accent' : 'fill-info'}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={2}
        className={cn('fill-none', level === null ? 'stroke-silver [stroke-dasharray:5_4]' : 'stroke-ink')}
      />
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        className="font-bold fill-foreground"
        style={{ fontSize: 15 }}
      >
        {level === null ? 'n/m' : fmtPercent(level)}
      </text>
      <text x={cx} y={cy + r + 20} textAnchor="middle" className="fill-muted" style={{ fontSize: 13 }}>
        {label}
      </text>
    </g>
  )
}

function PlanLegend() {
  const items: [string, ReactNode][] = [
    ['Running', <span key="r" className="size-3 rounded-[4px] bg-ink" />],
    ['Tripped', <span key="t" className="size-3 rounded-[4px] bg-accent-strong" />],
    [
      'Maintenance',
      <span key="m" className="size-3 rounded-[4px] border-2 border-warning bg-warning-soft" />,
    ],
    ['Standby', <span key="s" className="size-3 rounded-[4px] border-2 border-silver bg-surface" />],
    [
      'Not commissioned',
      <span key="n" className="size-3 rounded-[4px] border-2 border-dashed border-silver" />,
    ],
    ['Fuel line', <span key="f" className="h-0 w-4 border-t-[3px] border-dashed border-info" />],
    ['Power line', <span key="p" className="w-4 h-[3px] rounded-full bg-ink" />],
  ]
  return (
    <div className="gap-x-4 gap-y-2 text-xs flex flex-wrap text-muted">
      {items.map(([label, swatch]) => (
        <span key={label} className="gap-1.5 flex items-center">
          {swatch}
          {label}
        </span>
      ))}
      <span>Layout is schematic until the as-built drawings arrive.</span>
    </div>
  )
}

function ZoneDetail({ zone, plant, reading }: { zone: SiteZoneKind; plant: Plant; reading: PlantReading }) {
  const navigate = useNavigate()
  const onOpenUnit = (unitId: string) => navigate(paths.unit(plant.id, unitId))
  const units = unitsOf(plant.id)
  const link = (label: string, to: string) => (
    <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(to)}>
      {label}
      <ArrowRight />
    </Button>
  )

  switch (zone) {
    case 'engine_hall':
      return (
        <ul className="space-y-1.5">
          {units.map((u) => {
            const r = reading.units.find((x) => x.unitId === u.id)
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onOpenUnit(u.id)}
                  className="gap-2 rounded-xl px-3 py-2 text-sm flex w-full items-center bg-card text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                >
                  <span className="font-semibold w-14 text-xs font-mono">{u.code}</span>
                  <UnitStateBadge state={u.state} />
                  <span className="ml-auto tabular-nums">{fmtNumber(r?.mw ?? 0, 1)} MW</span>
                  {r && r.mw > 0 && (
                    <span
                      className={cn(
                        'w-14 text-xs text-right tabular-nums',
                        r.exhaustC > EXHAUST_LIMIT_C ? 'font-semibold text-accent-strong' : 'text-muted',
                      )}
                    >
                      {fmtNumber(r.exhaustC)} °C
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )
    case 'tank_farm': {
      const hours = supplyHours(reading, plant)
      return (
        <>
          <KeyValue
            bare
            items={[
              { label: 'Day tank', value: reading.tankLevel ? fmtPercent(reading.tankLevel) : 'Empty' },
              {
                label: 'Stock',
                value: `${fmtNumber(reading.tankLevel * plant.tankCapacityM3)} of ${fmtNumber(plant.tankCapacityM3)} m³`,
              },
              { label: 'Supply left', value: hours === null ? 'No burn' : `About ${fmtNumber(hours)} h` },
              { label: 'Storage tanks', value: 'Not metered yet' },
            ]}
          />
          {link('Open fuel', paths.fuel)}
        </>
      )
    }
    case 'fuel_treatment':
      return (
        <>
          <KeyValue
            bare
            items={[
              { label: 'Supply', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` },
              { label: 'Return', value: `${fmtNumber(reading.fuelReturnLph)} L/h` },
              { label: 'Net burn', value: `${fmtNumber(reading.fuelNetLph)} L/h` },
              {
                label: 'Fuel per kWh',
                value: reading.sfc === null ? 'Nothing running' : `${fmtNumber(reading.sfc)} g/kWh`,
              },
            ]}
          />
          {link('Open fuel tab', paths.plant(plant.id, 'fuel'))}
        </>
      )
    case 'switchyard':
      return (
        <>
          <KeyValue
            bare
            items={[
              { label: 'Export', value: `${fmtNumber(reading.mw, 1)} MW` },
              { label: 'Voltage', value: `${fmtNumber(reading.voltageKv, 1)} kV` },
              { label: 'Current', value: `${fmtNumber(reading.currentA)} A` },
              { label: 'Frequency', value: `${fmtNumber(reading.frequencyHz, 2)} Hz` },
              { label: 'Power factor', value: fmtNumber(reading.powerFactor, 2) },
            ]}
          />
          {link('Open electrical tab', paths.plant(plant.id, 'electrical'))}
        </>
      )
    case 'control_room':
      return (
        <>
          <ul className="space-y-1.5">
            {sourcesOf(plant.id).map((s) => (
              <li
                key={s.id}
                className="gap-2 rounded-xl px-3 py-2 text-sm flex items-center justify-between bg-card"
              >
                <span className="min-w-0 truncate">{s.name}</span>
                <SourceStateBadge state={s.state} />
              </li>
            ))}
          </ul>
          {link('Open data sources', paths.plant(plant.id, 'sources'))}
        </>
      )
    case 'gate':
      return (
        <>
          <ul className="space-y-1.5">
            {CAMERAS.filter((c) => c.plantId === plant.id).map((c) => (
              <li
                key={c.id}
                className="gap-2 rounded-xl px-3 py-2 text-sm flex items-center justify-between bg-card"
              >
                <span>{c.name}</span>
                <span className={cn('text-xs font-semibold', c.online ? 'text-success' : 'text-muted')}>
                  {c.online ? 'Online' : 'Offline'}
                </span>
              </li>
            ))}
          </ul>
          {link('Open cameras', paths.cctv(plant.id))}
        </>
      )
    case 'workshop': {
      const down = units.filter((u) => u.state === 'maintenance' || u.state === 'tripped')
      return down.length ? (
        <ul className="space-y-1.5">
          {down.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onOpenUnit(u.id)}
                className="gap-2 rounded-xl px-3 py-2 text-sm flex w-full items-center justify-between bg-card text-left hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
              >
                <span className="font-semibold text-xs font-mono">{u.code}</span>
                <UnitStateBadge state={u.state} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No unit is waiting on the workshop.</p>
      )
    }
  }
}

function ZoneAlarms({ alarms, now }: { alarms: Alarm[]; now: number }) {
  if (!alarms.length) return <EmptyState compact icon={<CircleCheck />} title="No open alarms in this zone" />
  return (
    <div className="space-y-2">
      {alarms.map((a) => (
        <AlarmRow key={a.id} alarm={a} now={now} />
      ))}
    </div>
  )
}

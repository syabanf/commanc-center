import { AUX_SYSTEMS, CAMERAS, type PlantReading, fmtNumber, fmtPercent } from '@gpi/fixtures'
import {
  type Plant,
  SITE_ZONE_LABEL,
  type SiteZoneKind,
  SOURCE_KIND_LABEL,
  UNIT_STATE_LABEL,
} from '@gpi/types'
import { Button, cn } from '@gpi/ui'
import { ArrowRight } from 'lucide-react'
import { type KeyboardEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { sourcesOf, unitsOf } from '../../state/live'
import { BREAKER_LABEL, type BreakerState, singleLineModel } from './single-line-model'

// A single-line diagram for each zone of the site plan, drawn top to bottom in flow order:
// electrical zones show breakers and buses, fuel zones the process line, the control room the data
// path to Khobar and the gate the CCTV path. Every element is a button with details and a link.

type Kind = 'gen' | 'breaker' | 'bus' | 'trafo' | 'tank' | 'pump' | 'device' | 'sink'
type Tone = 'ok' | 'warning' | 'alarm' | 'idle'

interface LineNode {
  id: string
  kind: Kind
  label: string
  tone: Tone
  /** Carries flow; dead nodes draw grey links. */
  on: boolean
  details: { label: string; value: string }[]
  link?: { label: string; to: string }
  breaker?: BreakerState
  level?: number
}

type Row = LineNode[]

const breakerTone = (s: BreakerState): Tone =>
  s === 'closed' ? 'ok' : s === 'tripped' ? 'alarm' : s === 'racked_out' ? 'warning' : 'idle'

const AUX_SHORT: Record<string, string> = {
  cooling_water: 'Cooling',
  lube_oil: 'Lube oil',
  compressed_air: 'Air',
  ventilation: 'HVAC',
  water_treatment: 'Water',
  fire_alarm: 'Fire',
  fuel_leak: 'Leak det.',
  ups: 'UPS',
  battery_charger: 'DC',
}

/** The rows of one zone's line, top to bottom. */
function zoneRows(zone: SiteZoneKind, plant: Plant, reading: PlantReading): Row[] {
  const units = unitsOf(plant.id)
  const model = singleLineModel(units, reading)
  const live = model.live
  const sld = { label: 'Open single line', to: paths.plant(plant.id, 'sld') }
  const fuel = { label: 'Open fuel tab', to: paths.plant(plant.id, 'fuel') }
  const bus11: LineNode = {
    id: 'bus11',
    kind: 'bus',
    label: '11 kV bus A · 52-BC · bus B',
    tone: live ? 'ok' : 'idle',
    on: live,
    details: [
      { label: 'Voltage', value: live ? `${fmtNumber(reading.voltageKv, 2)} kV` : 'Dead' },
      { label: 'Frequency', value: live ? `${fmtNumber(reading.frequencyHz, 2)} Hz` : 'None' },
    ],
    link: sld,
  }
  const running = units.filter((u) => u.state === 'running').length
  const level = reading.tankLevel

  switch (zone) {
    case 'engine_hall':
      return [
        units.map((u): LineNode => {
          const b = model.unitBreakers.find((x) => x.unitId === u.id)!
          return {
            id: `gen:${u.id}`,
            kind: 'gen',
            label: `G${u.code.split('-G')[1]}`,
            tone:
              u.state === 'running'
                ? 'ok'
                : u.state === 'tripped'
                  ? 'alarm'
                  : u.state === 'maintenance'
                    ? 'warning'
                    : 'idle',
            on: u.state === 'running',
            details: [
              { label: 'State', value: UNIT_STATE_LABEL[u.state] },
              { label: 'Output', value: `${fmtNumber(b.kw / 1000, 1)} of ${u.ratingMw} MW` },
            ],
            link: { label: 'Open unit page', to: paths.unit(plant.id, u.id) },
          }
        }),
        model.unitBreakers.map((b): LineNode => ({
          id: `breaker:${b.tag}`,
          kind: 'breaker',
          label: b.tag,
          tone: breakerTone(b.state),
          on: b.state === 'closed',
          breaker: b.state,
          details: [
            { label: 'State', value: BREAKER_LABEL[b.state] },
            { label: 'Selector', value: b.local ? 'Local' : 'Remote' },
            { label: 'kW / kVAr', value: `${fmtNumber(b.kw)} / ${fmtNumber(b.kvar)}` },
          ],
          link: sld,
        })),
        [bus11],
        [
          {
            id: 'to-yard',
            kind: 'sink',
            label: 'To MV switchyard',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Carrying', value: `${fmtNumber(model.exportMw, 1)} MW after auxiliaries` }],
            link: sld,
          },
        ],
      ]
    case 'switchyard':
      return [
        [bus11],
        model.trafoBreakers.map((b): LineNode => ({
          id: `breaker:${b.tag}`,
          kind: 'breaker',
          label: b.tag,
          tone: breakerTone(b.state),
          on: live,
          breaker: b.state,
          details: [
            { label: 'State', value: BREAKER_LABEL[b.state] },
            { label: 'Current', value: `${fmtNumber(b.amps)} A` },
          ],
          link: sld,
        })),
        model.transformers.map((t): LineNode => ({
          id: `trafo:${t.tag}`,
          kind: 'trafo',
          label: t.tag,
          tone: !live ? 'idle' : t.load > 0.9 ? 'warning' : 'ok',
          on: live,
          details: [
            { label: 'Rating', value: `${t.mva} MVA, 11/33 kV` },
            { label: 'Load', value: fmtPercent(t.load) },
            { label: 'Oil / winding', value: `${fmtNumber(t.oil)} / ${fmtNumber(t.winding)} °C` },
          ],
          link: sld,
        })),
        [
          {
            id: 'bus33',
            kind: 'bus',
            label: '33 kV bus',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Voltage', value: live ? `${fmtNumber(model.kv33, 1)} kV` : 'Dead' }],
            link: sld,
          },
        ],
        model.feederBreakers.map((b, i): LineNode => ({
          id: `breaker:${b.tag}`,
          kind: 'breaker',
          label: b.tag,
          tone: breakerTone(b.state),
          on: live,
          breaker: b.state,
          details: [
            { label: 'Feeds', value: `Grid line ${i + 1}` },
            { label: 'Export', value: `${fmtNumber(b.kw / 1000, 1)} MW` },
          ],
          link: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
        })),
        model.feederBreakers.map((b, i): LineNode => ({
          id: `grid:${i}`,
          kind: 'sink',
          label: `Grid ${i + 1}`,
          tone: live ? 'ok' : 'idle',
          on: live,
          details: [{ label: 'Export', value: `${fmtNumber(b.kw / 1000, 1)} MW at 33 kV` }],
          link: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
        })),
      ]
    case 'tank_farm':
      return [
        [1, 2].map((n): LineNode => ({
          id: `storage:${n}`,
          kind: 'tank',
          label: `Storage ${n}`,
          tone: 'idle',
          on: true,
          details: [{ label: 'Level', value: 'Not metered yet' }],
          link: fuel,
        })),
        [
          {
            id: 'pump',
            kind: 'pump',
            label: 'P-TR1',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Transfer pump', value: live ? 'Running, storage to day tank' : 'Idle' }],
            link: fuel,
          },
        ],
        [
          {
            id: 'day-tank',
            kind: 'tank',
            label: `Day tank ${fmtPercent(level)}`,
            tone: level < 0.25 ? 'alarm' : 'ok',
            on: level > 0,
            level,
            details: [
              { label: 'Level', value: fmtPercent(level) },
              {
                label: 'Stock',
                value: `${fmtNumber(level * plant.tankCapacityM3)} of ${fmtNumber(plant.tankCapacityM3)} m³`,
              },
            ],
            link: fuel,
          },
        ],
        [
          {
            id: 'to-treatment',
            kind: 'sink',
            label: 'To fuel treatment',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Supply', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` }],
            link: fuel,
          },
        ],
      ]
    case 'fuel_treatment':
      return [
        [
          {
            id: 'from-tank',
            kind: 'tank',
            label: `Day tank ${fmtPercent(level)}`,
            tone: level < 0.25 ? 'alarm' : 'ok',
            on: level > 0,
            level,
            details: [{ label: 'Supply out', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` }],
            link: fuel,
          },
        ],
        [1, 2, 3].map((n): LineNode => ({
          id: `separator:${n}`,
          kind: 'device',
          label: `Separator ${n}`,
          tone: live ? 'ok' : 'idle',
          on: live,
          details: [{ label: 'Purifier', value: live ? 'Running' : 'Idle' }],
          link: fuel,
        })),
        [
          {
            id: 'booster',
            kind: 'pump',
            label: 'Booster',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [
              { label: 'Supply', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` },
              { label: 'Return', value: `${fmtNumber(reading.fuelReturnLph)} L/h back to the day tank` },
            ],
            link: fuel,
          },
        ],
        [
          {
            id: 'engines',
            kind: 'sink',
            label: `Engines · ${running} of ${units.length} fed`,
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [
              { label: 'Net burn', value: `${fmtNumber(reading.fuelNetLph)} L/h` },
              {
                label: 'Fuel per kWh',
                value: reading.sfc === null ? 'Nothing running' : `${fmtNumber(reading.sfc)} g/kWh`,
              },
            ],
            link: fuel,
          },
        ],
      ]
    case 'control_room': {
      const sources = sourcesOf(plant.id)
      const tone = (s: string): Tone =>
        s === 'connected' ? 'ok' : s === 'degraded' ? 'warning' : s === 'offline' ? 'alarm' : 'idle'
      const starlink = sources.find((s) => s.kind === 'starlink')
      const linkUp = plant.link !== 'offline'
      return [
        sources
          .filter((s) => s.kind !== 'starlink' && s.kind !== 'cctv_nvr')
          .map((s): LineNode => ({
            id: `source:${s.id}`,
            kind: 'device',
            label: SOURCE_KIND_LABEL[s.kind].split(' ')[0]!,
            tone: tone(s.state),
            on: s.state === 'connected' || s.state === 'degraded',
            details: [
              { label: 'Interface', value: s.name },
              { label: 'Protocol', value: s.protocol },
            ],
            link: { label: 'Open data sources', to: paths.plant(plant.id, 'sources') },
          })),
        [
          {
            id: 'scada',
            kind: 'device',
            label: 'Plant SCADA servers',
            tone: 'ok',
            on: true,
            details: [{ label: 'Pair', value: 'Redundant, with local historian and buffer' }],
            link: { label: 'Open platform rules', to: paths.system('platform') },
          },
        ],
        [
          {
            id: 'firewall',
            kind: 'device',
            label: 'OT firewall · VPN',
            tone: 'ok',
            on: true,
            details: [{ label: 'Role', value: 'Terminates the encrypted site-to-site VPN' }],
            link: { label: 'Open platform rules', to: paths.system('platform') },
          },
        ],
        [
          {
            id: 'starlink',
            kind: 'device',
            label: 'Starlink',
            tone: starlink ? tone(starlink.state) : linkUp ? 'ok' : 'alarm',
            on: linkUp,
            details: [{ label: 'Link', value: plant.link }],
            link: { label: 'Open link health', to: paths.dataHealth('link') },
          },
        ],
        [
          {
            id: 'khobar',
            kind: 'sink',
            label: 'Command Center, Khobar',
            tone: linkUp ? 'ok' : 'alarm',
            on: linkUp,
            details: [{ label: 'Receives', value: linkUp ? 'Live values every 5 s' : 'Last values, frozen' }],
            link: { label: 'Open control room', to: paths.room },
          },
        ],
      ]
    }
    case 'workshop':
      return [
        [bus11],
        [
          {
            id: 'station-trafo',
            kind: 'trafo',
            label: 'Station 11/0.4 kV',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Supplies', value: 'Plant auxiliaries, about 3% of generation' }],
            link: sld,
          },
        ],
        [
          {
            id: 'lv-board',
            kind: 'bus',
            label: 'LV switchboard',
            tone: live ? 'ok' : 'idle',
            on: live,
            details: [{ label: 'Voltage', value: live ? '400 V' : 'Dead' }],
            link: { label: 'Open auxiliaries', to: paths.plant(plant.id, 'aux') },
          },
        ],
        AUX_SYSTEMS.filter((a) => a.plantId === plant.id).map((a): LineNode => ({
          id: `aux:${a.kind}`,
          kind: 'device',
          label: AUX_SHORT[a.kind] ?? a.kind,
          tone:
            a.state === 'normal'
              ? 'ok'
              : a.state === 'warning'
                ? 'warning'
                : a.state === 'alarm'
                  ? 'alarm'
                  : 'idle',
          on: a.state === 'normal' || a.state === 'warning',
          details: [{ label: 'Status', value: a.value }],
          link: { label: 'Open auxiliaries', to: paths.plant(plant.id, 'aux') },
        })),
      ]
    case 'gate':
      return [
        CAMERAS.filter((c) => c.plantId === plant.id).map((c): LineNode => ({
          id: `camera:${c.id}`,
          kind: 'device',
          label: c.name.split(' ')[0]!,
          tone: c.online ? 'ok' : 'idle',
          on: c.online,
          details: [
            { label: 'Camera', value: c.name },
            { label: 'State', value: c.online ? 'Online' : 'Offline' },
          ],
          link: { label: 'Open cameras', to: paths.cctv(plant.id) },
        })),
        [
          {
            id: 'nvr',
            kind: 'device',
            label: 'CCTV recorder',
            tone: 'ok',
            on: true,
            details: [{ label: 'Network', value: 'Separate from the SCADA network' }],
            link: { label: 'Open cameras', to: paths.cctv(plant.id) },
          },
        ],
        [
          {
            id: 'display',
            kind: 'sink',
            label: 'Command Center display',
            tone: 'idle',
            on: false,
            details: [{ label: 'Integration', value: 'Display-level only, an optional item' }],
            link: { label: 'Open cameras', to: paths.cctv(plant.id) },
          },
        ],
      ]
  }
}

const W = 640
const ROW_GAP = 82
const TOP = 36

const TONE_FILL: Record<Tone, string> = {
  ok: 'fill-ink stroke-ink',
  warning: 'fill-warning-soft stroke-warning',
  alarm: 'fill-accent-strong stroke-accent-strong',
  idle: 'fill-card stroke-silver',
}
const TONE_TEXT: Record<Tone, string> = {
  ok: 'fill-white',
  warning: 'fill-foreground',
  alarm: 'fill-white',
  idle: 'fill-muted',
}

/**
 * The selected zone's single line under the 2D plan. `focus` preselects an element, for example the
 * generator someone clicked on the plan.
 */
export function ZoneLine({
  zone,
  plant,
  reading,
  focus,
}: {
  zone: SiteZoneKind
  plant: Plant
  reading: PlantReading
  focus: string | null
}) {
  const navigate = useNavigate()
  const rows = zoneRows(zone, plant, reading)
  const [picked, setPicked] = useState<string | null>(focus)
  useEffect(() => setPicked(focus), [focus, zone])
  const nodes = rows.flat()
  const current = nodes.find((n) => n.id === picked) ?? null

  const xs = (count: number) => Array.from({ length: count }, (_, i) => 40 + ((i + 0.5) * (W - 80)) / count)
  const height = TOP + (rows.length - 1) * ROW_GAP + 50
  const positions = rows.map((row) => xs(row.length))
  const press = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setPicked(id)
    }
  }

  return (
    <section className="rounded-2xl p-3 sm:p-4 space-y-3 bg-surface-2" aria-labelledby="zone-line-title">
      <h3 id="zone-line-title" className="text-sm font-semibold">
        Single line · {SITE_ZONE_LABEL[zone]}
      </h3>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="block h-auto w-full min-w-[480px]"
          role="group"
          aria-label={`Single line of the ${SITE_ZONE_LABEL[zone]}`}
        >
          {/* Links between consecutive rows: pairwise when the counts match, otherwise fan in or out. */}
          {rows.slice(1).map((row, r) => {
            const above = rows[r]!
            const ya = TOP + r * ROW_GAP
            const yb = ya + ROW_GAP
            const pa = positions[r]!
            const pb = positions[r + 1]!
            const pairs: [number, number][] =
              above.length === row.length
                ? above.map((_, i) => [i, i])
                : above.length === 1 || row.length === 1
                  ? above.flatMap((_, i) => row.map((__, j) => [i, j] as [number, number]))
                  : row.map((_, j) => [
                      Math.min(above.length - 1, Math.floor((j * above.length) / row.length)),
                      j,
                    ])
            return pairs.map(([i, j]) => {
              const a = above[i]!
              const b = row[j]!
              const xa = a.kind === 'bus' ? pb[j]! : pa[i]!
              const xb = b.kind === 'bus' ? xa : pb[j]!
              const on = a.on && b.on
              return (
                <path
                  key={`${a.id}-${b.id}`}
                  d={`M${xa} ${ya + 18} V${(ya + yb) / 2} H${xb} V${yb - 18}`}
                  className={cn('fill-none', on ? 'stroke-ink' : 'stroke-silver')}
                  strokeWidth={on ? 3 : 2}
                  strokeDasharray={on ? undefined : '5 4'}
                />
              )
            })
          })}
          {rows.map((row, r) =>
            row.map((n, i) => {
              const x = positions[r]![i]!
              const y = TOP + r * ROW_GAP
              // Device boxes shrink on crowded rows so neighbours never touch.
              const cell = Math.min(60, (W - 80) / row.length - 8)
              const selected = n.id === picked
              const ring = selected ? 'stroke-accent' : undefined
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${n.label}, ${n.details[0]?.value ?? ''}`}
                  onClick={() => setPicked(n.id)}
                  onKeyDown={press(n.id)}
                  className="group cursor-pointer outline-none"
                >
                  {n.kind === 'bus' ? (
                    <>
                      <rect
                        x={30}
                        y={y - 6}
                        width={W - 60}
                        height={12}
                        rx={6}
                        strokeWidth={selected ? 3 : 0}
                        className={cn(n.on ? 'fill-ink' : 'fill-silver', ring)}
                      />
                      <text x={36} y={y - 12} className="fill-muted" style={{ fontSize: 12 }}>
                        {n.label}
                      </text>
                    </>
                  ) : (
                    <>
                      {n.kind === 'gen' || n.kind === 'pump' ? (
                        <circle
                          cx={x}
                          cy={y}
                          r={18}
                          strokeWidth={selected ? 4 : 2}
                          className={cn(TONE_FILL[n.tone], ring)}
                        />
                      ) : n.kind === 'trafo' ? (
                        <>
                          <circle
                            cx={x - 7}
                            cy={y}
                            r={14}
                            strokeWidth={selected ? 4 : 2.5}
                            className={cn('fill-none', n.on ? 'stroke-ink' : 'stroke-silver', ring)}
                          />
                          <circle
                            cx={x + 7}
                            cy={y}
                            r={14}
                            strokeWidth={selected ? 4 : 2.5}
                            className={cn('fill-none', n.on ? 'stroke-ink' : 'stroke-silver', ring)}
                          />
                        </>
                      ) : n.kind === 'breaker' ? (
                        <rect
                          x={x - 11}
                          y={y - 11}
                          width={22}
                          height={22}
                          rx={4}
                          strokeWidth={selected ? 4 : 2.5}
                          className={cn(
                            n.breaker === 'open' ? 'fill-card stroke-ink' : TONE_FILL[n.tone],
                            ring,
                          )}
                        />
                      ) : n.kind === 'tank' ? (
                        <>
                          <rect
                            x={x - 26}
                            y={y - 18}
                            width={52}
                            height={36}
                            rx={8}
                            strokeWidth={selected ? 4 : 2}
                            className={cn(
                              'fill-card',
                              n.tone === 'alarm' ? 'stroke-accent' : 'stroke-ink',
                              n.level === undefined && 'stroke-silver [stroke-dasharray:4_3]',
                              ring,
                            )}
                          />
                          {n.level !== undefined && (
                            <rect
                              x={x - 24}
                              y={y + 16 - 32 * n.level}
                              width={48}
                              height={32 * n.level}
                              rx={6}
                              className={n.tone === 'alarm' ? 'fill-accent' : 'fill-info'}
                            />
                          )}
                        </>
                      ) : (
                        <rect
                          x={x - cell / 2}
                          y={y - 15}
                          width={cell}
                          height={30}
                          rx={10}
                          strokeWidth={selected ? 4 : 2}
                          className={cn(TONE_FILL[n.tone], ring)}
                        />
                      )}
                      {(n.kind === 'gen' || n.kind === 'pump') && (
                        <text
                          x={x}
                          y={y + 4}
                          textAnchor="middle"
                          className={cn('font-bold', TONE_TEXT[n.tone])}
                          style={{ fontSize: 11 }}
                        >
                          {n.kind === 'pump' ? 'P' : n.label}
                        </text>
                      )}
                      {n.kind !== 'gen' && (
                        <text
                          x={x}
                          y={y + 32}
                          textAnchor="middle"
                          className="font-semibold fill-foreground"
                          style={{ fontSize: 11 }}
                        >
                          {n.label}
                        </text>
                      )}
                      {n.kind === 'device' && n.tone !== 'ok' && (
                        <circle
                          cx={x + cell / 2 - 4}
                          cy={y - 12}
                          r={5}
                          className={
                            n.tone === 'alarm'
                              ? 'fill-accent'
                              : n.tone === 'warning'
                                ? 'fill-warning'
                                : 'fill-silver'
                          }
                        />
                      )}
                    </>
                  )}
                </g>
              )
            }),
          )}
        </svg>
      </div>
      {current ? (
        <div className="rounded-xl p-3 gap-3 flex flex-wrap items-start justify-between bg-card">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{current.label}</p>
            <dl className="mt-1 gap-x-4 gap-y-0.5 text-xs grid grid-cols-[auto_1fr]">
              {current.details.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="font-medium">{d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {current.link && (
            <Button size="sm" variant="outline" onClick={() => navigate(current.link!.to)}>
              {current.link.label}
              <ArrowRight />
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">Select any element of the line to see its values.</p>
      )}
    </section>
  )
}

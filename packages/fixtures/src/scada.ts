import type {
  AuxState,
  AuxSystem,
  AuxSystemKind,
  Plant,
  ScadaEvent,
  ScadaEventKind,
  EquipmentGroup,
  Unit,
} from '@gpi/types'
import { HOUR, MINUTE, ago, toMs } from './clock'
import { PLANTS, UNITS } from './seed'
import { SAMPLE_MS } from './telemetry'

// Values and rules from the GPI Preliminary SCADA System Specification, Rev. 2 (23 Oct 2026).
// Event records, auxiliary readings and link figures below are demo data shaped by that spec.

export const SPEC = {
  title: 'Preliminary SCADA System Specification',
  revision: 'Rev. 2',
  issued: '2026-10-23',
  /** Section 8: licensed tags per plant in the base proposal, and the priced upgrade. */
  tagBase: 1500,
  tagUpgrade: 2500,
  /** Section 8.4: spare capacity over the approved tag list. */
  tagSpare: 0.25,
  /** Section 8.1: budgeting allowance of unique points per generating unit. */
  pointsPerUnit: { min: 30, max: 50 },
  /** Section 4.3. */
  historianYears: 3,
  /** Section 3.2: Sequence of Events resolution at source. */
  soeResolutionMs: 1,
} as const

/** Step-up transformers per plant: one per three generators, at least two. */
export const transformerCount = (unitCount: number) => Math.max(2, Math.ceil(unitCount / 3))

export interface TagGroup {
  label: string
  /** Budget estimate at the midpoint allowance. */
  points: number
  /** Estimate at the top of the allowance. */
  max: number
}

/**
 * Preliminary tag allocation by equipment group (section 8.4 asks suppliers for one).
 * Counts follow the basic monitoring scope of section 8.1; suppliers replace them with the tag database.
 */
export function tagEstimate(plant: Plant, units: Unit[] = UNITS): TagGroup[] {
  const n = units.filter((u) => u.plantId === plant.id).length
  const t = transformerCount(n)
  const { min, max } = SPEC.pointsPerUnit
  const mid = (min + max) / 2
  return [
    { label: 'Generating units', points: n * mid, max: n * max },
    { label: '11 kV switchgear', points: (n + t + 1) * 8, max: (n + t + 1) * 10 },
    { label: '33 kV switchgear and transformers', points: t * 14 + 2 * 10, max: t * 18 + 2 * 12 },
    { label: 'Fuel system', points: 60, max: 80 },
    { label: 'Auxiliary systems', points: 54, max: 72 },
    { label: 'Communication and diagnostics', points: 40, max: 50 },
  ]
}

// ---- Sequence of Events ---------------------------------------------------------------------

const [AB, JM, UM, AG, AD] = PLANTS as [Plant, Plant, Plant, Plant, Plant]

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
const random = rng(20261023)

/** Typical Starlink round trip per plant for live delivery, in milliseconds. */
const LINK_DELAY: Record<string, [number, number]> = {
  [AB.id]: [300, 900],
  [JM.id]: [300, 900],
  [UM.id]: [800, 3000],
  [AG.id]: [400, 1200],
  [AD.id]: [600, 1500],
}

/** Link outages at Umbaikha: events inside one arrive when the link returns (store-and-forward). */
const OUTAGES: Record<string, { from: number; to: number }[]> = {
  [UM.id]: [
    { from: toMs(ago(300)), to: toMs(ago(288)) },
    { from: toMs(ago(36)), to: toMs(ago(29)) },
  ],
}

type Draft = Omit<ScadaEvent, 'id' | 'receivedAt' | 'firstOut'> & { firstOut?: boolean }

const at = (minutesAgo: number, plusMs = 0) => new Date(toMs(ago(minutesAgo)) + plusMs).toISOString()
const code = (unitId: string) => UNITS.find((u) => u.id === unitId)!.code
const num = (unitId: string) => code(unitId).split('-G')[1]

function draft(
  plant: Plant,
  kind: ScadaEventKind,
  group: EquipmentGroup,
  tag: string,
  message: string,
  sourceAt: string,
  unitId: string | null = null,
  firstOut = false,
): Draft {
  return { plantId: plant.id, unitId, group, kind, tag, message, sourceAt, firstOut }
}

function stopStart(
  plant: Plant,
  unit: Unit,
  stopMinutesAgo: number,
  restartAfterMin: number | null,
): Draft[] {
  const n = num(unit.id)
  const out = [
    draft(
      plant,
      'unit_stop',
      'generator',
      unit.code,
      `${unit.code} stopped from the plant control room`,
      at(stopMinutesAgo),
      unit.id,
    ),
    draft(
      plant,
      'breaker_open',
      'switchgear_11kv',
      `52-G${n}`,
      `Generator breaker 52-G${n} opened`,
      at(stopMinutesAgo, 2140),
      unit.id,
    ),
  ]
  if (restartAfterMin !== null) {
    const start = stopMinutesAgo - restartAfterMin
    out.push(
      draft(plant, 'unit_start', 'generator', unit.code, `${unit.code} started`, at(start), unit.id),
      draft(
        plant,
        'breaker_close',
        'switchgear_11kv',
        `52-G${n}`,
        `Generator breaker 52-G${n} closed after synchronising`,
        at(start, 71_320),
        unit.id,
      ),
    )
  }
  return out
}

const drafts: Draft[] = [
  // JM-G2 reverse power trip, matching alarm al-1.
  draft(
    JM,
    'protection_trip',
    'generator',
    '32R-G2',
    'Reverse power relay 32R operated',
    at(9),
    'un-jm-2',
    true,
  ),
  draft(JM, 'protection_trip', 'generator', '86-G2', 'Lockout relay 86-G2 operated', at(9, 14), 'un-jm-2'),
  draft(
    JM,
    'breaker_open',
    'switchgear_11kv',
    '52-G2',
    'Generator breaker 52-G2 opened by protection',
    at(9, 46),
    'un-jm-2',
  ),
  draft(
    JM,
    'unit_stop',
    'generator',
    'JM-G2',
    'JM-G2 engine shut down after the trip',
    at(9, 1310),
    'un-jm-2',
  ),
  // JM-G5 taken out for maintenance.
  ...stopStart(
    JM,
    UNITS.find((u) => u.id === 'un-jm-5')!,
    306,
    null,
  ),
  draft(
    JM,
    'selector_local',
    'switchgear_11kv',
    '52-G5',
    'Breaker 52-G5 selector switched to local for maintenance',
    at(300, 520),
    'un-jm-5',
  ),
  // AB-G3 overcurrent trip, matching alarm al-8.
  draft(
    AB,
    'protection_trip',
    'switchgear_11kv',
    '51-G3',
    'Overcurrent relay 51 operated on feeder G3',
    at(26 * 60),
    'un-ab-3',
    true,
  ),
  draft(
    AB,
    'breaker_open',
    'switchgear_11kv',
    '52-G3',
    'Generator breaker 52-G3 opened by protection',
    at(26 * 60, 38),
    'un-ab-3',
  ),
  draft(
    AB,
    'breaker_close',
    'switchgear_11kv',
    '52-G3',
    'Generator breaker 52-G3 closed after reset',
    at(25 * 60 + 20),
    'un-ab-3',
  ),
  draft(AB, 'level_switch', 'fuel', 'LSL-DT1', 'Day tank level switch low operated', at(190, 260)),
  draft(
    AB,
    'breaker_close',
    'transformer',
    '52-T2',
    'Transformer T2 HV breaker closed after inspection',
    at(14 * 60, 410),
  ),
  // AG-G2 runs hot, matching alarm al-3.
  draft(
    AG,
    'warning',
    'generator',
    'TT-EXH-G2',
    'Exhaust temperature high warning from the engine controller',
    at(72, 880),
    'un-ag-2',
  ),
  draft(
    AG,
    'selector_remote',
    'switchgear_11kv',
    '52-G3',
    'Breaker 52-G3 selector switched to remote after cold commissioning',
    at(400, 120),
    'un-ag-3',
  ),
  // Umbaikha link drops twice; the events in between are back-filled.
  draft(UM, 'link_lost', 'communication', 'STL-UM', 'Starlink link to Umbaikha lost', at(300)),
  draft(UM, 'warning', 'fuel', 'FT-RET', 'Fuel return flow deviation above 5%', at(294, 640)),
  draft(
    UM,
    'link_restored',
    'communication',
    'STL-UM',
    'Starlink link to Umbaikha restored, back-fill started',
    at(288),
  ),
  draft(UM, 'link_lost', 'communication', 'STL-UM', 'Starlink link to Umbaikha lost', at(36)),
  draft(UM, 'warning', 'auxiliary', 'PT-CA1', 'Compressed air receiver pressure low', at(32, 205)),
  draft(
    UM,
    'link_restored',
    'communication',
    'STL-UM',
    'Starlink link to Umbaikha restored, back-fill started',
    at(29),
  ),
  // Aden goes silent; anything after this waits in the site buffer.
  draft(AD, 'link_lost', 'communication', 'STL-AD', 'Starlink link to Aden lost', AD.frozenAt!),
]

// Routine stops and starts over the last day on the operating plants.
for (const plant of [AB, JM, UM, AG]) {
  for (const unit of UNITS.filter(
    (u) => u.plantId === plant.id && (u.state === 'running' || u.state === 'standby'),
  )) {
    if (random() < 0.45) continue
    const stop = 60 + Math.round(random() * 22 * 60)
    drafts.push(
      ...stopStart(plant, unit, stop, unit.state === 'standby' ? null : 20 + Math.round(random() * 40)),
    )
  }
}

function receivedAt(d: Draft): string {
  const source = toMs(d.sourceAt)
  const outage = OUTAGES[d.plantId]?.find((o) => source >= o.from && source < o.to)
  if (outage && d.kind !== 'link_lost') return new Date(outage.to + 4_000 + random() * 20_000).toISOString()
  // The central system notices a lost link when samples stop arriving.
  if (d.kind === 'link_lost') return new Date(source + 15_000 + random() * 5_000).toISOString()
  const [low, high] = LINK_DELAY[d.plantId]!
  return new Date(source + low + random() * (high - low)).toISOString()
}

export const SCADA_EVENTS: ScadaEvent[] = drafts
  .map((d, i) => ({ ...d, firstOut: d.firstOut ?? false, id: `ev-${i + 1}`, receivedAt: receivedAt(d) }))
  .sort((a, b) => b.sourceAt.localeCompare(a.sourceAt))

/** Minutes between the source time stamp and arrival above which an event counts as back-filled. */
export const BACKFILL_MS = MINUTE
export const isBackfilled = (e: ScadaEvent) => toMs(e.receivedAt) - toMs(e.sourceAt) > BACKFILL_MS

// ---- Auxiliary systems (section 3.4) ----------------------------------------------------------

const AUX_DEFAULT: Record<AuxSystemKind, string> = {
  cooling_water: 'HT 84 °C, LT 38 °C',
  lube_oil: 'Separator running, sump 72%',
  compressed_air: 'Receiver 28 bar',
  ventilation: 'Engine hall 41 °C',
  water_treatment: 'Demineraliser online',
  fire_alarm: 'All zones healthy',
  fuel_leak: 'No leak on 6 sensors',
  ups: 'On mains, battery 100%',
  battery_charger: '110 V DC float',
}
const AUX_OVERRIDES: Record<string, Partial<Record<AuxSystemKind, [AuxState, string]>>> = {
  [AB.id]: { ventilation: ['warning', 'Engine hall 47 °C, limit 45 °C'] },
  [JM.id]: { battery_charger: ['warning', 'DC bus 104 V, float low'] },
  [UM.id]: { compressed_air: ['warning', 'Receiver 24 bar, low at 25 bar'] },
  [AG.id]: {
    water_treatment: ['not_integrated', 'Interface survey pending'],
    fuel_leak: ['not_integrated', 'Sensors not wired yet'],
  },
}

export const AUX_SYSTEMS: AuxSystem[] = PLANTS.flatMap((plant) =>
  (Object.keys(AUX_DEFAULT) as AuxSystemKind[]).map((kind) => {
    if (plant.phase === 'construction')
      return { plantId: plant.id, kind, state: 'not_integrated', value: 'Plant under construction' }
    if (plant.link === 'offline') return { plantId: plant.id, kind, state: 'no_data', value: 'Link offline' }
    const [state, value] = AUX_OVERRIDES[plant.id]?.[kind] ?? ['normal', AUX_DEFAULT[kind]]
    return { plantId: plant.id, kind, state, value }
  }),
)

// ---- Starlink link health (section 6.1) -------------------------------------------------------

const BASE_LATENCY: Record<string, number> = {
  [AB.id]: 48,
  [JM.id]: 52,
  [UM.id]: 940,
  [AG.id]: 61,
  [AD.id]: 610,
}

/** Round-trip latency in ms at time `t`, or null while the link is down. */
export function linkLatency(plant: Plant, t: number): number | null {
  if (plant.frozenAt && t >= toMs(plant.frozenAt)) return null
  if (OUTAGES[plant.id]?.some((o) => t >= o.from && t < o.to)) return null
  const base = BASE_LATENCY[plant.id]!
  const swing = plant.link === 'degraded' ? 0.3 : 0.12
  const drift = 0.6 * Math.sin(t / (5 * HOUR) + base) + 0.4 * Math.sin(t / (2.3 * HOUR) + base / 3)
  return Math.round(base * (1 + swing * drift))
}

/** Hourly latency for the last `hours`, oldest first. */
export function linkTrend(plant: Plant, now: number, hours = 24) {
  return Array.from({ length: hours }, (_, i) => {
    const t = now - (hours - 1 - i) * HOUR
    return { at: t, ms: linkLatency(plant, t) }
  })
}

/** Samples waiting in the plant buffer for back-fill: everything since the link froze. */
export function bufferedSamples(plant: Plant, now: number): number {
  return plant.frozenAt ? Math.max(0, Math.floor((now - toMs(plant.frozenAt)) / SAMPLE_MS)) : 0
}

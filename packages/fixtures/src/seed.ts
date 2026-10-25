import type {
  Alarm,
  AlarmEvent,
  AlarmKind,
  AlarmRecord,
  AlarmRule,
  BillingMonth,
  Camera,
  DailyEnergy,
  DataSource,
  EscalationRule,
  Milestone,
  Person,
  Plant,
  ProgressUpdate,
  ProjectIssue,
  Unit,
  UnitState,
} from '@gpi/types'
import { DAY, FIXTURE_NOW, ago, startOfDay, toMs } from './clock'

// Demo data only. Names, readings and money are invented for the prototype; plant names and planned
// capacities come from the discovery answers (Q07) and are project targets, not verified output.

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = rng(20261019)
const between = (min: number, max: number) => min + (max - min) * random()

/** Map units: x 0–1000 spans 42.4°E–53.4°E, y 0–660 spans 19.2°N–12.2°N. Positions are approximate until GPI supplies coordinates. */
export const MAP_SIZE = { width: 1000, height: 660 }
export const mapPoint = (lon: number, lat: number) => ({
  x: Math.round(((lon - 42.4) / 11) * 1000),
  y: Math.round(((19.2 - lat) / 7) * 660),
})

export const PLANTS: Plant[] = [
  {
    id: 'pl-ab',
    code: 'AB',
    name: 'Al-Bidrah',
    region: 'hadramout',
    capacityMw: 40,
    phase: 'operating',
    map: mapPoint(47.6, 15.2),
    link: 'online',
    latencyMs: 48,
    frozenAt: null,
    contractor: 'Hadramout Energy Contracting',
    tankCapacityM3: 1200,
    tankLevel: 0.22,
  },
  {
    id: 'pl-jm',
    code: 'JM',
    name: 'Jul Masahah',
    region: 'hadramout',
    capacityMw: 40,
    phase: 'operating',
    map: mapPoint(48.5, 16.1),
    link: 'online',
    latencyMs: 55,
    frozenAt: null,
    contractor: 'Hadramout Energy Contracting',
    tankCapacityM3: 1200,
    tankLevel: 0.61,
  },
  {
    id: 'pl-um',
    code: 'UM',
    name: 'Umbaikha',
    region: 'hadramout',
    capacityMw: 60,
    phase: 'operating',
    map: mapPoint(50.3, 15.4),
    link: 'degraded',
    latencyMs: 940,
    frozenAt: null,
    contractor: 'Wadi Power Services',
    tankCapacityM3: 1800,
    tankLevel: 0.47,
  },
  {
    id: 'pl-ag',
    code: 'AG',
    name: 'Al-Ghurf',
    region: 'hadramout',
    capacityMw: 60,
    phase: 'commissioning',
    map: mapPoint(49.6, 16.45),
    link: 'online',
    latencyMs: 61,
    frozenAt: null,
    contractor: 'Wadi Power Services',
    tankCapacityM3: 1800,
    tankLevel: 0.74,
  },
  {
    id: 'pl-ad',
    code: 'AD',
    name: 'Aden',
    region: 'aden',
    capacityMw: 100,
    phase: 'construction',
    map: mapPoint(45.03, 12.8),
    link: 'offline',
    latencyMs: 0,
    frozenAt: ago(47),
    contractor: 'Gulf Coast EPC',
    tankCapacityM3: 3000,
    tankLevel: 0,
  },
]

function units(
  plant: Plant,
  ratingMw: number,
  states: UnitState[],
  hot: Record<number, number> = {},
): Unit[] {
  return states.map((state, i) => ({
    id: `un-${plant.code.toLowerCase()}-${i + 1}`,
    plantId: plant.id,
    code: `${plant.code}-G${i + 1}`,
    ratingMw,
    engine: 'HFO 4-stroke medium speed',
    controller: 'DSE 8610',
    state,
    runHours: state === 'not_commissioned' ? 0 : Math.round(between(1800, 14_500)),
    load: state === 'running' ? Number(between(0.78, 0.9).toFixed(2)) : 0,
    exhaustBiasC: hot[i] ?? 0,
  }))
}
const [AB, JM, UM, AG, AD] = PLANTS as [Plant, Plant, Plant, Plant, Plant]

export const UNITS: Unit[] = [
  ...units(AB, 8, ['running', 'running', 'running', 'running', 'standby']),
  ...units(JM, 8, ['running', 'tripped', 'running', 'running', 'maintenance']),
  ...units(UM, 10, ['running', 'running', 'running', 'running', 'running', 'standby']),
  ...units(
    AG,
    10,
    ['running', 'running', 'not_commissioned', 'not_commissioned', 'not_commissioned', 'not_commissioned'],
    { 1: 62 },
  ),
  ...units(AD, 10, Array<UnitState>(10).fill('not_commissioned')),
]

export const PEOPLE: Person[] = [
  {
    id: 'pe-op1',
    name: 'Khalid Al-Harbi',
    role: 'operator',
    title: 'Command Center operator, day shift',
    plantId: null,
    email: 'k.alharbi@gpi.example',
  },
  {
    id: 'pe-op2',
    name: 'Faisal Al-Qahtani',
    role: 'operator',
    title: 'Command Center operator, night shift',
    plantId: null,
    email: 'f.alqahtani@gpi.example',
  },
  {
    id: 'pe-ab',
    name: 'Ahmed Bawazir',
    role: 'om_engineer',
    title: 'O&M lead, Al-Bidrah',
    plantId: AB.id,
    email: 'a.bawazir@gpi.example',
  },
  {
    id: 'pe-jm',
    name: 'Salem Bin Talib',
    role: 'om_engineer',
    title: 'O&M lead, Jul Masahah',
    plantId: JM.id,
    email: 's.bintalib@gpi.example',
  },
  {
    id: 'pe-um',
    name: 'Omar Baabbad',
    role: 'om_engineer',
    title: 'O&M lead, Umbaikha',
    plantId: UM.id,
    email: 'o.baabbad@gpi.example',
  },
  {
    id: 'pe-ag',
    name: 'Yasser Al-Kathiri',
    role: 'om_engineer',
    title: 'Commissioning lead, Al-Ghurf',
    plantId: AG.id,
    email: 'y.alkathiri@gpi.example',
  },
  {
    id: 'pe-ad',
    name: 'Nabil Saeed',
    role: 'om_engineer',
    title: 'Site engineer, Aden',
    plantId: AD.id,
    email: 'n.saeed@gpi.example',
  },
  {
    id: 'pe-pm',
    name: 'Tariq Hassan',
    role: 'project_manager',
    title: 'Projects manager',
    plantId: null,
    email: 't.hassan@gpi.example',
  },
  {
    id: 'pe-ex',
    name: 'Majed Al-Otaibi',
    role: 'executive',
    title: 'Operations director',
    plantId: null,
    email: 'm.alotaibi@gpi.example',
  },
]

const raised = (minutes: number): AlarmEvent => ({ at: ago(minutes), by: 'rule', verb: 'raised' })
const event = (minutes: number, by: string, verb: AlarmEvent['verb'], note?: string): AlarmEvent => ({
  at: ago(minutes),
  by,
  verb,
  ...(note ? { note } : {}),
})

type AlarmSeed = Omit<Alarm, 'id' | 'code' | 'resolution' | 'postIncident'> &
  Partial<Pick<Alarm, 'resolution' | 'postIncident'>>
const alarmSeeds: AlarmSeed[] = [
  {
    plantId: JM.id,
    unitId: 'un-jm-2',
    kind: 'generator_trip',
    priority: 'critical',
    status: 'new',
    raisedAt: ago(9),
    message: 'JM-G2 tripped on reverse power protection',
    reading: '−0.4 MW, breaker open',
    assigneeId: null,
    escalation: 1,
    history: [raised(9)],
  },
  {
    plantId: UM.id,
    unitId: null,
    kind: 'comms_loss',
    priority: 'high',
    status: 'acknowledged',
    raisedAt: ago(36),
    message: 'Starlink latency above 800 ms, data arriving late',
    reading: '940 ms round trip',
    assigneeId: null,
    escalation: 2,
    history: [
      raised(36),
      event(31, 'pe-op1', 'acknowledged'),
      event(6, 'system', 'escalated', 'Response time of 30 min passed at level 1'),
    ],
  },
  {
    plantId: AG.id,
    unitId: 'un-ag-2',
    kind: 'high_exhaust_temp',
    priority: 'high',
    status: 'assigned',
    raisedAt: ago(72),
    message: 'AG-G2 exhaust gas temperature above 500 °C during load test',
    reading: '512 °C (limit 500 °C)',
    assigneeId: 'pe-ag',
    escalation: 1,
    history: [
      raised(72),
      event(68, 'pe-op1', 'acknowledged'),
      event(
        64,
        'pe-op1',
        'assigned',
        'Check turbocharger inlet and injector timing before the next load step',
      ),
    ],
  },
  {
    plantId: AD.id,
    unitId: null,
    kind: 'comms_loss',
    priority: 'medium',
    status: 'new',
    raisedAt: ago(45),
    message: 'Aden site link stopped reporting',
    reading: 'No data for 45 min',
    assigneeId: null,
    escalation: 1,
    history: [raised(45)],
  },
  {
    plantId: AB.id,
    unitId: null,
    kind: 'low_tank_level',
    priority: 'medium',
    status: 'assigned',
    raisedAt: ago(190),
    message: 'HFO day tank below 25%',
    reading: '22% (limit 25%)',
    assigneeId: 'pe-ab',
    escalation: 1,
    history: [
      raised(190),
      event(182, 'pe-op1', 'acknowledged'),
      event(175, 'pe-op1', 'assigned', 'Confirm the fuel delivery planned for today'),
    ],
  },
  {
    plantId: UM.id,
    unitId: null,
    kind: 'fuel_imbalance',
    priority: 'medium',
    status: 'new',
    raisedAt: ago(24),
    message: 'Net fuel use 6% above the generation baseline over 4 h',
    reading: '+6.2% vs baseline',
    assigneeId: null,
    escalation: 1,
    history: [raised(24)],
  },
  {
    plantId: JM.id,
    unitId: 'un-jm-4',
    kind: 'low_lube_pressure',
    priority: 'low',
    status: 'acknowledged',
    raisedAt: ago(130),
    message: 'JM-G4 lube oil pressure trending low',
    reading: '3.9 bar (warning 4.0 bar)',
    assigneeId: null,
    escalation: 1,
    history: [raised(130), event(121, 'pe-op2', 'acknowledged')],
  },
  {
    plantId: AB.id,
    unitId: 'un-ab-3',
    kind: 'breaker_event',
    priority: 'high',
    status: 'resolved',
    raisedAt: ago(26 * 60),
    message: 'AB-G3 generator breaker opened on overcurrent',
    reading: '1,180 A (pickup 1,100 A)',
    assigneeId: 'pe-ab',
    escalation: 1,
    history: [
      raised(26 * 60),
      event(26 * 60 - 3, 'pe-op2', 'acknowledged'),
      event(26 * 60 - 8, 'pe-op2', 'assigned'),
      event(24 * 60, 'pe-ab', 'resolved', 'Feeder fault cleared, breaker reclosed, unit back on load'),
    ],
    resolution: 'Feeder fault cleared, breaker reclosed, unit back on load',
  },
  {
    plantId: UM.id,
    unitId: null,
    kind: 'generation_drop',
    priority: 'high',
    status: 'closed',
    raisedAt: ago(3 * 24 * 60),
    message: 'Plant output fell 18 MW in 5 minutes',
    reading: '−18 MW in 5 min',
    assigneeId: 'pe-um',
    escalation: 2,
    history: [
      raised(3 * 1440),
      event(3 * 1440 - 2, 'pe-op1', 'acknowledged'),
      event(3 * 1440 - 5, 'pe-op1', 'assigned'),
      event(
        3 * 1440 - 95,
        'pe-um',
        'resolved',
        'Grid feeder load shedding by the utility, not a plant fault',
      ),
      event(2 * 1440, 'pe-op1', 'closed'),
    ],
    resolution: 'Grid feeder load shedding by the utility, not a plant fault',
    postIncident:
      'Utility shed two feeders without notice. Agreed a phone notification with the utility dispatch desk.',
  },
  {
    plantId: JM.id,
    unitId: 'un-jm-1',
    kind: 'high_exhaust_temp',
    priority: 'medium',
    status: 'closed',
    raisedAt: ago(5 * 1440),
    message: 'JM-G1 cylinder 6 exhaust temperature deviation',
    reading: '+48 °C vs cylinder mean',
    assigneeId: 'pe-jm',
    escalation: 1,
    history: [
      raised(5 * 1440),
      event(5 * 1440 - 4, 'pe-op2', 'acknowledged'),
      event(5 * 1440 - 10, 'pe-op2', 'assigned'),
      event(4 * 1440, 'pe-jm', 'resolved', 'Replaced injector on cylinder 6'),
      event(4 * 1440 - 60, 'pe-op2', 'closed'),
    ],
    resolution: 'Replaced injector on cylinder 6',
    postIncident: 'Injector wear found at 4,000 h. Added injector inspection to the 3,000 h service.',
  },
  {
    plantId: JM.id,
    unitId: 'un-jm-5',
    kind: 'low_lube_pressure',
    priority: 'medium',
    status: 'new',
    raisedAt: ago(54),
    message: 'JM-G5 lube oil pressure low with the engine stopped for maintenance',
    reading: '0.2 bar (warning 4.0 bar)',
    assigneeId: null,
    escalation: 1,
    history: [raised(54)],
  },
]

export const ALARMS: Alarm[] = alarmSeeds.map((a, i) => ({
  resolution: null,
  postIncident: null,
  ...a,
  id: `al-${i + 1}`,
  code: `ALM-2026-${String(4180 + alarmSeeds.length - i).padStart(6, '0')}`,
}))

const day = (offset: number) => new Date(startOfDay(FIXTURE_NOW) + offset * DAY).toISOString()

const MILESTONE_NAMES = [
  'Site survey and design',
  'Civil works',
  'Engine installation',
  'MV switchgear and SCADA',
  'Fuel system and UNUM gateway',
  'Cold commissioning',
  'Hot commissioning',
  'Reliability run',
  'Handover to O&M',
]
function milestones(plant: Plant, done: number, delayedAt: number | null): Milestone[] {
  return MILESTONE_NAMES.map((name, i) => ({
    id: `ms-${plant.code.toLowerCase()}-${i + 1}`,
    plantId: plant.id,
    name,
    due: day((i - done) * 21 + (i < done ? -10 : 14)),
    state: i < done ? 'done' : i === delayedAt ? 'delayed' : i === done ? 'in_progress' : 'upcoming',
  }))
}
export const MILESTONES: Milestone[] = [
  ...milestones(AB, 9, null),
  ...milestones(JM, 9, null),
  ...milestones(UM, 9, null),
  ...milestones(AG, 6, 6),
  ...milestones(AD, 2, 3),
]

export const ISSUES: ProjectIssue[] = [
  {
    id: 'is-1',
    plantId: AG.id,
    title: 'AG-G2 exhaust temperature above limit during load test',
    owner: 'Wadi Power Services',
    due: day(3),
    status: 'open',
  },
  {
    id: 'is-2',
    plantId: AG.id,
    title: 'UNUM flow meter calibration certificates missing for units 3 to 6',
    owner: 'UNUM/Technoton',
    due: day(7),
    status: 'open',
  },
  {
    id: 'is-3',
    plantId: AD.id,
    title: 'Engine hall roof steel delivery delayed at port',
    owner: 'Gulf Coast EPC',
    due: day(-4),
    status: 'open',
  },
  {
    id: 'is-4',
    plantId: AD.id,
    title: 'Starlink terminal not yet activated on site',
    owner: 'GPI IT',
    due: day(2),
    status: 'open',
  },
  {
    id: 'is-5',
    plantId: AD.id,
    title: 'MV switchgear foundation drawings awaiting approval',
    owner: 'Interlink OE',
    due: day(5),
    status: 'open',
  },
  {
    id: 'is-6',
    plantId: JM.id,
    title: 'Fuel gateway on unit 5 reports intermittently',
    owner: 'UNUM/Technoton',
    due: day(1),
    status: 'open',
  },
  {
    id: 'is-7',
    plantId: AG.id,
    title: 'Thermal-oil heater interlock test',
    owner: 'Wadi Power Services',
    due: day(-6),
    status: 'closed',
  },
]

const photo = (id: string, caption: string) => ({ id, caption, url: null })
export const PROGRESS_UPDATES: ProgressUpdate[] = [
  {
    id: 'pu-1',
    plantId: AG.id,
    at: ago(2 * 1440),
    by: 'pe-ag',
    progress: 0.78,
    note: 'Units 1 and 2 synchronised and on load test. Units 3 to 6 waiting for fuel meter certificates.',
    photos: [photo('ph-1', 'Engine hall, units 1–2 on load'), photo('ph-2', 'MV switchgear room')],
  },
  {
    id: 'pu-2',
    plantId: AG.id,
    at: ago(9 * 1440),
    by: 'pe-ag',
    progress: 0.72,
    note: 'Cold commissioning finished on units 1 and 2.',
    photos: [photo('ph-3', 'Cold commissioning checklist')],
  },
  {
    id: 'pu-3',
    plantId: AD.id,
    at: ago(3 * 1440),
    by: 'pe-ad',
    progress: 0.34,
    note: 'Foundations for engines 1 to 6 poured. Roof steel still at the port.',
    photos: [
      photo('ph-4', 'Engine foundations 1–6'),
      photo('ph-5', 'Tank farm bund wall'),
      photo('ph-6', 'Site access road'),
    ],
  },
  {
    id: 'pu-4',
    plantId: AD.id,
    at: ago(17 * 1440),
    by: 'pe-ad',
    progress: 0.28,
    note: 'Civil works on the tank farm started.',
    photos: [photo('ph-7', 'Tank farm excavation')],
  },
]

const ifaces = (
  plant: Plant,
  states: [
    DataSource['state'],
    DataSource['state'],
    DataSource['state'],
    DataSource['state'],
    DataSource['state'],
  ],
): DataSource[] => {
  const base: Omit<DataSource, 'id' | 'plantId' | 'state'>[] = [
    {
      kind: 'mv_scada',
      name: 'MV SCADA',
      protocol: 'Modbus TCP or IEC 60870-5-104 (to confirm)',
      note: 'Breaker status, MV bus voltage, feeder power',
    },
    {
      kind: 'engine_controller',
      name: 'DSE 8610 controllers',
      protocol: 'Modbus TCP via DSE gateway',
      note: 'Unit MW, run hours, engine temperatures and pressures',
    },
    {
      kind: 'fuel_gateway',
      name: 'UNUM/Technoton gateway',
      protocol: 'MQTT (to confirm)',
      note: 'Fuel supply, return and net flow, tank level',
    },
    {
      kind: 'cctv_nvr',
      name: 'CCTV recorder',
      protocol: 'RTSP / ONVIF',
      note: 'Site cameras for the video wall',
    },
    { kind: 'starlink', name: 'Starlink terminal', protocol: 'Site-to-site VPN', note: 'Backhaul to Khobar' },
  ]
  return base.map((b, i) => ({
    ...b,
    id: `ds-${plant.code.toLowerCase()}-${i + 1}`,
    plantId: plant.id,
    state: states[i]!,
  }))
}
export const DATA_SOURCES: DataSource[] = [
  ...ifaces(AB, ['connected', 'connected', 'connected', 'connected', 'connected']),
  ...ifaces(JM, ['connected', 'connected', 'degraded', 'connected', 'connected']),
  ...ifaces(UM, ['degraded', 'degraded', 'degraded', 'degraded', 'degraded']),
  ...ifaces(AG, ['pending_survey', 'connected', 'connected', 'connected', 'connected']),
  ...ifaces(AD, ['pending_survey', 'pending_survey', 'pending_survey', 'offline', 'offline']),
]

const CAMERA_NAMES = ['Main gate', 'Engine hall', 'Tank farm', 'MV switchyard']
export const CAMERAS: Camera[] = PLANTS.flatMap((plant) =>
  CAMERA_NAMES.map((name, i) => ({
    id: `cam-${plant.code.toLowerCase()}-${i + 1}`,
    plantId: plant.id,
    name,
    online: plant.link !== 'offline' && !(plant.id === UM.id && i === 2),
  })),
)

/** Commissioned capacity per plant for the history, in MW. */
const historyCapacity: Record<string, number> = { [AB.id]: 40, [JM.id]: 40, [UM.id]: 60, [AG.id]: 20 }
export const DAILY_ENERGY: DailyEnergy[] = Object.entries(historyCapacity).flatMap(([plantId, mw]) =>
  Array.from({ length: 30 }, (_, i) => {
    const offset = i - 30
    if (plantId === AG.id && offset < -12) return null
    const availability = Number(between(plantId === UM.id ? 0.78 : 0.84, 0.97).toFixed(3))
    const load = between(0.74, 0.88)
    const mwh = Math.round(mw * 24 * availability * load)
    const sfc = between(0.208, plantId === UM.id ? 0.232 : 0.222)
    return { plantId, date: day(offset), mwh, fuelM3: Math.round((mwh * sfc) / 0.96), availability }
  }).filter((row): row is DailyEnergy => row !== null),
)

export const BILLING: BillingMonth[] = [
  { month: '2026-05', billedUsd: 8_420_000, collectedUsd: 7_150_000 },
  { month: '2026-06', billedUsd: 8_910_000, collectedUsd: 7_020_000 },
  { month: '2026-07', billedUsd: 9_640_000, collectedUsd: 7_870_000 },
  { month: '2026-08', billedUsd: 9_880_000, collectedUsd: 6_940_000 },
  { month: '2026-09', billedUsd: 9_310_000, collectedUsd: 7_460_000 },
]

/** Draft alarm register (Q26, Q27). Nothing is approved until O&M and the owner's engineer sign it off. */
export const ALARM_RULES: AlarmRule[] = [
  {
    id: 'ar-1',
    kind: 'generator_trip',
    condition: 'Generator breaker opens while the unit is on load',
    delaySec: 0,
    priority: 'critical',
    approved: false,
  },
  {
    id: 'ar-2',
    kind: 'high_exhaust_temp',
    condition: 'Exhaust gas temperature above 500 °C',
    delaySec: 30,
    priority: 'high',
    approved: false,
  },
  {
    id: 'ar-3',
    kind: 'low_lube_pressure',
    condition: 'Lube oil pressure below 4.0 bar while running',
    delaySec: 10,
    priority: 'high',
    approved: false,
  },
  {
    id: 'ar-4',
    kind: 'breaker_event',
    condition: 'Any protection relay operation on MV switchgear',
    delaySec: 0,
    priority: 'high',
    approved: false,
  },
  {
    id: 'ar-5',
    kind: 'comms_loss',
    condition: 'No data from a site for 60 s, or latency above 800 ms',
    delaySec: 60,
    priority: 'high',
    approved: false,
  },
  {
    id: 'ar-6',
    kind: 'generation_drop',
    condition: 'Plant output falls more than 15% in 5 min',
    delaySec: 0,
    priority: 'high',
    approved: false,
  },
  {
    id: 'ar-7',
    kind: 'low_tank_level',
    condition: 'HFO day tank below 25%',
    delaySec: 300,
    priority: 'medium',
    approved: false,
  },
  {
    id: 'ar-8',
    kind: 'fuel_imbalance',
    condition: 'Net fuel use more than 5% above the generation baseline over 4 h',
    delaySec: 0,
    priority: 'medium',
    approved: false,
  },
]

/** Proposed escalation matrix (Q29). Owners and response times still need GPI agreement. */
export const ESCALATION_RULES: EscalationRule[] = [
  { level: 1, owner: 'Plant O&M lead', responseMin: 30, channels: 'Dashboard, email' },
  {
    level: 2,
    owner: 'Command Center supervisor',
    responseMin: 60,
    channels: 'Dashboard, email, SMS (option)',
  },
  { level: 3, owner: 'Operations director', responseMin: 120, channels: 'Email, phone' },
]

/** How often each plant raised each kind of alarm per day over the last month. Umbaikha's weak link
 * drives its comms losses; Jul Masahah's trip history and Al-Ghurf's hot G2 show up the same way. */
const alarmRates: Record<string, Partial<Record<AlarmKind, number>>> = {
  [AB.id]: { high_exhaust_temp: 0.08, low_tank_level: 0.12, generation_drop: 0.06, breaker_event: 0.04 },
  [JM.id]: { generator_trip: 0.14, low_lube_pressure: 0.1, generation_drop: 0.12, breaker_event: 0.05 },
  [UM.id]: { comms_loss: 0.45, fuel_imbalance: 0.12, generation_drop: 0.08, high_exhaust_temp: 0.05 },
  [AG.id]: { high_exhaust_temp: 0.35, low_lube_pressure: 0.06, comms_loss: 0.05 },
  [AD.id]: { comms_loss: 0.2 },
}
const historyRandom = rng(20261020)
const ACK_RANGE: Record<string, [number, number]> = {
  critical: [2, 14],
  high: [4, 42],
  medium: [8, 75],
  low: [15, 120],
}
/** Comms losses got worse in the last week, so the analytics have a trend to point at. */
const weekBoost = (kind: AlarmKind, plantId: string, offset: number) =>
  kind === 'comms_loss' && plantId === UM.id && offset >= -7 ? 2 : 1
export const ALARM_HISTORY: AlarmRecord[] = Array.from({ length: 30 }, (_, i) => i - 30).flatMap((offset) =>
  Object.entries(alarmRates).flatMap(([plantId, rates]) =>
    (Object.entries(rates) as [AlarmKind, number][]).flatMap(([kind, rate]) => {
      if (plantId === AG.id && offset < -12) return []
      const expected = rate * weekBoost(kind, plantId, offset)
      const count = Math.floor(expected) + (historyRandom() < expected % 1 ? 1 : 0)
      const priority = ALARM_RULES.find((r) => r.kind === kind)!.priority
      const [low, high] = ACK_RANGE[priority]!
      return Array.from({ length: count }, (_, n) => {
        const ackMin = Math.round(low + (high - low) * historyRandom() ** 1.6)
        return {
          id: `ah-${plantId}-${kind}-${offset}-${n}`,
          plantId,
          kind,
          priority,
          raisedAt: new Date(toMs(day(offset)) + historyRandom() * DAY).toISOString(),
          ackMin,
          resolveMin: ackMin + Math.round(20 + 280 * historyRandom()),
        }
      })
    }),
  ),
)

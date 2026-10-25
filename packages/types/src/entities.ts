import type {
  AlarmKind,
  AlarmPriority,
  AlarmStatus,
  AlarmVerb,
  AuxState,
  AuxSystemKind,
  EquipmentGroup,
  EscalationLevel,
  IssueStatus,
  LinkState,
  MilestoneState,
  PlantPhase,
  Region,
  Role,
  ScadaEventKind,
  SourceKind,
  SourceState,
  UnitState,
} from './enums'

export interface Plant {
  id: string
  code: string
  name: string
  region: Region
  /** Planned capacity from the project basis, not verified available output. */
  capacityMw: number
  phase: PlantPhase
  /** Approximate position on the overview map, in map units. Exact coordinates are pending (Q24). */
  map: { x: number; y: number }
  link: LinkState
  /** Round-trip latency of the site link in milliseconds. */
  latencyMs: number
  /** Last sample time for a link that has stopped reporting. */
  frozenAt: string | null
  contractor: string
  tankCapacityM3: number
  /** Tank level at FIXTURE_NOW as a fraction. */
  tankLevel: number
}

export interface Unit {
  id: string
  plantId: string
  code: string
  ratingMw: number
  engine: string
  controller: string
  state: UnitState
  runHours: number
  /** Load fraction while running. */
  load: number
  /** Offset added to the simulated exhaust temperature, so one unit can run hot. */
  exhaustBiasC: number
}

export interface Person {
  id: string
  name: string
  role: Role
  title: string
  plantId: string | null
  email: string
}

export interface AlarmEvent {
  at: string
  by: string
  verb: AlarmVerb
  note?: string
}

export interface Alarm {
  id: string
  code: string
  plantId: string
  unitId: string | null
  kind: AlarmKind
  priority: AlarmPriority
  status: AlarmStatus
  raisedAt: string
  message: string
  /** The reading that tripped the rule, with its unit. */
  reading: string
  assigneeId: string | null
  escalation: EscalationLevel
  history: AlarmEvent[]
  resolution: string | null
  postIncident: string | null
}

export interface Milestone {
  id: string
  plantId: string
  name: string
  due: string
  state: MilestoneState
}

export interface ProjectIssue {
  id: string
  plantId: string
  title: string
  owner: string
  due: string
  status: IssueStatus
}

export interface ProgressUpdate {
  id: string
  plantId: string
  at: string
  by: string
  progress: number
  note: string
  photos: SitePhoto[]
}

/** A dated site photo. Seeded photos have no file (`url: null`) and render as a captioned placeholder. */
export interface SitePhoto {
  id: string
  caption: string
  url: string | null
}

export interface DataSource {
  id: string
  plantId: string
  kind: SourceKind
  name: string
  protocol: string
  state: SourceState
  note: string
}

export interface Camera {
  id: string
  plantId: string
  name: string
  online: boolean
}

export interface DailyEnergy {
  plantId: string
  date: string
  mwh: number
  fuelM3: number
  availability: number
}

export interface BillingMonth {
  month: string
  billedUsd: number
  collectedUsd: number
}

export interface AlarmRule {
  id: string
  kind: AlarmKind
  condition: string
  delaySec: number
  priority: AlarmPriority
  approved: boolean
}

export interface EscalationRule {
  level: EscalationLevel
  owner: string
  responseMin: number
  channels: string
}

/** A closed alarm from the last 30 days, kept for response-time and cause analysis. */
export interface AlarmRecord {
  id: string
  plantId: string
  kind: AlarmKind
  priority: AlarmPriority
  raisedAt: string
  /** Minutes from raise to acknowledge. */
  ackMin: number
  /** Minutes from raise to resolve. */
  resolveMin: number
}

/** One Sequence of Events record, time-stamped at the source device (spec 3.2 and 6.1). */
export interface ScadaEvent {
  id: string
  plantId: string
  unitId: string | null
  group: EquipmentGroup
  kind: ScadaEventKind
  /** Device tag, for example 52-G2 for a generator breaker. */
  tag: string
  message: string
  /** Source time stamp in UTC with millisecond resolution. */
  sourceAt: string
  /** When the Command Center received it. Later than `sourceAt` by the link delay, or by minutes after a back-fill. */
  receivedAt: string
  /** The first event of a trip sequence. */
  firstOut: boolean
}

export interface AuxSystem {
  plantId: string
  kind: AuxSystemKind
  state: AuxState
  /** Headline reading or status line. */
  value: string
}

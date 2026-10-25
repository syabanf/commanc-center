import type { AlarmKind, AlarmPriority, Plant, Unit, UnitState } from '@gpi/types'
import { ESCALATION_RULES } from './seed'
import type { PlantReading } from './telemetry'

// Scripted what-if scenarios for operator training in the 3D view. A frame is a pure function of the
// scenario, the plant snapshot taken when the run started, the sim time and the trainee's actions.
// Nothing here touches the store or the plant.

export type ScenarioId = 'unit_trip' | 'link_outage' | 'low_fuel' | 'load_ramp'

export interface SimUnit {
  state: UnitState
  mw: number
}

export interface SimEvent {
  atS: number
  /** Who produced the record: plant devices, the central system, or the trainee. */
  source: 'plant' | 'console' | 'operator'
  tag: string
  message: string
  firstOut?: boolean
}

export interface SimAlarm {
  raisedAtS: number
  kind: AlarmKind
  priority: AlarmPriority
  message: string
  unitId: string | null
  escalation: 1 | 2 | 3
}

/** What the trainee did, in sim seconds. */
export interface SimPractice {
  ackAtS?: number
  assignAtS?: number
  assignee?: string
}

export interface SimFrame {
  tS: number
  units: Record<string, SimUnit>
  mw: number
  frequencyHz: number
  tankLevel: number
  linkUp: boolean
  bufferedSamples: number
  /** Demand the running units cannot cover, in MW. */
  unservedMw: number
  /** False while the fuel transfer pump to the day tank is stopped. */
  transferPumpOn: boolean
  /** True while the plant buffer drains into the central historian after an outage. */
  backfilling: boolean
  events: SimEvent[]
  alarm: SimAlarm | null
}

export interface SimBase {
  plant: Plant
  units: Unit[]
  reading: PlantReading
}

export interface Scenario {
  id: ScenarioId
  label: string
  description: string
  durationS: number
  /** Why the scenario cannot run on this plant, or null when it can. */
  blocker: (base: SimBase) => string | null
  frame: (base: SimBase, tS: number, practice: SimPractice) => SimFrame
}

const LEVEL_1_S = ESCALATION_RULES[0]!.responseMin * 60
const LEVEL_2_S = ESCALATION_RULES[1]!.responseMin * 60
/** Governors share a lost load over about a minute. */
const RAMP_S = 60
/** Assumed day tank volume for the low-fuel scenario, in litres, until the tank schedule arrives. */
export const SIM_DAY_TANK_L = 60_000

const ease = (x: number) => Math.min(1, Math.max(0, x))
const running = (base: SimBase) => base.units.filter((u) => u.state === 'running')
const mwOf = (base: SimBase, unitId: string) => base.reading.units.find((r) => r.unitId === unitId)?.mw ?? 0

function snapshot(base: SimBase): Record<string, SimUnit> {
  return Object.fromEntries(base.units.map((u) => [u.id, { state: u.state, mw: mwOf(base, u.id) }]))
}

/** Spread `demand` over the units that are on line, capped at each rating; returns the unserved part. */
function share(base: SimBase, units: Record<string, SimUnit>, demand: number): number {
  const online = base.units.filter((u) => units[u.id]!.state === 'running')
  const capacity = online.reduce((s, u) => s + u.ratingMw * 0.98, 0)
  const served = Math.min(demand, capacity)
  for (const u of online) units[u.id]!.mw = (served * u.ratingMw * 0.98) / (capacity || 1)
  return Math.max(0, demand - served)
}

/** Ownerless alarms climb one level per the escalation matrix; assigning an owner stops the clock. */
function escalate(alarm: SimAlarm, tS: number, practice: SimPractice, events: SimEvent[]): SimAlarm {
  const stop = practice.assignAtS ?? Infinity
  const at2 = alarm.raisedAtS + LEVEL_1_S
  const at3 = at2 + LEVEL_2_S
  let level: 1 | 2 | 3 = 1
  if (tS >= at2 && stop > at2) {
    level = 2
    events.push({
      atS: at2,
      source: 'console',
      tag: 'ESC',
      message: 'No owner after 30 min, escalated to the Command Center supervisor',
    })
  }
  if (tS >= at3 && stop > at3) {
    level = 3
    events.push({
      atS: at3,
      source: 'console',
      tag: 'ESC',
      message: 'No owner after 60 more min, escalated to the operations director',
    })
  }
  return { ...alarm, escalation: level }
}

function practiceEvents(alarm: SimAlarm | null, tS: number, practice: SimPractice, events: SimEvent[]) {
  if (!alarm) return
  if (practice.ackAtS !== undefined && practice.ackAtS <= tS)
    events.push({
      atS: practice.ackAtS,
      source: 'operator',
      tag: 'ACK',
      message: 'You acknowledged the alarm',
    })
  if (practice.assignAtS !== undefined && practice.assignAtS <= tS)
    events.push({
      atS: practice.assignAtS,
      source: 'operator',
      tag: 'ASSIGN',
      message: `You assigned the alarm to ${practice.assignee ?? 'the site crew'}`,
    })
}

function finish(
  tS: number,
  practice: SimPractice,
  parts: Omit<SimFrame, 'tS' | 'events' | 'alarm' | 'mw' | 'transferPumpOn' | 'backfilling'> &
    Partial<Pick<SimFrame, 'transferPumpOn' | 'backfilling'>> & {
      events: SimEvent[]
      alarm: SimAlarm | null
    },
): SimFrame {
  const events = [...parts.events]
  const alarm =
    parts.alarm && tS >= parts.alarm.raisedAtS ? escalate(parts.alarm, tS, practice, events) : null
  practiceEvents(alarm, tS, practice, events)
  const mw = Object.values(parts.units).reduce((s, u) => s + u.mw, 0)
  return {
    transferPumpOn: true,
    backfilling: false,
    ...parts,
    tS,
    mw,
    alarm,
    events: events.filter((e) => e.atS <= tS).sort((a, b) => a.atS - b.atS),
  }
}

const unitTrip: Scenario = {
  id: 'unit_trip',
  label: 'Generator trip',
  description:
    'The most loaded unit trips on reverse power. The others pick up its load and the console raises a critical alarm.',
  durationS: 40 * 60,
  blocker: (base) => (running(base).length >= 2 ? null : 'Needs at least two running units.'),
  frame(base, tS, practice) {
    const units = snapshot(base)
    const victim = running(base).reduce((a, b) => (mwOf(base, b.id) > mwOf(base, a.id) ? b : a))
    const n = victim.code.split('-G')[1]
    const tripAt = 5
    const demand = base.reading.mw
    const events: SimEvent[] = [
      {
        atS: tripAt,
        source: 'plant',
        tag: `32R-G${n}`,
        message: 'Reverse power relay 32R operated',
        firstOut: true,
      },
      { atS: tripAt + 0.014, source: 'plant', tag: `86-G${n}`, message: `Lockout relay 86-G${n} operated` },
      {
        atS: tripAt + 0.046,
        source: 'plant',
        tag: `52-G${n}`,
        message: `Generator breaker 52-G${n} opened by protection`,
      },
      { atS: tripAt + 1.3, source: 'plant', tag: victim.code, message: `${victim.code} engine shut down` },
      {
        atS: tripAt + RAMP_S,
        source: 'plant',
        tag: 'GOV',
        message: 'Remaining units settled on the shared load',
      },
    ]
    let unservedMw = 0
    let frequencyHz = base.reading.frequencyHz
    if (tS >= tripAt) {
      const lost = units[victim.id]!.mw
      units[victim.id] = { state: 'tripped', mw: 0 }
      const before = Object.fromEntries(Object.entries(units).map(([id, u]) => [id, u.mw]))
      unservedMw = share(base, units, demand)
      // Governors move from the old set points to the new share over the ramp.
      const k = ease((tS - tripAt) / RAMP_S)
      for (const [id, u] of Object.entries(units))
        if (u.state === 'running') u.mw = before[id]! + (u.mw - before[id]!) * k
      const dip = Math.min(1.2, (lost / Math.max(1, demand)) * 3)
      frequencyHz = 50 - dip * Math.exp(-(tS - tripAt) / 12) - 0.04
      if (unservedMw > 0)
        events.push({
          atS: tripAt + RAMP_S,
          source: 'console',
          tag: 'LOAD',
          message: `${unservedMw.toFixed(1)} MW of demand above the remaining capacity`,
        })
    }
    const alarm: SimAlarm = {
      raisedAtS: tripAt + 2,
      kind: 'generator_trip',
      priority: 'critical',
      message: `${victim.code} tripped on reverse power protection`,
      unitId: victim.id,
      escalation: 1,
    }
    events.push({
      atS: alarm.raisedAtS,
      source: 'console',
      tag: 'ALM',
      message: `Critical alarm raised: ${alarm.message}`,
    })
    return finish(tS, practice, {
      units,
      frequencyHz,
      tankLevel: base.reading.tankLevel,
      linkUp: true,
      bufferedSamples: 0,
      unservedMw,
      events,
      alarm,
    })
  },
}

const linkOutage: Scenario = {
  id: 'link_outage',
  label: 'Starlink outage',
  description:
    'The site link drops for 8 minutes. Values freeze in Khobar, the plant buffers samples and back-fills them when the link returns.',
  durationS: 15 * 60,
  blocker: (base) => (base.plant.link === 'offline' ? 'The link is already down at this plant.' : null),
  frame(base, tS, practice) {
    const lostAt = 10
    const restoreAt = lostAt + 8 * 60
    const drainS = 60
    const down = tS >= lostAt && tS < restoreAt
    const filled = Math.floor((Math.min(tS, restoreAt) - lostAt) / 5)
    const bufferedSamples =
      tS < lostAt ? 0 : down ? filled : Math.max(0, Math.round(filled * (1 - (tS - restoreAt) / drainS)))
    const events: SimEvent[] = [
      {
        atS: lostAt,
        source: 'plant',
        tag: 'STL',
        message: 'Starlink link lost; the plant keeps running on its own',
      },
      { atS: lostAt + 15, source: 'console', tag: 'ALM', message: 'High alarm raised: no samples for 15 s' },
      { atS: restoreAt, source: 'plant', tag: 'STL', message: 'Starlink link restored' },
      {
        atS: restoreAt + 2,
        source: 'console',
        tag: 'HIST',
        message: 'Back-fill started from the plant buffer',
      },
      {
        atS: restoreAt + drainS,
        source: 'console',
        tag: 'HIST',
        message: 'Back-fill complete, source time stamps kept',
      },
    ]
    return finish(tS, practice, {
      units: snapshot(base),
      frequencyHz: base.reading.frequencyHz,
      tankLevel: base.reading.tankLevel,
      linkUp: !down,
      bufferedSamples,
      backfilling: !down && bufferedSamples > 0,
      unservedMw: 0,
      events,
      alarm: {
        raisedAtS: lostAt + 15,
        kind: 'comms_loss',
        priority: 'high',
        message: `No data from ${base.plant.name}`,
        unitId: null,
        escalation: 1,
      },
    })
  },
}

const lowFuel: Scenario = {
  id: 'low_fuel',
  label: 'Low day tank',
  description:
    'The transfer pump trips and the day tank drains at full burn. Assigning the alarm sends the crew to restart the pump.',
  durationS: 90 * 60,
  blocker: (base) => (base.reading.fuelNetLph > 0 ? null : 'Nothing burns fuel at this plant.'),
  frame(base, tS, practice) {
    const start = 0.3
    const perS = base.reading.fuelNetLph / 3600 / SIM_DAY_TANK_L
    const restartAt = practice.assignAtS !== undefined ? practice.assignAtS + 5 * 60 : Infinity
    const lowAt = (start - 0.25) / perS
    const refill = 3 * perS
    const level =
      tS < restartAt
        ? start - perS * tS
        : Math.min(0.95, start - perS * restartAt + refill * (tS - restartAt))
    const events: SimEvent[] = [
      {
        atS: 3,
        source: 'plant',
        tag: 'P-TR1',
        message: 'Transfer pump P-TR1 tripped on motor overload',
        firstOut: true,
      },
      { atS: lowAt, source: 'plant', tag: 'LSL-DT1', message: 'Day tank level switch low operated' },
    ]
    if (restartAt <= tS)
      events.push({
        atS: restartAt,
        source: 'plant',
        tag: 'P-TR1',
        message: 'Site crew restarted transfer pump P-TR1',
      })
    return finish(tS, practice, {
      units: snapshot(base),
      frequencyHz: base.reading.frequencyHz,
      tankLevel: Math.max(0, level),
      transferPumpOn: tS < 3 || tS >= restartAt,
      linkUp: true,
      bufferedSamples: 0,
      unservedMw: 0,
      events,
      alarm: {
        raisedAtS: lowAt + 1,
        kind: 'low_tank_level',
        priority: 'medium',
        message: 'Day tank below 25% with the transfer pump stopped',
        unitId: null,
        escalation: 1,
      },
    })
  },
}

const loadRamp: Scenario = {
  id: 'load_ramp',
  label: 'Evening peak',
  description:
    'Demand rises 15% over 10 minutes. A standby unit starts and synchronises when one exists; otherwise demand goes unserved.',
  durationS: 15 * 60,
  blocker: (base) => (running(base).length ? null : 'No unit is running.'),
  frame(base, tS, practice) {
    const units = snapshot(base)
    const demand = base.reading.mw * (1 + 0.15 * ease(tS / 600))
    const standby = base.units.find((u) => u.state === 'standby')
    const events: SimEvent[] = [
      { atS: 0, source: 'console', tag: 'LOAD', message: 'Evening demand starts to rise' },
    ]
    const startAt = 180
    const closeAt = startAt + 70
    if (standby) {
      const n = standby.code.split('-G')[1]
      events.push(
        {
          atS: startAt,
          source: 'plant',
          tag: standby.code,
          message: `${standby.code} started by the plant load management`,
        },
        {
          atS: closeAt,
          source: 'plant',
          tag: `52-G${n}`,
          message: `Breaker 52-G${n} closed after synchronising`,
        },
      )
      if (tS >= closeAt) units[standby.id] = { state: 'running', mw: 0 }
    }
    const unservedMw = share(base, units, demand)
    // Without a standby unit, demand passes the running capacity at a fixed moment of the ramp.
    const capacity = running(base).reduce((s, u) => s + u.ratingMw * 0.98, 0)
    const shortAt = standby ? Infinity : ((capacity / Math.max(1, base.reading.mw) - 1) / 0.15) * 600
    const alarm: SimAlarm | null =
      shortAt <= 600
        ? {
            raisedAtS: Math.max(1, shortAt),
            kind: 'generation_drop',
            priority: 'high',
            message: 'Demand above available capacity',
            unitId: null,
            escalation: 1,
          }
        : null
    if (alarm)
      events.push({
        atS: alarm.raisedAtS,
        source: 'console',
        tag: 'LOAD',
        message: 'Running units at full rating, demand goes unserved',
      })
    return finish(tS, practice, {
      units,
      frequencyHz: unservedMw > 0 ? 49.7 : base.reading.frequencyHz,
      tankLevel: base.reading.tankLevel,
      linkUp: true,
      bufferedSamples: 0,
      unservedMw,
      events,
      alarm,
    })
  },
}

export const SCENARIOS: Scenario[] = [unitTrip, linkOutage, lowFuel, loadRamp]

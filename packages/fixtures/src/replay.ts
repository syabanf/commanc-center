import type { Plant, ScadaEvent, Unit, UnitState } from '@gpi/types'
import { SCADA_EVENTS } from './scada'
import { UNITS } from './seed'

// Replays a plant's Sequence of Events on the 3D model. Each step is the plant state just after one
// recorded event, so the model can walk the record forwards and backwards.

export interface ReplayState {
  units: Record<string, UnitState>
  linkUp: boolean
  /** A low-level switch has operated on the day tank. */
  tankLow: boolean
}

export interface ReplayStep extends ReplayState {
  event: ScadaEvent
}

const STOPPING: ScadaEvent['kind'][] = ['protection_trip', 'unit_stop', 'breaker_open']

/** A unit's state before the record starts, worked back from its first event. */
function before(unit: Unit, first: ScadaEvent | undefined): UnitState {
  if (!first || unit.state === 'not_commissioned') return unit.state
  if (STOPPING.includes(first.kind)) return 'running'
  if (first.kind === 'unit_start' || first.kind === 'breaker_close') return 'standby'
  return unit.state
}

function apply(state: ReplayState, e: ScadaEvent): ReplayState {
  const units = { ...state.units }
  if (e.unitId && units[e.unitId]) {
    const current = units[e.unitId]!
    if (e.kind === 'protection_trip') units[e.unitId] = 'tripped'
    else if ((e.kind === 'unit_stop' || e.kind === 'breaker_open') && current !== 'tripped')
      units[e.unitId] = 'standby'
    else if (e.kind === 'selector_local') units[e.unitId] = 'maintenance'
    // A started engine only counts as running once its breaker closes onto the bus.
    else if (e.kind === 'breaker_close') units[e.unitId] = 'running'
  }
  return {
    units,
    linkUp: e.kind === 'link_lost' ? false : e.kind === 'link_restored' ? true : state.linkUp,
    tankLow: state.tankLow || e.kind === 'level_switch',
  }
}

/** The plant before its first recorded event, and the state after each event, oldest first. */
export function replaySteps(plant: Plant, units: Unit[] = UNITS, events: ScadaEvent[] = SCADA_EVENTS) {
  const record = events
    .filter((e) => e.plantId === plant.id)
    .sort((a, b) => a.sourceAt.localeCompare(b.sourceAt))
  const own = units.filter((u) => u.plantId === plant.id)
  const firstLink = record.find((e) => e.kind === 'link_lost' || e.kind === 'link_restored')
  const initial: ReplayState = {
    units: Object.fromEntries(
      own.map((u) => [
        u.id,
        before(
          u,
          record.find((e) => e.unitId === u.id),
        ),
      ]),
    ),
    linkUp: firstLink ? firstLink.kind === 'link_lost' : plant.link !== 'offline',
    tankLow: false,
  }
  const steps: ReplayStep[] = []
  let state = initial
  for (const event of record) {
    state = apply(state, event)
    steps.push({ ...state, event })
  }
  return { initial, steps }
}

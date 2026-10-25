import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOUR, ago, toMs } from './clock'
import { PLANTS, UNITS } from './seed'
import { SCADA_EVENTS, SPEC, isBackfilled, tagEstimate } from './scada'
import { initialState, isSuppressed, reduce } from './store'

test('an alarm from equipment in maintenance is suppressed and never escalates', () => {
  const g5 = initialState.alarms.find((a) => a.unitId === 'un-jm-5')!
  assert.ok(isSuppressed(g5))
  const later = new Date(toMs(ago(0)) + 4 * HOUR).toISOString()
  const s = reduce(initialState, {
    action: { type: 'alarms/escalateDue' },
    meta: { by: 'system', at: later },
  })
  assert.equal(s.alarms.find((a) => a.id === g5.id)!.escalation, 1)
})

test('the JM-G2 trip sequence starts with one first-out event, millisecond apart at source', () => {
  const trip = SCADA_EVENTS.filter((e) => e.unitId === 'un-jm-2').sort((a, b) =>
    a.sourceAt.localeCompare(b.sourceAt),
  )
  assert.equal(trip[0]!.firstOut, true)
  assert.equal(trip.filter((e) => e.firstOut).length, 1)
  assert.equal(toMs(trip[1]!.sourceAt) - toMs(trip[0]!.sourceAt), 14)
})

test('events raised during an Umbaikha outage arrive back-filled with their source time kept', () => {
  const filled = SCADA_EVENTS.filter(isBackfilled)
  assert.ok(filled.length >= 2)
  assert.ok(filled.every((e) => e.plantId === 'pl-um' && toMs(e.receivedAt) > toMs(e.sourceAt)))
})

test('every plant fits the 1,500-tag base with 25% spare at the midpoint allowance', () => {
  for (const plant of PLANTS) {
    const points = tagEstimate(plant, UNITS).reduce((sum, g) => sum + g.points, 0)
    assert.ok(points * (1 + SPEC.tagSpare) <= SPEC.tagBase, `${plant.code} needs ${points} points`)
  }
})

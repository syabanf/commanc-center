import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW } from './clock'
import { PLANTS, UNITS } from './seed'
import { SCENARIOS, type SimBase } from './simulation'
import { plantReading } from './telemetry'

const baseOf = (code: string): SimBase => {
  const plant = PLANTS.find((p) => p.code === code)!
  return {
    plant,
    units: UNITS.filter((u) => u.plantId === plant.id),
    reading: plantReading(plant, UNITS, FIXTURE_NOW),
  }
}
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!

test('a generator trip moves its load to the other units without passing their rating', () => {
  const base = baseOf('AB')
  const end = scenario('unit_trip').frame(base, 120, {})
  const tripped = Object.entries(end.units).filter(([, u]) => u.state === 'tripped')
  assert.equal(tripped.length, 1)
  for (const u of base.units) assert.ok(end.units[u.id]!.mw <= u.ratingMw)
  assert.ok(
    Math.abs(end.mw + end.unservedMw - base.reading.mw) < 0.01,
    'demand is served or reported unserved',
  )
  assert.equal(end.events[0]!.firstOut, true)
})

test('an unowned trip alarm escalates at 30 minutes, and assigning it first stops the clock', () => {
  const trip = scenario('unit_trip')
  const base = baseOf('AB')
  assert.equal(trip.frame(base, 35 * 60, {}).alarm!.escalation, 2)
  assert.equal(
    trip.frame(base, 35 * 60, { ackAtS: 60, assignAtS: 120, assignee: 'Site O&M lead' }).alarm!.escalation,
    1,
  )
})

test('a Starlink outage buffers samples while down and drains them after the link returns', () => {
  const outage = scenario('link_outage')
  const base = baseOf('JM')
  const down = outage.frame(base, 5 * 60, {})
  assert.equal(down.linkUp, false)
  assert.ok(down.bufferedSamples > 0)
  assert.equal(outage.frame(base, 8 * 60 + 40, {}).backfilling, true)
  assert.equal(outage.frame(base, 14 * 60, {}).bufferedSamples, 0)
})

test('assigning the low-tank alarm sends the crew, and the tank refills', () => {
  const fuel = scenario('low_fuel')
  const base = baseOf('JM')
  const raisedAt = fuel.frame(base, fuel.durationS, {}).alarm!.raisedAtS
  const assigned = { ackAtS: raisedAt + 10, assignAtS: raisedAt + 20 }
  const later = raisedAt + 20 + 15 * 60
  assert.ok(fuel.frame(base, later, assigned).tankLevel > fuel.frame(base, later, {}).tankLevel)
  assert.equal(fuel.frame(base, later, {}).transferPumpOn, false)
  assert.equal(fuel.frame(base, later, assigned).transferPumpOn, true)
})

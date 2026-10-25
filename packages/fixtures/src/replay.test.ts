import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replaySteps } from './replay'
import { PLANTS, UNITS } from './seed'

test('replaying every recorded event lands on the units as they stand today', () => {
  for (const plant of PLANTS) {
    const { steps, initial } = replaySteps(plant)
    const end = steps.at(-1)?.units ?? initial.units
    for (const unit of UNITS.filter((u) => u.plantId === plant.id)) {
      assert.equal(end[unit.id], unit.state, `${unit.code} after replay`)
    }
  }
})

test('the JM-G2 trip turns the unit tripped at the first-out event and Umbaikha loses its link twice', () => {
  const jm = replaySteps(PLANTS.find((p) => p.code === 'JM')!)
  const firstOut = jm.steps.find((s) => s.event.firstOut && s.event.unitId === 'un-jm-2')!
  assert.equal(firstOut.units['un-jm-2'], 'tripped')
  const um = replaySteps(PLANTS.find((p) => p.code === 'UM')!)
  assert.equal(um.steps.filter((s) => !s.linkUp && s.event.kind === 'link_lost').length, 2)
  assert.equal(um.steps.at(-1)!.linkUp, true)
})

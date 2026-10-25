import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLANTS, UNITS } from './seed'
import { siteLayout } from './site-plan'

test('every genset sits inside the engine hall without overlapping another', () => {
  for (const plant of PLANTS) {
    const layout = siteLayout(plant, UNITS)
    const hall = layout.zones.find((z) => z.kind === 'engine_hall')!.rect
    assert.equal(layout.units.length, UNITS.filter((u) => u.plantId === plant.id).length)
    for (const [i, { rect }] of layout.units.entries()) {
      assert.ok(rect.x >= hall.x && rect.x + rect.w <= hall.x + hall.w, `${plant.code} unit ${i} fits across`)
      assert.ok(rect.y >= hall.y && rect.y + rect.h <= hall.y + hall.h, `${plant.code} unit ${i} fits down`)
      for (const { rect: other } of layout.units.slice(i + 1)) {
        const apart =
          rect.x + rect.w <= other.x ||
          other.x + other.w <= rect.x ||
          rect.y + rect.h <= other.y ||
          other.y + other.h <= rect.y
        assert.ok(apart, `${plant.code} units do not overlap`)
      }
    }
  }
})

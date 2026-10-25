import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FURNITURE, ROOM, roomChecks, seatZone, videoWallSize } from './control-room'

test('every piece of furniture and every chair fits inside the 5.0 × 3.6 m room', () => {
  for (const f of FURNITURE) {
    const { x, z, w, d, h } = f.box
    assert.ok(x >= 0 && x + w <= ROOM.widthM + 0.001 && z >= 0 && z + d <= ROOM.lengthM + 0.001, f.id)
    assert.ok(h <= ROOM.heightM, `${f.id} height`)
    if (f.monitors) {
      const s = seatZone(f)
      assert.ok(s.x1 <= ROOM.widthM && s.z1 <= ROOM.lengthM, `${f.id} chair`)
    }
  }
  assert.ok(videoWallSize().w <= ROOM.widthM - 0.3, 'video wall leaves room at the side walls')
})

test('the proposed layout keeps the wall inside 60° and flags the tight floor area', () => {
  const checks = Object.fromEntries(roomChecks().map((c) => [c.id, c]))
  assert.equal(checks.angle!.tone, 'ok')
  assert.equal(checks.walkway!.tone, 'ok')
  assert.equal(checks.door!.tone, 'ok')
  assert.equal(checks.area!.tone, 'warning')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MINUTE, ago, toMs } from './clock'
import { ActionRefused, type AppAction, initialState, reduce } from './store'

const run = (state = initialState, action: AppAction, by = 'pe-op1', at = ago(0)) =>
  reduce(state, { action, meta: { by, at } })
const alarm = (state: typeof initialState, id: string) => state.alarms.find((a) => a.id === id)!

test('an alarm walks new → acknowledged → assigned → resolved → closed', () => {
  let s = run(initialState, { type: 'alarms/acknowledge', id: 'al-1' })
  assert.equal(alarm(s, 'al-1').status, 'acknowledged')
  s = run(s, { type: 'alarms/assign', id: 'al-1', personId: 'pe-jm', note: 'Check reverse power relay' })
  assert.equal(alarm(s, 'al-1').assigneeId, 'pe-jm')
  assert.throws(() => run(s, { type: 'alarms/resolve', id: 'al-1', resolution: '  ' }), ActionRefused)
  s = run(s, { type: 'alarms/resolve', id: 'al-1', resolution: 'Relay reset, unit resynchronised' }, 'pe-jm')
  assert.throws(() => run(s, { type: 'alarms/close', id: 'al-1', postIncident: '' }), /post-incident/)
  s = run(s, { type: 'alarms/close', id: 'al-1', postIncident: 'Governor droop setting corrected' })
  const done = alarm(s, 'al-1')
  assert.equal(done.status, 'closed')
  assert.deepEqual(
    done.history.map((e) => e.verb),
    ['raised', 'acknowledged', 'assigned', 'resolved', 'closed'],
  )
})

test('assigning a new alarm is refused with the blocker sentence', () => {
  assert.throws(
    () => run(initialState, { type: 'alarms/assign', id: 'al-1', personId: 'pe-jm', note: '' }),
    /Acknowledge the alarm/,
  )
})

test('the escalation timer raises ownerless alarms one level when the response time passes', () => {
  const s = run(initialState, { type: 'alarms/escalateDue' }, 'system')
  assert.equal(alarm(s, 'al-4').escalation, 2, 'Aden comms loss waited 45 min at level 1')
  assert.equal(alarm(s, 'al-1').escalation, 1, 'the trip is 9 min old')
  assert.equal(alarm(s, 'al-7').escalation, 1, 'low priority never escalates')
  const later = run(
    s,
    { type: 'alarms/escalateDue' },
    'system',
    new Date(toMs(ago(0)) + 25 * MINUTE).toISOString(),
  )
  assert.equal(alarm(later, 'al-1').escalation, 2)
})

test('progress cannot go backwards', () => {
  assert.throws(
    () =>
      run(initialState, {
        type: 'projects/recordProgress',
        plantId: 'pl-ag',
        progress: 0.7,
        note: 'x',
        photos: [],
      }),
    /below the last recorded 78%/,
  )
  const s = run(
    initialState,
    {
      type: 'projects/recordProgress',
      plantId: 'pl-ag',
      progress: 0.8,
      note: 'Unit 3 cold commissioned',
      photos: [],
    },
    'pe-ag',
  )
  assert.equal(s.progressUpdates[0]!.progress, 0.8)
})

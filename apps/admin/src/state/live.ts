import {
  DATA_SOURCES,
  PEOPLE,
  PLANTS,
  SAMPLE_MS,
  UNITS,
  fleetSummary,
  nowMs,
  plantReading,
} from '@gpi/fixtures'
import { toast } from '@gpi/ui'
import type { AppAction } from '@gpi/fixtures'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'
import { useStore } from './store'

export const plantById = new Map(PLANTS.map((p) => [p.id, p]))
export const unitById = new Map(UNITS.map((u) => [u.id, u]))
export const personById = new Map(PEOPLE.map((p) => [p.id, p]))
export const unitsOf = (plantId: string) => UNITS.filter((u) => u.plantId === plantId)
export const sourcesOf = (plantId: string) => DATA_SOURCES.filter((s) => s.plantId === plantId)

/** Event actors that are not people: `rule` raises alarms, `system` runs the escalation timer. */
const MACHINE_ACTORS: Record<string, string> = { rule: 'Alarm rule', system: 'Escalation timer' }

export const personName = (id: string | null) =>
  id === null ? 'Unassigned' : (MACHINE_ACTORS[id] ?? personById.get(id)?.name ?? 'Unknown user')

/** App clock that re-renders every `interval` ms. */
export function useNow(interval = 1000): number {
  const [now, setNow] = useState(nowMs)
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowMs()), interval)
    return () => window.clearInterval(id)
  }, [interval])
  return now
}

/** Live readings for every plant, refreshed at the sample rate. */
export function useLive() {
  const now = useNow(SAMPLE_MS)
  return useMemo(() => {
    const readings = PLANTS.map((p) => plantReading(p, UNITS, now))
    return {
      now,
      readings,
      byPlant: new Map(readings.map((r) => [r.plantId, r])),
      fleet: fleetSummary(PLANTS, readings),
    }
  }, [now])
}

/**
 * Dispatch stamped with the signed-in user. A refused action shows the blocker in a danger toast;
 * a successful one shows `success` when given. Returns whether the action went through.
 */
export function useAct() {
  const { dispatch } = useStore()
  const { user } = useAuth()
  return useCallback(
    (action: AppAction, success?: { title: string; description?: string }) => {
      const result = dispatch(action, user.id)
      if (!result.ok) toast(result.reason, { tone: 'danger' })
      else if (success) toast(success.title, { tone: 'success', description: success.description })
      return result.ok
    },
    [dispatch, user.id],
  )
}

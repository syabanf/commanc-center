import {
  type AppAction,
  type AppState,
  ActionRefused,
  loadLocalState,
  nowIso,
  reduce,
  saveLocalState,
} from '@gpi/fixtures'
import { type ReactNode, createContext, use, useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'gpi.admin.state.v1'

export type DispatchResult = { ok: true } | { ok: false; reason: string }
type Dispatch = (action: AppAction, by: string) => DispatchResult

interface Store {
  state: AppState
  dispatch: Dispatch
  storageError: boolean
  reset: () => void
}

const StoreContext = createContext<Store | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => loadLocalState(KEY))
  const [storageError, setStorageError] = useState(false)
  // The reducer can refuse, so dispatch applies it to the latest state synchronously and reports back.
  const latest = useRef(state)

  const dispatch = useCallback<Dispatch>((action, by) => {
    try {
      const next = reduce(latest.current, { action, meta: { by, at: nowIso() } })
      latest.current = next
      setState(next)
      return { ok: true }
    } catch (error) {
      if (error instanceof ActionRefused) return { ok: false, reason: error.message }
      throw error
    }
  }, [])

  useEffect(() => {
    setStorageError(!saveLocalState(KEY, state))
  }, [state])

  // The escalation timer a backend would run: on load and every minute, as the system actor.
  useEffect(() => {
    const tick = () => dispatch({ type: 'alarms/escalateDue' }, 'system')
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [dispatch])

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // nothing stored
    }
    window.location.reload()
  }, [])

  return <StoreContext value={{ state, dispatch, storageError, reset }}>{children}</StoreContext>
}

export function useStore(): Store {
  const store = use(StoreContext)
  if (!store) throw new Error('useStore needs AppStateProvider')
  return store
}

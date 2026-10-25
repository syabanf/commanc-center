import { useSearchParams } from 'react-router'

/** One URL parameter as state. Setting it replaces the history entry, and the default value removes it. */
export function useSearchParam<T extends string>(name: string, fallback: T, allowed: readonly T[]) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(name) as T | null
  const value = raw !== null && allowed.includes(raw) ? raw : fallback
  const set = (next: T) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (next === fallback) copy.delete(name)
        else copy.set(name, next)
        return copy
      },
      { replace: true },
    )
  return [value, set] as const
}

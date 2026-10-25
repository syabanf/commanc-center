import { useSearchParams } from 'react-router'

export interface FilterGroup<T> {
  /** URL parameter that holds the selection, comma separated. */
  id: string
  label: string
  options: { value: string; label: string }[]
  match: (row: T, value: string) => boolean
}

export type FilterSelection = Partial<Record<string, string[]>>
export interface QuickView {
  id: string
  label: string
  selection: FilterSelection
}

/**
 * Multi-select filters kept in the URL. A row passes a group when it matches any selected option, and
 * passes the filters when it passes every group. Option counts apply the other groups only, so each count
 * says how many rows that option would add.
 */
export function useFilters<T>(rows: T[], groups: FilterGroup<T>[]) {
  const [params, setParams] = useSearchParams()

  const selected: Record<string, string[]> = Object.fromEntries(
    groups.map((g) => {
      const allowed = new Set(g.options.map((o) => o.value))
      return [g.id, (params.get(g.id)?.split(',') ?? []).filter((v) => allowed.has(v))]
    }),
  )

  const passes = (row: T, skip?: string) =>
    groups.every(
      (g) => g.id === skip || !selected[g.id]!.length || selected[g.id]!.some((v) => g.match(row, v)),
    )

  const apply = (next: FilterSelection) =>
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        for (const g of groups) {
          const values = next[g.id] ?? []
          if (values.length) copy.set(g.id, values.join(','))
          else copy.delete(g.id)
        }
        return copy
      },
      { replace: true },
    )

  const toggle = (groupId: string, value: string) => {
    const current = selected[groupId]!
    apply({
      ...selected,
      [groupId]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    })
  }

  return {
    groups,
    selected,
    rows: rows.filter((row) => passes(row)),
    matches: (row: T) => passes(row),
    activeCount: Object.values(selected).reduce((sum, values) => sum + values.length, 0),
    /** Stable key of the selection, for resetting pagination. */
    key: groups.map((g) => selected[g.id]!.join(',')).join('|'),
    count: (group: FilterGroup<T>, value: string) =>
      rows.filter((row) => passes(row, group.id) && group.match(row, value)).length,
    toggle,
    apply,
    clear: () => apply({}),
    /** Whether the selection equals `preset` exactly. */
    isPreset: (preset: FilterSelection) =>
      groups.every(
        (g) => [...(preset[g.id] ?? [])].sort().join(',') === [...selected[g.id]!].sort().join(','),
      ),
  }
}

export type Filters<T> = ReturnType<typeof useFilters<T>>

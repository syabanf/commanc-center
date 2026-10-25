import {
  Button,
  Chip,
  ChipRow,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
  useIsPhone,
} from '@gpi/ui'
import { SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import type { Filters, QuickView } from '../lib/use-filters'

/** "Filters" pill that opens every filter group: a popover on desktop, a bottom sheet on phones. */
export function FilterButton<T>({ filters, total }: { filters: Filters<T>; total: number }) {
  const isPhone = useIsPhone()
  const [open, setOpen] = useState(false)
  const trigger = (
    <Button
      variant={filters.activeCount ? 'secondary' : 'outline'}
      className="shrink-0"
      aria-label={filters.activeCount ? `Filters, ${filters.activeCount} active` : 'Filters'}
    >
      <SlidersHorizontal />
      Filters
      {filters.activeCount > 0 && (
        <span className="px-1.5 font-bold bg-white/20 rounded-full text-[11px] tabular-nums">
          {filters.activeCount}
        </span>
      )}
    </Button>
  )
  const body = (
    <>
      <div className="space-y-4">
        {filters.groups.map((group) => (
          <fieldset key={group.id}>
            <legend className="mb-2 font-semibold tracking-wider text-[11px] text-muted uppercase">
              {group.label}
            </legend>
            <div className="gap-2 flex flex-wrap">
              {group.options.map((option) => (
                <Chip
                  key={option.value}
                  variant="filter"
                  active={filters.selected[group.id]!.includes(option.value)}
                  aria-pressed={filters.selected[group.id]!.includes(option.value)}
                  count={filters.count(group, option.value)}
                  onClick={() => filters.toggle(group.id, option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-5 gap-2 pt-4 flex items-center justify-between border-t">
        <Button variant="ghost" onClick={filters.clear} disabled={!filters.activeCount}>
          Clear all
        </Button>
        <Button onClick={() => setOpen(false)}>
          {filters.rows.length === total ? 'Show all results' : `Show ${filters.rows.length} results`}
        </Button>
      </div>
    </>
  )

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Pick any mix. Counts show what each option would add.</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-5">{body}</div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="p-5 max-h-[70vh] w-[440px] overflow-y-auto">
        {body}
      </PopoverContent>
    </Popover>
  )
}

/** One removable chip per active option, plus Clear all. Renders nothing while no filter is on. */
export function ActiveFilters<T>({ filters, className }: { filters: Filters<T>; className?: string }) {
  if (!filters.activeCount) return null
  return (
    <div className={cn('gap-2 flex flex-wrap items-center', className)}>
      <span className="text-xs font-semibold text-muted">
        {filters.rows.length} {filters.rows.length === 1 ? 'match' : 'matches'}
      </span>
      {filters.groups.flatMap((group) =>
        filters.selected[group.id]!.map((value) => {
          const label = group.options.find((o) => o.value === value)?.label ?? value
          return (
            <button
              key={`${group.id}-${value}`}
              type="button"
              onClick={() => filters.toggle(group.id, value)}
              aria-label={`Remove filter ${group.label}: ${label}`}
              className="gap-1.5 h-8 pr-2 pl-3 text-xs font-semibold inline-flex items-center rounded-full bg-ink text-on-ink transition-colors hover:bg-ink-3 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
            >
              <span className="text-on-ink-muted">{group.label}:</span> {label}
              <X className="size-3.5" />
            </button>
          )
        }),
      )}
      <Button variant="link" size="sm" onClick={filters.clear}>
        Clear all
      </Button>
    </div>
  )
}

/** Saved combinations of filters, one tap each. Tapping the active view clears it. */
export function QuickViews<T>({ filters, views }: { filters: Filters<T>; views: QuickView[] }) {
  return (
    <ChipRow>
      {views.map((view) => {
        const active = filters.isPreset(view.selection)
        return (
          <Chip
            key={view.id}
            variant="filter"
            active={active}
            aria-pressed={active}
            onClick={() => filters.apply(active ? {} : view.selection)}
          >
            {view.label}
          </Chip>
        )
      })}
    </ChipRow>
  )
}

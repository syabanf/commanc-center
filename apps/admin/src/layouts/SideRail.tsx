import { Rail, RailCollapse, RailItem, cn } from '@gpi/ui'
import { Link, NavLink, useLocation } from 'react-router'
import { GulfMark } from '../components/GulfMark'
import { NAV, NAV_GROUPS, navFor } from './nav'
import { useNewAlarmCount } from './useAlarmCount'

export function SideRail({
  expanded,
  canExpand,
  onToggle,
}: {
  expanded: boolean
  canExpand: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const current = navFor(pathname)
  const newAlarms = useNewAlarmCount()

  return (
    <Rail
      expanded={expanded}
      header={
        <Link
          to="/"
          className={cn('gap-3 rounded-2xl flex items-center', expanded && 'px-1 w-full')}
          aria-label="Fleet overview"
        >
          <span className="size-11 p-1 rounded-xl bg-white flex shrink-0 items-center justify-center shadow-card">
            <GulfMark />
          </span>
          {expanded && (
            <span className="min-w-0">
              <span className="font-bold leading-tight tracking-tight block text-[15px]">GPI Command</span>
              <span className="block text-[11px] text-on-ink-muted">Khobar · 5 Yemen plants</span>
            </span>
          )}
        </Link>
      }
      footer={canExpand ? <RailCollapse expanded={expanded} onToggle={onToggle} /> : undefined}
    >
      {NAV_GROUPS.map((group, index) => (
        <div key={group} className="w-full">
          {expanded ? (
            <p className="px-3 pb-0.5 pt-1 font-bold tracking-wider text-[10px] text-on-ink-muted uppercase">
              {group}
            </p>
          ) : index > 0 ? (
            <div aria-hidden className="my-2 w-8 border-white/15 mx-auto border-t" />
          ) : null}
          <div className="gap-0.5 flex flex-col items-center">
            {NAV.filter((item) => item.group === group).map((item) => {
              const Icon = item.icon
              return (
                <RailItem
                  key={item.to}
                  asChild
                  expanded={expanded}
                  active={item.id === current.id}
                  className={expanded ? 'h-[33px]' : undefined}
                  icon={<Icon />}
                  label={item.label}
                  badge={item.id === 'alarms' ? newAlarms : 0}
                >
                  <NavLink to={item.to} end={item.to === '/'} />
                </RailItem>
              )
            })}
          </div>
        </div>
      ))}
    </Rail>
  )
}

import { Rail, RailCollapse, RailItem, RailWorkspace, cn } from '@gpi/ui'
import { Eye } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { GulfMark } from '../components/GulfMark'
import { NAV, navFor } from './nav'
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
  const navigate = useNavigate()

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
      workspace={
        <RailWorkspace
          icon={<Eye />}
          kicker="Phase 1"
          name="Read-only monitoring"
          expanded={expanded}
          title="Plant control stays with the site crews. The Command Center reads data only."
          onClick={() => navigate('/system')}
        />
      }
      footer={canExpand ? <RailCollapse expanded={expanded} onToggle={onToggle} /> : undefined}
    >
      {NAV.map((item) => {
        const Icon = item.icon
        return (
          <RailItem
            key={item.to}
            asChild
            expanded={expanded}
            active={item.id === current.id}
            icon={<Icon />}
            label={item.label}
            badge={item.id === 'alarms' ? newAlarms : 0}
          >
            <NavLink to={item.to} end={item.to === '/'} />
          </RailItem>
        )
      })}
    </Rail>
  )
}

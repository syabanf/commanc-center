import { fmtClock, fmtDate, fmtUtcClock, fmtWeekday } from '@gpi/fixtures'
import { PEOPLE } from '@gpi/fixtures'
import { ROLE_LABEL } from '@gpi/types'
import { ActionMenu, Avatar, Button, StatusDot } from '@gpi/ui'
import { Check, Menu } from 'lucide-react'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/auth'
import { useLive } from '../state/live'
import { navFor } from './nav'
import { NotificationsButton } from './notifications'

export function Header({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const { now, fleet } = useLive()
  const linkIssues = fleet.late + fleet.stale

  return (
    <header className="h-14 gap-3 flex shrink-0 items-center print:hidden">
      <Button variant="card" size="icon-lg" className="md:hidden" aria-label="Open menu" onClick={onMenu}>
        <Menu />
      </Button>
      <div className="min-w-0 shrink">
        <div className="gap-2 flex items-center">
          <h2 className="text-lg font-bold leading-tight truncate">{navFor(pathname).label}</h2>
          <span
            className="px-2 py-0.5 font-bold tracking-wide shrink-0 rounded-full bg-accent-soft text-[10px] text-accent-strong uppercase"
            title="All readings and dates in this prototype are simulated"
          >
            Demo data
          </span>
        </div>
        <p className="text-xs truncate text-muted">
          {fmtWeekday(now)} {fmtDate(now)} · <span className="font-mono tabular-nums">{fmtClock(now)}</span>{' '}
          AST<span className="sm:inline hidden"> · {fmtUtcClock(now)}</span>
        </p>
      </div>
      <div className="gap-2 ml-auto flex shrink-0 items-center">
        <span
          className="h-11 gap-2 px-4 text-xs font-semibold lg:inline-flex hidden items-center rounded-full bg-card shadow-card"
          title="Sites whose latest sample is older than 15 s"
        >
          <StatusDot
            tone={fleet.stale ? 'danger' : linkIssues ? 'warning' : 'success'}
            pulse={linkIssues > 0}
          />
          {linkIssues ? `${linkIssues} of 5 sites reporting late` : 'All 5 sites reporting on time'}
        </span>
        <NotificationsButton />
        <UserMenu />
      </div>
    </header>
  )
}

function UserMenu() {
  const { user, switchUser } = useAuth()
  return (
    <ActionMenu
      title="View the console as"
      trigger={
        <button
          type="button"
          aria-label={`Account: ${user.name}, ${ROLE_LABEL[user.role]}`}
          className="h-11 gap-2.5 p-1.5 xl:pr-4 flex items-center rounded-full bg-card shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
        >
          <Avatar name={user.name} size="sm" />
          <span className="min-w-0 xl:block hidden text-left">
            <span className="text-sm font-semibold leading-tight block max-w-[10rem] truncate">
              {user.name}
            </span>
            <span className="block max-w-[10rem] truncate text-[11px] text-muted">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
        </button>
      }
      items={PEOPLE.filter((p) => ['pe-op1', 'pe-jm', 'pe-pm', 'pe-ex'].includes(p.id)).map((p) => ({
        key: p.id,
        label: p.name,
        description: ROLE_LABEL[p.role],
        icon: p.id === user.id ? <Check /> : <span className="size-4" />,
        onSelect: () => switchUser(p.id),
      }))}
    />
  )
}

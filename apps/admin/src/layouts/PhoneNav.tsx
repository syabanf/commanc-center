import { ROLE_LABEL } from '@gpi/types'
import { Avatar, BottomBar, BottomBarItem, Sheet, SheetContent, SheetTitle, cn } from '@gpi/ui'
import { Menu } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../auth/auth'
import { NAV, NAV_GROUPS, navFor } from './nav'
import { useNewAlarmCount } from './useAlarmCount'

const BAR = ['', 'alarms', 'plants', 'events']

/** Phone navigation: floating ink bar plus a dark bottom sheet with every destination. */
export function PhoneNav({
  moreOpen,
  onMoreChange,
}: {
  moreOpen: boolean
  onMoreChange: (open: boolean) => void
}) {
  const { pathname } = useLocation()
  const current = navFor(pathname)
  const newAlarms = useNewAlarmCount()
  const { user } = useAuth()

  return (
    <>
      <BottomBar className="print:hidden">
        {NAV.filter((item) => BAR.includes(item.id)).map((item) => {
          const Icon = item.icon
          return (
            <BottomBarItem
              key={item.to}
              asChild
              icon={<Icon />}
              label={item.id === '' ? 'Overview' : item.label}
              active={!moreOpen && current.id === item.id}
              badge={item.id === 'alarms' ? newAlarms : 0}
            >
              <Link to={item.to} />
            </BottomBarItem>
          )
        })}
        <BottomBarItem icon={<Menu />} label="More" active={moreOpen} onClick={() => onMoreChange(true)} />
      </BottomBar>

      <Sheet open={moreOpen} onOpenChange={onMoreChange}>
        <SheetContent
          side="bottom"
          tone="dark"
          hideClose
          aria-describedby={undefined}
          className="max-h-[85dvh] overflow-y-auto"
        >
          <SheetTitle className="sr-only">All destinations</SheetTitle>
          {NAV_GROUPS.map((group) => (
            <div key={group} className="px-3 pt-4">
              <p className="px-2 pb-2 font-bold tracking-wide text-[11px] text-on-ink-muted uppercase">
                {group}
              </p>
              <div className="gap-2 grid grid-cols-3">
                {NAV.filter((item) => item.group === group).map((item) => {
                  const Icon = item.icon
                  const badge = item.id === 'alarms' ? newAlarms : 0
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => onMoreChange(false)}
                      aria-current={current.id === item.id ? 'page' : undefined}
                      className="gap-2 rounded-2xl p-3 hover:bg-white/10 flex flex-col items-center text-center transition-colors"
                    >
                      <span
                        className={cn(
                          'size-11 rounded-2xl bg-white/10 [&_svg]:size-5 relative flex items-center justify-center',
                          current.id === item.id && 'text-white bg-accent-strong shadow-glow',
                        )}
                      >
                        <Icon />
                        {badge > 0 && (
                          <span className="-right-1 -top-1 bg-white px-1 font-bold absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[10px] text-ink">
                            {badge}
                          </span>
                        )}
                      </span>
                      <span className="text-xs font-medium leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="mt-3 gap-3 border-white/10 px-5 pt-4 flex items-center border-t">
            <Avatar name={user.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{user.name}</p>
              <p className="text-xs truncate text-on-ink-muted">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

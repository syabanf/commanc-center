import { fmtAgo, isSuppressed } from '@gpi/fixtures'
import { ALARM_KIND_LABEL, ESCALATION_LABEL, type Alarm } from '@gpi/types'
import {
  Button,
  EmptyState,
  IconTile,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
  useIsPhone,
} from '@gpi/ui'
import { Bell, BellOff, Siren, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PRIORITY_TONE } from '../components/badges'
import { paths } from '../components/links'
import { usePersistentState } from '../lib/storage'
import { plantById } from '../state/live'
import { useStore } from '../state/store'

interface Notice {
  /** Changes when the alarm escalates, so an escalation shows as unread again. */
  id: string
  alarm: Alarm
  escalated: boolean
}

/** Derived on every render from the open alarms; only the read ids persist. */
function useNotices(): Notice[] {
  const { alarms } = useStore().state
  return useMemo(
    () =>
      alarms
        .filter(
          (a) =>
            !isSuppressed(a) && (a.status === 'new' || (a.escalation > 1 && a.status === 'acknowledged')),
        )
        .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))
        .map((alarm) => ({ id: `${alarm.id}:${alarm.escalation}`, alarm, escalated: alarm.escalation > 1 })),
    [alarms],
  )
}

export function NotificationsButton() {
  const items = useNotices()
  const [readIds, setReadIds] = usePersistentState<string[]>('gpi.admin.read', [])
  const [open, setOpen] = useState(false)
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const unread = items.filter((i) => !readIds.includes(i.id)).length

  const openItem = (n: Notice) => {
    setReadIds((ids) => (ids.includes(n.id) ? ids : [...ids, n.id]))
    setOpen(false)
    navigate(paths.alarm(n.alarm.id))
  }

  const trigger = (
    <Button
      variant="card"
      size="icon-lg"
      className="relative"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Bell />
      {unread > 0 && (
        <span className="-right-1 -top-1 px-1 font-bold text-white absolute flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-surface bg-accent-strong text-[10.5px]">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Button>
  )

  const body = (
    <>
      <div className="gap-3 px-4 pb-2 pt-4 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold">Notifications</p>
          <p className="text-xs text-muted">{unread ? `${unread} unread` : 'All caught up'}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReadIds(items.map((i) => i.id))}
          disabled={!unread}
        >
          Mark all read
        </Button>
      </div>
      <div className="p-2 max-h-[min(70dvh,480px)] overflow-y-auto">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={<BellOff />}
            title="No alarm waits for you"
            description="New and escalated alarms show up here."
          />
        ) : (
          items.map((n) => {
            const isRead = readIds.includes(n.id)
            const plant = plantById.get(n.alarm.plantId)
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  'gap-3 rounded-2xl p-3 flex w-full items-start text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                  isRead && 'opacity-70',
                )}
              >
                <IconTile size="sm" tone={PRIORITY_TONE[n.alarm.priority]}>
                  {n.escalated ? <TrendingUp /> : <Siren />}
                </IconTile>
                <span className="min-w-0 flex-1">
                  <span className="gap-2 flex items-start justify-between">
                    <span className="text-sm font-semibold leading-snug">{n.alarm.message}</span>
                    {!isRead && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    )}
                  </span>
                  <span className="mt-0.5 text-xs block text-muted">
                    {plant?.name} · {ALARM_KIND_LABEL[n.alarm.kind]}
                  </span>
                  <span className="mt-1 font-medium block text-[11px] text-muted">
                    {n.escalated ? `Escalated to ${ESCALATION_LABEL[n.alarm.escalation]}` : 'New alarm'} ·{' '}
                    {fmtAgo(n.alarm.raisedAt)}
                  </span>
                </span>
              </button>
            )
          })
        )}
      </div>
    </>
  )

  if (isPhone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="p-0 w-[400px]">
        {body}
      </PopoverContent>
    </Popover>
  )
}

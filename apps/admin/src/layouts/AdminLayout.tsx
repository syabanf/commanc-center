import { Banner, Button, useMediaQuery } from '@gpi/ui'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router'
import { usePersistentState } from '../lib/storage'
import { useStore } from '../state/store'
import { Header } from './Header'
import { PhoneNav } from './PhoneNav'
import { SideRail } from './SideRail'

const GLOW =
  'radial-gradient(38% 34% at 72% 22%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%), radial-gradient(28% 30% at 92% 48%, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent 70%), radial-gradient(34% 30% at 55% 8%, color-mix(in srgb, var(--color-accent-soft) 55%, transparent), transparent 72%)'

// Scroll position of `main` per history entry key, for Back and Forward.
const scrollTops = new Map<string, number>()

export function AdminLayout() {
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const [expandedPref, setExpandedPref] = usePersistentState('gpi.admin.rail', true)
  const [moreOpen, setMoreOpen] = useState(false)
  const { storageError, reset } = useStore()
  const { key, pathname } = useLocation()
  const navigationType = useNavigationType()
  const mainRef = useRef<HTMLElement>(null)
  const entryKey = useRef(key)
  const expanded = expandedPref && isDesktop

  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const save = () => scrollTops.set(entryKey.current, main.scrollTop)
    main.addEventListener('scroll', save, { passive: true })
    return () => main.removeEventListener('scroll', save)
  }, [])

  // A new page starts at the top of the scroll box. Back and Forward return to where the user left it.
  useLayoutEffect(() => {
    entryKey.current = key
  }, [key])
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: navigationType === 'POP' ? (scrollTops.get(key) ?? 0) : 0 })
  }, [pathname])

  return (
    <div className="gap-4 p-3 lg:p-4 print:bg-white print:p-0 relative flex h-dvh overflow-clip bg-surface print:block print:h-auto print:overflow-visible">
      <div aria-hidden className="inset-0 pointer-events-none absolute overflow-hidden print:hidden">
        <div
          className="blur-xl absolute -top-[30%] -right-[8%] h-[120%] w-[70%] opacity-70"
          style={{ background: GLOW }}
        />
      </div>
      <div className="md:block relative hidden shrink-0 print:hidden">
        <SideRail expanded={expanded} canExpand={isDesktop} onToggle={() => setExpandedPref(!expandedPref)} />
      </div>
      <div className="min-w-0 gap-4 relative flex flex-1 flex-col">
        <nav aria-label="Skip links">
          <a
            href="#main"
            className="px-4 py-2 text-sm font-semibold focus:left-4 focus:top-3 sr-only z-30 rounded-full bg-ink text-on-ink shadow-float focus:not-sr-only focus:absolute"
          >
            Skip to content
          </a>
        </nav>
        <Header onMenu={() => setMoreOpen(true)} />
        <main
          id="main"
          tabIndex={-1}
          ref={mainRef}
          className="min-h-0 pb-24 pr-0.5 md:pb-2 print:p-0 relative flex-1 overflow-y-auto print:overflow-visible"
        >
          {storageError && (
            <Banner
              tone="danger"
              title="Changes cannot be saved"
              className="mb-4"
              action={
                <Button variant="outline" size="sm" onClick={reset}>
                  Reset demo data
                </Button>
              }
            >
              This browser refused to store the console data. Alarm actions will be lost on reload.
            </Banner>
          )}
          <Outlet />
        </main>
      </div>
      <PhoneNav moreOpen={moreOpen} onMoreChange={setMoreOpen} />
    </div>
  )
}

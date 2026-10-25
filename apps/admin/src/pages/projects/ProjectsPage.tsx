import { PLANTS, fmtAgo, fmtPercent } from '@gpi/fixtures'
import { Card, PageHeader, ProgressBar, StatCard } from '@gpi/ui'
import { CircleAlert, HardHat, ListChecks } from 'lucide-react'
import { Link } from 'react-router'
import { MilestoneBadge, PhaseBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { projectProgress } from '../../state/derive'
import { useNow } from '../../state/live'
import { useStore } from '../../state/store'

export function ProjectsPage() {
  const state = useStore().state
  const now = useNow(60_000)
  const openIssues = state.issues.filter((i) => i.status === 'open')
  const delayed = state.milestones.filter((m) => m.state === 'delayed')
  const building = PLANTS.filter((p) => p.phase !== 'operating')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Projects"
        description="Follow construction and commissioning at each plant: milestones, site photos, open issues and contractor actions."
      />
      <div className="gap-3 sm:grid-cols-3 sm:gap-4 grid grid-cols-1">
        <StatCard
          label="Sites still building"
          value={building.length}
          hint={building.map((p) => p.name).join(', ')}
          icon={<HardHat />}
          tone="info"
        />
        <StatCard
          label="Delayed milestones"
          value={delayed.length}
          hint={delayed.length ? 'Open a site to see which' : 'All milestones on plan'}
          icon={<ListChecks />}
          tone={delayed.length ? 'danger' : 'success'}
        />
        <StatCard
          label="Open issues"
          value={openIssues.length}
          hint="Contractor and owner actions"
          icon={<CircleAlert />}
          tone={openIssues.length ? 'warning' : 'success'}
        />
      </div>
      <div className="gap-4 md:grid-cols-2 xl:grid-cols-3 grid grid-cols-1">
        {PLANTS.map((plant) => {
          const progress = projectProgress(state, plant.id)
          const milestones = state.milestones.filter((m) => m.plantId === plant.id)
          const current = milestones.find((m) => m.state === 'delayed' || m.state === 'in_progress')
          const lastUpdate = state.progressUpdates.find((u) => u.plantId === plant.id)
          const issues = openIssues.filter((i) => i.plantId === plant.id).length
          return (
            <Link
              key={plant.id}
              to={paths.project(plant.id)}
              className="p-5 flex flex-col rounded-card bg-card shadow-card transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none active:scale-[0.98]"
            >
              <span className="gap-2 flex items-start justify-between">
                <span>
                  <span className="text-xs block font-mono text-muted">
                    {plant.code} · {plant.contractor}
                  </span>
                  <span className="text-base font-semibold block">{plant.name}</span>
                </span>
                <PhaseBadge phase={plant.phase} />
              </span>
              <span className="mt-4 gap-1 flex items-start">
                <span className="font-extrabold text-[28px] leading-none tracking-[-0.5px] tabular-nums">
                  {fmtPercent(progress)}
                </span>
                <span className="pt-1 text-sm font-semibold text-muted">complete</span>
              </span>
              <ProgressBar
                className="mt-3"
                value={progress}
                tone={progress === 1 ? 'success' : 'ink'}
                aria-label={`${plant.name} progress`}
              />
              <span className="mt-3 gap-2 text-xs flex flex-wrap items-center text-muted">
                {current ? (
                  <>
                    <MilestoneBadge state={current.state} /> {current.name}
                  </>
                ) : (
                  'Handed over to O&M'
                )}
              </span>
              <Card variant="soft" className="mt-4 p-0 grid grid-cols-2 divide-x divide-border text-center">
                <span className="px-2 py-2.5">
                  <span className="font-medium block text-[10.5px] text-muted">Open issues</span>
                  <span className="font-extrabold block text-[15px] tabular-nums">{issues}</span>
                </span>
                <span className="px-2 py-2.5">
                  <span className="font-medium block text-[10.5px] text-muted">Last update</span>
                  <span className="font-extrabold block truncate text-[15px]">
                    {lastUpdate ? fmtAgo(lastUpdate.at, now) : 'Not yet'}
                  </span>
                </span>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

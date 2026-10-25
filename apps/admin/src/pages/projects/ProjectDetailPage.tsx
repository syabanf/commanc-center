import { fmtDate, fmtDateTime, fmtPercent, toMs } from '@gpi/fixtures'
import type { ProjectIssue, SitePhoto } from '@gpi/types'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  CountBadge,
  EmptyState,
  ProgressBar,
  type StepState,
  Steps,
  cn,
} from '@gpi/ui'
import { Camera, CircleCheck, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { MilestoneBadge, PhaseBadge } from '../../components/badges'
import { HeroMetric } from '../../components/HeroMetric'
import { paths } from '../../components/links'
import { NotFoundCard } from '../../components/NotFoundCard'
import { projectProgress } from '../../state/derive'
import { personName, plantById, useAct, useNow } from '../../state/live'
import { useStore } from '../../state/store'
import { ProgressDialog } from './ProgressDialog'

const MILESTONE_STEP: Record<string, StepState> = {
  done: 'done',
  in_progress: 'current',
  delayed: 'current',
  upcoming: 'upcoming',
}

export function ProjectDetailPage() {
  const { plantId = '' } = useParams()
  const plant = plantById.get(plantId)
  const state = useStore().state
  const { can } = useAuth()
  const act = useAct()
  const now = useNow(60_000)
  const [recording, setRecording] = useState(false)
  const [closing, setClosing] = useState<ProjectIssue | null>(null)

  if (!plant) return <NotFoundCard title="Project not found" fallback={paths.projects} />
  const progress = projectProgress(state, plant.id)
  const milestones = state.milestones.filter((m) => m.plantId === plant.id)
  const issues = state.issues
    .filter((i) => i.plantId === plant.id)
    .sort((a, b) => a.status.localeCompare(b.status) || a.due.localeCompare(b.due))
  const updates = state.progressUpdates.filter((u) => u.plantId === plant.id)
  const photos = updates.flatMap((u) => u.photos.map((p) => ({ ...p, at: u.at })))
  const done = milestones.filter((m) => m.state === 'done').length
  const current = milestones.find((m) => m.state === 'delayed' || m.state === 'in_progress')
  const openIssues = issues.filter((i) => i.status === 'open')

  return (
    <div className="space-y-4">
      <div className="gap-2 flex flex-wrap items-center justify-between">
        <BackButton fallback={paths.projects} />
        {can('project.update') && plant.phase !== 'operating' && (
          <Button onClick={() => setRecording(true)}>
            <Plus />
            Record progress
          </Button>
        )}
      </div>

      <Card variant="ink" className="p-5">
        <div className="gap-3 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-mono text-on-ink-muted">
              {plant.code} · {plant.contractor}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{plant.name} project</h1>
            <p className="mt-1 text-sm text-on-ink-muted">
              {current ? `Now: ${current.name}` : 'All milestones done, plant handed over to O&M'}
            </p>
          </div>
          <PhaseBadge phase={plant.phase} />
        </div>
        <div className="mt-5 gap-4 sm:grid-cols-4 grid grid-cols-2">
          <HeroMetric label="Progress" value={fmtPercent(progress)} />
          <HeroMetric label="Milestones done" value={`${done}/${milestones.length}`} />
          <HeroMetric label="Open issues" value={String(openIssues.length)} />
          <HeroMetric label="Planned capacity" value={String(plant.capacityMw)} unit="MW" />
        </div>
        <div className="mt-4">
          <ProgressBar value={progress} tone="white" aria-label="Project progress" />
        </div>
        {current?.state === 'delayed' && (
          <p className="mt-3 rounded-2xl px-3 py-2 text-sm bg-accent/20">
            {current.name} is delayed. It was due {fmtDate(current.due)}.
          </p>
        )}
      </Card>

      <Card className="p-5">
        <Steps
          steps={milestones.map((m) => ({
            key: m.id,
            label: m.name,
            state: MILESTONE_STEP[m.state]!,
            hint: m.state === 'delayed' ? 'Delayed' : fmtDate(m.due),
          }))}
        />
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              Planned dates from the project schedule. Actual dates come with the signed site status report.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {milestones.map((m) => (
              <div
                key={m.id}
                className="gap-3 rounded-2xl p-3 text-sm flex items-center justify-between bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="font-semibold block">{m.name}</span>
                  <span className="text-xs block text-muted">Due {fmtDate(m.due)}</span>
                </span>
                <MilestoneBadge state={m.state} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="gap-2 flex items-center">
              Issues and contractor actions <CountBadge count={openIssues.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {issues.length === 0 ? (
              <EmptyState
                compact
                icon={<CircleCheck />}
                title="No issues raised"
                description="Issues the site team records show up here."
              />
            ) : (
              issues.map((issue) => {
                const overdue = issue.status === 'open' && toMs(issue.due) < now
                return (
                  <div
                    key={issue.id}
                    className={cn(
                      'gap-3 rounded-2xl p-3 text-sm flex flex-wrap items-center justify-between bg-surface-2',
                      issue.status === 'closed' && 'opacity-60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold block">{issue.title}</span>
                      <span
                        className={cn(
                          'text-xs block',
                          overdue ? 'font-semibold text-accent-strong' : 'text-muted',
                        )}
                      >
                        {issue.owner} ·{' '}
                        {issue.status === 'closed'
                          ? 'Closed'
                          : overdue
                            ? `Overdue since ${fmtDate(issue.due)}`
                            : `Due ${fmtDate(issue.due)}`}
                      </span>
                    </span>
                    {issue.status === 'open' && can('project.update') && (
                      <Button variant="outline" size="sm" onClick={() => setClosing(issue)}>
                        Close issue
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site photos</CardTitle>
          <CardDescription>Dated photos attached to progress updates.</CardDescription>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <EmptyState
              compact
              icon={<Camera />}
              title="No photos yet"
              description="Attach photos when you record progress."
            />
          ) : (
            <div className="gap-3 sm:grid-cols-3 xl:grid-cols-4 grid grid-cols-2">
              {photos.map((p) => (
                <PhotoTile key={p.id} photo={p} at={p.at} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress updates</CardTitle>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <EmptyState
              compact
              title="No updates recorded"
              description={
                plant.phase === 'operating'
                  ? 'This plant was handed over before the console started.'
                  : 'The site team records progress here.'
              }
            />
          ) : (
            <ol className="space-y-3">
              {updates.map((u, i) => (
                <li key={u.id} className="gap-3 flex">
                  <span
                    aria-hidden="true"
                    className={cn('mt-1.5 size-2 shrink-0 rounded-full', i === 0 ? 'bg-accent' : 'bg-silver')}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold tabular-nums">{fmtPercent(u.progress)}</span>
                    <span className="text-muted">
                      {' '}
                      · {personName(u.by)} · {fmtDateTime(u.at)}
                    </span>
                    <span className="mt-0.5 block text-body/80">{u.note}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <ProgressDialog plant={plant} current={progress} open={recording} onOpenChange={setRecording} />
      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={`Close "${closing?.title}"?`}
        description={`${closing?.owner} reported the action as done. The issue moves to the closed list.`}
        confirmLabel="Close issue"
        onConfirm={() => {
          if (
            closing &&
            act(
              { type: 'issues/close', id: closing.id },
              { title: 'Issue closed', description: closing.title },
            )
          )
            setClosing(null)
        }}
      />
    </div>
  )
}

function PhotoTile({ photo, at }: { photo: SitePhoto; at: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <figure className="rounded-2xl overflow-hidden bg-surface-2">
      {photo.url && !broken ? (
        <img
          src={photo.url}
          alt={photo.caption}
          className="aspect-[4/3] w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="[&_svg]:size-8 flex aspect-[4/3] items-center justify-center text-silver"
          role="img"
          aria-label={`${photo.caption}, file not loaded`}
        >
          <Camera />
        </div>
      )}
      <figcaption className="p-3">
        <span className="text-xs font-semibold block truncate">{photo.caption}</span>
        <span className="block text-[11px] text-muted">{fmtDate(at)}</span>
      </figcaption>
    </figure>
  )
}

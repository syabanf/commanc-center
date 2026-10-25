import { PLANTS, SPEC, fmtNumber, fmtPercent, tagEstimate } from '@gpi/fixtures'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from '@gpi/ui'
import { Database, Gauge, Tags } from 'lucide-react'

/** Bar position as a share of the 2,500-tag upgrade. */
const scale = (v: number) => `${Math.min(100, (v / SPEC.tagUpgrade) * 100)}%`

/** Preliminary tag allocation per plant against the licensed capacity (spec section 8). */
export function TagCapacity() {
  const rows = PLANTS.map((plant) => {
    const groups = tagEstimate(plant)
    const points = groups.reduce((s, g) => s + g.points, 0)
    const max = groups.reduce((s, g) => s + g.max, 0)
    return { plant, groups, points, max, sized: points * (1 + SPEC.tagSpare) }
  })
  const fleet = rows.reduce((s, r) => s + r.sized, 0)
  const tightest = rows.reduce((a, b) => (b.sized > a.sized ? b : a))

  return (
    <div className="space-y-4">
      <div className="gap-3 sm:gap-4 sm:grid-cols-3 grid grid-cols-1">
        <StatCard
          label="Base licence"
          value={fmtNumber(SPEC.tagBase)}
          unit="tags per plant"
          hint={`Upgrade option to ${fmtNumber(SPEC.tagUpgrade)}`}
          icon={<Tags />}
        />
        <StatCard
          label="Fleet estimate with spare"
          value={fmtNumber(fleet)}
          unit="tags"
          hint={`Includes the ${fmtPercent(SPEC.tagSpare)} spare rule`}
          icon={<Database />}
          tone="info"
        />
        <StatCard
          label="Tightest plant"
          value={fmtPercent(tightest.sized / SPEC.tagBase)}
          unit="of base"
          hint={`${tightest.plant.name}, ${tightest.plant.capacityMw} MW`}
          icon={<Gauge />}
          tone={tightest.sized > SPEC.tagBase ? 'danger' : 'success'}
        />
      </div>
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        {rows.map(({ plant, groups, points, max, sized }) => {
          return (
            <Card key={plant.id}>
              <CardHeader>
                <CardTitle>{plant.name}</CardTitle>
                <CardDescription>
                  {fmtNumber(points)} points estimated, {fmtNumber(sized)} with spare. Up to {fmtNumber(max)}{' '}
                  at the top of the allowance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  role="img"
                  aria-label={`${plant.name}: ${fmtNumber(sized)} tags with spare against a ${fmtNumber(SPEC.tagBase)} base licence`}
                  className="relative"
                >
                  <div className="h-4 flex overflow-hidden rounded-full bg-surface">
                    <span className="bg-ink" style={{ width: scale(points) }} />
                    <span className="bg-info/60" style={{ width: scale(sized - points) }} />
                  </div>
                  <span
                    className="-top-1 w-0.5 h-6 absolute bg-accent"
                    style={{ left: scale(SPEC.tagBase) }}
                    aria-hidden="true"
                  />
                  <div className="mt-1.5 h-4 relative text-[11px] text-muted">
                    <span className="absolute -translate-x-1/2" style={{ left: scale(SPEC.tagBase) }}>
                      {fmtNumber(SPEC.tagBase)} base
                    </span>
                    <span className="right-0 absolute">{fmtNumber(SPEC.tagUpgrade)}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {groups.map((g) => (
                    <li key={g.label} className="gap-2 flex justify-between">
                      <span className="text-body/80">{g.label}</span>
                      <span className="font-semibold tabular-nums">{fmtNumber(g.points)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <div className="gap-x-4 gap-y-2 text-xs flex flex-wrap text-muted">
        <span className="gap-1.5 flex items-center">
          <span className="size-3 rounded-[3px] bg-ink" />
          Estimate at {(SPEC.pointsPerUnit.min + SPEC.pointsPerUnit.max) / 2} points per unit
        </span>
        <span className="gap-1.5 flex items-center">
          <span className="size-3 rounded-[3px] bg-info/60" />
          {fmtPercent(SPEC.tagSpare)} spare
        </span>
        <span className="gap-1.5 flex items-center">
          <span className="w-0.5 h-3 bg-accent" />
          Base licence
        </span>
      </div>
      <p className="text-xs text-muted">
        Budget allowance from section 8.1: {SPEC.pointsPerUnit.min} to {SPEC.pointsPerUnit.max} unique points
        per generating unit. One process variable used for display, alarms and history counts as one tag. The
        Command Center receives an agreed subset, so central licensing is quoted separately.
      </p>
    </div>
  )
}

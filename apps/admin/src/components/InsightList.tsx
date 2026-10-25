import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CountBadge,
  IconTile,
} from '@gpi/ui'
import { Banknote, Fuel, HardHat, RadioTower, Siren, Zap, type LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { INSIGHT_AREA_LABEL, type Insight, type InsightArea } from '../state/insights'
import { plantById } from '../state/live'
import { paths } from './links'

const AREA_ICON: Record<InsightArea, LucideIcon> = {
  generation: Zap,
  fuel: Fuel,
  alarms: Siren,
  data: RadioTower,
  projects: HardHat,
  commercial: Banknote,
}

export function InsightRow({ insight }: { insight: Insight }) {
  const Icon = AREA_ICON[insight.area]
  const plant = insight.plantId ? plantById.get(insight.plantId) : null
  return (
    <Link
      to={insight.to}
      className="gap-3 rounded-2xl p-3 flex items-start bg-surface-2 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
    >
      <IconTile size="sm" tone={insight.tone}>
        <Icon />
      </IconTile>
      <span className="min-w-0 flex-1">
        <span className="font-semibold tracking-wider block text-[10.5px] text-muted uppercase">
          {INSIGHT_AREA_LABEL[insight.area]}
          {plant ? ` · ${plant.name}` : ' · Fleet'}
        </span>
        <span className="mt-0.5 text-sm font-semibold block">{insight.title}</span>
        <span className="mt-0.5 text-xs block text-muted">{insight.detail}</span>
      </span>
      <span className="text-sm font-bold shrink-0 text-right tabular-nums">{insight.metric}</span>
    </Link>
  )
}

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <div className="space-y-2">
      {insights.map((insight) => (
        <InsightRow key={insight.id} insight={insight} />
      ))}
    </div>
  )
}

/** A card with the most urgent findings and a link to the full Insights page. */
export function InsightsCard({
  title,
  description,
  insights,
  limit = 4,
}: {
  title: string
  description: string
  insights: Insight[]
  limit?: number
}) {
  const navigate = useNavigate()
  if (!insights.length) return null
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="outline" size="sm" onClick={() => navigate(paths.insights())}>
            All insights
          </Button>
        }
      >
        <CardTitle className="gap-2 flex items-center">
          {title} <CountBadge count={insights.length} />
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-2 md:grid-cols-2 grid grid-cols-1">
        {insights.slice(0, limit).map((insight) => (
          <InsightRow key={insight.id} insight={insight} />
        ))}
      </CardContent>
    </Card>
  )
}

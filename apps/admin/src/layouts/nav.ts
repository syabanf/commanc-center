import type { LucideIcon } from 'lucide-react'
import {
  ChartColumn,
  Cctv,
  Factory,
  Fuel,
  HardHat,
  LayoutGrid,
  Lightbulb,
  ListOrdered,
  MonitorPlay,
  Network,
  Database,
  Siren,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
  group: 'Operations' | 'Analysis' | 'Delivery' | 'Planning'
}

export const NAV_GROUPS = ['Operations', 'Analysis', 'Delivery', 'Planning'] as const

export const NAV: NavItem[] = [
  { id: '', label: 'Fleet overview', icon: LayoutGrid, to: '/', group: 'Operations' },
  { id: 'alarms', label: 'Alarms', icon: Siren, to: '/alarms', group: 'Operations' },
  { id: 'plants', label: 'Plants', icon: Factory, to: '/plants', group: 'Operations' },
  { id: 'events', label: 'Events', icon: ListOrdered, to: '/events', group: 'Operations' },
  { id: 'data-health', label: 'Data health', icon: Network, to: '/data-health', group: 'Operations' },
  { id: 'insights', label: 'Insights', icon: Lightbulb, to: '/insights', group: 'Analysis' },
  { id: 'fuel', label: 'Fuel', icon: Fuel, to: '/fuel', group: 'Analysis' },
  { id: 'reports', label: 'Reports', icon: ChartColumn, to: '/reports', group: 'Analysis' },
  { id: 'projects', label: 'Projects', icon: HardHat, to: '/projects', group: 'Delivery' },
  { id: 'cctv', label: 'Camera readiness', icon: Cctv, to: '/cctv', group: 'Planning' },
  { id: 'room', label: 'Control room design', icon: MonitorPlay, to: '/room', group: 'Planning' },
  { id: 'system', label: 'System design', icon: Network, to: '/system', group: 'Planning' },
  { id: 'master', label: 'Master data', icon: Database, to: '/master', group: 'Planning' },
]

/** The nav item a path belongs to, by its first segment. */
export function navFor(pathname: string): NavItem {
  const segment = pathname.split('/')[1] ?? ''
  return NAV.find((item) => item.id === segment) ?? NAV[0]!
}

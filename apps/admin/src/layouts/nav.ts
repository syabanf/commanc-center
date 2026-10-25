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
  Siren,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  to: string
}

export const NAV: NavItem[] = [
  { id: '', label: 'Fleet overview', icon: LayoutGrid, to: '/' },
  { id: 'plants', label: 'Plants', icon: Factory, to: '/plants' },
  { id: 'alarms', label: 'Alarms', icon: Siren, to: '/alarms' },
  { id: 'events', label: 'Event list', icon: ListOrdered, to: '/events' },
  { id: 'insights', label: 'Insights', icon: Lightbulb, to: '/insights' },
  { id: 'fuel', label: 'Fuel', icon: Fuel, to: '/fuel' },
  { id: 'projects', label: 'Projects', icon: HardHat, to: '/projects' },
  { id: 'cctv', label: 'CCTV', icon: Cctv, to: '/cctv' },
  { id: 'room', label: 'Control room', icon: MonitorPlay, to: '/room' },
  { id: 'reports', label: 'Reports', icon: ChartColumn, to: '/reports' },
  { id: 'system', label: 'Data sources', icon: Network, to: '/system' },
]

/** The nav item a path belongs to, by its first segment. */
export function navFor(pathname: string): NavItem {
  const segment = pathname.split('/')[1] ?? ''
  return NAV.find((item) => item.id === segment) ?? NAV[0]!
}

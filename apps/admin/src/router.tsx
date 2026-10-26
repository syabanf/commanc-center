import { createBrowserRouter } from 'react-router'
import { AdminLayout } from './layouts/AdminLayout'

import type { ComponentType } from 'react'

type Loaded = Record<string, ComponentType>
const page = (load: () => Promise<Loaded>, name: string) => async () => ({ Component: (await load())[name] })

export const router = createBrowserRouter([
  {
    path: '/',
    Component: AdminLayout,
    HydrateFallback: () => <div className="h-dvh bg-surface" />,
    children: [
      { index: true, lazy: page(() => import('./pages/overview/OverviewPage'), 'OverviewPage') },
      { path: 'plants', lazy: page(() => import('./pages/plants/PlantsPage'), 'PlantsPage') },
      { path: 'plants/:id', lazy: page(() => import('./pages/plants/PlantDetailPage'), 'PlantDetailPage') },
      {
        path: 'plants/:plantId/units/:unitId',
        lazy: page(() => import('./pages/plants/UnitDetailPage'), 'UnitDetailPage'),
      },
      { path: 'alarms', lazy: page(() => import('./pages/alarms/AlarmsPage'), 'AlarmsPage') },
      { path: 'alarms/:id', lazy: page(() => import('./pages/alarms/AlarmDetailPage'), 'AlarmDetailPage') },
      { path: 'fuel', lazy: page(() => import('./pages/fuel/FuelPage'), 'FuelPage') },
      { path: 'projects', lazy: page(() => import('./pages/projects/ProjectsPage'), 'ProjectsPage') },
      {
        path: 'projects/:plantId',
        lazy: page(() => import('./pages/projects/ProjectDetailPage'), 'ProjectDetailPage'),
      },
      { path: 'cctv', lazy: page(() => import('./pages/cctv/CctvPage'), 'CctvPage') },
      { path: 'events', lazy: page(() => import('./pages/events/EventsPage'), 'EventsPage') },
      { path: 'data-health', lazy: page(() => import('./pages/system/SystemPage'), 'DataHealthPage') },
      { path: 'insights', lazy: page(() => import('./pages/insights/InsightsPage'), 'InsightsPage') },
      { path: 'room', lazy: page(() => import('./pages/room/ControlRoomPage'), 'ControlRoomPage') },
      { path: 'reports', lazy: page(() => import('./pages/reports/ReportsPage'), 'ReportsPage') },
      { path: 'system', lazy: page(() => import('./pages/system/SystemPage'), 'SystemPage') },
      { path: 'master', lazy: page(() => import('./pages/master/MasterDataPage'), 'MasterDataPage') },
      { path: '*', lazy: page(() => import('./pages/NotFoundPage'), 'NotFoundPage') },
    ],
  },
])

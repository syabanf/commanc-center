export const paths = {
  overview: '/',
  plants: '/plants',
  plant: (id: string, tab?: string) => `/plants/${id}${tab ? `?tab=${tab}` : ''}`,
  unit: (plantId: string, unitId: string) => `/plants/${plantId}/units/${unitId}`,
  /** The 3D model replaying a plant's event list from one record. */
  replay: (plantId: string, eventId: string) => `/plants/${plantId}?view=3d&mode=replay&event=${eventId}`,
  alarms: (query = '') => `/alarms${query}`,
  alarm: (id: string) => `/alarms/${id}`,
  fuel: '/fuel',
  projects: '/projects',
  project: (plantId: string) => `/projects/${plantId}`,
  cctv: (plantId?: string) => `/cctv${plantId ? `?site=${plantId}` : ''}`,
  events: (query = '') => `/events${query}`,
  insights: (area?: string) => `/insights${area ? `?area=${area}` : ''}`,
  room: '/room',
  reports: '/reports',
  system: (tab?: string) => `/system${tab ? `?tab=${tab}` : ''}`,
}

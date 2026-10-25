export type Region = 'hadramout' | 'aden'
export const REGION_LABEL: Record<Region, string> = { hadramout: 'Hadramout', aden: 'Aden' }

/** Plant lifecycle. The brief (Q09) says no site status is verified yet, so every phase is shown as reported. */
export type PlantPhase = 'construction' | 'commissioning' | 'operating'
export const PLANT_PHASE_LABEL: Record<PlantPhase, string> = {
  construction: 'Construction',
  commissioning: 'Commissioning',
  operating: 'Operating',
}

export type UnitState = 'running' | 'standby' | 'tripped' | 'maintenance' | 'not_commissioned'
export const UNIT_STATE_LABEL: Record<UnitState, string> = {
  running: 'Running',
  standby: 'Standby',
  tripped: 'Tripped',
  maintenance: 'Maintenance',
  not_commissioned: 'Not commissioned',
}

export type LinkState = 'online' | 'degraded' | 'offline'
export const LINK_STATE_LABEL: Record<LinkState, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
}

export type AlarmKind =
  | 'generator_trip'
  | 'high_exhaust_temp'
  | 'low_lube_pressure'
  | 'breaker_event'
  | 'comms_loss'
  | 'generation_drop'
  | 'low_tank_level'
  | 'fuel_imbalance'
export const ALARM_KIND_LABEL: Record<AlarmKind, string> = {
  generator_trip: 'Generator trip',
  high_exhaust_temp: 'High exhaust temperature',
  low_lube_pressure: 'Low lube oil pressure',
  breaker_event: 'Breaker or protection event',
  comms_loss: 'Communication loss',
  generation_drop: 'Unexpected generation drop',
  low_tank_level: 'Low tank level',
  fuel_imbalance: 'Abnormal fuel balance',
}

export type AlarmPriority = 'critical' | 'high' | 'medium' | 'low'
export const ALARM_PRIORITY_LABEL: Record<AlarmPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
export const ALARM_PRIORITIES: AlarmPriority[] = ['critical', 'high', 'medium', 'low']

export type AlarmStatus = 'new' | 'acknowledged' | 'assigned' | 'resolved' | 'closed'
export const ALARM_STATUS_LABEL: Record<AlarmStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  resolved: 'Resolved',
  closed: 'Closed',
}
export const ALARM_STATUS_FLOW: AlarmStatus[] = ['new', 'acknowledged', 'assigned', 'resolved', 'closed']
export const OPEN_ALARM_STATUSES: AlarmStatus[] = ['new', 'acknowledged', 'assigned']

/** Escalation matrix levels from Q29: site O&M first, then the Command Center, then management. */
export type EscalationLevel = 1 | 2 | 3
export const ESCALATION_LABEL: Record<EscalationLevel, string> = {
  1: 'Site O&M',
  2: 'Command Center',
  3: 'Management',
}

export type AlarmVerb = 'raised' | 'acknowledged' | 'assigned' | 'escalated' | 'note' | 'resolved' | 'closed'
export const ALARM_VERB_LABEL: Record<AlarmVerb, string> = {
  raised: 'Raised',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  escalated: 'Escalated',
  note: 'Note added',
  resolved: 'Resolved',
  closed: 'Closed',
}

export type Role = 'operator' | 'om_engineer' | 'project_manager' | 'executive'
export const ROLE_LABEL: Record<Role, string> = {
  operator: 'Command Center operator',
  om_engineer: 'Plant O&M engineer',
  project_manager: 'Project manager',
  executive: 'Senior management',
}

export type Permission =
  'alarm.acknowledge' | 'alarm.assign' | 'alarm.resolve' | 'alarm.close' | 'project.update' | 'report.export'

export type SourceKind = 'mv_scada' | 'engine_controller' | 'fuel_gateway' | 'cctv_nvr' | 'starlink'
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  mv_scada: 'MV SCADA',
  engine_controller: 'Engine controllers',
  fuel_gateway: 'Fuel monitoring gateway',
  cctv_nvr: 'CCTV recorder',
  starlink: 'Starlink backhaul',
}

export type SourceState = 'connected' | 'degraded' | 'offline' | 'pending_survey'
export const SOURCE_STATE_LABEL: Record<SourceState, string> = {
  connected: 'Connected',
  degraded: 'Degraded',
  offline: 'Offline',
  pending_survey: 'Pending survey',
}

export type MilestoneState = 'done' | 'in_progress' | 'upcoming' | 'delayed'
export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  done: 'Done',
  in_progress: 'In progress',
  upcoming: 'Upcoming',
  delayed: 'Delayed',
}

export type IssueStatus = 'open' | 'closed'

export type SiteZoneKind =
  'engine_hall' | 'fuel_treatment' | 'tank_farm' | 'switchyard' | 'control_room' | 'workshop' | 'gate'
export const SITE_ZONE_LABEL: Record<SiteZoneKind, string> = {
  engine_hall: 'Engine hall',
  fuel_treatment: 'Fuel treatment',
  tank_farm: 'Tank farm',
  switchyard: 'MV switchyard',
  control_room: 'Control room',
  workshop: 'Workshop and stores',
  gate: 'Main gate',
}

/** Equipment groups from the SCADA specification (Rev. 2, sections 3.1 to 3.4). */
export type EquipmentGroup =
  'generator' | 'switchgear_11kv' | 'switchgear_33kv' | 'transformer' | 'fuel' | 'auxiliary' | 'communication'
export const EQUIPMENT_GROUP_LABEL: Record<EquipmentGroup, string> = {
  generator: 'Generators',
  switchgear_11kv: '11 kV switchgear',
  switchgear_33kv: '33 kV switchgear',
  transformer: 'Transformers',
  fuel: 'Fuel system',
  auxiliary: 'Auxiliaries',
  communication: 'Communication',
}

export type ScadaEventKind =
  | 'breaker_open'
  | 'breaker_close'
  | 'protection_trip'
  | 'unit_start'
  | 'unit_stop'
  | 'selector_local'
  | 'selector_remote'
  | 'level_switch'
  | 'warning'
  | 'link_lost'
  | 'link_restored'
export const SCADA_EVENT_LABEL: Record<ScadaEventKind, string> = {
  breaker_open: 'Breaker open',
  breaker_close: 'Breaker closed',
  protection_trip: 'Protection trip',
  unit_start: 'Unit start',
  unit_stop: 'Unit stop',
  selector_local: 'Selector to local',
  selector_remote: 'Selector to remote',
  level_switch: 'Level switch',
  warning: 'Warning',
  link_lost: 'Link lost',
  link_restored: 'Link restored',
}

export type AuxSystemKind =
  | 'cooling_water'
  | 'lube_oil'
  | 'compressed_air'
  | 'ventilation'
  | 'water_treatment'
  | 'fire_alarm'
  | 'fuel_leak'
  | 'ups'
  | 'battery_charger'
export const AUX_SYSTEM_LABEL: Record<AuxSystemKind, string> = {
  cooling_water: 'Cooling water',
  lube_oil: 'Lubricating oil',
  compressed_air: 'Compressed air',
  ventilation: 'Ventilation and A/C',
  water_treatment: 'Water treatment',
  fire_alarm: 'Fire alarm and firefighting',
  fuel_leak: 'Fuel leak detection',
  ups: 'UPS',
  battery_charger: 'DC battery chargers',
}

export type AuxState = 'normal' | 'warning' | 'alarm' | 'no_data' | 'not_integrated'
export const AUX_STATE_LABEL: Record<AuxState, string> = {
  normal: 'Normal',
  warning: 'Warning',
  alarm: 'Alarm',
  no_data: 'No data',
  not_integrated: 'Not integrated',
}

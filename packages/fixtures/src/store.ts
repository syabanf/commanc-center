import type {
  Alarm,
  AlarmEvent,
  Milestone,
  Permission,
  ProgressUpdate,
  ProjectIssue,
  Role,
  SitePhoto,
} from '@gpi/types'
import { OPEN_ALARM_STATUSES } from '@gpi/types'
import { MINUTE, toMs } from './clock'
import { fmtPercent } from './format'
import { ALARMS, ESCALATION_RULES, ISSUES, MILESTONES, PROGRESS_UPDATES, UNITS } from './seed'

/** The editable part of the demo. Plants, units, people and history are read-only seed data. */
export interface AppState {
  alarms: Alarm[]
  milestones: Milestone[]
  issues: ProjectIssue[]
  progressUpdates: ProgressUpdate[]
}

export const initialState: AppState = {
  alarms: ALARMS,
  milestones: MILESTONES,
  issues: ISSUES,
  progressUpdates: PROGRESS_UPDATES,
}

export type AppAction =
  | { type: 'alarms/acknowledge'; id: string }
  | { type: 'alarms/assign'; id: string; personId: string; note: string }
  | { type: 'alarms/note'; id: string; note: string }
  | { type: 'alarms/resolve'; id: string; resolution: string }
  | { type: 'alarms/close'; id: string; postIncident: string }
  | { type: 'alarms/escalateDue' }
  | { type: 'projects/recordProgress'; plantId: string; progress: number; note: string; photos: SitePhoto[] }
  | { type: 'issues/close'; id: string }

export interface ActionMeta {
  /** Person id, `rule` for an alarm rule, or `system` for the escalation timer. */
  by: string
  at: string
}

export interface Envelope {
  action: AppAction
  meta: ActionMeta
}

// ---- permissions ------------------------------------------------------------------------------

const BY_ROLE: Record<Role, Permission[]> = {
  operator: ['alarm.acknowledge', 'alarm.assign', 'alarm.resolve', 'alarm.close', 'report.export'],
  om_engineer: ['alarm.acknowledge', 'alarm.resolve', 'project.update'],
  project_manager: ['project.update', 'report.export'],
  executive: ['report.export'],
}

export function can(role: Role, permission: Permission): boolean {
  return BY_ROLE[role].includes(permission)
}

// ---- blockers: the reducer refuses with the same sentence the UI shows -------------------------

export function acknowledgeBlocker(alarm: Alarm): string | null {
  return alarm.status === 'new' ? null : 'This alarm is already acknowledged.'
}

export function assignBlocker(alarm: Alarm): string | null {
  if (alarm.status === 'new') return 'Acknowledge the alarm before assigning it.'
  if (alarm.status === 'resolved' || alarm.status === 'closed') return 'This alarm is already resolved.'
  return null
}

export function resolveBlocker(alarm: Alarm, resolution = 'x'): string | null {
  if (alarm.status === 'new' || alarm.status === 'acknowledged')
    return 'Assign an owner before resolving the alarm.'
  if (alarm.status !== 'assigned') return 'This alarm is already resolved.'
  if (!resolution.trim()) return 'Describe what fixed the problem.'
  return null
}

export function closeBlocker(alarm: Alarm, postIncident = 'x'): string | null {
  if (alarm.status !== 'resolved') return 'Resolve the alarm before closing it.'
  if ((alarm.priority === 'critical' || alarm.priority === 'high') && !postIncident.trim()) {
    return 'Critical and high alarms need a post-incident summary.'
  }
  return null
}

export function latestProgress(state: AppState, plantId: string): number | null {
  const updates = state.progressUpdates.filter((u) => u.plantId === plantId)
  return updates.length ? Math.max(...updates.map((u) => u.progress)) : null
}

export function progressBlocker(state: AppState, plantId: string, progress: number): string | null {
  const last = latestProgress(state, plantId)
  if (!(progress >= 0 && progress <= 1)) return 'Enter a progress between 0 and 100%.'
  if (last !== null && progress < last)
    return `Progress cannot go below the last recorded ${fmtPercent(last)}.`
  return null
}

// ---- escalation timer ---------------------------------------------------------------------------

/** Ownerless alarms (new or acknowledged) climb one level each time the current level's response time passes. */
/** Spec 4.2: alarms from equipment taken out of service are suppressed. They stay listed but never escalate. */
export function isSuppressed(alarm: Alarm): boolean {
  return !!alarm.unitId && UNITS.find((u) => u.id === alarm.unitId)?.state === 'maintenance'
}

export function escalationDueAt(alarm: Alarm): number | null {
  if (alarm.escalation >= 3 || alarm.priority === 'low' || isSuppressed(alarm)) return null
  if (alarm.status !== 'new' && alarm.status !== 'acknowledged') return null
  const rule = ESCALATION_RULES.find((r) => r.level === alarm.escalation)
  if (!rule) return null
  const since = [...alarm.history].reverse().find((e) => e.verb === 'escalated' || e.verb === 'raised')
  return toMs(since?.at ?? alarm.raisedAt) + rule.responseMin * MINUTE
}

// ---- reducer ------------------------------------------------------------------------------------

export class ActionRefused extends Error {}

function updateAlarm(state: AppState, id: string, next: (alarm: Alarm) => Alarm): AppState {
  const alarm = state.alarms.find((a) => a.id === id)
  if (!alarm) throw new ActionRefused('This alarm no longer exists.')
  return { ...state, alarms: state.alarms.map((a) => (a.id === id ? next(a) : a)) }
}

function refuseIf(reason: string | null) {
  if (reason) throw new ActionRefused(reason)
}

/** Applies one action. Throws `ActionRefused` with the blocker sentence when the action is not allowed. */
export function reduce(state: AppState, { action, meta }: Envelope): AppState {
  const log = (verb: AlarmEvent['verb'], note?: string): AlarmEvent => ({
    at: meta.at,
    by: meta.by,
    verb,
    ...(note ? { note } : {}),
  })
  switch (action.type) {
    case 'alarms/acknowledge':
      return updateAlarm(state, action.id, (a) => {
        refuseIf(acknowledgeBlocker(a))
        return { ...a, status: 'acknowledged', history: [...a.history, log('acknowledged')] }
      })
    case 'alarms/assign':
      return updateAlarm(state, action.id, (a) => {
        refuseIf(assignBlocker(a))
        return {
          ...a,
          status: 'assigned',
          assigneeId: action.personId,
          history: [...a.history, log('assigned', action.note.trim())],
        }
      })
    case 'alarms/note':
      return updateAlarm(state, action.id, (a) => {
        refuseIf(action.note.trim() ? null : 'Write a note first.')
        return { ...a, history: [...a.history, log('note', action.note.trim())] }
      })
    case 'alarms/resolve':
      return updateAlarm(state, action.id, (a) => {
        refuseIf(resolveBlocker(a, action.resolution))
        const resolution = action.resolution.trim()
        return { ...a, status: 'resolved', resolution, history: [...a.history, log('resolved', resolution)] }
      })
    case 'alarms/close':
      return updateAlarm(state, action.id, (a) => {
        refuseIf(closeBlocker(a, action.postIncident))
        const postIncident = action.postIncident.trim() || null
        return {
          ...a,
          status: 'closed',
          postIncident,
          history: [...a.history, log('closed', postIncident ?? undefined)],
        }
      })
    case 'alarms/escalateDue': {
      const now = toMs(meta.at)
      let changed = false
      const alarms = state.alarms.map((a) => {
        const due = escalationDueAt(a)
        if (due === null || due > now) return a
        changed = true
        const escalation = (a.escalation + 1) as Alarm['escalation']
        const rule = ESCALATION_RULES.find((r) => r.level === a.escalation)!
        return {
          ...a,
          escalation,
          history: [
            ...a.history,
            log('escalated', `No owner after ${rule.responseMin} min at level ${a.escalation}`),
          ],
        }
      })
      return changed ? { ...state, alarms } : state
    }
    case 'projects/recordProgress': {
      refuseIf(progressBlocker(state, action.plantId, action.progress))
      refuseIf(action.note.trim() ? null : 'Describe what changed on site.')
      const update: ProgressUpdate = {
        id: `pu-${toMs(meta.at).toString(36)}`,
        plantId: action.plantId,
        at: meta.at,
        by: meta.by,
        progress: action.progress,
        note: action.note.trim(),
        photos: action.photos,
      }
      return { ...state, progressUpdates: [update, ...state.progressUpdates] }
    }
    case 'issues/close': {
      const issue = state.issues.find((i) => i.id === action.id)
      refuseIf(
        !issue
          ? 'This issue no longer exists.'
          : issue.status === 'closed'
            ? 'This issue is already closed.'
            : null,
      )
      return {
        ...state,
        issues: state.issues.map((i) => (i.id === action.id ? { ...i, status: 'closed' } : i)),
      }
    }
  }
}

export const isOpen = (alarm: Alarm) => OPEN_ALARM_STATUSES.includes(alarm.status)

// ---- persistence --------------------------------------------------------------------------------

const VERSION = 2

export function loadLocalState(key: string): AppState {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as { version?: number; state?: AppState }
    return parsed.version === VERSION && parsed.state ? parsed.state : initialState
  } catch {
    return initialState
  }
}

/** Returns false when the browser refused to store the state. */
export function saveLocalState(key: string, state: AppState): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ version: VERSION, state }))
    return true
  } catch {
    return false
  }
}

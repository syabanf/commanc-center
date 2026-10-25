import {
  BILLING,
  DAY,
  HOUR,
  PLANTS,
  type AppState,
  type PlantReading,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtMonth,
  fmtNumber,
  fmtPercent,
  fmtTime,
  fmtUsd,
  isOpen,
  toMs,
} from '@gpi/fixtures'
import { ALARM_KIND_LABEL, UNIT_STATE_LABEL, type AlarmKind } from '@gpi/types'
import { useMemo } from 'react'
import { EXHAUST_LIMIT_C } from '../components/HeroMetric'
import { paths } from '../components/links'
import {
  ACK_TARGET_MIN,
  AVAILABILITY_TARGET,
  SFC_BASELINE,
  alarmHistory,
  commissionedMw,
  countBy,
  energyRows,
  energyTotals,
  median,
  supplyHours,
} from './derive'
import { plantById, unitById, unitsOf, useLive } from './live'
import { useStore } from './store'

export type InsightArea = 'generation' | 'fuel' | 'alarms' | 'data' | 'projects' | 'commercial'
export type InsightTone = 'danger' | 'warning' | 'info' | 'success'

export const INSIGHT_AREA_LABEL: Record<InsightArea, string> = {
  generation: 'Generation',
  fuel: 'Fuel',
  alarms: 'Alarms',
  data: 'Data links',
  projects: 'Projects',
  commercial: 'Commercial',
}

export interface Insight {
  id: string
  area: InsightArea
  tone: InsightTone
  plantId: string | null
  title: string
  detail: string
  /** Headline number shown beside the title. */
  metric: string
  to: string
}

/** What the crew should check first when one kind of alarm keeps coming back. */
const FIRST_CHECK: Partial<Record<AlarmKind, string>> = {
  comms_loss: 'Check the Starlink terminal and the site router.',
  high_exhaust_temp: 'Check injectors and charge-air cooling on the hot units.',
  generator_trip: 'Pull the protection relay records for the trips.',
  low_lube_pressure: 'Check oil filters and the prelube pump.',
  fuel_imbalance: 'Compare the flow meters against a tank dip.',
  low_tank_level: 'Bring the delivery schedule forward.',
}

const TONE_ORDER: Record<InsightTone, number> = { danger: 0, warning: 1, info: 2, success: 3 }

/**
 * Findings the console derives from live readings, the 30-day history and the store, most urgent first.
 * Every rule names the plant, the number behind it and the page that shows the detail.
 */
export function buildInsights(now: number, readings: PlantReading[], state: AppState): Insight[] {
  const out: Insight[] = []

  for (const r of readings) {
    const plant = plantById.get(r.plantId)!
    const rated = commissionedMw(plant.id)

    if (r.freshness === 'stale') {
      out.push({
        id: `stale-${plant.id}`,
        area: 'data',
        tone: 'danger',
        plantId: plant.id,
        title: `No data from ${plant.name} for ${fmtDuration(r.ageMs)}`,
        detail: `The site link is ${plant.link}. Values on screen froze at ${fmtTime(r.sampledAt)}, so alarms from this site cannot reach the console.`,
        metric: fmtDuration(r.ageMs),
        to: paths.plant(plant.id, 'sources'),
      })
    } else if (plant.link === 'degraded') {
      out.push({
        id: `slow-${plant.id}`,
        area: 'data',
        tone: 'warning',
        plantId: plant.id,
        title: `${plant.name} link runs slow at ${fmtNumber(plant.latencyMs)} ms`,
        detail: 'Samples arrive late and some drop. Comms-loss alarms from this site track the latency.',
        metric: `${fmtNumber(plant.latencyMs)} ms`,
        to: paths.plant(plant.id, 'sources'),
      })
    }

    const down = unitsOf(plant.id).filter((u) => u.state === 'tripped' || u.state === 'maintenance')
    if (down.length) {
      const lost = down.reduce((sum, u) => sum + u.ratingMw, 0)
      out.push({
        id: `capacity-${plant.id}`,
        area: 'generation',
        tone: down.some((u) => u.state === 'tripped') ? 'danger' : 'warning',
        plantId: plant.id,
        title: `${plant.name} has ${lost} MW out of service`,
        detail: `${down.map((u) => `${u.code} ${UNIT_STATE_LABEL[u.state].toLowerCase()}`).join(', ')}. The plant can deliver ${fmtPercent(r.availableMw / rated)} of its commissioned rating.`,
        metric: `−${lost} MW`,
        to: paths.plant(plant.id, 'units'),
      })
    }

    for (const u of r.units) {
      const margin = EXHAUST_LIMIT_C - u.exhaustC
      if (u.mw > 0 && margin < 25) {
        const unit = unitById.get(u.unitId)!
        out.push({
          id: `hot-${u.unitId}`,
          area: 'generation',
          tone: margin < 0 ? 'danger' : 'warning',
          plantId: plant.id,
          title: `${unit.code} exhaust runs at ${fmtNumber(u.exhaustC)} °C`,
          detail:
            margin < 0
              ? `${fmtNumber(-margin)} °C over the ${EXHAUST_LIMIT_C} °C limit.`
              : `${fmtNumber(margin)} °C below the ${EXHAUST_LIMIT_C} °C limit. Plan an inspection before the next load step.`,
          metric: `${fmtNumber(u.exhaustC)} °C`,
          to: paths.unit(plant.id, unit.id),
        })
      }
    }

    const hours = supplyHours(r, plant)
    if (hours !== null && hours < 72) {
      out.push({
        id: `tank-${plant.id}`,
        area: 'fuel',
        tone: hours < 24 ? 'danger' : 'warning',
        plantId: plant.id,
        title: `${plant.name} has ${fmtNumber(hours)} h of HFO left`,
        detail: `Tank at ${fmtPercent(r.tankLevel)}, burning ${fmtNumber(r.fuelNetLph)} L/h. Plan the next delivery before ${fmtDateTime(now + hours * HOUR)}.`,
        metric: `${fmtNumber(hours)} h`,
        to: paths.fuel,
      })
    }

    const month = energyTotals(30, now, plant.id)
    if (month.sfc !== null && month.sfc > SFC_BASELINE * 1.02) {
      const extraM3 = ((month.sfc - SFC_BASELINE) * month.mwh) / 1000 / 0.96
      out.push({
        id: `sfc-${plant.id}`,
        area: 'fuel',
        tone: 'warning',
        plantId: plant.id,
        title: `${plant.name} burns ${fmtPercent(month.sfc / SFC_BASELINE - 1)} more fuel per kWh than baseline`,
        detail: `${fmtNumber(month.sfc)} g/kWh over 30 days against ${SFC_BASELINE} g/kWh. That cost about ${fmtNumber(extraM3)} m³ of extra HFO this month.`,
        metric: `${fmtNumber(month.sfc)} g/kWh`,
        to: paths.fuel,
      })
    }

    const week = energyTotals(7, now, plant.id)
    if (week.availability !== null && week.availability < AVAILABILITY_TARGET) {
      out.push({
        id: `availability-${plant.id}`,
        area: 'generation',
        tone: 'warning',
        plantId: plant.id,
        title: `${plant.name} availability is ${fmtPercent(week.availability, 1)} this week, under target`,
        detail: `Target ${fmtPercent(AVAILABILITY_TARGET)}. The 30-day average is ${fmtPercent(month.availability ?? 0, 1)}.`,
        metric: fmtPercent(week.availability, 1),
        to: paths.plant(plant.id, 'trend'),
      })
    }
  }

  const sum = (rows: { mwh: number }[]) => rows.reduce((s, row) => s + row.mwh, 0)
  const thisWeek = sum(energyRows(7, now))
  const lastWeek = sum(energyRows(14, now)) - thisWeek
  const change = lastWeek ? thisWeek / lastWeek - 1 : 0
  if (Math.abs(change) >= 0.02) {
    out.push({
      id: 'energy-week',
      area: 'generation',
      tone: change > 0 ? 'success' : 'info',
      plantId: null,
      title: `Fleet energy ${change > 0 ? 'rose' : 'fell'} ${fmtPercent(Math.abs(change), 1)} week on week`,
      detail: `${fmtNumber(thisWeek)} MWh in the last 7 days against ${fmtNumber(lastWeek)} MWh the week before.`,
      metric: `${change > 0 ? '+' : '−'}${fmtPercent(Math.abs(change), 1)}`,
      to: paths.reports,
    })
  }

  const planned = PLANTS.reduce((s, p) => s + p.capacityMw, 0)
  const pending = planned - commissionedMw()
  if (pending > 0) {
    out.push({
      id: 'pending-capacity',
      area: 'projects',
      tone: 'info',
      plantId: null,
      title: `${pending} MW of the ${planned} MW plan is not commissioned yet`,
      detail: PLANTS.filter((p) => commissionedMw(p.id) < p.capacityMw)
        .map((p) => `${p.name} ${p.capacityMw - commissionedMw(p.id)} MW`)
        .join(', '),
      metric: `${pending} MW`,
      to: paths.projects,
    })
  }

  // Alarm trends from the closed-alarm history.
  const recent = alarmHistory(now, 7)
  const before = alarmHistory(now, 14, 7)
  const [hotKey, hotCount] = countBy(recent, (a) => `${a.plantId}|${a.kind}`)[0] ?? ['', 0]
  const prevCount = before.filter((a) => `${a.plantId}|${a.kind}` === hotKey).length
  if (hotCount >= 3 && hotCount >= prevCount * 1.5) {
    const [plantId, kind] = hotKey.split('|') as [string, AlarmKind]
    out.push({
      id: `hotspot-${hotKey}`,
      area: 'alarms',
      tone: 'warning',
      plantId,
      title: `${ALARM_KIND_LABEL[kind]} alarms at ${plantById.get(plantId)!.name} rose to ${hotCount} this week`,
      detail: `${prevCount} the week before. ${FIRST_CHECK[kind] ?? ''}`.trim(),
      metric: `${hotCount} vs ${prevCount}`,
      to: paths.alarms(`?site=${plantId}`),
    })
  }

  const urgent = alarmHistory(now, 30).filter((a) => a.priority === 'critical' || a.priority === 'high')
  if (urgent.length) {
    const onTime = urgent.filter((a) => a.ackMin <= ACK_TARGET_MIN).length / urgent.length
    out.push({
      id: 'ack-rate',
      area: 'alarms',
      tone: onTime < 0.9 ? 'warning' : 'success',
      plantId: null,
      title: `${fmtPercent(onTime)} of critical and high alarms acknowledged within ${ACK_TARGET_MIN} min`,
      detail: `Median ${fmtNumber(median(urgent.map((a) => a.ackMin))!)} min to acknowledge and ${fmtDuration(median(urgent.map((a) => a.resolveMin))! * 60_000)} to resolve, across ${urgent.length} alarms in 30 days.`,
      metric: fmtPercent(onTime),
      to: paths.insights('alarms'),
    })
  }

  for (const alarm of state.alarms) {
    if (!isOpen(alarm) || alarm.assigneeId || alarm.priority !== 'critical') continue
    out.push({
      id: `unowned-${alarm.id}`,
      area: 'alarms',
      tone: 'danger',
      plantId: alarm.plantId,
      title: `${alarm.code} has waited ${fmtDuration(now - toMs(alarm.raisedAt))} without an owner`,
      detail: `${alarm.message}. Assign an engineer to stop the escalation timer.`,
      metric: fmtDuration(now - toMs(alarm.raisedAt)),
      to: paths.alarm(alarm.id),
    })
  }

  for (const m of state.milestones) {
    if (m.state !== 'delayed') continue
    const plant = plantById.get(m.plantId)!
    const issues = state.issues.filter((i) => i.plantId === plant.id && i.status === 'open').length
    out.push({
      id: `milestone-${m.id}`,
      area: 'projects',
      tone: 'warning',
      plantId: plant.id,
      title: `${m.name} at ${plant.name} is behind plan`,
      detail: `Due ${fmtDate(m.due)}. ${issues} open issues at this site.`,
      metric:
        toMs(m.due) > now
          ? `Due in ${fmtNumber((toMs(m.due) - now) / DAY)} d`
          : `${fmtNumber((now - toMs(m.due)) / DAY)} d late`,
      to: paths.project(plant.id),
    })
  }

  const bill = BILLING[BILLING.length - 1]!
  const collectedShare = bill.collectedUsd / bill.billedUsd
  if (collectedShare < 0.85) {
    const outstanding = BILLING.reduce((s, b) => s + b.billedUsd - b.collectedUsd, 0)
    out.push({
      id: 'collections',
      area: 'commercial',
      tone: 'warning',
      plantId: null,
      title: `Collections reached ${fmtPercent(collectedShare)} of billing in ${fmtMonth(bill.month)}`,
      detail: `${fmtUsd(bill.collectedUsd)} collected of ${fmtUsd(bill.billedUsd)}. ${fmtUsd(outstanding)} is outstanding across ${BILLING.length} months.`,
      metric: fmtPercent(collectedShare),
      to: paths.reports,
    })
  }

  return out.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
}

export function useInsights(): Insight[] {
  const { now, readings } = useLive()
  const { state } = useStore()
  return useMemo(() => buildInsights(now, readings, state), [now, readings, state])
}

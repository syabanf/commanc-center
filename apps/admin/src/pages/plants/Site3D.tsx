import {
  PEOPLE,
  CAMERAS,
  type PlantReading,
  SCENARIOS,
  SIM_DAY_TANK_L,
  type ScenarioId,
  type SimBase,
  type SimFrame,
  type SimPractice,
  type ReplayState,
  bufferedSamples,
  fmtDuration,
  fmtTimeMs,
  fmtUtcMs,
  isSuppressed,
  replaySteps,
  fmtNumber,
  fmtPercent,
  isOpen,
  linkLatency,
  siteLayout,
} from '@gpi/fixtures'
import {
  ALARM_KIND_LABEL,
  ALARM_PRIORITY_LABEL,
  type Alarm,
  type AlarmKind,
  type Plant,
  SCADA_EVENT_LABEL,
  SITE_ZONE_LABEL,
  type SiteZoneKind,
} from '@gpi/types'
import { Badge, Button, Chip, ChipRow, EmptyState, KeyValue, SegmentedControl, cn } from '@gpi/ui'
import { Box, Maximize2, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { AlarmStatusBadge, PriorityBadge, UnitStateBadge } from '../../components/badges'
import { EXHAUST_LIMIT_C } from '../../components/HeroMetric'
import { paths } from '../../components/links'
import { useSearchParam } from '../../lib/use-search-param'
import { supplyHours } from '../../state/derive'
import { unitsOf, useAct, useNow } from '../../state/live'
import { useStore } from '../../state/store'
import { AssignDialog } from '../alarms/dialogs'
import { AUX_SHARE, singleLineModel } from './single-line-model'
import {
  type BeaconAt,
  type FlowId,
  type SceneDisplay,
  type SelectKey,
  type SiteScene,
  createSiteScene,
} from './site3d/scene'

const MODES = ['live', 'sim', 'replay'] as const
type Mode = (typeof MODES)[number]
const SPEEDS = [1, 10, 60]

/** The fuel and power paths in flow order; the panel steps through them. */
const CHAINS: { name: string; steps: { key: SelectKey; label: string }[] }[] = [
  {
    name: 'Fuel path',
    steps: [
      { key: 'storage:0', label: 'Storage' },
      { key: 'flow:transfer', label: 'Transfer' },
      { key: 'tank', label: 'Day tank' },
      { key: 'flow:supply', label: 'Supply' },
      { key: 'separators', label: 'Treatment' },
      { key: 'flow:header', label: 'Engine feed' },
      { key: 'zone:engine_hall', label: 'Engines' },
      { key: 'flow:return', label: 'Return' },
    ],
  },
  {
    name: 'Power path',
    steps: [
      { key: 'zone:engine_hall', label: 'Generators' },
      { key: 'flow:bus', label: '11 kV bus' },
      { key: 'flow:mv', label: 'To transformers' },
      { key: 'transformer:0', label: 'Step-up' },
      { key: 'flow:hv', label: '33 kV line' },
      { key: 'export', label: 'Gantry' },
      { key: 'flow:grid', label: 'Grid' },
    ],
  },
]

/** Where the beacon turns for an alarm: its unit, or the equipment its kind points at. */
function beaconFor(kind: AlarmKind, unitId: string | null): BeaconAt | null {
  if (unitId) return `unit:${unitId}`
  if (kind === 'low_tank_level' || kind === 'fuel_imbalance') return 'tank'
  if (kind === 'comms_loss') return 'link'
  return 'export'
}

const fmtSim = (s: number) => {
  const m = Math.floor(s / 60)
  return `T+${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/**
 * Three.js model of one plant. Live mode shows the current readings and the real alarm actions for the
 * selected equipment. Simulation mode replays a scripted scenario on the model for training; the
 * trainee's acknowledge and assign actions change only the simulation.
 */
export function Site3D({ plant, reading }: { plant: Plant; reading: PlantReading }) {
  const mount = useRef<HTMLDivElement>(null)
  const scene = useRef<SiteScene | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useSearchParam<Mode>('mode', 'live', MODES)
  const units = useMemo(() => unitsOf(plant.id), [plant.id])
  const [selectionParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const route = useRef(location)
  route.current = location
  const selectable = useMemo(() => {
    const layout = siteLayout(plant, units)
    return new Set<SelectKey>([
      'site',
      'tank',
      'link',
      'separators',
      'export',
      ...units.map((unit) => `unit:${unit.id}` as const),
      ...layout.zones.map((zone) => `zone:${zone.kind}` as const),
      ...layout.transformers.map((_, index) => `transformer:${index}` as const),
      ...layout.storageTanks.map((_, index) => `storage:${index}` as const),
      ...CAMERAS.filter((camera) => camera.plantId === plant.id).map(
        (camera) => `camera:${camera.name}` as const,
      ),
      ...(['control_room', 'workshop', 'gate'] as const).map((kind) => `building:${kind}` as const),
      ...(['transfer', 'supply', 'header', 'return', 'bus', 'mv', 'hv', 'grid'] as const).map(
        (id) => `flow:${id}` as const,
      ),
    ])
  }, [plant, units])
  const selectedParam = selectionParams.get('select') as SelectKey | null
  const selected = selectedParam && selectable.has(selectedParam) ? selectedParam : null
  const setSelected = (key: SelectKey | null) => {
    const current = route.current
    const next = new URLSearchParams(current.search)
    if (key) next.set('select', key)
    else next.delete('select')
    navigate(
      { pathname: current.pathname, search: next.toString(), hash: current.hash },
      { replace: true, preventScrollReset: true },
    )
  }
  const sim = useSimulation(plant, reading, mode === 'sim')
  const replay = useReplay(plant, mode === 'replay')
  const { alarms } = useStore().state

  useEffect(() => {
    if (!mount.current) return
    try {
      scene.current = createSiteScene(mount.current, plant, setSelected)
    } catch {
      setFailed(true)
      return
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [plant])

  const display = useMemo<SceneDisplay>(() => {
    const hot = (unitId: string) => {
      const r = reading.units.find((u) => u.unitId === unitId)
      return !!r && r.mw > 0 && r.exhaustC > EXHAUST_LIMIT_C
    }
    if (sim.frame) {
      const f = sim.frame
      return {
        units: Object.fromEntries(
          Object.entries(f.units).map(([id, u]) => [id, { ...u, hot: u.state === 'running' && hot(id) }]),
        ),
        tankLevel: f.tankLevel,
        linkUp: f.linkUp,
        backfilling: f.backfilling,
        transferPumpOn: f.transferPumpOn,
        exportMw: f.mw * (1 - AUX_SHARE),
        strained: f.unservedMw > 0,
        beacon: f.alarm ? beaconFor(f.alarm.kind, f.alarm.unitId) : null,
      }
    }
    if (replay.state) {
      const step = replay.state
      // Running units take today's output, or their usual load if they are stopped now.
      const mwOf = (id: string) => {
        const unit = units.find((u) => u.id === id)!
        const now = reading.units.find((r) => r.unitId === id)?.mw ?? 0
        return step.units[id] === 'running' ? now || unit.ratingMw * (unit.load || 0.8) : 0
      }
      const total = units.reduce((sum, u) => sum + mwOf(u.id), 0)
      const e = replay.event
      return {
        units: Object.fromEntries(
          units.map((u) => [u.id, { state: step.units[u.id]!, mw: mwOf(u.id), hot: false }]),
        ),
        tankLevel: step.tankLow ? Math.min(reading.tankLevel, 0.24) : reading.tankLevel,
        linkUp: step.linkUp,
        backfilling: false,
        transferPumpOn: true,
        exportMw: total * (1 - AUX_SHARE),
        strained: false,
        beacon: !e
          ? null
          : e.unitId
            ? `unit:${e.unitId}`
            : e.group === 'communication'
              ? 'link'
              : e.group === 'fuel'
                ? 'tank'
                : e.group === 'auxiliary'
                  ? null
                  : 'export',
      }
    }
    const urgent = alarms.find(
      (a) =>
        a.plantId === plant.id &&
        isOpen(a) &&
        !isSuppressed(a) &&
        (a.priority === 'critical' || a.priority === 'high'),
    )
    return {
      units: Object.fromEntries(
        units.map((u) => [
          u.id,
          { state: u.state, mw: reading.units.find((r) => r.unitId === u.id)?.mw ?? 0, hot: hot(u.id) },
        ]),
      ),
      tankLevel: reading.tankLevel,
      linkUp: plant.link !== 'offline',
      backfilling: false,
      transferPumpOn: true,
      exportMw: reading.mw * (1 - AUX_SHARE),
      strained: false,
      beacon: urgent ? beaconFor(urgent.kind, urgent.unitId) : null,
    }
  }, [sim.frame, replay.state, replay.event, reading, units, plant, alarms])

  useEffect(() => scene.current?.update(display), [display])
  useEffect(() => scene.current?.select(selected), [selected])

  if (failed) {
    return (
      <EmptyState
        icon={<Box />}
        title="3D view needs WebGL"
        description="This browser cannot draw the 3D model. The 2D site plan shows the same layout."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="gap-3 flex flex-wrap items-center justify-between">
        <SegmentedControl
          aria-label="3D mode"
          size="sm"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { value: 'live', label: 'Live' },
            { value: 'sim', label: 'Simulation' },
            { value: 'replay', label: 'Event replay' },
          ]}
        />
        {mode === 'sim' && <Badge variant="warning">Training simulation · nothing reaches the plant</Badge>}
      </div>
      <div className="gap-6 xl:grid-cols-[minmax(0,1fr)_360px] grid grid-cols-1">
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl relative overflow-hidden bg-surface-2">
            <div
              ref={mount}
              role="img"
              aria-label={`3D model of ${plant.name}${mode === 'sim' ? ', simulation running' : ''}`}
              className="sm:aspect-[16/9] @container relative aspect-[4/3] w-full"
            />
            <div className="right-4 top-4 gap-3 absolute flex">
              <Button
                size="sm"
                variant="secondary"
                aria-label="Reset view"
                onClick={() => scene.current?.reset()}
              >
                <RotateCcw />
                <span className="sm:inline hidden">Reset view</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                aria-label="Top view"
                onClick={() => scene.current?.top()}
              >
                <Maximize2 />
                <span className="sm:inline hidden">Top view</span>
              </Button>
            </div>
            {sim.frame && <SimStrip frame={sim.frame} />}
          </div>
          {mode === 'sim' && <SimControls sim={sim} />}
          {mode === 'replay' && <ReplayControls replay={replay} />}
          <p className="text-xs text-muted">
            Drag to orbit, scroll or pinch to zoom, then select equipment to inspect it. The model is
            schematic until the as-built drawings arrive.
          </p>
          <ChipRow className="gap-3 pb-2" aria-label="Select equipment">
            {units.map((u) => (
              <Chip
                key={u.id}
                variant="filter"
                active={selected === `unit:${u.id}`}
                onClick={() => setSelected(`unit:${u.id}`)}
              >
                {u.code}
              </Chip>
            ))}
            <Chip variant="filter" active={selected === 'tank'} onClick={() => setSelected('tank')}>
              Day tank
            </Chip>
            <Chip variant="filter" active={selected === 'link'} onClick={() => setSelected('link')}>
              Starlink
            </Chip>
            <Chip
              variant="filter"
              active={selected === 'flow:supply'}
              onClick={() => setSelected('flow:supply')}
            >
              Fuel path
            </Chip>
            <Chip variant="filter" active={selected === 'flow:bus'} onClick={() => setSelected('flow:bus')}>
              Power path
            </Chip>
          </ChipRow>
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Selection and simulation">
          {mode === 'sim' && sim.frame && <PracticePanel plant={plant} sim={sim} />}
          {mode === 'replay' && <ReplayLog replay={replay} />}
          <SelectionPanel
            plant={plant}
            reading={reading}
            display={display}
            frame={sim.frame}
            mode={mode}
            selected={selected}
            onSelect={setSelected}
          />
        </aside>
      </div>
    </div>
  )
}

// ---- Simulation state ----------------------------------------------------------------------

function useSimulation(plant: Plant, reading: PlantReading, on: boolean) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>('unit_trip')
  const [tS, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(10)
  const [practice, setPractice] = useState<SimPractice>({})
  const [base, setBase] = useState<SimBase | null>(null)
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!

  const restart = (id = scenarioId) => {
    setScenarioId(id)
    setT(0)
    setPlaying(false)
    setPractice({})
    setBase({ plant, units: unitsOf(plant.id), reading })
  }

  // Take the plant snapshot when simulation mode opens; drop it when it closes.
  useEffect(() => {
    if (on && !base) setBase({ plant, units: unitsOf(plant.id), reading })
    if (!on && base) {
      setBase(null)
      setPlaying(false)
    }
  }, [on, base, plant, reading])

  useEffect(() => {
    if (!playing) return
    const step = setInterval(() => {
      setT((t) => {
        const next = Math.min(scenario.durationS, t + 0.1 * speed)
        if (next >= scenario.durationS) setPlaying(false)
        return next
      })
    }, 100)
    return () => clearInterval(step)
  }, [playing, speed, scenario.durationS])

  const blocker = base ? scenario.blocker(base) : null
  const frame: SimFrame | null = on && base && !blocker ? scenario.frame(base, tS, practice) : null
  return {
    scenario,
    blocker,
    frame,
    tS,
    playing,
    speed,
    practice,
    setT,
    setSpeed,
    setPlaying,
    restart,
    acknowledge: () => setPractice((p) => ({ ...p, ackAtS: tS })),
    assign: (assignee: string) => setPractice((p) => ({ ...p, assignAtS: tS, assignee })),
  }
}
type Simulation = ReturnType<typeof useSimulation>

/** Key values of the running simulation, over the model. */
function SimStrip({ frame }: { frame: SimFrame }) {
  const items = [
    { label: 'Output', value: `${fmtNumber(frame.mw, 1)} MW` },
    { label: 'Frequency', value: frame.mw > 0 ? `${fmtNumber(frame.frequencyHz, 2)} Hz` : 'None' },
    { label: 'Unserved', value: `${fmtNumber(frame.unservedMw, 1)} MW`, alert: frame.unservedMw > 0 },
    {
      label: 'Link',
      value: frame.linkUp ? 'Up' : `Down · ${fmtNumber(frame.bufferedSamples)} buffered`,
      alert: !frame.linkUp,
    },
  ]
  return (
    <div className="left-3 bottom-3 gap-2 absolute flex flex-wrap" aria-live="polite">
      {items.map((i) => (
        <span
          key={i.label}
          className={cn(
            'px-3 py-1.5 text-xs rounded-full shadow-card',
            i.alert ? 'text-white bg-accent-strong' : 'bg-card/95 text-foreground',
          )}
        >
          <span className={i.alert ? 'text-white/80' : 'text-muted'}>{i.label}</span>{' '}
          <span className="font-semibold tabular-nums">{i.value}</span>
        </span>
      ))}
    </div>
  )
}

function SimControls({ sim }: { sim: Simulation }) {
  const { scenario, blocker, tS, playing, speed } = sim
  return (
    <div className="rounded-2xl p-5 space-y-4 bg-surface-2">
      <ChipRow aria-label="Scenario">
        {SCENARIOS.map((s) => (
          <Chip key={s.id} variant="filter" active={s.id === scenario.id} onClick={() => sim.restart(s.id)}>
            {s.label}
          </Chip>
        ))}
      </ChipRow>
      <p className="text-sm text-body/80">{blocker ?? scenario.description}</p>
      <div className="gap-2 flex flex-wrap items-center">
        <Button
          size="sm"
          onClick={() => {
            if (tS >= scenario.durationS) sim.setT(0)
            sim.setPlaying(!playing)
          }}
          disabled={!!blocker}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? 'Pause' : tS > 0 && tS < scenario.durationS ? 'Resume' : 'Play'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => sim.restart()} aria-label="Restart scenario">
          <SkipBack />
          Restart
        </Button>
        <SegmentedControl
          aria-label="Simulation speed"
          size="sm"
          value={String(speed)}
          onChange={(v) => sim.setSpeed(Number(v))}
          options={SPEEDS.map((s) => ({ value: String(s), label: `${s}×` }))}
        />
        <span className="text-sm font-semibold ml-auto font-mono tabular-nums">
          {fmtSim(tS)} <span className="text-muted">/ {fmtSim(scenario.durationS)}</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={scenario.durationS}
        step={1}
        value={tS}
        disabled={!!blocker}
        onChange={(e) => sim.setT(Number(e.target.value))}
        aria-label="Simulation time"
        className="w-full accent-[var(--color-accent-strong)]"
      />
    </div>
  )
}

/** The scenario alarm with practice actions, and the simulated event log. */
function PracticePanel({ plant, sim }: { plant: Plant; sim: Simulation }) {
  const frame = sim.frame!
  const { practice } = sim
  const alarm = frame.alarm
  const lead =
    PEOPLE.find((p) => p.plantId === plant.id && p.role === 'om_engineer')?.name ?? 'Plant O&M lead'
  return (
    <div className="rounded-2xl p-5 space-y-4 bg-surface-2">
      <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Practice</p>
      {alarm ? (
        <div className="rounded-xl p-3 space-y-2 bg-card">
          <div className="gap-2 flex flex-wrap items-center">
            <span className="text-sm font-semibold">{ALARM_KIND_LABEL[alarm.kind]}</span>
            <PriorityBadge priority={alarm.priority} />
            <Badge variant={alarm.escalation > 1 ? 'danger' : 'muted'}>Level {alarm.escalation}</Badge>
          </div>
          <p className="text-xs text-muted">{alarm.message}</p>
          <div className="gap-2 flex flex-wrap">
            {practice.ackAtS === undefined ? (
              <Button size="sm" onClick={sim.acknowledge}>
                Acknowledge
              </Button>
            ) : practice.assignAtS === undefined ? (
              <Button size="sm" onClick={() => sim.assign(lead)}>
                Assign to {lead}
              </Button>
            ) : (
              <Badge variant="success">Assigned to {practice.assignee}</Badge>
            )}
          </div>
          {practice.ackAtS !== undefined && (
            <p className="text-xs text-muted">
              Acknowledged after {fmtDuration(Math.max(1, practice.ackAtS - alarm.raisedAtS) * 1000)}
              {practice.assignAtS !== undefined &&
                `, assigned after ${fmtDuration(Math.max(1, practice.assignAtS - alarm.raisedAtS) * 1000)}`}
              . Target: an owner within 30 min.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Play the scenario. Its alarm appears here when the console raises it.
        </p>
      )}
      <ol className="max-h-64 space-y-1.5 overflow-y-auto" aria-label="Simulated events">
        {[...frame.events].reverse().map((e, i) => (
          <li key={`${e.atS}-${i}`} className="gap-2 text-xs flex items-start">
            <span className="shrink-0 font-mono text-muted tabular-nums">{fmtSim(e.atS)}</span>
            <span className="min-w-0">
              <span className={cn('font-semibold', e.source === 'operator' && 'text-info')}>{e.tag}</span>{' '}
              {e.message}
              {e.firstOut && (
                <Badge variant="danger" className="ml-1">
                  First-out
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---- Event replay ---------------------------------------------------------------------------

/** Real gap between replayed events, scaled by the speed setting. */
const REPLAY_STEP_MS = 1600

function useReplay(plant: Plant, on: boolean) {
  const { initial, steps } = useMemo(() => replaySteps(plant), [plant])
  const [params] = useSearchParams()
  const startAt = params.get('event')
  const [index, setIndex] = useState(() => {
    const i = steps.findIndex((s) => s.event.id === startAt)
    return i >= 0 ? i : -1
  })
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  useEffect(() => {
    if (!on || !playing) return
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i + 1 >= steps.length) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, REPLAY_STEP_MS / speed)
    return () => clearInterval(timer)
  }, [on, playing, speed, steps.length])

  const state: ReplayState | null = on ? (index >= 0 ? steps[index]! : initial) : null
  const event = on && index >= 0 ? steps[index]!.event : null
  return { steps, index, state, event, playing, speed, setIndex, setPlaying, setSpeed }
}
type Replay = ReturnType<typeof useReplay>

function ReplayControls({ replay }: { replay: Replay }) {
  const { steps, index, playing, speed } = replay
  const current = index >= 0 ? steps[index]!.event : null
  if (!steps.length) {
    return (
      <div className="rounded-2xl p-5 text-sm bg-surface-2 text-muted">
        The event list holds no records for this plant yet.
      </div>
    )
  }
  return (
    <div className="rounded-2xl p-5 space-y-4 bg-surface-2">
      {current ? (
        <div className="gap-2 flex flex-wrap items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold font-mono tabular-nums">
              {fmtTimeMs(current.sourceAt)} <span className="text-muted">· {fmtUtcMs(current.sourceAt)}</span>
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {SCADA_EVENT_LABEL[current.kind]} · <span className="font-mono">{current.tag}</span>
              {current.firstOut && (
                <Badge variant="danger" className="ml-2">
                  First-out
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted">{current.message}</p>
          </div>
          <span className="text-xs font-semibold text-muted tabular-nums">
            {index + 1} of {steps.length}
          </span>
        </div>
      ) : (
        <p className="text-sm text-body/80">
          The model shows the plant before its first recorded event. Play to walk the record in order.
        </p>
      )}
      <div className="gap-2 flex flex-wrap items-center">
        <Button
          size="sm"
          variant="outline"
          aria-label="Previous event"
          disabled={index < 0}
          onClick={() => replay.setIndex(index - 1)}
        >
          <SkipBack />
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (index + 1 >= steps.length) replay.setIndex(-1)
            replay.setPlaying(!playing)
          }}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-label="Next event"
          disabled={index + 1 >= steps.length}
          onClick={() => replay.setIndex(index + 1)}
        >
          <SkipForward />
        </Button>
        <SegmentedControl
          aria-label="Replay speed"
          size="sm"
          value={String(speed)}
          onChange={(v) => replay.setSpeed(Number(v))}
          options={[1, 2, 4].map((s) => ({ value: String(s), label: `${s}×` }))}
        />
      </div>
      <input
        type="range"
        min={-1}
        max={steps.length - 1}
        step={1}
        value={index}
        onChange={(e) => replay.setIndex(Number(e.target.value))}
        aria-label="Replay position"
        className="w-full accent-[var(--color-accent-strong)]"
      />
    </div>
  )
}

/** The plant's recorded events in order; the current one is marked and any row jumps there. */
function ReplayLog({ replay }: { replay: Replay }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    list.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' })
  }, [replay.index])
  return (
    <div className="rounded-2xl p-5 space-y-3 bg-surface-2">
      <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Event list replay</p>
      <ol ref={list} className="max-h-80 space-y-1 overflow-y-auto" aria-label="Recorded events">
        {replay.steps.map((s, i) => (
          <li key={s.event.id}>
            <button
              type="button"
              aria-current={i === replay.index ? 'step' : undefined}
              onClick={() => replay.setIndex(i)}
              className={cn(
                'gap-2 rounded-xl px-2 py-1.5 text-xs flex w-full items-start text-left transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                i === replay.index
                  ? 'bg-ink text-on-ink'
                  : i < replay.index
                    ? 'text-muted hover:bg-surface'
                    : 'hover:bg-surface',
              )}
            >
              <span className="shrink-0 font-mono tabular-nums">
                {fmtTimeMs(s.event.sourceAt).slice(0, 8)}
              </span>
              <span className="min-w-0">
                <span className="font-semibold">{s.event.tag}</span> {s.event.message}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---- Selection ------------------------------------------------------------------------------

function SelectionPanel({
  plant,
  reading,
  display,
  frame,
  mode,
  selected,
  onSelect,
}: {
  plant: Plant
  reading: PlantReading
  display: SceneDisplay
  frame: SimFrame | null
  mode: Mode
  selected: SelectKey | null
  onSelect: (key: SelectKey | null) => void
}) {
  const navigate = useNavigate()
  const now = useNow(5000)
  const { alarms } = useStore().state
  const open = alarms.filter((a) => a.plantId === plant.id && isOpen(a))
  const units = unitsOf(plant.id)

  if (!selected) {
    return (
      <div className="rounded-2xl p-5 text-sm bg-surface-2 text-muted">
        Select anything in the model: a generator, tank, transformer, building, zone or the ground for the
        whole plant.
      </div>
    )
  }

  let title = ''
  let body: ReactNode = null
  let related: Alarm[] = []
  let link: { label: string; to: string } | null = null

  if (selected.startsWith('unit:')) {
    const id = selected.slice(5)
    const unit = unitsOf(plant.id).find((u) => u.id === id)!
    const shown = display.units[id]!
    const r = reading.units.find((u) => u.unitId === id)
    title = unit.code
    body = (
      <>
        <UnitStateBadge state={shown.state} />
        <KeyValue
          bare
          className="mt-3"
          items={[
            { label: 'Output', value: `${fmtNumber(shown.mw, 1)} of ${unit.ratingMw} MW` },
            {
              label: 'Exhaust',
              value: r && mode === 'live' ? `${fmtNumber(r.exhaustC)} °C` : 'Not in this mode',
              hidden: !r,
            },
            {
              label: 'Lube oil',
              value: r && mode === 'live' ? `${fmtNumber(r.lubeBar, 1)} bar` : 'Not in this mode',
              hidden: !r,
            },
            { label: 'Engine', value: unit.engine },
          ]}
        />
      </>
    )
    related = open.filter((a) => a.unitId === id)
    link = { label: 'Open unit page', to: paths.unit(plant.id, id) }
  } else if (selected === 'tank') {
    const hours = supplyHours(reading, plant)
    title = 'Day tank'
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Level', value: fmtPercent(display.tankLevel) },
          frame
            ? { label: 'Volume', value: `Assumed ${fmtNumber(SIM_DAY_TANK_L / 1000)} m³ day tank` }
            : { label: 'Stock', value: `${fmtNumber(reading.tankLevel * plant.tankCapacityM3)} m³` },
          {
            label: 'Supply left',
            value: frame ? 'See the event log' : hours === null ? 'No burn' : `About ${fmtNumber(hours)} h`,
          },
        ]}
      />
    )
    related = open.filter((a) => a.kind === 'low_tank_level' || a.kind === 'fuel_imbalance')
    link = { label: 'Open fuel tab', to: paths.plant(plant.id, 'fuel') }
  } else if (selected === 'link') {
    const latency = linkLatency(plant, now)
    title = 'Starlink terminal'
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Link', value: display.linkUp ? 'Up' : 'Down' },
          { label: 'Round trip', value: frame || latency === null ? 'None' : `${fmtNumber(latency)} ms` },
          {
            label: 'Site buffer',
            value: `${fmtNumber(frame ? frame.bufferedSamples : bufferedSamples(plant, now))} samples`,
          },
        ]}
      />
    )
    related = open.filter((a) => a.kind === 'comms_loss')
    link = { label: 'Open link health', to: paths.dataHealth('link') }
  } else if (selected.startsWith('flow:')) {
    const id = selected.slice(5) as FlowId
    const running = units.filter((u) => display.units[u.id]?.state === 'running').length
    const generated = Object.values(display.units).reduce((sum, u) => sum + u.mw, 0)
    const fuelLink = { label: 'Open fuel tab', to: paths.plant(plant.id, 'fuel') }
    const powerLink = { label: 'Open single line', to: paths.plant(plant.id, 'sld') }
    const flows: Record<
      FlowId,
      { title: string; items: { label: string; value: ReactNode }[]; link: typeof fuelLink }
    > = {
      transfer: {
        title: 'Transfer line',
        items: [
          { label: 'Route', value: 'Storage tank 1 to the day tank' },
          { label: 'Pump P-TR1', value: display.transferPumpOn ? 'Running' : 'Stopped' },
        ],
        link: fuelLink,
      },
      supply: {
        title: 'Fuel supply',
        items: [
          { label: 'Route', value: 'Day tank to fuel treatment' },
          { label: 'Flow', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` },
        ],
        link: fuelLink,
      },
      header: {
        title: 'Engine fuel header',
        items: [
          { label: 'Route', value: 'Booster module to every engine' },
          { label: 'Engines fed', value: `${running} of ${units.length}` },
          { label: 'Net burn', value: `${fmtNumber(reading.fuelNetLph)} L/h` },
        ],
        link: fuelLink,
      },
      return: {
        title: 'Fuel return',
        items: [
          { label: 'Route', value: 'Engines back to the day tank' },
          { label: 'Flow', value: `${fmtNumber(reading.fuelReturnLph)} L/h` },
        ],
        link: fuelLink,
      },
      bus: {
        title: '11 kV bus',
        items: [
          { label: 'Feeding', value: `${running} of ${units.length} generators` },
          { label: 'Generated', value: `${fmtNumber(generated, 1)} MW` },
          { label: 'Frequency', value: generated > 0 ? `${fmtNumber(reading.frequencyHz, 2)} Hz` : 'Dead' },
        ],
        link: powerLink,
      },
      mv: {
        title: '11 kV to the transformers',
        items: [
          { label: 'Carrying', value: `${fmtNumber(display.exportMw, 1)} MW` },
          { label: 'Current', value: `${fmtNumber(reading.currentA)} A` },
        ],
        link: powerLink,
      },
      hv: {
        title: '33 kV line',
        items: [
          { label: 'Carrying', value: `${fmtNumber(display.exportMw, 1)} MW` },
          {
            label: 'Voltage',
            value: display.exportMw > 0 ? `${fmtNumber(reading.voltageKv * 3, 1)} kV` : 'Dead',
          },
        ],
        link: powerLink,
      },
      grid: {
        title: 'Grid export',
        items: [
          { label: 'Export', value: `${fmtNumber(display.exportMw, 1)} MW` },
          { label: 'Demand', value: display.strained ? 'Above what the units deliver' : 'Covered' },
        ],
        link: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
      },
    }
    title = flows[id].title
    body = <KeyValue bare items={flows[id].items} />
    link = flows[id].link
    related = open.filter((a) =>
      ['transfer', 'supply', 'header', 'return'].includes(id)
        ? a.kind === 'fuel_imbalance' || a.kind === 'low_tank_level'
        : a.kind === 'breaker_event' || a.kind === 'generation_drop',
    )
  } else if (selected === 'site') {
    title = plant.name
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Output', value: `${fmtNumber(display.exportMw, 1)} MW exported` },
          {
            label: 'Units running',
            value: `${units.filter((u) => display.units[u.id]?.state === 'running').length} of ${units.length}`,
          },
          { label: 'Link', value: display.linkUp ? 'Up' : 'Down' },
          { label: 'Open alarms', value: open.length },
        ]}
      />
    )
    related = open.filter((a) => a.priority === 'critical')
    link = { label: 'Open alarms for this plant', to: paths.alarms(`?site=${plant.id}`) }
  } else if (selected.startsWith('zone:')) {
    const zone = selected.slice(5) as SiteZoneKind
    title = SITE_ZONE_LABEL[zone]
    body = (
      <p className="text-sm text-muted">The 2D site plan lists this zone's live values and open alarms.</p>
    )
    link = { label: 'Show on the 2D plan', to: `${paths.plant(plant.id)}?zone=${zone}` }
  } else if (selected.startsWith('transformer:')) {
    const t = singleLineModel(units, reading).transformers[Number(selected.slice(12))]!
    title = `Transformer ${t.tag}`
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Ratio', value: '11/33 kV step-up' },
          { label: 'Rating', value: `${t.mva} MVA` },
          { label: 'Load', value: frame ? 'Not simulated' : fmtPercent(t.load) },
          { label: 'Oil / winding', value: `${fmtNumber(t.oil)} / ${fmtNumber(t.winding)} °C` },
        ]}
      />
    )
    link = { label: 'Open single line', to: paths.plant(plant.id, 'sld') }
  } else if (selected.startsWith('storage:')) {
    title = `HFO storage tank ${Number(selected.slice(8)) + 1}`
    body = (
      <p className="text-sm text-muted">
        Not metered yet. Level transmitters sit outside the SCADA supply until GPI adds them.
      </p>
    )
    link = { label: 'Open fuel tab', to: paths.plant(plant.id, 'fuel') }
  } else if (selected === 'separators') {
    title = 'Fuel treatment'
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Supply', value: `${fmtNumber(reading.fuelSupplyLph)} L/h` },
          { label: 'Return', value: `${fmtNumber(reading.fuelReturnLph)} L/h` },
          { label: 'Net burn', value: `${fmtNumber(reading.fuelNetLph)} L/h` },
          { label: 'Transfer pump', value: display.transferPumpOn ? 'Running' : 'Stopped' },
        ]}
      />
    )
    related = open.filter((a) => a.kind === 'fuel_imbalance')
    link = { label: 'Open fuel tab', to: paths.plant(plant.id, 'fuel') }
  } else if (selected === 'export') {
    title = 'Export gantry'
    body = (
      <KeyValue
        bare
        items={[
          { label: 'Export', value: `${fmtNumber(display.exportMw, 1)} MW` },
          {
            label: 'Voltage',
            value: display.exportMw > 0 ? `${fmtNumber(reading.voltageKv * 3, 1)} kV` : 'Dead',
          },
          { label: 'Demand', value: display.strained ? 'Above what the units deliver' : 'Covered' },
        ]}
      />
    )
    related = open.filter((a) => a.kind === 'breaker_event' || a.kind === 'generation_drop')
    link = { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') }
  } else if (selected.startsWith('building:')) {
    const kind = selected.slice(9) as 'control_room' | 'workshop' | 'gate'
    title = SITE_ZONE_LABEL[kind]
    const down = units.filter((u) => display.units[u.id]?.state === 'maintenance').length
    body = (
      <p className="text-sm text-muted">
        {kind === 'control_room'
          ? 'Holds the plant SCADA servers, the gateways and the Starlink router.'
          : kind === 'workshop'
            ? `${down ? `${down} unit${down === 1 ? '' : 's'} in maintenance` : 'No unit in maintenance'}.`
            : 'Security post with the gate camera.'}
      </p>
    )
    link =
      kind === 'control_room'
        ? { label: 'Open data sources', to: paths.plant(plant.id, 'sources') }
        : kind === 'workshop'
          ? { label: 'Open auxiliaries', to: paths.plant(plant.id, 'aux') }
          : { label: 'Open cameras', to: paths.cctv(plant.id) }
  } else {
    const name = selected.slice(7)
    title = `Camera · ${name}`
    body = (
      <p className="text-sm text-muted">
        Live view opens on the CCTV page. CCTV stays off the SCADA network.
      </p>
    )
    link = { label: 'Open cameras', to: paths.cctv(plant.id) }
  }

  return (
    <div className="rounded-2xl p-5 space-y-4 bg-surface-2">
      <div className="gap-2 flex items-start justify-between">
        <div>
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">
            {mode === 'sim'
              ? 'Selected · simulated'
              : mode === 'replay'
                ? 'Selected · event replay'
                : 'Selected'}
          </p>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
          Clear
        </Button>
      </div>
      {body}
      {CHAINS.filter((c) => c.steps.some((st) => st.key === selected)).map((chain) => (
        <div key={chain.name}>
          <p className="mb-1.5 font-semibold tracking-wider text-[11px] text-muted uppercase">{chain.name}</p>
          <ol className="gap-1 flex flex-wrap items-center">
            {chain.steps.map((st, i) => (
              <li key={st.key} className="gap-1 flex items-center">
                {i > 0 && (
                  <span aria-hidden="true" className="text-muted">
                    ›
                  </span>
                )}
                <button
                  type="button"
                  aria-current={st.key === selected ? 'step' : undefined}
                  onClick={() => onSelect(st.key)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
                    st.key === selected ? 'bg-ink text-on-ink' : 'bg-card hover:bg-surface',
                  )}
                >
                  {st.label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {mode === 'live' && related.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Open alarms</p>
          {related.map((a) => (
            <AlarmActions key={a.id} alarm={a} />
          ))}
        </div>
      )}
      {mode !== 'live' && related.length > 0 && (
        <p className="text-xs text-muted">Current alarm actions are available in Live mode.</p>
      )}
      {link && (
        <Button size="sm" variant="outline" onClick={() => navigate(link.to)}>
          {link.label}
        </Button>
      )}
    </div>
  )
}

/** The next lifecycle step for a real alarm, offered to roles that may take it. */
function AlarmActions({ alarm }: { alarm: Alarm }) {
  const act = useAct()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [assigning, setAssigning] = useState(false)
  return (
    <div className="rounded-xl p-3 space-y-2 bg-card">
      <div className="gap-2 flex flex-wrap items-center">
        <span className="text-sm font-semibold">{ALARM_KIND_LABEL[alarm.kind]}</span>
        <AlarmStatusBadge status={alarm.status} />
      </div>
      <p className="text-xs text-muted">
        {alarm.code} · {ALARM_PRIORITY_LABEL[alarm.priority]} · {alarm.reading}
      </p>
      <div className="gap-2 flex flex-wrap">
        {alarm.status === 'new' && can('alarm.acknowledge') && (
          <Button
            size="sm"
            onClick={() =>
              act(
                { type: 'alarms/acknowledge', id: alarm.id },
                { title: 'Alarm acknowledged', description: `${alarm.code} from the 3D view` },
              )
            }
          >
            Acknowledge
          </Button>
        )}
        {alarm.status === 'acknowledged' && can('alarm.assign') && (
          <Button size="sm" onClick={() => setAssigning(true)}>
            Assign
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => navigate(paths.alarm(alarm.id))}>
          Open alarm
        </Button>
      </div>
      <AssignDialog alarm={alarm} open={assigning} onOpenChange={setAssigning} />
    </div>
  )
}

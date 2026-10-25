import { CAMERAS, PLAN_SIZE, UNITS, fmtNumber, fmtPercent, siteLayout } from '@gpi/fixtures'
import { type Plant, SITE_ZONE_LABEL, type SiteZoneKind, UNIT_STATE_LABEL, type UnitState } from '@gpi/types'
import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { WIDE_ONLY, createStage, cssLabel } from '../../../lib/three-stage'
import { createBeacon, createFan, createShockwaves, createSignal, createSmoke, puffTexture } from './effects'

/** What the scene draws: live readings or one simulation frame. */
export interface SceneDisplay {
  units: Record<string, { state: UnitState; mw: number; hot: boolean }>
  tankLevel: number
  linkUp: boolean
  /** The plant buffer is draining into the central historian. */
  backfilling: boolean
  /** The transfer pump keeps the day tank topped up from storage. */
  transferPumpOn: boolean
  exportMw: number
  /** Demand exceeds what the running units deliver. */
  strained: boolean
  /** Where the alarm beacon turns, if anything is in alarm. */
  beacon: BeaconAt | null
}

export type BeaconAt = `unit:${string}` | 'tank' | 'link' | 'export'

/** Everything in the model that a click selects. */
/** Segments of the fuel and power chains, in flow order. */
export const FLOW_IDS = ['transfer', 'supply', 'header', 'return', 'bus', 'mv', 'hv', 'grid'] as const
export type FlowId = (typeof FLOW_IDS)[number]
type FlowKind = 'fuel' | 'transfer' | 'return' | 'power'

export type SelectKey =
  | 'site'
  | `flow:${FlowId}`
  | `unit:${string}`
  | 'tank'
  | 'link'
  | `camera:${string}`
  | `zone:${SiteZoneKind}`
  | `transformer:${number}`
  | `storage:${number}`
  | 'separators'
  | 'export'
  | `building:${'control_room' | 'workshop' | 'gate'}`

export interface SiteScene {
  update: (display: SceneDisplay) => void
  select: (key: SelectKey | null) => void
  reset: () => void
  top: () => void
  dispose: () => void
}

/** Plan units to world units: the 1000 × 600 plan becomes a 20 × 12 site. */
const S = 0.02
const wx = (x: number) => (x - PLAN_SIZE.width / 2) * S
const wz = (y: number) => (y - PLAN_SIZE.height / 2) * S
const HOME = new THREE.Vector3(0, 11, 12.5)
const TOP = new THREE.Vector3(0, 22, 0.01)
const TANK_H = 1.5

/** Detail after the unit number: output while running, the state when tripped or in maintenance. */
const unitDetail = (state: UnitState, mw: number) =>
  state === 'running'
    ? ` · ${fmtNumber(mw, 1)} MW`
    : state === 'tripped' || state === 'maintenance'
      ? ` · ${UNIT_STATE_LABEL[state]}`
      : ''

/**
 * Builds the three.js model of one plant from the schematic site layout. The scene is built once;
 * `update` recolours and relabels it in place, so live samples and simulation frames never rebuild it.
 */
export function createSiteScene(
  host: HTMLElement,
  plant: Plant,
  onSelect: (key: SelectKey | null) => void,
): SiteScene {
  // Shown display, read by the highlight pulse and the frame handler below.
  let shown: SceneDisplay | null = null
  const stage = createStage<SelectKey>(host, {
    home: HOME,
    top: TOP,
    minDistance: 5,
    maxDistance: 38,
    shadowExtent: 14,
    onSelect,
    // Tripped generators pulse, and so does the dish while the link is down.
    emphasis: (key, time): number => {
      const tripped = key.startsWith('unit:') && shown?.units[key.slice(5)]?.state === 'tripped'
      const blink = key === 'link' && !!shown && !shown.linkUp
      return tripped || blink ? 0.25 + 0.25 * Math.sin(time / 300) : 0
    },
  })
  const { scene, color, reduceMotion, track, mat, add, pickable } = stage
  const tag = (text: string, x: number, y: number, z: number, strong = false, extra = '') =>
    stage.tag(text, x, y, z, strong, extra).el
  const layout = siteLayout(plant, UNITS)
  const zone = (kind: SiteZoneKind) => layout.zones.find((z) => z.kind === kind)!.rect

  // Ground and zone pads.
  const ground = add(new THREE.PlaneGeometry(24, 15), mat(color.surface), 0, 0, 0)
  ground.rotation.x = -Math.PI / 2
  ground.castShadow = false
  pickable.set(ground, 'site')
  for (const { kind, rect } of layout.zones) {
    const pad = add(
      new THREE.BoxGeometry(rect.w * S, 0.06, rect.h * S),
      mat(color.card),
      wx(rect.x + rect.w / 2),
      0.03,
      wz(rect.y + rect.h / 2),
    )
    pad.castShadow = false
    pickable.set(pad, `zone:${kind}`)
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(pad.geometry),
      new THREE.LineBasicMaterial({ color: color.border }),
    )
    track(edges.geometry)
    track(edges.material as THREE.Material)
    pad.add(edges)
    tag(SITE_ZONE_LABEL[kind], wx(rect.x) + 0.2, 0.1, wz(rect.y) + 0.25, false, WIDE_ONLY)
  }

  // Engine hall walls, open roof so the gensets stay visible.
  const hall = zone('engine_hall')
  const wallMat = mat(color.surface2, { transparent: true, opacity: 0.85 })
  for (const wallMesh of [
    add(new THREE.BoxGeometry(hall.w * S, 0.5, 0.08), wallMat, wx(hall.x + hall.w / 2), 0.25, wz(hall.y)),
    add(new THREE.BoxGeometry(0.08, 0.5, hall.h * S), wallMat, wx(hall.x), 0.25, wz(hall.y + hall.h / 2)),
    add(
      new THREE.BoxGeometry(0.08, 0.5, hall.h * S),
      wallMat,
      wx(hall.x + hall.w),
      0.25,
      wz(hall.y + hall.h / 2),
    ),
  ])
    pickable.set(wallMesh, 'zone:engine_hall')

  // Gensets, exhaust stacks and the over-temperature ring.
  const stateColor: Record<UnitState, THREE.Color> = {
    running: color.ink,
    standby: color.silver,
    tripped: color.accentStrong,
    maintenance: color.warning,
    not_commissioned: color.chart,
  }
  const puff = puffTexture(track)
  const shockwaves = createShockwaves(scene, track)
  const gensets = new Map<
    string,
    {
      body: THREE.MeshStandardMaterial
      detail: HTMLSpanElement
      ring: THREE.Mesh
      smoke: ReturnType<typeof createSmoke>
      fan: ReturnType<typeof createFan>
      base: THREE.Vector3
      target: THREE.Color
      rating: number
      state: UnitState | null
    }
  >()
  const fanMat = mat(color.silver)
  for (const { unitId, rect } of layout.units) {
    const unit = UNITS.find((u) => u.id === unitId)!
    const x = wx(rect.x + rect.w / 2)
    const z = wz(rect.y + rect.h / 2) + 0.15
    const w = rect.w * S * 0.78
    const d = rect.h * S * 0.55
    const body = mat(color.ink, { transparent: true })
    const genset = add(new THREE.BoxGeometry(w, 0.8, d), body, x, 0.46, z)
    pickable.set(genset, `unit:${unitId}`)
    add(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 16), mat(color.silver), x, 0.9, z - d / 2 - 0.12)
    const smoke = createSmoke(scene, new THREE.Vector3(x, 1.8, z - d / 2 - 0.12), puff, track, color.muted)
    const fan = createFan(
      scene,
      new THREE.Vector3(x, 0.89, z + d * 0.12),
      Math.min(w, d) * 0.32,
      fanMat,
      track,
    )
    const ring = add(
      new THREE.TorusGeometry(Math.max(w, d) * 0.62, 0.035, 8, 48),
      mat(color.accent),
      x,
      0.08,
      z,
    )
    ring.rotation.x = Math.PI / 2
    const detail = document.createElement('span')
    detail.className = WIDE_ONLY
    tag(unit.code.split('-')[1]!, x, 1.15, z).append(detail)
    gensets.set(unitId, {
      body,
      detail,
      ring,
      smoke,
      fan,
      base: new THREE.Vector3(x, 0.08, z),
      target: color.ink.clone(),
      rating: unit.ratingMw,
      state: null,
    })
  }

  // Tank farm: the day tank fills to its level; storage tanks are not metered yet.
  const { dayTank, storageTanks } = layout
  const dayR = dayTank.r * S
  const shell = add(
    new THREE.CylinderGeometry(dayR, dayR, TANK_H, 40, 1, true),
    mat(color.silver, { transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    wx(dayTank.cx),
    TANK_H / 2 + 0.06,
    wz(dayTank.cy),
  )
  const fillMat = mat(color.info)
  const fill = add(
    new THREE.CylinderGeometry(dayR * 0.96, dayR * 0.96, TANK_H, 40),
    fillMat,
    wx(dayTank.cx),
    0,
    wz(dayTank.cy),
  )
  pickable.set(shell, 'tank')
  pickable.set(fill, 'tank')
  const tankLabel = tag('', wx(dayTank.cx), TANK_H + 0.35, wz(dayTank.cy), true)
  storageTanks.forEach((t, i) =>
    pickable.set(
      add(new THREE.CylinderGeometry(t.r * S, t.r * S, 1.2, 32), mat(color.chart), wx(t.cx), 0.66, wz(t.cy)),
      `storage:${i}`,
    ),
  )

  // Fuel treatment: separator skids.
  const ft = zone('fuel_treatment')
  for (let i = 0; i < 3; i++) {
    const sep = add(
      new THREE.CylinderGeometry(0.22, 0.22, 0.9, 20),
      mat(color.silver),
      wx(ft.x + 60 + i * 70),
      0.5,
      wz(ft.y + ft.h / 2 + 10),
    )
    sep.rotation.z = Math.PI / 2
    pickable.set(sep, 'separators')
  }

  // Switchyard: step-up transformers with bushings and the export gantry.
  const energised: THREE.MeshStandardMaterial[] = []
  layout.transformers.forEach((t, i) => {
    const x = wx(t.x + t.w / 2)
    const z = wz(t.y + t.h / 2)
    const m = mat(color.ink)
    energised.push(m)
    pickable.set(
      add(new THREE.BoxGeometry(t.w * S * 0.7, 0.75, t.h * S * 0.8), m, x, 0.44, z),
      `transformer:${i}`,
    )
    for (const dx of [-0.2, 0, 0.2])
      pickable.set(
        add(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 10), mat(color.chart), x + dx, 1.04, z),
        `transformer:${i}`,
      )
  })
  const yard = zone('switchyard')
  const gx = wx(yard.x + yard.w - 30)
  const gz = wz(yard.y + yard.h / 2)
  for (const dz of [-0.8, 0.8])
    pickable.set(add(new THREE.BoxGeometry(0.08, 2.2, 0.08), mat(color.silver), gx, 1.1, gz + dz), 'export')
  pickable.set(add(new THREE.BoxGeometry(0.08, 0.08, 1.7), mat(color.silver), gx, 2.2, gz), 'export')
  const exportLabel = tag('', gx, 2.6, gz, true)

  // Buildings, with the Starlink terminal on the control room roof.
  const building = (kind: 'control_room' | 'workshop' | 'gate', h: number, inset = 16) => {
    const r = zone(kind)
    const x = wx(r.x + r.w / 2)
    const z = wz(r.y + r.h / 2 + 10)
    const mesh = add(
      new THREE.BoxGeometry((r.w - inset * 2) * S, h, (r.h - inset * 2 - 20) * S),
      mat(color.surface2),
      x,
      h / 2 + 0.06,
      z,
    )
    pickable.set(mesh, `building:${kind}`)
    return { x, z, h }
  }
  const room = building('control_room', 0.6)
  building('workshop', 0.85)
  building('gate', 0.45, 40)
  const dishMat = mat(color.ink)
  const dish = add(
    new THREE.CylinderGeometry(0.28, 0.2, 0.06, 24),
    dishMat,
    room.x + 1.6,
    room.h + 0.32,
    room.z,
  )
  dish.rotation.z = 0.35
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8), mat(color.silver), room.x + 1.6, room.h + 0.18, room.z)
  pickable.set(dish, 'link')
  // The overlay renderer owns the label's display style, so hide the object itself.
  const linkLabel = new CSS2DObject(cssLabel('Starlink down', true))
  linkLabel.position.set(room.x + 1.6, room.h + 0.8, room.z)
  scene.add(linkLabel)

  // Fuel and power chains, end to end. Each run is a pickable tube with particles that move while the
  // medium flows; points are plan x, plan y and height in metres.
  type Point = [number, number, number]
  const pathOf = (points: Point[]) => {
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < points.length; i++) {
      const [ax, ay, ah] = points[i - 1]!
      const [bx, by, bh] = points[i]!
      path.add(
        new THREE.LineCurve3(new THREE.Vector3(wx(ax), ah, wz(ay)), new THREE.Vector3(wx(bx), bh, wz(by))),
      )
    }
    return path
  }
  const dotGeo = track(new THREE.SphereGeometry(0.065, 10, 8))
  const dotMats: Record<FlowKind, THREE.MeshBasicMaterial> = {
    fuel: track(new THREE.MeshBasicMaterial({ color: color.info })),
    transfer: track(new THREE.MeshBasicMaterial({ color: color.info })),
    return: track(new THREE.MeshBasicMaterial({ color: color.muted })),
    power: track(new THREE.MeshBasicMaterial({ color: color.card })),
  }
  const runs: {
    id: FlowId
    kind: FlowKind
    pipe: THREE.MeshStandardMaterial
    dots: { dot: THREE.Mesh; u: number; path: THREE.CurvePath<THREE.Vector3> }[]
  }[] = []
  /** One flow segment: a main run with particles, plus optional branches drawn in the same pipe. */
  const run = (id: FlowId, kind: FlowKind, points: Point[], dotCount: number, branches: Point[][] = []) => {
    const radius = kind === 'power' ? 0.035 : kind === 'return' ? 0.035 : 0.05
    const pipe = mat(kind === 'power' ? color.ink : kind === 'return' ? color.muted : color.info)
    for (const pts of [points, ...branches]) {
      const tube = add(
        new THREE.TubeGeometry(pathOf(pts), Math.max(8, pts.length * 16), radius, 8, false),
        pipe,
        0,
        0,
        0,
      )
      pickable.set(tube, `flow:${id}`)
    }
    const path = pathOf(points)
    const dots = Array.from({ length: dotCount }, (_, i) => {
      const dot = new THREE.Mesh(dotGeo, dotMats[kind])
      scene.add(dot)
      return { dot, u: i / dotCount, path }
    })
    runs.push({ id, kind, pipe, dots })
  }

  // Fuel: storage, transfer pump, day tank, treatment, engine header with a feed per unit, return line.
  const store = storageTanks[0]!
  const dayBottom = dayTank.cy + dayTank.r
  const hallBottom = hall.y + hall.h - 10
  const unitCentres = layout.units.map(({ rect }) => [rect.x + rect.w / 2, rect.y + rect.h / 2] as const)
  run(
    'transfer',
    'transfer',
    [
      [store.cx, store.cy, 0.22],
      [store.cx, store.cy + store.r + 14, 0.22],
      [dayTank.cx, store.cy + store.r + 14, 0.22],
      [dayTank.cx, dayTank.cy, 0.22],
    ],
    6,
  )
  run(
    'supply',
    'fuel',
    [
      [dayTank.cx, dayBottom, 0.12],
      [dayTank.cx, 272, 0.12],
      [600, 272, 0.12],
      [600, 326, 0.12],
      [200, 326, 0.12],
      [200, ft.y + 5, 0.12],
    ],
    10,
  )
  run(
    'header',
    'fuel',
    [
      [90, ft.y + 5, 0.12],
      [90, hallBottom, 0.12],
      [hall.x + hall.w - 20, hallBottom, 0.12],
    ],
    12,
    unitCentres.map(([x, y]) => [
      [x, hallBottom, 0.12],
      [x, y, 0.12],
    ]),
  )
  run(
    'return',
    'return',
    [
      [hall.x + hall.w - 20, hallBottom - 8, 0.3],
      [582, hallBottom - 8, 0.3],
      [582, 284, 0.3],
      [dayTank.cx - 12, 284, 0.3],
      [dayTank.cx - 12, dayBottom, 0.3],
    ],
    8,
  )

  // Power: each unit onto the 11 kV bus, the bus to the transformers, 33 kV to the gantry, out to the grid.
  const busY = unitCentres.reduce((sum, [, y]) => sum + y, 0) / Math.max(1, unitCentres.length)
  const trafo = layout.transformers.map((t) => [t.x + t.w / 2, t.y + t.h / 2] as const)
  const gantryX = yard.x + yard.w - 30
  const gantryY = yard.y + yard.h / 2
  run(
    'bus',
    'power',
    [
      [unitCentres[0]![0], busY, 1.15],
      [hall.x + hall.w, busY, 1.15],
    ],
    8,
    unitCentres.map(([x, y]) => [
      [x, y, 0.86],
      [x, y, 1.15],
      [x, busY, 1.15],
    ]),
  )
  run(
    'mv',
    'power',
    [
      [hall.x + hall.w, busY, 1.15],
      [612, busY, 1.15],
      [612, trafo[0]![1], 1.15],
      [trafo.at(-1)![0], trafo[0]![1], 1.15],
    ],
    6,
    trafo.map(([x, y]) => [
      [x, y, 1.15],
      [x, y, 0.82],
    ]),
  )
  run(
    'hv',
    'power',
    [
      [trafo[0]![0], trafo[0]![1] - 14, 1.5],
      [gantryX, trafo[0]![1] - 14, 1.5],
      [gantryX, gantryY, 2.2],
    ],
    6,
    trafo.map(([x, y]) => [
      [x, y, 1.27],
      [x, y - 14, 1.5],
    ]),
  )
  run(
    'grid',
    'power',
    [
      [gantryX, gantryY, 2.2],
      [PLAN_SIZE.width + 100, gantryY, 2.2],
    ],
    6,
  )
  /** Rated export, so particle speed reads as a share of what the plant could send out. */
  const ratedMw = UNITS.filter((u) => u.plantId === plant.id).reduce((sum, u) => sum + u.ratingMw, 0)

  const signal = createSignal(scene, dish.position.clone(), color.info, puff, track)
  const beacon = createBeacon(scene, color.accent, track)
  const beaconSpot = (at: BeaconAt): THREE.Vector3 => {
    if (at === 'tank') return new THREE.Vector3(wx(dayTank.cx), TANK_H + 0.9, wz(dayTank.cy))
    if (at === 'link') return dish.position.clone().setY(dish.position.y + 0.7)
    if (at === 'export') return new THREE.Vector3(gx, 2.9, gz)
    return gensets.get(at.slice(5))!.base.clone().setY(1.9)
  }

  // Camera poles.
  for (const pin of layout.cameras) {
    const cam = CAMERAS.find((c) => c.plantId === plant.id && c.name === pin.name)
    if (!cam) continue
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 8), mat(color.silver), wx(pin.x), 0.76, wz(pin.y))
    const head = add(
      new THREE.SphereGeometry(0.11, 16, 12),
      mat(cam.online ? color.ink : color.silver),
      wx(pin.x),
      1.5,
      wz(pin.y),
    )
    pickable.set(head, `camera:${cam.name}`)
  }

  let shownLevel = -1
  let targetLevel = 0

  const update = (display: SceneDisplay) => {
    shown = display
    const now = performance.now()
    for (const [unitId, g] of gensets) {
      const u = display.units[unitId]!
      // Bursts mark a change of state, never the first draw.
      if (g.state && g.state !== u.state && !reduceMotion) {
        if (u.state === 'tripped') {
          shockwaves.burst(g.base, color.accent, now)
          g.smoke.puff(now)
        } else if (u.state === 'running') shockwaves.burst(g.base, color.info, now, 1.4, 700)
      }
      g.state = u.state
      g.target.copy(stateColor[u.state])
      g.body.opacity = u.state === 'not_commissioned' ? 0.35 : 1
      g.detail.textContent = unitDetail(u.state, u.mw)
      g.ring.visible = u.hot
      const load = u.state === 'running' ? Math.min(1, u.mw / g.rating) : 0
      g.smoke.setLoad(reduceMotion ? 0 : load)
      g.fan.setLoad(reduceMotion ? 0 : load)
    }
    targetLevel = Math.max(0.02, display.tankLevel)
    if (shownLevel < 0 || reduceMotion) shownLevel = targetLevel
    fillMat.color.copy(display.tankLevel < 0.25 ? color.accent : color.info)
    tankLabel.textContent = `Day tank ${fmtPercent(display.tankLevel)}`
    const live = display.exportMw > 0
    for (const m of energised) m.color.copy(live ? color.ink : color.silver)
    dotMats.power.color.copy(display.strained ? color.accent : color.card)
    for (const r of runs) {
      const flowing = r.kind === 'transfer' ? live && display.transferPumpOn : live
      r.pipe.color.copy(
        !flowing
          ? color.silver
          : r.kind === 'power'
            ? color.ink
            : r.kind === 'return'
              ? color.muted
              : color.info,
      )
      for (const d of r.dots) d.dot.visible = flowing && !reduceMotion
    }
    exportLabel.textContent = live ? `Export ${fmtNumber(display.exportMw, 1)} MW` : 'No export'
    linkLabel.visible = !display.linkUp
    signal.setMode(!display.linkUp ? 'down' : display.backfilling ? 'backfill' : 'up')
    beacon.place(display.beacon ? beaconSpot(display.beacon) : null)
  }

  stage.onFrame((time, dt) => {
    for (const g of gensets.values()) {
      g.body.color.lerp(g.target, reduceMotion ? 1 : Math.min(1, dt / 400))
      g.smoke.tick(time, dt)
      g.fan.tick(time, dt)
    }
    shownLevel += (targetLevel - shownLevel) * (reduceMotion ? 1 : Math.min(1, dt / 500))
    fill.scale.y = shownLevel
    fill.position.y = (TANK_H * shownLevel) / 2 + 0.06
    // Flow speed follows output; a strained plant pushes its power particles harder.
    const share = shown ? Math.min(1.2, shown.exportMw / Math.max(1, ratedMw)) : 0
    const fuel = 0.00006 + share * 0.00012
    const speed: Record<FlowKind, number> = {
      fuel,
      transfer: 0.00012,
      return: fuel * 0.6,
      power: (0.00008 + share * 0.0002) * (shown?.strained ? 1.6 : 1),
    }
    for (const r of runs) {
      for (const d of r.dots) {
        if (!d.dot.visible) continue
        d.u = (d.u + dt * speed[r.kind]) % 1
        d.dot.position.copy(d.path.getPointAt(d.u))
      }
    }
    shockwaves.tick(time)
    signal.tick(time, reduceMotion)
    beacon.tick(time, reduceMotion)
  })

  return {
    update,
    select: stage.select,
    reset: stage.reset,
    top: stage.top,
    dispose: () => {
      shockwaves.dispose()
      stage.dispose()
    },
  }
}

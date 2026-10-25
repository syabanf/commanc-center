import type { Unit } from '@gpi/types'
import * as THREE from 'three'
import { WIDE_ONLY, createStage } from '../../../lib/three-stage'
import type { BreakerState, SingleLineModel } from '../single-line-model'

// The single-line diagram laid out in depth: generators at the front, then their 11 kV breakers, the
// 11 kV bus in two sections, transformer breakers, transformers, 33 kV breakers and bus, the feeder
// breakers and the lines to the grid at the back. Power particles run only through closed paths.

export type SldKey =
  | `gen:${string}`
  | `breaker:${string}`
  | `trafo:${number}`
  | 'bus:11a'
  | 'bus:11b'
  | 'bus:33'
  | `line:${number}`

const ROW = {
  gen: 3.6,
  genBreaker: 2.2,
  bus11: 1,
  trafoLv: -0.3,
  trafo: -1.7,
  trafoHv: -3.1,
  bus33: -4.2,
  feeder: -5.4,
  line: -6.6,
}
const BUS_H = 1.5
const SPACING = 1.5

const spread = (count: number, span: number) =>
  Array.from({ length: count }, (_, i) => (count === 1 ? 0 : -span / 2 + (i * span) / (count - 1)))

export function createSldScene(host: HTMLElement, units: Unit[], onSelect: (key: SldKey | null) => void) {
  const width = Math.max(6, (units.length - 1) * SPACING)
  const stage = createStage<SldKey>(host, {
    home: new THREE.Vector3(width * 0.55, 7.5, 9.5),
    top: new THREE.Vector3(0, 18, 0.01),
    target: new THREE.Vector3(0, 0.8, -1.2),
    minDistance: 3,
    maxDistance: 34,
    shadowExtent: Math.max(9, width),
    onSelect,
    emphasis: (key, time) =>
      key.startsWith('breaker:') && states.get(key.slice(8)) === 'tripped'
        ? 0.25 + 0.25 * Math.sin(time / 300)
        : 0,
  })
  const { scene, color, add, mat, tag, track, pickable } = stage
  const states = new Map<string, BreakerState>()

  const ground = add(new THREE.PlaneGeometry(width + 8, 15), mat(color.surface), 0, 0, -1.5, false)
  ground.rotation.x = -Math.PI / 2

  const unitX = spread(units.length, width)
  const half = Math.ceil(units.length / 2)
  const couplerX = units.length > 1 ? (unitX[half - 1]! + unitX[half]!) / 2 : 0
  const t = Math.max(2, Math.ceil(units.length / 3))
  const trafoX = spread(t, width * 0.7)
  const feederX = [-width * 0.22, width * 0.22]

  // Breakers are switchgear cubicles coloured by state, with a lamp on top.
  const fill: Record<BreakerState, THREE.Color> = {
    closed: color.ink,
    open: color.card,
    tripped: color.accentStrong,
    racked_out: color.warning,
  }
  const breakers = new Map<string, THREE.MeshStandardMaterial>()
  const breaker = (tagName: string, x: number, z: number, size = 0.55) => {
    const material = mat(color.ink)
    const cubicle = add(new THREE.BoxGeometry(size, 1.2, size), material, x, 0.6, z)
    pickable.set(cubicle, `breaker:${tagName}`)
    breakers.set(tagName, material)
    tag(tagName, x, 1.45, z, false, WIDE_ONLY)
  }

  // Conductors: a pickable tube per segment, with particles on energised ones.
  type Segment = {
    path: THREE.CurvePath<THREE.Vector3>
    material: THREE.MeshStandardMaterial
    dots: THREE.Mesh[]
    u: number
    live: () => boolean
  }
  const segments: Segment[] = []
  const dotGeo = track(new THREE.SphereGeometry(0.05, 8, 6))
  const dotMat = track(new THREE.MeshBasicMaterial({ color: color.card }))
  const conductor = (
    points: THREE.Vector3[],
    key: SldKey | null,
    live: () => boolean,
    radius = 0.04,
    dots = 3,
  ) => {
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1]!, points[i]!))
    const material = mat(color.ink)
    const tube = add(new THREE.TubeGeometry(path, points.length * 12, radius, 8, false), material, 0, 0, 0)
    if (key) pickable.set(tube, key)
    const marks = Array.from({ length: dots }, () => {
      const dot = new THREE.Mesh(dotGeo, dotMat)
      scene.add(dot)
      return dot
    })
    segments.push({ path, material, dots: marks, u: Math.random(), live })
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const isClosed = (tagName: string) => states.get(tagName) === 'closed'
  let energised = false

  // Generators and their incomer breakers.
  const genMats = new Map<string, THREE.MeshStandardMaterial>()
  units.forEach((u, i) => {
    const x = unitX[i]!
    const n = u.code.split('-G')[1]
    const m = mat(color.ink)
    genMats.set(u.id, m)
    const drum = add(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 24), m, x, 0.62, ROW.gen)
    drum.rotation.z = Math.PI / 2
    pickable.set(drum, `gen:${u.id}`)
    add(new THREE.BoxGeometry(1.1, 0.16, 0.9), mat(color.silver), x, 0.08, ROW.gen)
    tag(`G${n}`, x, 1.25, ROW.gen, true)
    breaker(`52-G${n}`, x, ROW.genBreaker)
    conductor([v(x, 0.62, ROW.gen - 0.45), v(x, 0.62, ROW.genBreaker + 0.3)], `gen:${u.id}`, () =>
      isClosed(`52-G${n}`),
    )
    conductor([v(x, 1.2, ROW.genBreaker - 0.3), v(x, BUS_H, ROW.bus11)], `breaker:52-G${n}`, () =>
      isClosed(`52-G${n}`),
    )
  })

  // 11 kV bus in two sections with the coupler between them.
  const busBar = (from: number, to: number, z: number, key: SldKey, label: string) => {
    const bar = add(
      new THREE.BoxGeometry(Math.abs(to - from), 0.12, 0.12),
      mat(color.ink),
      (from + to) / 2,
      BUS_H,
      z,
    )
    pickable.set(bar, key)
    tag(label, from + 0.2, BUS_H + 0.3, z)
    for (const px of [from, to])
      add(new THREE.CylinderGeometry(0.04, 0.04, BUS_H, 8), mat(color.silver), px, BUS_H / 2, z)
  }
  busBar(-width / 2 - 0.4, couplerX - 0.35, ROW.bus11, 'bus:11a', '11 kV bus A')
  busBar(couplerX + 0.35, width / 2 + 0.4, ROW.bus11, 'bus:11b', '11 kV bus B')
  breaker('52-BC', couplerX, ROW.bus11, 0.5)

  // Transformer branches: LV breaker, transformer with radiators, HV breaker.
  const trafoMats: THREE.MeshStandardMaterial[] = []
  trafoX.forEach((x, i) => {
    breaker(`52-T${i + 1}`, x, ROW.trafoLv)
    const m = mat(color.ink)
    trafoMats.push(m)
    const body = add(new THREE.BoxGeometry(1.1, 1.3, 0.9), m, x, 0.65, ROW.trafo)
    pickable.set(body, `trafo:${i}`)
    for (const dx of [-0.65, 0.65]) {
      const fin = add(new THREE.BoxGeometry(0.12, 1, 0.8), mat(color.silver), x + dx, 0.6, ROW.trafo)
      pickable.set(fin, `trafo:${i}`)
    }
    for (const dx of [-0.3, 0, 0.3])
      add(new THREE.CylinderGeometry(0.04, 0.06, 0.45, 10), mat(color.chart), x + dx, 1.5, ROW.trafo)
    tag(`T${i + 1} · 11/33 kV`, x, 2, ROW.trafo, true)
    breaker(`52-T${i + 1}H`, x, ROW.trafoHv, 0.5)
    const lv = () => energised && isClosed(`52-T${i + 1}`)
    conductor([v(x, BUS_H, ROW.bus11), v(x, 1.2, ROW.trafoLv + 0.3)], `breaker:52-T${i + 1}`, lv)
    conductor([v(x, 1.2, ROW.trafoLv - 0.3), v(x, 1.2, ROW.trafo + 0.45)], `trafo:${i}`, lv)
    conductor([v(x, 1.2, ROW.trafo - 0.45), v(x, 1.2, ROW.trafoHv + 0.25)], `trafo:${i}`, lv)
    conductor([v(x, 1.2, ROW.trafoHv - 0.25), v(x, BUS_H, ROW.bus33)], `breaker:52-T${i + 1}H`, lv)
  })

  // 33 kV bus, feeder breakers and the lines leaving for the grid.
  busBar((-width / 2) * 0.8, (width / 2) * 0.8, ROW.bus33, 'bus:33', '33 kV bus')
  feederX.forEach((x, i) => {
    breaker(`52-F${i + 1}`, x, ROW.feeder, 0.5)
    const live = () => energised
    conductor([v(x, BUS_H, ROW.bus33), v(x, 1.2, ROW.feeder + 0.25)], `breaker:52-F${i + 1}`, live)
    conductor(
      [v(x, 1.2, ROW.feeder - 0.25), v(x, 2.4, ROW.line), v(x, 2.4, ROW.line - 3)],
      `line:${i}`,
      live,
      0.03,
      5,
    )
    for (const dx of [-0.5, 0.5])
      add(new THREE.BoxGeometry(0.08, 2.6, 0.08), mat(color.silver), x + dx, 1.3, ROW.line)
    add(new THREE.BoxGeometry(1.1, 0.08, 0.08), mat(color.silver), x, 2.6, ROW.line)
    tag(`To grid ${i + 1}`, x, 2.95, ROW.line - 1.5, true)
  })

  stage.onFrame((_time, dt) => {
    for (const s of segments) {
      const on = s.live()
      for (const d of s.dots) d.visible = on && !stage.reduceMotion
      if (!on || stage.reduceMotion) continue
      s.u = (s.u + dt * 0.0005) % 1
      s.dots.forEach((d, i) => d.position.copy(s.path.getPointAt((s.u + i / s.dots.length) % 1)))
    }
  })

  return {
    update(model: SingleLineModel) {
      energised = model.live
      for (const b of model.breakers) states.set(b.tag, b.state)
      // The coupler and the 33 kV transformer breakers stay closed in this model.
      states.set('52-BC', 'closed')
      for (const b of model.trafoBreakers) states.set(`${b.tag}H`, 'closed')
      for (const [tagName, material] of breakers) material.color.copy(fill[states.get(tagName) ?? 'closed'])
      for (const b of model.unitBreakers)
        genMats
          .get(b.unitId!)!
          .color.copy(
            b.state === 'closed' ? color.ink : b.state === 'tripped' ? color.accentStrong : color.silver,
          )
      for (const m of trafoMats) m.color.copy(model.live ? color.ink : color.silver)
      for (const s of segments) s.material.color.copy(s.live() ? color.ink : color.silver)
    },
    select: stage.select,
    reset: stage.reset,
    top: stage.top,
    dispose: stage.dispose,
  }
}
export type SldScene = ReturnType<typeof createSldScene>

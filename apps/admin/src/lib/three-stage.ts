import { cn } from '@gpi/ui'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// Shared plumbing for the 3D views: renderer and label overlay, orbit controls, lights, resizing, the
// render loop, click-versus-drag picking with hover and selection highlights, and disposal.

/** Theme colours, read from the tokens so every scene follows the palette. */
export function tokens() {
  const css = getComputedStyle(document.documentElement)
  const c = (name: string) => new THREE.Color(css.getPropertyValue(`--color-${name}`).trim() || '#888888')
  return {
    ink: c('ink'),
    accent: c('accent'),
    accentStrong: c('accent-strong'),
    warning: c('warning'),
    success: c('success'),
    info: c('info'),
    surface: c('surface'),
    surface2: c('surface-2'),
    card: c('card'),
    border: c('border'),
    silver: c('silver'),
    chart: c('chart-muted'),
    muted: c('muted'),
  }
}
export type Palette = ReturnType<typeof tokens>

/** Narrow frames drop secondary labels so they do not pile up. */
export const WIDE_ONLY = 'hidden @[560px]:inline-block'

export function cssLabel(text: string, strong = false, extra = '') {
  const el = document.createElement('div')
  el.className = cn(
    'pointer-events-none whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-card',
    strong ? 'bg-ink text-on-ink' : 'bg-card/90 text-foreground',
    extra,
  )
  el.textContent = text
  return el
}

export interface StageOptions<K extends string> {
  /** Default camera position for a 16:9 frame; narrower frames pull back. */
  home: THREE.Vector3
  top: THREE.Vector3
  target?: THREE.Vector3
  minDistance: number
  maxDistance: number
  maxPolarAngle?: number
  /** Half-size of the area the sun's shadow covers. */
  shadowExtent: number
  onSelect: (key: K | null) => void
  /** Extra highlight for a pickable mesh, for example a pulse on a tripped unit. Time stays 0 under reduced motion. */
  emphasis?: (key: K, time: number) => number
}

/**
 * A three.js stage in `host`. Scenes add meshes through `add` and register selectable ones in `pickable`;
 * the stage handles hover, selection highlight, the camera fly-to and cleanup.
 */
export function createStage<K extends string>(host: HTMLElement, options: StageOptions<K>) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  const color = tokens()
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
  const centre = options.target ?? new THREE.Vector3()
  const homeFor = (aspect: number) =>
    options.home
      .clone()
      .sub(centre)
      .multiplyScalar(Math.max(1.12, 1.95 / aspect))
      .add(centre)

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  host.appendChild(renderer.domElement)
  const overlay = new CSS2DRenderer()
  Object.assign(overlay.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  host.appendChild(overlay.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = options.minDistance
  controls.maxDistance = options.maxDistance
  controls.maxPolarAngle = options.maxPolarAngle ?? 1.35
  controls.target.copy(centre)

  scene.add(new THREE.HemisphereLight(0xffffff, color.surface, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(-8, 16, 10).add(centre)
  sun.target.position.copy(centre)
  scene.add(sun.target)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  const e = options.shadowExtent
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e })
  scene.add(sun)

  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item)
    return item
  }
  const mat = (c: THREE.Color, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...extra }))
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    shadow = true,
  ) => {
    track(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }
  const tag = (text: string, x: number, y: number, z: number, strong = false, extra = '') => {
    const el = cssLabel(text, strong, extra)
    const obj = new CSS2DObject(el)
    obj.position.set(x, y, z)
    scene.add(obj)
    return { el, obj }
  }

  const pickable = new Map<THREE.Mesh, K>()
  let selected: K | null = null
  let hovered: K | null = null
  let flyTo: THREE.Vector3 | null = null

  const ray = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downAt = { x: 0, y: 0 }
  const pick = (ev: PointerEvent): K | null => {
    const box = renderer.domElement.getBoundingClientRect()
    pointer.set(((ev.clientX - box.left) / box.width) * 2 - 1, -((ev.clientY - box.top) / box.height) * 2 + 1)
    ray.setFromCamera(pointer, camera)
    const hit = ray.intersectObjects([...pickable.keys()], false)[0]?.object as THREE.Mesh | undefined
    return hit ? pickable.get(hit)! : null
  }
  const canvas = renderer.domElement
  const onMove = (ev: PointerEvent) => {
    hovered = pick(ev)
    canvas.style.cursor = hovered ? 'pointer' : 'grab'
  }
  const onDown = (ev: PointerEvent) => (downAt = { x: ev.clientX, y: ev.clientY })
  // A drag orbits; only a still click selects.
  const onUp = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) <= 5) options.onSelect(pick(ev))
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointerup', onUp)
  Object.assign(canvas.style, { cursor: 'grab', touchAction: 'none' })

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host
    if (!w || !h) return
    const first = camera.aspect === 1
    renderer.setSize(w, h)
    overlay.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    if (first) camera.position.copy(homeFor(camera.aspect))
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  const fly = (to: THREE.Vector3, target = centre) => {
    flyTo = null
    camera.position.copy(to)
    controls.target.copy(target)
    controls.update()
  }

  const frameHandlers: ((time: number, dt: number) => void)[] = []
  let frame = 0
  let last = 0
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick)
    const dt = last ? Math.min(100, time - last) : 16
    last = time
    // Ease the orbit centre to the selection; reduced motion jumps there.
    if (flyTo) {
      controls.target.lerp(flyTo, reduceMotion ? 1 : 0.08)
      if (controls.target.distanceTo(flyTo) < 0.005) flyTo = null
    }
    controls.update()
    for (const [mesh, key] of pickable) {
      const m = mesh.material as THREE.MeshStandardMaterial
      if (!m.emissive) continue
      m.emissive.copy(color.accent)
      m.emissiveIntensity =
        key === selected
          ? 0.45
          : key === hovered
            ? 0.22
            : (options.emphasis?.(key, reduceMotion ? 0 : time) ?? 0)
    }
    for (const handler of frameHandlers) handler(time, dt)
    renderer.render(scene, camera)
    overlay.render(scene, camera)
  }
  frame = requestAnimationFrame(tick)

  return {
    scene,
    camera,
    color,
    reduceMotion,
    track,
    mat,
    add,
    tag,
    pickable,
    onFrame: (handler: (time: number, dt: number) => void) => frameHandlers.push(handler),
    select(key: K | null) {
      selected = key
      const mesh = [...pickable].find(([, k]) => k === key)?.[0]
      flyTo = mesh ? mesh.getWorldPosition(new THREE.Vector3()).setY(centre.y) : null
    },
    /** Put the camera at an eye point looking at a target, as a seated person would. */
    look: (from: THREE.Vector3, at: THREE.Vector3) => fly(from, at),
    reset: () => fly(homeFor(camera.aspect)),
    top: () => fly(options.top),
    dispose() {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      for (const d of disposables) d.dispose()
      renderer.dispose()
      host.replaceChildren()
    },
  }
}
export type Stage<K extends string> = ReturnType<typeof createStage<K>>

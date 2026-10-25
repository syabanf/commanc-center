import {
  DOOR_SWING_M,
  FURNITURE,
  type Furniture,
  ROOM,
  VIDEO_WALL,
  seatZone,
  videoWallSize,
} from '@gpi/fixtures'
import * as THREE from 'three'
import { type Palette, createStage } from '../../lib/three-stage'

// Three.js model of the Khobar Command Center room, built from the room data in @gpi/fixtures.
// Every object is selectable; the video wall and the desk monitors draw live console content.

export const WALL_TILES = ['fleet', 'plants', 'alarms', 'events', 'fuel', 'links'] as const
export type WallTile = (typeof WALL_TILES)[number]

export type RoomKey =
  | `panel:${number}`
  | `desk:${string}`
  | `monitor:${string}:${number}`
  | `chair:${string}`
  | 'rack'
  | 'door'
  | 'ac'
  | 'lights'
  | 'floor'
  | `wall:${'front' | 'left' | 'right' | 'back'}`

/** What the screens show, refreshed with each live sample. */
export interface WallData {
  clock: string
  fleetMw: number
  capacityMw: number
  plants: {
    code: string
    name: string
    mw: number
    capacityMw: number
    fresh: boolean
    link: string
    latencyMs: number | null
    tank: number
  }[]
  critical: number
  open: number
  latestAlarm: string | null
  events: { time: string; tag: string; message: string }[]
}

/** The monitor at `index` on an operator desk shows this tile. */
export const MONITOR_TILES: WallTile[] = ['alarms', 'plants']

/** Room metres to world: centred on the floor, video wall at negative z. */
const wx = (x: number) => x - ROOM.widthM / 2
const wz = (z: number) => z - ROOM.lengthM / 2
const CENTRE = new THREE.Vector3(0, 1.1, 0)

const hex = (c: THREE.Color) => `#${c.getHexString()}`

function drawTile(ctx: CanvasRenderingContext2D, tile: WallTile, data: WallData, color: Palette) {
  const { width: W, height: H } = ctx.canvas
  const ink = hex(color.ink)
  const accent = hex(color.accent)
  const info = hex(color.info)
  ctx.fillStyle = ink
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = `600 ${H * 0.07}px DM Sans, system-ui, sans-serif`
  const titles: Record<WallTile, string> = {
    fleet: 'FLEET OUTPUT',
    plants: 'PLANTS',
    alarms: 'ALARMS',
    events: 'EVENT LIST',
    fuel: 'HFO DAY TANKS',
    links: 'STARLINK LINKS',
  }
  ctx.fillText(titles[tile], W * 0.05, H * 0.12)
  ctx.textAlign = 'right'
  ctx.fillText(data.clock, W * 0.95, H * 0.12)
  ctx.textAlign = 'left'
  const row = (i: number) => H * (0.27 + i * 0.145)
  const small = `500 ${H * 0.062}px DM Sans, system-ui, sans-serif`

  if (tile === 'fleet') {
    ctx.fillStyle = '#fff'
    ctx.font = `800 ${H * 0.34}px DM Sans, system-ui, sans-serif`
    ctx.fillText(data.fleetMw.toFixed(1), W * 0.05, H * 0.56)
    ctx.font = `600 ${H * 0.08}px DM Sans, system-ui, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText(`MW of ${data.capacityMw} MW planned`, W * 0.05, H * 0.7)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fillRect(W * 0.05, H * 0.8, W * 0.9, H * 0.05)
    ctx.fillStyle = '#fff'
    ctx.fillRect(W * 0.05, H * 0.8, W * 0.9 * Math.min(1, data.fleetMw / data.capacityMw), H * 0.05)
    return
  }
  ctx.font = small
  if (tile === 'plants' || tile === 'links' || tile === 'fuel') {
    data.plants.forEach((p, i) => {
      const y = row(i)
      ctx.fillStyle = tile === 'links' ? (p.link === 'online' ? info : accent) : p.fresh ? info : accent
      ctx.beginPath()
      ctx.arc(W * 0.07, y - H * 0.022, H * 0.022, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(p.name, W * 0.12, y)
      ctx.textAlign = 'right'
      const right =
        tile === 'plants'
          ? `${p.mw.toFixed(1)} / ${p.capacityMw} MW`
          : tile === 'links'
            ? p.latencyMs === null
              ? 'down'
              : `${p.latencyMs} ms`
            : `${Math.round(p.tank * 100)}%`
      ctx.fillText(right, W * 0.95, y)
      ctx.textAlign = 'left'
      if (tile === 'fuel') {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillRect(W * 0.5, y - H * 0.04, W * 0.28, H * 0.03)
        ctx.fillStyle = p.tank < 0.25 ? accent : info
        ctx.fillRect(W * 0.5, y - H * 0.04, W * 0.28 * p.tank, H * 0.03)
      }
    })
    return
  }
  if (tile === 'alarms') {
    ctx.fillStyle = data.critical ? accent : '#fff'
    ctx.font = `800 ${H * 0.28}px DM Sans, system-ui, sans-serif`
    ctx.fillText(String(data.critical), W * 0.05, H * 0.5)
    ctx.fillStyle = '#fff'
    ctx.fillText(String(data.open), W * 0.5, H * 0.5)
    ctx.font = small
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    ctx.fillText('critical', W * 0.05, H * 0.62)
    ctx.fillText('open', W * 0.5, H * 0.62)
    if (data.latestAlarm) {
      ctx.fillStyle = '#fff'
      ctx.fillText(data.latestAlarm.slice(0, 44), W * 0.05, H * 0.82)
    }
    return
  }
  data.events.slice(0, 5).forEach((e, i) => {
    const y = row(i)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText(e.time, W * 0.05, y)
    ctx.fillStyle = '#fff'
    ctx.fillText(`${e.tag}  ${e.message}`.slice(0, 40), W * 0.3, y)
  })
}

export function createRoomScene(host: HTMLElement, onSelect: (key: RoomKey | null) => void) {
  const { widthM: W, lengthM: L, heightM: H } = ROOM
  const stage = createStage<RoomKey>(host, {
    home: new THREE.Vector3(3.1, 4.3, 5.2),
    top: new THREE.Vector3(0, 11, 0.01),
    target: CENTRE,
    minDistance: 0.6,
    maxDistance: 16,
    maxPolarAngle: 1.5,
    shadowExtent: 4,
    onSelect,
  })
  const { scene, color, add, mat, tag, track, pickable } = stage
  const pick = <T extends THREE.Mesh>(mesh: T, key: RoomKey) => {
    pickable.set(mesh, key)
    return mesh
  }

  // Floor and walls. Walls face inwards, so from outside the near walls drop away and the room opens up.
  const floor = add(new THREE.PlaneGeometry(W, L), mat(color.surface2), 0, 0, 0, false)
  floor.rotation.x = -Math.PI / 2
  pick(floor, 'floor')
  const wall = (
    key: 'front' | 'left' | 'right' | 'back',
    width: number,
    x: number,
    z: number,
    rotY: number,
  ) => {
    const mesh = add(
      new THREE.PlaneGeometry(width, H),
      mat(color.card, { side: THREE.FrontSide }),
      x,
      H / 2,
      z,
      false,
    )
    mesh.rotation.y = rotY
    pick(mesh, `wall:${key}`)
  }
  wall('front', W, 0, -L / 2, 0)
  wall('back', W, 0, L / 2, Math.PI)
  wall('left', L, -W / 2, 0, Math.PI / 2)
  wall('right', L, W / 2, 0, -Math.PI / 2)
  const edges = new THREE.LineSegments(
    track(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L))),
    track(new THREE.LineBasicMaterial({ color: color.silver })),
  )
  edges.position.y = H / 2
  scene.add(edges)

  // Video wall: six panels in one bezel, each drawn from a live canvas.
  const size = videoWallSize()
  const wallY = VIDEO_WALL.bottomM + size.h / 2
  add(new THREE.BoxGeometry(size.w + 0.06, size.h + 0.06, 0.08), mat(color.ink), 0, wallY, -L / 2 + 0.05)
  const screens: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; tile: WallTile }[] = []
  const screen = (tile: WallTile, w: number, h: number, px: number) => {
    const canvas = Object.assign(document.createElement('canvas'), {
      width: px,
      height: Math.round((px * h) / w),
    })
    const texture = track(new THREE.CanvasTexture(canvas))
    texture.colorSpace = THREE.SRGBColorSpace
    screens.push({ ctx: canvas.getContext('2d')!, texture, tile })
    return track(new THREE.MeshBasicMaterial({ map: texture }))
  }
  const outline = new THREE.LineSegments(
    track(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1))),
    track(new THREE.LineBasicMaterial({ color: color.accent })),
  )
  outline.visible = false
  scene.add(outline)
  WALL_TILES.forEach((tile, i) => {
    const col = i % VIDEO_WALL.cols
    const r = Math.floor(i / VIDEO_WALL.cols)
    const x = -size.w / 2 + VIDEO_WALL.panelW * (col + 0.5)
    const y = VIDEO_WALL.bottomM + size.h - VIDEO_WALL.panelH * (r + 0.5)
    const panel = add(
      new THREE.PlaneGeometry(VIDEO_WALL.panelW - 0.012, VIDEO_WALL.panelH - 0.012),
      screen(tile, VIDEO_WALL.panelW, VIDEO_WALL.panelH, 512),
      x,
      y,
      -L / 2 + 0.095,
      false,
    )
    pick(panel, `panel:${i}`)
  })

  // Desks, monitors and chairs.
  const deskMeshes = (f: Furniture) => {
    const { x, z, w, d, h } = f.box
    const cx = wx(x + w / 2)
    const cz = wz(z + d / 2)
    pick(add(new THREE.BoxGeometry(w, 0.04, d), mat(color.card), cx, h, cz), `desk:${f.id}`)
    const legMat = mat(color.silver)
    for (const [lx, lz] of [
      [x + 0.05, z + 0.05],
      [x + w - 0.05, z + 0.05],
      [x + 0.05, z + d - 0.05],
      [x + w - 0.05, z + d - 0.05],
    ])
      add(new THREE.BoxGeometry(0.04, h - 0.02, 0.04), legMat, wx(lx!), (h - 0.02) / 2, wz(lz!))
    // Monitors sit at the screen-side edge and face the seat.
    const left = f.facing === 'left'
    const count = f.monitors ?? 0
    for (let i = 0; i < count; i++) {
      const mw = 0.56
      const offset = (i - (count - 1) / 2) * (mw + 0.04)
      const mx = left ? wx(x + 0.18) : cx + offset
      const mz = left ? cz + offset : wz(z + 0.18)
      const tile =
        f.kind === 'engineering' ? (i ? 'links' : 'events') : MONITOR_TILES[i % MONITOR_TILES.length]!
      const monitor = add(
        new THREE.PlaneGeometry(mw, 0.32),
        screen(tile, mw, 0.32, 256),
        mx,
        h + 0.32,
        mz,
        false,
      )
      monitor.rotation.y = left ? Math.PI / 2 : 0
      add(
        new THREE.BoxGeometry(left ? 0.03 : mw + 0.02, 0.34, left ? mw + 0.02 : 0.03),
        mat(color.ink),
        mx - (left ? 0.02 : 0),
        h + 0.32,
        mz - (left ? 0 : 0.02),
      )
      add(
        new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
        mat(color.silver),
        mx - (left ? 0.04 : 0),
        h + 0.09,
        mz - (left ? 0 : 0.04),
      )
      pick(monitor, `monitor:${f.id}:${i}`)
    }
    // Chair in the seat zone.
    const s = seatZone(f)
    const sx = wx((s.x0 + s.x1) / 2)
    const sz = wz((s.z0 + s.z1) / 2)
    const chairMat = mat(color.ink)
    const seat = pick(add(new THREE.BoxGeometry(0.5, 0.08, 0.5), chairMat, sx, 0.47, sz), `chair:${f.id}`)
    const back = add(
      new THREE.BoxGeometry(left ? 0.06 : 0.5, 0.55, left ? 0.5 : 0.06),
      chairMat,
      sx + (left ? 0.24 : 0),
      0.8,
      sz + (left ? 0 : 0.24),
    )
    pickable.set(back, `chair:${f.id}`)
    add(
      new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8),
      mat(color.silver),
      seat.position.x,
      0.23,
      seat.position.z,
    )
  }
  for (const f of FURNITURE.filter((f) => f.monitors)) deskMeshes(f)

  // Rack with blinking status LEDs.
  const rack = FURNITURE.find((f) => f.kind === 'rack')!
  const rx = wx(rack.box.x + rack.box.w / 2)
  const rz = wz(rack.box.z + rack.box.d / 2)
  pick(
    add(new THREE.BoxGeometry(rack.box.w, rack.box.h, rack.box.d), mat(color.ink), rx, rack.box.h / 2, rz),
    'rack',
  )
  const ledMat = track(new THREE.MeshBasicMaterial({ color: color.success }))
  const leds = Array.from({ length: 12 }, (_, i) => {
    const led = add(
      new THREE.SphereGeometry(0.012, 6, 4),
      ledMat,
      rx - rack.box.w / 2 - 0.005,
      0.5 + i * 0.12,
      rz + ((i % 3) - 1) * 0.15,
      false,
    )
    return { led, phase: i * 0.7 }
  })

  // Door in the back wall with its swing drawn on the floor.
  const door = FURNITURE.find((f) => f.kind === 'door')!
  const dx = wx(door.box.x + door.box.w / 2)
  // One-sided like the walls, so it disappears with the back wall when seen from outside.
  const leaf = add(
    new THREE.PlaneGeometry(door.box.w, door.box.h),
    mat(color.silver),
    dx,
    door.box.h / 2,
    L / 2 - 0.01,
    false,
  )
  leaf.rotation.y = Math.PI
  pick(leaf, 'door')
  const arc = add(
    new THREE.RingGeometry(DOOR_SWING_M - 0.01, DOOR_SWING_M, 32, 1, Math.PI / 2, Math.PI / 2),
    track(new THREE.MeshBasicMaterial({ color: color.muted, side: THREE.DoubleSide })),
    wx(door.box.x + door.box.w),
    0.005,
    L / 2,
    false,
  )
  arc.rotation.x = -Math.PI / 2

  // Split air-conditioner high on the right wall, and two ceiling light panels.
  pick(add(new THREE.BoxGeometry(0.22, 0.3, 0.9), mat(color.card), W / 2 - 0.12, 2.55, wz(2.6)), 'ac')
  const lightMat = mat(color.card, { emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.3 })
  for (const z of [1.4, 3.6])
    pick(add(new THREE.BoxGeometry(0.6, 0.03, 0.6), lightMat, 0, H - 0.02, wz(z), false), 'lights')

  // Dimension lines along the floor edges and up one corner.
  const dimMat = track(new THREE.LineBasicMaterial({ color: color.ink }))
  const dim = (a: THREE.Vector3, b: THREE.Vector3, text: string) => {
    const line = new THREE.Line(track(new THREE.BufferGeometry().setFromPoints([a, b])), dimMat)
    scene.add(line)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    tag(text, mid.x, mid.y, mid.z, true)
  }
  dim(
    new THREE.Vector3(-W / 2 - 0.25, 0.02, -L / 2),
    new THREE.Vector3(-W / 2 - 0.25, 0.02, L / 2),
    `P ${L.toFixed(1)} m`,
  )
  dim(
    new THREE.Vector3(-W / 2, 0.02, L / 2 + 0.25),
    new THREE.Vector3(W / 2, 0.02, L / 2 + 0.25),
    `L ${W.toFixed(1)} m`,
  )
  dim(
    new THREE.Vector3(W / 2 + 0.2, 0, L / 2 + 0.2),
    new THREE.Vector3(W / 2 + 0.2, H, L / 2 + 0.2),
    `T ${H.toFixed(1)} m`,
  )

  stage.onFrame((time) => {
    if (stage.reduceMotion) return
    for (const { led, phase } of leds) led.visible = Math.sin(time / 180 + phase * 3) > -0.6
  })

  const seatEye = (deskId: string) => {
    const f = FURNITURE.find((x) => x.id === deskId)!
    const s = seatZone(f)
    return new THREE.Vector3(
      wx((s.x0 + s.x1) / 2),
      1.2,
      wz(f.facing === 'left' ? (s.z0 + s.z1) / 2 : s.z0 + 0.4),
    )
  }
  const wallCentre = new THREE.Vector3(0, wallY, -L / 2)

  return {
    updateScreens(data: WallData) {
      for (const s of screens) {
        drawTile(s.ctx, s.tile, data, color)
        s.texture.needsUpdate = true
      }
    },
    select(key: RoomKey | null) {
      stage.select(key)
      const mesh = [...pickable].find(([, k]) => k === key)?.[0]
      // Screens are unlit, so a frame marks the selected one.
      outline.visible = !!mesh && !!key && (key.startsWith('panel:') || key.startsWith('monitor:'))
      if (outline.visible && mesh) {
        const g = mesh.geometry as THREE.PlaneGeometry
        outline.position.copy(mesh.position)
        outline.rotation.copy(mesh.rotation)
        outline.scale.set(g.parameters.width + 0.02, g.parameters.height + 0.02, 1)
        outline.translateZ(0.002)
      }
    },
    overview: stage.reset,
    plan: stage.top,
    seat: (deskId: string) => {
      const eye = seatEye(deskId)
      // The engineering desk faces the left wall; operators face the video wall.
      stage.look(eye, deskId === 'eng' ? new THREE.Vector3(-W / 2, 1.1, eye.z) : wallCentre)
    },
    dispose: stage.dispose,
  }
}
export type RoomScene = ReturnType<typeof createRoomScene>

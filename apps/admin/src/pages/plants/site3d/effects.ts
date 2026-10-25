import * as THREE from 'three'

// Animated details for the 3D site: exhaust smoke, radiator fans, trip shockwaves, the alarm beacon and
// Starlink signal rings. Each factory adds its objects to the scene, registers what it allocates in
// `track`, and exposes `tick(time, dt)` for the render loop. Times are in milliseconds.

type Track = <T extends { dispose: () => void }>(item: T) => T

/** Soft round sprite texture shared by smoke and data packets. */
export function puffTexture(track: Track) {
  const size = 64
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size })
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return track(new THREE.CanvasTexture(canvas))
}

const PUFFS = 9
const PUFF_LIFE = 3200

/**
 * Exhaust plume above one stack. Density and height follow the unit's load; a trip sends one dark puff
 * and the plume dies away.
 */
export function createSmoke(
  scene: THREE.Scene,
  top: THREE.Vector3,
  texture: THREE.Texture,
  track: Track,
  tint: THREE.Color,
) {
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const material = track(
      new THREE.SpriteMaterial({
        map: texture,
        color: tint.clone(),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    )
    const sprite = new THREE.Sprite(material)
    scene.add(sprite)
    return { sprite, material, phase: i / PUFFS, drift: (Math.random() - 0.5) * 0.4 }
  })
  let load = 0
  let shown = 0
  let darkUntil = 0
  const dark = new THREE.Color(0.18, 0.18, 0.2)
  return {
    setLoad: (next: number) => (load = next),
    puff: (now: number) => (darkUntil = now + 1600),
    tick(time: number, dt: number) {
      // Ease towards the target so a stopping engine fades instead of cutting out.
      shown += (load - shown) * Math.min(1, dt / 900)
      const isDark = time < darkUntil
      for (const p of puffs) {
        const life = (((time / PUFF_LIFE + p.phase) % 1) + 1) % 1
        const strength = isDark ? 0.9 : shown
        p.sprite.visible = strength > 0.02
        if (!p.sprite.visible) continue
        p.sprite.position.set(
          top.x + p.drift * life,
          top.y + life * (0.6 + strength * 1.4),
          top.z - life * 0.25,
        )
        p.sprite.scale.setScalar(0.18 + life * (0.5 + strength * 0.5))
        p.material.opacity = (1 - life) * (isDark ? 0.8 : 0.42 * strength)
        p.material.color.copy(isDark ? dark : tint)
      }
    },
  }
}

/** Radiator fan on a genset roof; spins with load and coasts down when the engine stops. */
export function createFan(
  scene: THREE.Scene,
  at: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  track: Track,
) {
  const group = new THREE.Group()
  group.position.copy(at)
  const hub = new THREE.Mesh(
    track(new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, 0.05, 12)),
    material,
  )
  group.add(hub)
  const blade = track(new THREE.BoxGeometry(radius * 1.9, 0.02, radius * 0.28))
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(blade, material)
    b.rotation.y = (i * Math.PI) / 3
    group.add(b)
  }
  scene.add(group)
  let target = 0
  let speed = 0
  return {
    setLoad: (load: number) => (target = load),
    tick(_time: number, dt: number) {
      speed += (target - speed) * Math.min(1, dt / 1500)
      group.rotation.y += speed * dt * 0.012
    },
  }
}

/** Flat expanding rings: a trip shockwave at a genset, or a soft pulse when a breaker closes. */
export function createShockwaves(scene: THREE.Scene, track: Track) {
  const geometry = track(new THREE.RingGeometry(0.85, 1, 48))
  const live: {
    mesh: THREE.Mesh
    material: THREE.MeshBasicMaterial
    start: number
    size: number
    span: number
  }[] = []
  return {
    burst(at: THREE.Vector3, color: THREE.Color, now: number, size = 2.2, span = 900) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.copy(at)
      scene.add(mesh)
      live.push({ mesh, material, start: now, size, span })
    },
    tick(time: number) {
      for (let i = live.length - 1; i >= 0; i--) {
        const w = live[i]!
        const k = (time - w.start) / w.span
        if (k >= 1) {
          scene.remove(w.mesh)
          w.material.dispose()
          live.splice(i, 1)
          continue
        }
        w.mesh.scale.setScalar(0.3 + k * w.size)
        w.material.opacity = 1 - k
      }
    },
    dispose() {
      for (const w of live) w.material.dispose()
    },
  }
}

/** Rotating red beacon above whatever is in alarm, with a light that washes the ground around it. */
export function createBeacon(scene: THREE.Scene, color: THREE.Color, track: Track) {
  const group = new THREE.Group()
  const lamp = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.12, 16, 12)),
    track(new THREE.MeshBasicMaterial({ color })),
  )
  const cone = new THREE.Mesh(
    track(new THREE.ConeGeometry(0.5, 1.6, 24, 1, true)),
    track(
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  )
  cone.rotation.z = Math.PI / 2
  cone.position.x = 0.8
  const spin = new THREE.Group()
  spin.add(cone)
  const light = new THREE.PointLight(color, 0, 6)
  group.add(lamp, spin, light)
  group.visible = false
  scene.add(group)
  return {
    place(at: THREE.Vector3 | null) {
      group.visible = !!at
      if (at) group.position.copy(at)
    },
    tick(time: number, still: boolean) {
      if (!group.visible) return
      spin.rotation.y = still ? 0 : time / 260
      light.intensity = still ? 2 : 2 + 2 * Math.sin(time / 160)
    },
  }
}

/**
 * Signal rings rising from the Starlink dish while the link is up, data packets streaming up during a
 * back-fill. While the link is down neither runs; the scene blinks the dish instead.
 */
export function createSignal(
  scene: THREE.Scene,
  at: THREE.Vector3,
  color: THREE.Color,
  texture: THREE.Texture,
  track: Track,
) {
  const ringGeo = track(new THREE.TorusGeometry(0.3, 0.015, 6, 40))
  const rings = Array.from({ length: 3 }, (_, i) => {
    const material = track(new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }))
    const mesh = new THREE.Mesh(ringGeo, material)
    mesh.rotation.x = Math.PI / 2
    scene.add(mesh)
    return { mesh, material, phase: i / 3 }
  })
  const packets = Array.from({ length: 12 }, (_, i) => {
    const material = track(
      new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false }),
    )
    const sprite = new THREE.Sprite(material)
    sprite.scale.setScalar(0.16)
    scene.add(sprite)
    return { sprite, material, phase: i / 12, x: (Math.random() - 0.5) * 0.3 }
  })
  let mode: 'up' | 'down' | 'backfill' = 'up'
  return {
    setMode: (next: typeof mode) => (mode = next),
    tick(time: number, still: boolean) {
      for (const r of rings) {
        r.mesh.visible = mode !== 'down' && !still
        if (!r.mesh.visible) continue
        const k = (((time / 2400 + r.phase) % 1) + 1) % 1
        r.mesh.position.set(at.x, at.y + 0.1 + k * 1.4, at.z)
        r.mesh.scale.setScalar(0.6 + k * 1.6)
        r.material.opacity = (1 - k) * 0.6
      }
      for (const p of packets) {
        p.sprite.visible = mode === 'backfill' && !still
        if (!p.sprite.visible) continue
        const k = (((time / 900 + p.phase) % 1) + 1) % 1
        p.sprite.position.set(at.x + p.x, at.y + 0.2 + k * 3, at.z)
        p.material.opacity = 1 - k
      }
    },
  }
}

import { type PlantReading, fmtNumber, fmtPercent, isOpen } from '@gpi/fixtures'
import { type Plant, UNIT_STATE_LABEL } from '@gpi/types'
import { Badge, Button, EmptyState, KeyValue } from '@gpi/ui'
import { Box, Maximize2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '../../../components/links'
import { unitsOf } from '../../../state/live'
import { useStore } from '../../../state/store'
import { BREAKER_LABEL, singleLineModel } from '../single-line-model'
import { type SldKey, type SldScene, createSldScene } from './sld-scene'

/** The single-line diagram as a 3D model; every generator, breaker, bus, transformer and line selects. */
export function SingleLine3D({ plant, reading }: { plant: Plant; reading: PlantReading }) {
  const navigate = useNavigate()
  const mount = useRef<HTMLDivElement>(null)
  const scene = useRef<SldScene | null>(null)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<SldKey | null>(null)
  const units = useMemo(() => unitsOf(plant.id), [plant.id])
  const model = useMemo(() => singleLineModel(units, reading), [units, reading])
  const { alarms } = useStore().state
  const breakerAlarms = alarms.filter(
    (a) => a.plantId === plant.id && isOpen(a) && a.kind === 'breaker_event',
  )

  useEffect(() => {
    if (!mount.current) return
    try {
      scene.current = createSldScene(mount.current, units, setSelected)
    } catch {
      setFailed(true)
      return
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [units])
  useEffect(() => scene.current?.update(model), [model])
  useEffect(() => scene.current?.select(selected), [selected])

  if (failed) {
    return (
      <EmptyState
        icon={<Box />}
        title="3D view needs WebGL"
        description="This browser cannot draw the 3D model. The 2D diagram shows the same circuit."
      />
    )
  }

  const panel = (() => {
    if (!selected) return null
    if (selected.startsWith('gen:')) {
      const unit = units.find((u) => u.id === selected.slice(4))!
      const b = model.unitBreakers.find((x) => x.unitId === unit.id)!
      return {
        kicker: 'Generator',
        title: unit.code,
        items: [
          { label: 'State', value: UNIT_STATE_LABEL[unit.state] },
          { label: 'Output', value: `${fmtNumber(b.kw / 1000, 1)} of ${unit.ratingMw} MW` },
          { label: 'Breaker', value: `${b.tag} ${BREAKER_LABEL[b.state].toLowerCase()}` },
        ],
        action: { label: 'Open unit page', to: paths.unit(plant.id, unit.id) },
      }
    }
    if (selected.startsWith('breaker:')) {
      const tag = selected.slice(8)
      const b = model.breakers.find((x) => x.tag === tag)
      return {
        kicker: 'Breaker',
        title: tag,
        items: b
          ? [
              { label: 'Feeds', value: b.feeds },
              { label: 'State', value: BREAKER_LABEL[b.state] },
              { label: 'Selector', value: b.local ? 'Local' : 'Remote' },
              { label: 'Trip circuit', value: 'Healthy' },
              { label: 'kW / kVAr', value: `${fmtNumber(b.kw)} / ${fmtNumber(b.kvar)}` },
              { label: 'Current', value: `${fmtNumber(b.amps)} A` },
            ]
          : [
              {
                label: 'Feeds',
                value: tag === '52-BC' ? 'Couples 11 kV bus A and B' : 'Transformer 33 kV side',
              },
              { label: 'State', value: 'Closed' },
            ],
        action: b?.unitId
          ? { label: 'Open unit page', to: paths.unit(plant.id, b.unitId) }
          : { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
      }
    }
    if (selected.startsWith('trafo:')) {
      const t = model.transformers[Number(selected.slice(6))]!
      return {
        kicker: 'Step-up transformer',
        title: `${t.tag} · 11/33 kV`,
        items: [
          { label: 'Rating', value: `${t.mva} MVA` },
          { label: 'Load', value: fmtPercent(t.load) },
          { label: 'Oil / winding', value: `${fmtNumber(t.oil)} / ${fmtNumber(t.winding)} °C` },
        ],
        action: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
      }
    }
    if (selected.startsWith('line:')) {
      const i = Number(selected.slice(5))
      return {
        kicker: '33 kV feeder',
        title: `Grid line ${i + 1}`,
        items: [
          { label: 'Export', value: `${fmtNumber(model.exportMw / 2, 1)} MW` },
          { label: 'Voltage', value: model.live ? `${fmtNumber(model.kv33, 1)} kV` : 'Dead' },
        ],
        action: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
      }
    }
    const bus = selected === 'bus:33' ? '33 kV bus' : selected === 'bus:11a' ? '11 kV bus A' : '11 kV bus B'
    const section =
      selected === 'bus:11a'
        ? model.unitBreakers.slice(0, model.half)
        : selected === 'bus:11b'
          ? model.unitBreakers.slice(model.half)
          : []
    return {
      kicker: 'Busbar',
      title: bus,
      items: [
        {
          label: 'Voltage',
          value: model.live
            ? `${fmtNumber(selected === 'bus:33' ? model.kv33 : reading.voltageKv, selected === 'bus:33' ? 1 : 2)} kV`
            : 'Dead',
        },
        { label: 'Frequency', value: model.live ? `${fmtNumber(reading.frequencyHz, 2)} Hz` : 'None' },
        selected === 'bus:33'
          ? { label: 'Export', value: `${fmtNumber(model.exportMw, 1)} MW` }
          : {
              label: 'Incomers closed',
              value: `${section.filter((b) => b.state === 'closed').length} of ${section.length}`,
            },
      ],
      action: { label: 'Open electrical tab', to: paths.plant(plant.id, 'electrical') },
    }
  })()

  return (
    <div className="gap-4 xl:grid-cols-[minmax(0,1fr)_340px] grid grid-cols-1">
      <div className="min-w-0 space-y-3">
        <div className="rounded-2xl relative overflow-hidden bg-surface-2">
          <div
            ref={mount}
            role="img"
            aria-label={`3D single-line model of ${plant.name}: ${fmtNumber(model.exportMw, 1)} MW export`}
            className="sm:aspect-[16/9] @container relative aspect-[4/3] w-full"
          />
          <div className="right-3 top-3 gap-2 absolute flex">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Reset view"
              onClick={() => scene.current?.reset()}
            >
              <RotateCcw />
              <span className="sm:inline hidden">Reset view</span>
            </Button>
            <Button size="sm" variant="secondary" aria-label="Top view" onClick={() => scene.current?.top()}>
              <Maximize2 />
              <span className="sm:inline hidden">Top view</span>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted">
          Generators at the front, the grid lines at the back. Ink breakers are closed, white open, orange
          tripped, brown open on local. Particles show power moving through closed paths.
        </p>
      </div>
      <aside className="min-w-0" aria-label="Selected equipment">
        <div className="rounded-2xl p-4 space-y-3 bg-surface-2">
          {panel ? (
            <>
              <div className="gap-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">
                    {panel.kicker}
                  </p>
                  <h3 className="text-lg font-semibold">{panel.title}</h3>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Clear
                </Button>
              </div>
              <KeyValue bare items={panel.items} />
              {selected?.startsWith('breaker:') && breakerAlarms.length > 0 && (
                <Badge variant="danger">
                  {breakerAlarms.length} open breaker {breakerAlarms.length === 1 ? 'alarm' : 'alarms'} at
                  this plant
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate(panel.action.to)}>
                {panel.action.label}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">
              Select a generator, breaker, busbar, transformer or grid line to see its values.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

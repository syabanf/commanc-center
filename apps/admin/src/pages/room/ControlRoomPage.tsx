import { FURNITURE, ROOM, VIDEO_WALL, fmtNumber, heatLoadW, roomChecks, videoWallSize } from '@gpi/fixtures'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  StatCard,
} from '@gpi/ui'
import { Armchair, Box, MonitorPlay, Thermometer } from 'lucide-react'
import { Suspense, lazy } from 'react'

/** Three.js loads only with this page. */
const RoomView = lazy(() => import('./RoomView').then((m) => ({ default: m.RoomView })))

export function ControlRoomPage() {
  const wall = videoWallSize()
  const checks = roomChecks()
  const workstations = FURNITURE.filter((f) => f.monitors)
  const warnings = checks.filter((c) => c.tone === 'warning').length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Control room design"
        description="The GPI Command Center room in Al Khobar, with the video wall and workstations the SCADA specification asks for."
      />
      <div className="gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4 grid grid-cols-1">
        <StatCard
          label="Room size"
          value={`${ROOM.lengthM.toFixed(1)} × ${ROOM.widthM.toFixed(1)} × ${ROOM.heightM.toFixed(1)}`}
          unit="m"
          hint={`${fmtNumber(ROOM.lengthM * ROOM.widthM, 1)} m² floor, ${fmtNumber(ROOM.lengthM * ROOM.widthM * ROOM.heightM)} m³`}
          icon={<Box />}
        />
        <StatCard
          label="Workstations"
          value={workstations.length}
          hint="Two operators, one engineering and administration"
          icon={<Armchair />}
          tone="info"
        />
        <StatCard
          label="Video wall"
          value={`${wall.w.toFixed(2)} × ${wall.h.toFixed(2)}`}
          unit="m"
          hint={`${VIDEO_WALL.cols * VIDEO_WALL.rows} × ${VIDEO_WALL.diagonalIn}-inch panels`}
          icon={<MonitorPlay />}
        />
        <StatCard
          label="Cooling load"
          value={fmtNumber(heatLoadW() / 1000, 1)}
          unit="kW"
          hint="Planning figure"
          icon={<Thermometer />}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Room model</CardTitle>
          <CardDescription>
            Room size from GPI. Furniture positions are a proposal for review; the screens show live console
            data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={
              <div className="sm:aspect-[16/10] animate-pulse rounded-2xl aspect-[4/3] bg-surface-2" />
            }
          >
            <RoomView />
          </Suspense>
        </CardContent>
      </Card>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="gap-2 flex items-center">
              Layout checks {warnings > 0 && <Badge variant="warning">{warnings} to review</Badge>}
            </CardTitle>
            <CardDescription>
              Against common control-room planning guidance (ISO 11064). A design aid, not a compliance
              assessment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li
                  key={c.id}
                  className="gap-3 rounded-2xl p-3 flex items-start justify-between bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-semibold block">{c.label}</span>
                    <span className="text-xs block text-muted">{c.note}</span>
                    <span className="mt-1 block text-[11px] text-muted">Target: {c.target}</span>
                  </span>
                  <Badge variant={c.tone === 'ok' ? 'success' : 'warning'} className="shrink-0">
                    {c.value}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Equipment</CardTitle>
            <CardDescription>What the room holds, from section 6 of the SCADA specification.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="gap-2 rounded-2xl p-3 flex justify-between bg-surface-2">
                <span>
                  <span className="font-semibold block">Video wall</span>
                  <span className="text-xs text-muted">
                    {VIDEO_WALL.cols} × {VIDEO_WALL.rows} panels, bottom edge at {VIDEO_WALL.bottomM} m
                  </span>
                </span>
                <span className="tabular-nums">
                  {wall.w.toFixed(2)} × {wall.h.toFixed(2)} m
                </span>
              </li>
              {FURNITURE.map((f) => (
                <li key={f.id} className="gap-2 rounded-2xl p-3 flex justify-between bg-surface-2">
                  <span>
                    <span className="font-semibold block">{f.label}</span>
                    <span className="text-xs text-muted">
                      {f.monitors
                        ? `${f.monitors} monitors, faces the ${f.facing === 'left' ? 'left wall' : 'video wall'}`
                        : 'Fixed'}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {f.box.w.toFixed(2)} × {f.box.d.toFixed(2)} m
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

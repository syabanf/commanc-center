import { PLANTS, fmtNumber, fmtPercent, fmtShortDate, isOpen } from '@gpi/fixtures'
import type { PlantReading } from '@gpi/fixtures'
import {
  BarList,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  LineChart,
  PageHeader,
  ProgressBar,
  StatCard,
} from '@gpi/ui'
import { Droplets, Fuel, Gauge, TriangleAlert } from 'lucide-react'
import { useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { SFC_BASELINE, dailyFleet, energyTotals, supplyHours } from '../../state/derive'
import { plantById, useLive } from '../../state/live'
import { useStore } from '../../state/store'

export function FuelPage() {
  const { now, fleet, readings } = useLive()
  const { alarms } = useStore().state
  const navigate = useNavigate()
  const burning = readings.filter((r) => r.fuelNetLph > 0)
  const withTank = readings.filter((r) => r.tankLevel > 0)
  const low = withTank.filter((r) => r.tankLevel < 0.25)
  const week = energyTotals(7, now)
  const imbalance = new Set(
    alarms.filter((a) => a.kind === 'fuel_imbalance' && isOpen(a)).map((a) => a.plantId),
  )

  const daily = dailyFleet(30, now).map((d) => ({ label: fmtShortDate(d.date), value: d.fuelM3 }))

  const columns: Column<PlantReading>[] = [
    {
      id: 'plant',
      header: 'Plant',
      sortValue: (r) => plantById.get(r.plantId)!.name,
      cell: (r) => <span className="font-semibold">{plantById.get(r.plantId)!.name}</span>,
    },
    {
      id: 'supply',
      header: 'Supply',
      align: 'right',
      sortValue: (r) => r.fuelSupplyLph,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.fuelSupplyLph)} L/h</span>,
    },
    {
      id: 'return',
      header: 'Return',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.fuelReturnLph,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.fuelReturnLph)} L/h</span>,
    },
    {
      id: 'net',
      header: 'Net',
      align: 'right',
      sortValue: (r) => r.fuelNetLph,
      cell: (r) => <span className="font-semibold tabular-nums">{fmtNumber(r.fuelNetLph)} L/h</span>,
    },
    {
      id: 'balance',
      header: 'Balance check',
      hideBelow: 'md',
      sortValue: (r) => (imbalance.has(r.plantId) ? 1 : 0),
      cell: (r) =>
        imbalance.has(r.plantId) ? (
          <span className="font-semibold text-accent-strong">Above generation baseline</span>
        ) : (
          <span className="text-muted">Within baseline</span>
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fuel"
        description="Track HFO use, specific fuel consumption and tank stock at each plant, and spot fuel that generation does not explain."
      />
      <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
        <StatCard
          label="Net HFO now"
          value={fmtNumber(fleet.fuelNetLph / 1000, 1)}
          unit="m³/h"
          hint="Supply minus return, all plants"
          icon={<Fuel />}
          tone="ink"
        />
        <StatCard
          label="Fleet specific fuel"
          value={fleet.sfc === null ? 'None' : fmtNumber(fleet.sfc)}
          unit="g/kWh"
          hint={`Baseline ${SFC_BASELINE} g/kWh`}
          icon={<Gauge />}
        />
        <StatCard
          label="HFO used, 7 days"
          value={fmtNumber(week.fuelM3)}
          unit="m³"
          hint={week.sfc === null ? undefined : `${fmtNumber(week.sfc)} g/kWh average`}
          icon={<Droplets />}
          tone="info"
        />
        <StatCard
          label="Tanks below 25%"
          value={low.length}
          hint={
            low.length
              ? low.map((r) => plantById.get(r.plantId)!.name).join(', ')
              : 'All tanks above the alarm level'
          }
          icon={<TriangleAlert />}
          tone={low.length ? 'danger' : 'success'}
        />
      </div>

      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Tank inventory</CardTitle>
            <CardDescription>
              HFO day tank level and hours of supply at the current burn rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {withTank.map((r) => {
              const plant = plantById.get(r.plantId)!
              const stockM3 = r.tankLevel * plant.tankCapacityM3
              const hours = supplyHours(r, plant)
              const isLow = r.tankLevel < 0.25
              return (
                <button
                  key={r.plantId}
                  type="button"
                  onClick={() => navigate(paths.plant(plant.id, 'fuel'))}
                  className="rounded-2xl p-3 block w-full bg-surface-2 text-left transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
                >
                  <span className="gap-2 text-sm flex items-center justify-between">
                    <span className="font-semibold">{plant.name}</span>
                    <span
                      className={
                        isLow ? 'font-bold text-accent-strong tabular-nums' : 'font-bold tabular-nums'
                      }
                    >
                      {fmtPercent(r.tankLevel)}
                    </span>
                  </span>
                  <ProgressBar
                    className="mt-2"
                    value={r.tankLevel}
                    tone={isLow ? 'accent' : 'ink'}
                    aria-label={`${plant.name} tank level`}
                  />
                  <span className="mt-1 block text-[11px] text-muted">
                    {fmtNumber(stockM3)} of {fmtNumber(plant.tankCapacityM3)} m³ ·{' '}
                    {hours === null ? 'no burn' : `about ${fmtNumber(hours)} h of supply`}
                  </span>
                </button>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Specific fuel consumption</CardTitle>
            <CardDescription>
              Live g/kWh. Plants above the {SFC_BASELINE} g/kWh baseline are in accent. Compare with engine
              type and load in mind.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              ariaLabel="Specific fuel consumption by plant"
              max={260}
              items={burning.map((r) => ({
                key: r.plantId,
                label: plantById.get(r.plantId)!.name,
                value: r.sfc ?? 0,
                display: `${fmtNumber(r.sfc ?? 0)} g/kWh`,
                hint: `${fmtNumber(r.mw, 1)} MW on load`,
                emphasis: (r.sfc ?? 0) > SFC_BASELINE,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fuel balance</CardTitle>
          <CardDescription>
            Supply and return flow from the UNUM/Technoton meters. Net use is checked against generation every
            4 h.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={burning}
            getRowKey={(r) => r.plantId}
            onRowClick={(r) => navigate(paths.plant(r.plantId, 'fuel'))}
            pageSize={0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>HFO burned per day</CardTitle>
          <CardDescription>
            Fleet total in m³ over the last 30 days. {PLANTS.length - 1} plants report; Aden has no units yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineChart
            data={daily}
            area
            height={220}
            format={(v) => `${fmtNumber(v)} m³`}
            ariaLabel="Fleet HFO burned per day, last 30 days"
          />
        </CardContent>
      </Card>
    </div>
  )
}

import { BILLING, PLANTS, fmtDate, fmtMonth, fmtNumber, fmtPercent, fmtUsd, isOpen } from '@gpi/fixtures'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  ColumnChart,
  DataTable,
  PageHeader,
  SegmentedControl,
} from '@gpi/ui'
import { Download, Printer } from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { useSearchParam } from '../../lib/use-search-param'
import { downloadCsv } from '../../lib/csv'
import { commissionedMw, energyTotals } from '../../state/derive'
import { useLive } from '../../state/live'
import { useStore } from '../../state/store'

const PERIODS = ['daily', 'weekly', 'monthly'] as const
type Period = (typeof PERIODS)[number]
const DAYS: Record<Period, number> = { daily: 1, weekly: 7, monthly: 30 }
const PERIOD_LABEL: Record<Period, string> = {
  daily: 'Yesterday',
  weekly: 'Last 7 days',
  monthly: 'Last 30 days',
}

export function ReportsPage() {
  const { can } = useAuth()
  const { now, fleet } = useLive()
  const { alarms } = useStore().state
  const [period, setPeriod] = useSearchParam<Period>('period', 'weekly', PERIODS)
  const days = DAYS[period]
  const totals = energyTotals(days, now)
  const reporting = PLANTS.filter((p) => energyTotals(days, now, p.id).mwh > 0)
  const rows = reporting.map((p) => ({ plant: p, ...energyTotals(days, now, p.id) }))
  const exportCsv = () =>
    downloadCsv(
      `gpi-report-${period}-${fmtDate(now).replace(/ /g, '-')}.csv`,
      ['Plant', 'Energy (MWh)', 'HFO (m3)', 'Availability', 'SFC (g/kWh)'],
      rows.map((r) => [
        r.plant.name,
        Math.round(r.mwh),
        Math.round(r.fuelM3),
        r.availability === null ? '' : r.availability.toFixed(3),
        r.sfc === null ? '' : Math.round(r.sfc),
      ]),
    )
  type Row = (typeof rows)[number]
  const bestSfc = Math.min(...rows.map((r) => r.sfc ?? Infinity))
  const openHigh = alarms.filter(
    (a) => isOpen(a) && (a.priority === 'critical' || a.priority === 'high'),
  ).length
  const billed = BILLING.reduce((s, b) => s + b.billedUsd, 0)
  const collected = BILLING.reduce((s, b) => s + b.collectedUsd, 0)

  const columns: Column<Row>[] = [
    {
      id: 'plant',
      header: 'Plant',
      sortValue: (r) => r.plant.name,
      cell: (r) => <span className="font-semibold">{r.plant.name}</span>,
    },
    {
      id: 'mwh',
      header: 'Energy',
      align: 'right',
      sortValue: (r) => r.mwh,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.mwh)} MWh</span>,
    },
    {
      id: 'cf',
      header: 'Capacity factor',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.mwh / (commissionedMw(r.plant.id) * 24 * days),
      cell: (r) => (
        <span className="tabular-nums">{fmtPercent(r.mwh / (commissionedMw(r.plant.id) * 24 * days))}</span>
      ),
    },
    {
      id: 'avail',
      header: 'Availability',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.availability ?? 0,
      cell: (r) => (
        <span className="tabular-nums">
          {r.availability === null ? 'None' : fmtPercent(r.availability, 1)}
        </span>
      ),
    },
    {
      id: 'fuel',
      header: 'HFO',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.fuelM3,
      cell: (r) => <span className="tabular-nums">{fmtNumber(r.fuelM3)} m³</span>,
    },
    {
      id: 'sfc',
      header: 'Specific fuel',
      align: 'right',
      sortValue: (r) => r.sfc ?? 0,
      cell: (r) => (
        <span className={r.sfc === bestSfc ? 'font-semibold text-success tabular-nums' : 'tabular-nums'}>
          {r.sfc === null ? 'None' : `${fmtNumber(r.sfc)} g/kWh`}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description="Compare plants over a period, read the executive summary and print it for management."
        actions={
          <>
            <SegmentedControl
              aria-label="Report period"
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={PERIODS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
            />
            {can('report.export') && (
              <>
                <Button variant="outline" onClick={exportCsv} className="print:hidden">
                  <Download />
                  Export CSV
                </Button>
                <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                  <Printer />
                  Print report
                </Button>
              </>
            )}
          </>
        }
      />
      <p className="text-xs hidden text-muted print:block">
        GPI Command Center · {PERIOD_LABEL[period]} · printed {fmtDate(now)}
      </p>

      <Card variant="ink" className="p-5">
        <p className="font-semibold tracking-wider text-[11px] text-on-ink-muted uppercase">
          Executive summary · {PERIOD_LABEL[period]}
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li>
            The fleet generated <strong>{fmtNumber(totals.mwh)} MWh</strong> from {reporting.length} reporting
            plants, burning {fmtNumber(totals.fuelM3)} m³ of HFO
            {totals.sfc !== null && <> at {fmtNumber(totals.sfc)} g/kWh</>}.
          </li>
          <li>
            Average unit availability was{' '}
            {totals.availability === null ? 'not measured' : fmtPercent(totals.availability, 1)}. The 90%
            unit-operation objective is a planning target, not a guarantee.
          </li>
          <li>
            Right now {fmtNumber(fleet.mw, 1)} MW is on load of {fleet.capacityMw} MW planned, with {openHigh}{' '}
            critical or high alarms open.
          </li>
          <li>
            Collections over five months reached {fmtPercent(collected / billed)} of billing, leaving{' '}
            {fmtUsd(billed - collected)} outstanding.
          </li>
        </ul>
        <div className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm">
          <span className="font-semibold">Data gaps:</span> {fleet.late + fleet.stale} sites report late or
          not at all. Aden has no generation yet. Plant phases wait for a signed site status report. Figures
          in this demo are invented.
        </div>
      </Card>

      <div className="gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Plant comparison</CardTitle>
            <CardDescription>
              The lowest specific fuel is in green. Compare with engine type, load and fuel quality in mind.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(r) => r.plant.id}
              pageSize={0}
              initialSort={{ id: 'mwh', desc: true }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Energy by plant</CardTitle>
            <CardDescription>
              MWh, {PERIOD_LABEL[period].toLowerCase()}. The largest producer is in accent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              data={rows.map((r) => ({
                label: r.plant.code,
                value: r.mwh,
                highlight: r.mwh === Math.max(...rows.map((x) => x.mwh)),
              }))}
              tone="muted"
              height={220}
              format={(v) => `${fmtNumber(v)} MWh`}
              ariaLabel="Energy by plant for the selected period"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Government billing and collections</CardTitle>
          <CardDescription>
            Monthly, in USD. Currency and billing basis wait for GPI finance to confirm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-sm w-full min-w-[480px]">
              <thead>
                <tr className="text-xs font-semibold tracking-wide border-b border-border text-left text-muted uppercase">
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3 text-right">Billed</th>
                  <th className="py-2 pr-3 text-right">Collected</th>
                  <th className="py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {BILLING.map((b) => (
                  <tr key={b.month} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">{fmtMonth(b.month)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUsd(b.billedUsd)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{fmtUsd(b.collectedUsd)}</td>
                    <td
                      className={
                        b.collectedUsd / b.billedUsd < 0.75
                          ? 'py-2.5 font-semibold text-right text-accent-strong tabular-nums'
                          : 'py-2.5 text-right tabular-nums'
                      }
                    >
                      {fmtPercent(b.collectedUsd / b.billedUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

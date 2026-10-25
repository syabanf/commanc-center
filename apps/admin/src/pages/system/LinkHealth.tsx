import {
  PLANTS,
  SCADA_EVENTS,
  bufferedSamples,
  fmtNumber,
  fmtTime,
  linkLatency,
  linkTrend,
} from '@gpi/fixtures'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, KeyValue, LineChart } from '@gpi/ui'
import { LinkBadge } from '../../components/badges'
import { useLive } from '../../state/live'

/** Starlink link health per plant (spec 6.1): latency, link losses, store-and-forward buffer. */
export function LinkHealth() {
  const { now } = useLive()
  return (
    <div className="space-y-4">
      <div className="gap-4 lg:grid-cols-2 2xl:grid-cols-3 grid grid-cols-1">
        {PLANTS.map((plant) => {
          const latency = linkLatency(plant, now)
          const losses = SCADA_EVENTS.filter((e) => e.plantId === plant.id && e.kind === 'link_lost').length
          const buffered = bufferedSamples(plant, now)
          return (
            <Card key={plant.id}>
              <CardHeader action={<LinkBadge link={plant.link} />}>
                <CardTitle>{plant.name}</CardTitle>
                <CardDescription>
                  {latency === null ? 'No round trip' : `${fmtNumber(latency)} ms round trip now`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <LineChart
                  data={linkTrend(plant, now).map((p) => ({ label: fmtTime(p.at), value: p.ms }))}
                  height={130}
                  tone={plant.link === 'online' ? 'ink' : 'accent'}
                  format={(v) => `${fmtNumber(v)} ms`}
                  ariaLabel={`${plant.name} Starlink latency over the last 24 hours`}
                />
                <KeyValue
                  bare
                  items={[
                    { label: 'Link losses, 24 h', value: losses },
                    {
                      label: 'Site buffer',
                      value: buffered
                        ? `${fmtNumber(buffered)} samples waiting for back-fill`
                        : 'Empty, central historian up to date',
                    },
                  ]}
                />
              </CardContent>
            </Card>
          )
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>How the link is designed</CardTitle>
          <CardDescription>
            From section 6.1 of the SCADA specification. GPI supplies the terminals and service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeyValue
            bare
            labelWidth="lg"
            items={[
              {
                label: 'Security',
                value: 'Encrypted site-to-site VPN, terminating on the plant OT firewall',
              },
              {
                label: 'Outages',
                value: 'Store-and-forward at each plant, automatic back-fill of the central historian',
              },
              {
                label: 'Bandwidth',
                value: 'Report by exception with deadbands; suppliers state average and peak per plant',
              },
              {
                label: 'Time stamps',
                value: 'Applied at the plant, so delayed data keeps its original time',
              },
              { label: 'Monitoring', value: 'Latency and link-loss alarms for every plant' },
              {
                label: 'Secondary link',
                value: '4G/LTE or VSAT with automatic failover, priced as an option',
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}

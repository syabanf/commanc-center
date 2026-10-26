import {
  ALARM_RULES,
  DATA_SOURCES,
  ESCALATION_RULES,
  LATE_MS,
  PLANTS,
  SAMPLE_MS,
  SPEC,
  STALE_MS,
  fmtDate,
  fmtAgo,
  fmtNumber,
} from '@gpi/fixtures'
import {
  ALARM_KIND_LABEL,
  ESCALATION_LABEL,
  SOURCE_KIND_LABEL,
  type AlarmRule,
  type Plant,
  type SourceKind,
} from '@gpi/types'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type Column,
  DataTable,
  KeyValue,
  PageHeader,
  PillTabs,
  StatCard,
} from '@gpi/ui'
import { Cable, CircleDashed, RadioTower, Unplug } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { FreshnessBadge, LinkBadge, PriorityBadge, SourceStateBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useSearchParam } from '../../lib/use-search-param'
import { useLive } from '../../state/live'
import { LinkDesign, LinkHealth } from './LinkHealth'
import { TagCapacity } from './TagCapacity'

const TABS = ['sources', 'link', 'tags', 'alarms', 'escalation', 'platform'] as const
type Tab = (typeof TABS)[number]
const KINDS = Object.keys(SOURCE_KIND_LABEL) as SourceKind[]

export function DataHealthPage() {
  return <SystemPage mode="health" />
}

export function SystemPage({ mode = 'design' }: { mode?: 'health' | 'design' }) {
  const [tab, setTab] = useSearchParam<Tab>('tab', mode === 'health' ? 'sources' : 'tags', TABS)
  if (mode === 'design' && (tab === 'sources' || tab === 'link')) {
    return <Navigate to={paths.dataHealth(tab)} replace />
  }
  if (mode === 'health' && tab !== 'sources' && tab !== 'link') {
    return <Navigate to={paths.system(tab)} replace />
  }
  const activeTab =
    mode === 'health'
      ? tab === 'link'
        ? 'link'
        : 'sources'
      : tab === 'sources' || tab === 'link'
        ? 'tags'
        : tab
  const count = (state: string) => DATA_SOURCES.filter((s) => s.state === state).length

  return (
    <div className="space-y-4">
      <PageHeader
        title={mode === 'health' ? 'Data health' : 'System design'}
        description={
          mode === 'health'
            ? 'Check sample freshness, site interfaces and Starlink links before acting on plant readings.'
            : 'Review tag capacity, alarm rules, escalation and platform assumptions from the SCADA specification.'
        }
        actions={
          <PillTabs
            value={activeTab}
            onValueChange={(v) => setTab(v as Tab)}
            items={
              mode === 'health'
                ? [
                    { value: 'sources', label: 'Site interfaces' },
                    { value: 'link', label: 'Starlink links' },
                  ]
                : [
                    { value: 'tags', label: 'Tag capacity' },
                    { value: 'alarms', label: 'Alarm register', count: ALARM_RULES.length },
                    { value: 'escalation', label: 'Escalation' },
                    { value: 'platform', label: 'Platform' },
                  ]
            }
          />
        }
      />
      {activeTab === 'sources' && (
        <>
          <div className="gap-3 sm:gap-4 xl:grid-cols-4 grid grid-cols-2">
            <StatCard
              label="Connected"
              value={count('connected')}
              hint={`of ${DATA_SOURCES.length} interfaces`}
              icon={<Cable />}
              tone="success"
            />
            <StatCard
              label="Degraded"
              value={count('degraded')}
              hint="Late or partial data"
              icon={<RadioTower />}
              tone="warning"
            />
            <StatCard
              label="Offline"
              value={count('offline')}
              hint="No data arriving"
              icon={<Unplug />}
              tone="danger"
            />
            <StatCard
              label="Pending survey"
              value={count('pending_survey')}
              hint="Interface not verified yet"
              icon={<CircleDashed />}
            />
          </div>
          <SourcesMatrix />
        </>
      )}
      {activeTab === 'link' && <LinkHealth />}
      {activeTab === 'tags' && <TagCapacity />}
      {activeTab === 'alarms' && <AlarmRegister />}
      {activeTab === 'escalation' && <Escalation />}
      {activeTab === 'platform' && (
        <>
          <Platform />
          <LinkDesign />
        </>
      )}
    </div>
  )
}

function SourcesMatrix() {
  const { now, byPlant } = useLive()
  const navigate = useNavigate()
  const columns: Column<Plant>[] = [
    {
      id: 'plant',
      header: 'Plant',
      sortValue: (p) => p.name,
      cell: (p) => {
        const r = byPlant.get(p.id)!
        return (
          <span>
            <span className="font-semibold block">{p.name}</span>
            <span className="mt-1 gap-1.5 flex flex-wrap items-center">
              <LinkBadge link={p.link} />
              <FreshnessBadge freshness={r.freshness} />
            </span>
            <span className="mt-1 text-xs block text-muted">
              {p.link === 'offline' ? 'No round trip' : `${fmtNumber(p.latencyMs)} ms`} · sample{' '}
              {fmtAgo(r.sampledAt, now)}
            </span>
          </span>
        )
      },
    },
    ...KINDS.map<Column<Plant>>((kind, i) => ({
      id: kind,
      header: SOURCE_KIND_LABEL[kind],
      hideBelow: i < 2 ? undefined : i < 4 ? 'md' : 'lg',
      cell: (p) => {
        const source = DATA_SOURCES.find((s) => s.plantId === p.id && s.kind === kind)
        return source ? <SourceStateBadge state={source.state} /> : <span className="text-muted">None</span>
      },
    })),
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interfaces per plant</CardTitle>
        <CardDescription>
          Protocols are planned values. The interface survey confirms read access, licences and tag lists for
          each site.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={PLANTS}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate(paths.plant(p.id, 'sources'))}
          pageSize={0}
        />
      </CardContent>
    </Card>
  )
}

function AlarmRegister() {
  const columns: Column<AlarmRule>[] = [
    {
      id: 'kind',
      header: 'Event',
      sortValue: (r) => ALARM_KIND_LABEL[r.kind],
      cell: (r) => <span className="font-semibold">{ALARM_KIND_LABEL[r.kind]}</span>,
    },
    {
      id: 'condition',
      header: 'Condition',
      hideBelow: 'sm',
      cell: (r) => <span className="text-body/80">{r.condition}</span>,
    },
    {
      id: 'delay',
      header: 'Delay',
      align: 'right',
      hideBelow: 'md',
      sortValue: (r) => r.delaySec,
      cell: (r) => <span className="tabular-nums">{r.delaySec ? `${r.delaySec} s` : 'None'}</span>,
    },
    {
      id: 'priority',
      header: 'Priority',
      sortValue: (r) => r.priority,
      cell: (r) => <PriorityBadge priority={r.priority} />,
    },
    {
      id: 'approved',
      header: 'Approval',
      cell: (r) => (
        <Badge variant={r.approved ? 'success' : 'muted'}>{r.approved ? 'Approved' : 'Draft'}</Badge>
      ),
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alarm register</CardTitle>
        <CardDescription>
          Draft rules from the discovery answers. OEM and protection setpoints replace these values, and O&M
          with the owner's engineer approve thresholds, delays and priorities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} rows={ALARM_RULES} getRowKey={(r) => r.id} pageSize={0} />
      </CardContent>
    </Card>
  )
}

function Escalation() {
  return (
    <div className="gap-4 lg:grid-cols-3 grid grid-cols-1">
      {ESCALATION_RULES.map((r) => (
        <Card key={r.level} className="p-5">
          <p className="font-semibold tracking-wider text-[11px] text-muted uppercase">Level {r.level}</p>
          <p className="mt-1 text-lg font-semibold">{ESCALATION_LABEL[r.level]}</p>
          <p className="mt-4 gap-1 flex items-start">
            <span className="font-extrabold text-[28px] leading-none tracking-[-0.5px] tabular-nums">
              {r.responseMin}
            </span>
            <span className="pt-1 text-sm font-semibold text-muted">min to respond</span>
          </p>
          <KeyValue
            bare
            className="mt-4"
            items={[
              { label: 'Owner', value: r.owner },
              { label: 'Channels', value: r.channels },
            ]}
          />
        </Card>
      ))}
      <p className="text-xs lg:col-span-3 text-muted">
        An alarm without an owner climbs one level when its response time passes. Assigning an owner stops the
        timer. Low-priority alarms never escalate. Names and times wait for GPI agreement.
      </p>
    </div>
  )
}

function Platform() {
  const sections: { title: string; description: string; items: { label: string; value: string }[] }[] = [
    {
      title: 'Data and history',
      description: 'Sections 4.3 and 6. Values on screen refresh from the central repository.',
      items: [
        {
          label: 'Operating values',
          value: `Every ${SAMPLE_MS / 1000} s on this console, report by exception from site`,
        },
        {
          label: 'Late and stale',
          value: `Late after ${LATE_MS / 1000} s, stale after ${STALE_MS / 1000} s`,
        },
        {
          label: 'Historian',
          value: `Retains ${SPEC.historianYears} years of values, alarms, trips and running hours`,
        },
        {
          label: 'Link loss',
          value: 'Central screens keep the last values; plants keep running on their own',
        },
        { label: 'Reports', value: 'Daily, weekly, monthly and annual, exported to PDF, Excel and CSV' },
      ],
    },
    {
      title: 'Time synchronisation',
      description: 'Section 5. One reference for every plant and the Command Center.',
      items: [
        { label: 'Reference', value: 'UTC everywhere, local time on screens and reports' },
        {
          label: 'Protection and controllers',
          value: `PTP (IEEE 1588) or IRIG-B, ${SPEC.soeResolutionMs} ms SOE accuracy`,
        },
        { label: 'Servers and network', value: 'NTP from the GPS master clock at each plant' },
      ],
    },
    {
      title: 'Protocols',
      description: 'Section 7. Suppliers verify what each existing device supports.',
      items: [
        { label: 'Switchgear and relays', value: 'IEC 61850, IEC 60870-5-104' },
        { label: 'Controllers and PLCs', value: 'Modbus TCP and RTU, OPC UA, EtherNet/IP or Profinet' },
        { label: 'Generator controllers', value: 'DSE 8610 or equivalent, vendor protocols where needed' },
        { label: 'Network equipment', value: 'SNMP' },
      ],
    },
    {
      title: 'Availability and redundancy',
      description: 'Section 9. Designed for 24/7 operation.',
      items: [
        { label: 'Servers', value: 'Redundant pair per plant with automatic failover' },
        { label: 'Power', value: 'Redundant supplies and UPS for servers, switches and gateways' },
        {
          label: 'Independence',
          value: 'A SCADA failure never trips a unit; protection and shutdown stay local',
        },
        { label: 'Recovery', value: 'Local storage during outages, automatic sync when the link returns' },
      ],
    },
    {
      title: 'Cybersecurity',
      description: 'Section 11. Compliance with IEC 62443 or equivalent.',
      items: [
        { label: 'Networks', value: 'IT and OT separated, VLANs per plant system, OT DMZ where needed' },
        { label: 'Access', value: 'Individual accounts, role-based access, password policy, audit logs' },
        {
          label: 'Field devices',
          value: 'No direct internet connection to PLCs, relays or generator controllers',
        },
        { label: 'Vendors', value: 'Secure remote-access procedure, controlled software updates' },
      ],
    },
    {
      title: 'Remote control',
      description: 'Section 10. Priced as an option; this console stays read-only in phase 1.',
      items: [
        { label: 'Safeguards', value: 'Local/remote selection, select-before-operate, command confirmation' },
        { label: 'Checks', value: 'Interlock and permissive verification, blocked while the link is down' },
        { label: 'Record', value: 'Operator, time, command and equipment response for every action' },
      ],
    },
  ]
  return (
    <div className="space-y-4">
      <div className="gap-4 lg:grid-cols-2 grid grid-cols-1">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <KeyValue bare labelWidth="lg" items={section.items} />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">
        Source: GPI {SPEC.title}, {SPEC.revision}, issued {fmtDate(SPEC.issued)} for budgetary quotation.
        Final tag lists, interfaces and control philosophy follow in detailed engineering.
      </p>
    </div>
  )
}

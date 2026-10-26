import { DATA_SOURCES, PLANTS, UNITS } from '@gpi/fixtures'
import { REGION_LABEL, type DataSource, type Plant, type Unit } from '@gpi/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  KeyValue,
  PageHeader,
  Textarea,
  UnderlineTabs,
} from '@gpi/ui'
import { ArrowUpRight, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths } from '../../components/links'
import { usePersistentState } from '../../lib/storage'

const TABS = ['plants', 'units', 'sources'] as const
type Tab = (typeof TABS)[number]
type RecordItem =
  { type: 'plants'; value: Plant } | { type: 'units'; value: Unit } | { type: 'sources'; value: DataSource }

type Correction = {
  id: string
  type: Tab
  recordId: string
  field: string
  current: string
  proposed: string
  reason: string
  submittedAt: string
}

const records: Record<Tab, RecordItem[]> = {
  plants: PLANTS.map((value) => ({ type: 'plants', value })),
  units: UNITS.map((value) => ({ type: 'units', value })),
  sources: DATA_SOURCES.map((value) => ({ type: 'sources', value })),
}

function fields(item: RecordItem): { label: string; value: string }[] {
  if (item.type === 'plants') {
    const p = item.value
    return [
      { label: 'Code', value: p.code },
      { label: 'Name', value: p.name },
      { label: 'Region', value: REGION_LABEL[p.region] },
      { label: 'Planned capacity', value: `${p.capacityMw} MW` },
      { label: 'Contractor', value: p.contractor },
      { label: 'Tank capacity', value: `${p.tankCapacityM3} m³` },
    ]
  }
  if (item.type === 'units') {
    const u = item.value
    return [
      { label: 'Code', value: u.code },
      { label: 'Plant', value: PLANTS.find((p) => p.id === u.plantId)?.name ?? u.plantId },
      { label: 'Rated capacity', value: `${u.ratingMw} MW` },
      { label: 'Engine', value: u.engine },
      { label: 'Controller', value: u.controller },
    ]
  }
  const s = item.value
  return [
    { label: 'Name', value: s.name },
    { label: 'Plant', value: PLANTS.find((p) => p.id === s.plantId)?.name ?? s.plantId },
    { label: 'Type', value: s.kind },
    { label: 'Protocol', value: s.protocol },
    { label: 'Note', value: s.note },
  ]
}

function title(item: RecordItem) {
  return item.type === 'plants' ? item.value.name : item.type === 'units' ? item.value.code : item.value.name
}

function context(item: RecordItem) {
  if (item.type === 'plants') return item.value.code
  return PLANTS.find((p) => p.id === item.value.plantId)?.name ?? item.value.plantId
}

function operationsLink(item: RecordItem) {
  if (item.type === 'plants') return paths.plant(item.value.id)
  if (item.type === 'units') return paths.unit(item.value.plantId, item.value.id)
  return paths.plant(item.value.plantId, 'sources')
}

export function MasterDataPage() {
  const [params, setParams] = useSearchParams()
  const rawTab = params.get('tab')
  const tab: Tab = TABS.find((value) => value === rawTab) ?? 'plants'
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [corrections, setCorrections] = usePersistentState<Correction[]>('gpi.master.corrections.v1', [])
  const list = records[tab]
  const selected = list.find((item) => item.value.id === params.get('record')) ?? list[0]!
  const detailFields = fields(selected)
  const [field, setField] = useState('')
  const [proposed, setProposed] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [requestOpen, setRequestOpen] = useState(false)
  const activeField = detailFields.find((entry) => entry.label === field) ?? detailFields[0]!
  const matching = list.filter((item) =>
    `${title(item)} ${context(item)}`.toLowerCase().includes(query.toLowerCase()),
  )
  const related = corrections.filter(
    (request) => request.type === tab && request.recordId === selected.value.id,
  )

  useEffect(() => {
    const list = listRef.current
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !active) return
    const top = active.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop
    list.scrollTop = Math.max(0, top - (list.clientHeight - active.clientHeight) / 2)
  }, [selected.value.id, tab])

  const select = (nextTab: Tab, recordId?: string) => {
    const next = new URLSearchParams()
    if (nextTab !== 'plants') next.set('tab', nextTab)
    if (recordId) next.set('record', recordId)
    setParams(next)
    setRequestOpen(false)
    setField('')
    setProposed('')
    setReason('')
    setError('')
  }

  const submit = () => {
    if (!proposed.trim() || !reason.trim()) {
      setError('Enter a proposed value and a reason.')
      return
    }
    if (proposed.trim() === activeField.value) {
      setError('The proposed value is the same as the current value.')
      return
    }
    setCorrections((previous) => [
      {
        id: crypto.randomUUID(),
        type: tab,
        recordId: selected.value.id,
        field: activeField.label,
        current: activeField.value,
        proposed: proposed.trim(),
        reason: reason.trim(),
        submittedAt: new Date().toISOString(),
      },
      ...previous,
    ])
    setRequestOpen(false)
    setProposed('')
    setReason('')
    setError('')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master data"
        description="Find the plant, unit and source records used by this demo. Request a correction when a reference value looks wrong."
      />
      <Card className="p-5 text-sm leading-relaxed">
        <strong>Demo registry.</strong> These records come from fixture data. Correction requests are saved
        only in this browser; they do not change operational readings or publish to a central system.
      </Card>
      <Card>
        <UnderlineTabs
          className="px-6 pt-3 lg:px-8"
          value={tab}
          onValueChange={(value) => select(value as Tab)}
          items={[
            { value: 'plants', label: 'Plants', count: PLANTS.length },
            { value: 'units', label: 'Units', count: UNITS.length },
            { value: 'sources', label: 'Data sources', count: DATA_SOURCES.length },
          ]}
        />
        <CardContent className="gap-6 p-6 pt-6 lg:gap-8 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)] lg:p-8 lg:pt-7 grid grid-cols-1">
          <div id="master-list" className="min-w-0 space-y-4 scroll-mt-24">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              leftIcon={<Search />}
              placeholder={`Search ${tab}`}
              aria-label={`Search ${tab}`}
            />
            <div
              ref={listRef}
              className="max-h-60 space-y-1.5 rounded-2xl p-2 sm:max-h-72 lg:max-h-[32rem] overflow-y-auto border border-border"
              aria-label={`${tab} records`}
            >
              {matching.map((item) => (
                <button
                  key={item.value.id}
                  type="button"
                  onClick={() => {
                    select(tab, item.value.id)
                    if (window.matchMedia('(max-width: 1023px)').matches)
                      requestAnimationFrame(() =>
                        document.getElementById('master-detail')?.scrollIntoView({ behavior: 'smooth' }),
                      )
                  }}
                  aria-current={item.value.id === selected.value.id ? 'true' : undefined}
                  className={`rounded-xl px-4 py-3 w-full text-left transition-colors ${item.value.id === selected.value.id ? 'bg-ink text-on-ink' : 'hover:bg-surface-2'}`}
                >
                  <span className="font-semibold text-sm block truncate">{title(item)}</span>
                  <span className="text-xs block truncate opacity-70">{context(item)}</span>
                </button>
              ))}
              {matching.length === 0 && <p className="p-3 text-sm text-muted">No matching records.</p>}
            </div>
          </div>
          <div id="master-detail" className="min-w-0 space-y-6 scroll-mt-24">
            <div className="gap-3 flex flex-wrap items-start justify-between">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {tab.slice(0, -1)} record
                </p>
                <h2 className="mt-1 text-xl font-bold">{title(selected)}</h2>
                <p className="mt-1 text-xs font-mono text-muted">{selected.value.id}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold lg:hidden text-accent-strong underline"
                  onClick={() =>
                    document.getElementById('master-list')?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  Choose another record
                </button>
              </div>
              <Badge variant="muted">Fixture data</Badge>
            </div>
            <KeyValue
              bare
              labelWidth="md"
              className="rounded-2xl px-4 sm:px-5 border border-border"
              items={detailFields}
            />
            <div className="gap-3 flex flex-wrap">
              <Button asChild variant="outline" size="sm">
                <Link to={operationsLink(selected)}>
                  Open operational view <ArrowUpRight />
                </Link>
              </Button>
              <Button size="sm" onClick={() => setRequestOpen((open) => !open)}>
                Request correction
              </Button>
            </div>
            {requestOpen && (
              <form
                className="rounded-2xl p-5 space-y-5 bg-surface-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <h3 className="font-semibold">Correction request</h3>
                <FormField label="Field">
                  <select
                    className="rounded-xl px-3 py-2 text-sm w-full border border-border bg-card"
                    value={activeField.label}
                    onChange={(event) => {
                      setField(event.target.value)
                      setProposed('')
                      setError('')
                    }}
                  >
                    {detailFields.map((entry) => (
                      <option key={entry.label}>{entry.label}</option>
                    ))}
                  </select>
                </FormField>
                <p className="text-xs text-muted">Current value: {activeField.value}</p>
                <FormField label="Proposed value" required>
                  <Input value={proposed} onChange={(event) => setProposed(event.target.value)} />
                </FormField>
                <FormField label="Reason" required>
                  <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
                </FormField>
                {error && (
                  <p role="alert" className="text-sm text-accent-strong">
                    {error}
                  </p>
                )}
                <div className="gap-3 flex flex-wrap">
                  <Button type="submit" size="sm">
                    Save request
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setRequestOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {related.length > 0 && (
              <section className="space-y-3" aria-label="Correction requests">
                <h3 className="font-semibold">Correction requests</h3>
                {related.map((request) => (
                  <div key={request.id} className="rounded-xl p-4 text-sm border border-border">
                    <div className="gap-2 flex flex-wrap items-center justify-between">
                      <strong>{request.field}</strong>
                      <div className="gap-2 flex items-center">
                        <Badge variant="info">Saved locally</Badge>
                        <button
                          type="button"
                          className="text-xs font-semibold text-muted underline hover:text-foreground"
                          onClick={() =>
                            setCorrections((previous) => previous.filter((item) => item.id !== request.id))
                          }
                        >
                          Remove request
                        </button>
                      </div>
                    </div>
                    <p className="mt-1">
                      {request.current} → {request.proposed}
                    </p>
                    <p className="mt-1 text-muted">{request.reason}</p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(request.submittedAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </section>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

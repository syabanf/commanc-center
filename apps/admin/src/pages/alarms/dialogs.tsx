import { PEOPLE, closeBlocker, resolveBlocker } from '@gpi/fixtures'
import { ROLE_LABEL, type Alarm } from '@gpi/types'
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Textarea,
} from '@gpi/ui'
import { useState } from 'react'
import { plantById, useAct } from '../../state/live'

const OWNERS = PEOPLE.filter((p) => p.role === 'om_engineer' || p.role === 'operator')

export function AssignDialog({
  alarm,
  open,
  onOpenChange,
}: {
  alarm: Alarm
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <AssignForm alarm={alarm} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function AssignForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const act = useAct()
  const siteLead = OWNERS.find((p) => p.plantId === alarm.plantId)
  const [personId, setPersonId] = useState<string | null>(siteLead?.id ?? null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const error = personId ? null : 'Choose who owns the response.'

  const submit = () => {
    setSubmitted(true)
    if (error || !personId) return
    const owner = OWNERS.find((p) => p.id === personId)!
    if (
      act(
        { type: 'alarms/assign', id: alarm.id, personId, note },
        { title: `Assigned to ${owner.name}`, description: `${alarm.code} · escalation timer stopped` },
      )
    )
      onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Assign {alarm.code}?</DialogTitle>
        <DialogDescription>
          The owner leads the response at {plantById.get(alarm.plantId)?.name}. Assigning stops the escalation
          timer.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <FormField
          label="Owner"
          required
          error={submitted ? error : undefined}
          hint={siteLead ? `Default: ${siteLead.name}, the site lead` : undefined}
        >
          <Combobox
            items={OWNERS}
            getKey={(p) => p.id}
            getLabel={(p) => p.name}
            getDescription={(p) => `${ROLE_LABEL[p.role]} · ${p.title}`}
            value={personId}
            onChange={setPersonId}
            placeholder="Choose a person"
            invalid={submitted && !!error}
          />
        </FormField>
        <FormField label="Instructions" hint="Optional. Shown in the alarm history.">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What should the owner check first?"
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Assign owner</Button>
      </DialogFooter>
    </form>
  )
}

export type TextAction = 'note' | 'resolve' | 'close'

const COPY: Record<
  TextAction,
  {
    title: (code: string) => string
    description: string
    label: string
    placeholder: string
    submit: string
    toast: string
  }
> = {
  note: {
    title: (code) => `Add a note to ${code}?`,
    description: 'Notes go into the alarm history with your name and the time.',
    label: 'Note',
    placeholder: 'Site crew on the way, ETA 20 min',
    submit: 'Add note',
    toast: 'Note added',
  },
  resolve: {
    title: (code) => `Resolve ${code}?`,
    description: 'Describe what fixed the problem. The Command Center closes the incident after review.',
    label: 'Resolution',
    placeholder: 'Relay reset, unit resynchronised and back on load',
    submit: 'Resolve alarm',
    toast: 'Alarm resolved',
  },
  close: {
    title: (code) => `Close ${code}?`,
    description: 'Closing ends the incident. Record what caused it and what changes to prevent a repeat.',
    label: 'Post-incident summary',
    placeholder: 'Root cause, actions taken, follow-up owner',
    submit: 'Close incident',
    toast: 'Incident closed',
  },
}

export function TextActionDialog({
  alarm,
  action,
  onOpenChange,
}: {
  alarm: Alarm
  action: TextAction | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {action && (
          <TextActionForm key={action} alarm={alarm} action={action} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TextActionForm({ alarm, action, onDone }: { alarm: Alarm; action: TextAction; onDone: () => void }) {
  const act = useAct()
  const copy = COPY[action]
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const required = action !== 'close' || alarm.priority === 'critical' || alarm.priority === 'high'
  const error =
    action === 'resolve'
      ? resolveBlocker(alarm, text)
      : action === 'close'
        ? closeBlocker(alarm, text)
        : text.trim()
          ? null
          : 'Write a note first.'

  const submit = () => {
    setSubmitted(true)
    if (error) return
    const sent =
      action === 'note'
        ? act(
            { type: 'alarms/note', id: alarm.id, note: text },
            { title: copy.toast, description: alarm.code },
          )
        : action === 'resolve'
          ? act(
              { type: 'alarms/resolve', id: alarm.id, resolution: text },
              { title: copy.toast, description: `${alarm.code} · waiting to be closed` },
            )
          : act(
              { type: 'alarms/close', id: alarm.id, postIncident: text },
              { title: copy.toast, description: `${alarm.code} · moved to history` },
            )
    if (sent) onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{copy.title(alarm.code)}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <FormField
        label={copy.label}
        required={required}
        error={submitted ? error : undefined}
        hint={required ? undefined : 'Optional for medium and low alarms.'}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={copy.placeholder}
          invalid={submitted && !!error}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{copy.submit}</Button>
      </DialogFooter>
    </form>
  )
}

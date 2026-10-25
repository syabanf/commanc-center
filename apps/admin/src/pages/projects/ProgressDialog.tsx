import { fmtPercent, progressBlocker } from '@gpi/fixtures'
import type { Plant } from '@gpi/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  PhotoInput,
  Textarea,
} from '@gpi/ui'
import { useState } from 'react'
import { useAct } from '../../state/live'
import { useStore } from '../../state/store'

export function ProgressDialog({
  plant,
  current,
  open,
  onOpenChange,
}: {
  plant: Plant
  current: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {open && <ProgressForm plant={plant} current={current} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** Manual progress entry (Q12) for sites where no automated data exists yet. */
function ProgressForm({ plant, current, onDone }: { plant: Plant; current: number; onDone: () => void }) {
  const { state } = useStore()
  const act = useAct()
  const [percent, setPercent] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const progress = percent.trim() === '' ? NaN : Number(percent) / 100
  const progressError =
    percent.trim() === '' ? 'Enter the progress in percent.' : progressBlocker(state, plant.id, progress)
  const noteError = note.trim() ? null : 'Describe what changed on site.'

  const submit = () => {
    setSubmitted(true)
    if (progressError || noteError) return
    const stamp = Date.now().toString(36)
    const sitePhotos = photos.map((url, i) => ({
      id: `ph-${stamp}-${i}`,
      caption: `${plant.name} site photo ${i + 1}`,
      url,
    }))
    if (
      act(
        { type: 'projects/recordProgress', plantId: plant.id, progress, note, photos: sitePhotos },
        {
          title: `Progress recorded at ${fmtPercent(progress)}`,
          description: `${plant.name} · ${photos.length} photos attached`,
        },
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
        <DialogTitle>Record progress at {plant.name}</DialogTitle>
        <DialogDescription>
          Use this where no automated data exists yet. The update goes into the project history with your
          name.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <FormField
          label="Overall progress"
          required
          error={submitted ? progressError : undefined}
          hint={`Last recorded ${fmtPercent(current)}. Progress cannot go backwards.`}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            placeholder={String(Math.round(current * 100))}
            rightSlot={<span className="pr-3 text-sm font-semibold text-muted">%</span>}
            invalid={submitted && !!progressError}
          />
        </FormField>
        <FormField label="What changed" required error={submitted ? noteError : undefined}>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Unit 3 cold commissioning finished"
            invalid={submitted && !!noteError}
          />
        </FormField>
        <FormField label="Site photos" hint="Optional. Photos stay in this browser for the demo.">
          <PhotoInput
            photos={photos}
            onAdd={(urls) => setPhotos((p) => [...p, ...urls])}
            onRemove={(url) => setPhotos((p) => p.filter((u) => u !== url))}
          />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record progress</Button>
      </DialogFooter>
    </form>
  )
}

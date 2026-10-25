import { Card, EmptyState } from '@gpi/ui'
import { SearchX } from 'lucide-react'
import { BackButton } from './BackButton'

export function NotFoundCard({ title, fallback }: { title: string; fallback: string }) {
  return (
    <Card>
      <h1 className="sr-only">{title}</h1>
      <EmptyState
        icon={<SearchX />}
        title={title}
        description="The link may be out of date."
        action={<BackButton fallback={fallback} />}
      />
    </Card>
  )
}

// frontend/src/components/shared/RAGBadge.tsx
import { cn } from '../../lib/utils'
import type { RAGStatus } from '../../types'

const ragStyles: Record<RAGStatus, string> = {
  NO_DATA: 'bg-gray-100 text-gray-600',
  ON_TRACK: 'bg-green-100 text-green-700',
  AT_RISK: 'bg-yellow-100 text-yellow-700',
  OFF_TRACK: 'bg-red-100 text-red-700',
}

const ragLabels: Record<RAGStatus, string> = {
  NO_DATA: 'No Data',
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  OFF_TRACK: 'Off Track',
}

interface RAGBadgeProps {
  status: RAGStatus
  className?: string
}

export default function RAGBadge({ status, className }: RAGBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        ragStyles[status] || ragStyles.NO_DATA,
        className
      )}
    >
      {ragLabels[status]}
    </span>
  )
}
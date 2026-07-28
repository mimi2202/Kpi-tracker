// frontend/src/components/dashboard/PeriodSelector.tsx
import { cn } from '../../lib/utils'

type PeriodType = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

interface Period {
  id: string
  period_label: string
  status: string
}

interface PeriodSelectorProps {
  periodType: PeriodType
  onPeriodTypeChange: (type: PeriodType) => void
  selectedPeriodId: string | null
  onPeriodChange: (id: string) => void
  periods: Period[]
}

const periodTypes: { value: PeriodType; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
]

export default function PeriodSelector({
  periodType,
  onPeriodTypeChange,
  selectedPeriodId,
  onPeriodChange,
  periods,
}: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="tab-bar">
        {periodTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => onPeriodTypeChange(type.value)}
            className={cn('tab-item', periodType === type.value && 'active')}
          >
            {type.label}
          </button>
        ))}
      </div>

      <select
        value={selectedPeriodId || ''}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {periods.length === 0 && (
          <option value="">No periods available</option>
        )}
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.period_label}
          </option>
        ))}
      </select>
    </div>
  )
}
// frontend/src/components/dashboard/SummaryCards.tsx
import type { DashboardSummary } from '../../api/dashboard'

interface SummaryCardsProps {
  summary: DashboardSummary | null
  previousPeriodLabel: string
}

export default function SummaryCards({ summary, previousPeriodLabel }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Average Achievement',
      value: summary?.average_achievement != null ? `${summary.average_achievement}%` : 'N/A',
      trend: summary?.trend || '—',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'On Track',
      value: summary?.on_track_count ?? '—',
      subtitle: 'KPIs meeting target',
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'At Risk',
      value: summary?.at_risk_count ?? '—',
      subtitle: 'KPIs near threshold',
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Off Track',
      value: summary?.off_track_count ?? '—',
      subtitle: 'KPIs below threshold',
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
      {cards.map((card) => (
        <div key={card.label} className="card stat-card p-6">
          <p className="text-sm text-gray-500 mb-2">{card.label}</p>
          <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          {card.subtitle && (
            <p className="text-xs text-gray-400 mt-1">{card.subtitle}</p>
          )}
          {summary?.previous_average != null && card.label === 'Average Achievement' && (
            <p className="text-xs text-gray-400 mt-1">
              vs {summary.previous_average}% ({previousPeriodLabel})
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
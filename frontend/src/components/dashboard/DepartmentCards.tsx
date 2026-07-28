// frontend/src/components/dashboard/DepartmentCards.tsx
import type { DepartmentScore } from '../../api/dashboard'
import { cn } from '../../lib/utils'

interface DepartmentCardsProps {
  departments: DepartmentScore[]
  selectedDepartmentId: string | null
  onDepartmentClick: (deptId: string) => void
}

export default function DepartmentCards({
  departments,
  selectedDepartmentId,
  onDepartmentClick,
}: DepartmentCardsProps) {
  if (departments.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500">No department data available for this period.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        Department Performance — Click a card to filter
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {departments.map((dept) => {
          const isSelected = selectedDepartmentId === dept.department.id
          const achievement = dept.average_achievement
          const progressWidth = achievement != null ? Math.min(achievement, 100) : 0

          return (
            <button
              key={dept.id}
              onClick={() => onDepartmentClick(dept.department.id)}
              className={cn(
                'card p-5 text-left transition-all cursor-pointer',
                isSelected && 'ring-2 ring-blue-500 shadow-lg scale-[1.02]'
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dept.department.colour || '#3B82F6' }}
                />
                <span className="text-sm font-medium text-gray-900 truncate">
                  {dept.department.name}
                </span>
              </div>

              <div className="text-2xl font-bold text-gray-900 mb-2">
                {achievement != null ? `${achievement}%` : 'N/A'}
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    dept.rag_status === 'ON_TRACK' && 'bg-green-500',
                    dept.rag_status === 'AT_RISK' && 'bg-yellow-500',
                    dept.rag_status === 'OFF_TRACK' && 'bg-red-500',
                    dept.rag_status === 'NO_DATA' && 'bg-gray-300',
                  )}
                  style={{ width: `${progressWidth}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className={cn(
                  'status-pill',
                  dept.rag_status === 'ON_TRACK' && 'on-track',
                  dept.rag_status === 'AT_RISK' && 'at-risk',
                  dept.rag_status === 'OFF_TRACK' && 'off-track',
                  dept.rag_status === 'NO_DATA' && 'no-data',
                )}>
                  {dept.rag_status === 'ON_TRACK' && 'On Track'}
                  {dept.rag_status === 'AT_RISK' && 'At Risk'}
                  {dept.rag_status === 'OFF_TRACK' && 'Off Track'}
                  {dept.rag_status === 'NO_DATA' && 'No Data'}
                </span>
                <span className="text-xs text-gray-400">
                  {dept.total_kpis} KPIs
                </span>
              </div>

              {dept.outstanding_actions > 0 && (
                <div className="mt-2 text-xs text-orange-600">
                  ⚠ {dept.outstanding_actions} outstanding action{dept.outstanding_actions > 1 ? 's' : ''}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
// frontend/src/components/shared/TrendIcon.tsx
import { cn } from '../../lib/utils'
import type { TrendStatus } from '../../types'
import { ArrowUp, ArrowDown, ArrowRight, Minus, HelpCircle } from 'lucide-react'

const trendConfig: Record<TrendStatus, { icon: typeof ArrowUp; color: string }> = {
  IMPROVING: { icon: ArrowUp, color: 'text-green-500' },
  DECLINING: { icon: ArrowDown, color: 'text-red-500' },
  STABLE: { icon: ArrowRight, color: 'text-blue-500' },
  INSUFFICIENT_DATA: { icon: HelpCircle, color: 'text-gray-400' },
  NO_DATA: { icon: Minus, color: 'text-gray-300' },
}

export default function TrendIcon({ status, className }: { status: TrendStatus; className?: string }) {
  const config = trendConfig[status] || trendConfig.NO_DATA
  const Icon = config.icon

  return <Icon className={cn('h-4 w-4', config.color, className)} />
}
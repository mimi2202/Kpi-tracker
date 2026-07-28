// frontend/src/components/dashboard/TrendChart.tsx
import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { TrendDataPoint } from '../../api/dashboard'

interface TrendChartProps {
  trends: TrendDataPoint[]
  periodType: string
}

export default function TrendChart({ trends, periodType }: TrendChartProps) {
  // Group trends by department and reshape data for chart
  const chartData = useMemo(() => {
    if (!trends || trends.length === 0) return []

    // Get unique periods and departments
    const periods = [...new Set(trends.map(t => t.period_label))]
    const departments = [...new Set(trends.map(t => t.department_name))]
    
    // Reshape: each row = one period with all department values
    return periods.map(period => {
      const row: any = { period }
      departments.forEach(dept => {
        const point = trends.find(t => t.period_label === period && t.department_name === dept)
        row[dept] = point?.achievement ?? null
      })
      return row
    })
  }, [trends])

  const departments = useMemo(() => 
    [...new Set(trends.map(t => t.department_name))],
    [trends]
  )

  // Department colours
  const deptColours: Record<string, string> = {}
  trends.forEach(t => {
    if (!deptColours[t.department_name]) {
      deptColours[t.department_name] = t.department_colour || '#3B82F6'
    }
  })

  if (chartData.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          All Departments — Performance Trend
        </h3>
        <div className="h-64 flex items-center justify-center text-gray-400">
          No trend data available
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        All Departments — Performance Trend
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              fontSize: '13px',
            }}
            formatter={(value: number) => [`${value?.toFixed(1)}%`]}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
          />
          <ReferenceLine
            y={85}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          {departments.map((dept) => (
            <Line
              key={dept}
              type="monotone"
              dataKey={dept}
              stroke={deptColours[dept] || '#3B82F6'}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
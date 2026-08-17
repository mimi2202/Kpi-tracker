import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; sublabel?: string }[]
  placeholder: string
  emptyMessage?: string
}

export default function SearchableSelect({ value, onChange, options, placeholder, emptyMessage = 'No matches' }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sublabel || '').toLowerCase().includes(query.toLowerCase())
  )

  const inputStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '9px 12px',
    fontSize: 14,
    outline: 'none',
    marginTop: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ ...inputStyle, borderColor: open ? '#6366f1' : '#d1d5db', boxShadow: open ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none' }}
      >
        <span style={{ color: selected ? '#111827' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
          backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: 260, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f3f4f6' }}>
            <Search size={14} color="#9ca3af" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to filter…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13 }}
            />
          </div>
          <div style={{ overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>{emptyMessage}</div>
            ) : (
              filtered.map(o => (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
                  style={{
                    padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                    backgroundColor: o.value === value ? '#eef2ff' : 'transparent',
                    color: o.value === value ? '#4338ca' : '#111827',
                  }}
                  onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.backgroundColor = '#f9fafb' }}
                  onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div>{o.label}</div>
                  {o.sublabel && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{o.sublabel}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
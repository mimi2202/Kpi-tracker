import { useEffect, useState } from 'react'

const API_BASE = 'http://localhost:8000'

const resolveMediaUrl = (url: string | null) => {
  if (!url) return null
  if (/^(https?:)?\/\//i.test(url)) return url
  if (/^(data|blob):/i.test(url)) return url
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface AvatarProps { src?: string | null; name?: string; size?: number }

export default function Avatar({ src, name = '', size = 36 }: AvatarProps) {
  const resolved = resolveMediaUrl(src || null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [resolved])

  const showImage = Boolean(resolved) && !failed

  return (
    <div className="relative shrink-0 overflow-hidden rounded-full bg-indigo-600 select-none" style={{ width: size, height: size }} title={name || undefined}>
      <span aria-hidden={showImage} className="absolute inset-0 flex items-center justify-center font-semibold leading-none text-white" style={{ fontSize: Math.max(10, size * 0.38) }}>
        {initials(name)}
      </span>
      {showImage && (
        <img src={resolved!} alt={name || 'Avatar'} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </div>
  )
}

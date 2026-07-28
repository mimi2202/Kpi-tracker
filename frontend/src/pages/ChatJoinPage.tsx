// frontend/src/pages/ChatJoinPage.tsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { MessageCircle, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

type Status = 'joining' | 'success' | 'error'

export default function ChatJoinPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('joining')
  const [message, setMessage] = useState('')
  const [roomName, setRoomName] = useState('')
  const ran = useRef(false)   // guard React 18 StrictMode double-invoke

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    if (!token) { setStatus('error'); setMessage('No invite token provided.'); return }

    apiClient.post('/chat-rooms/join/', { token })
      .then(res => {
        setStatus('success')
        setRoomName(res.data?.name || 'the room')
        // Land them in the app; the ChatWidget will pick up the new room.
        setTimeout(() => navigate('/dashboard', { replace: true }), 1600)
      })
      .catch(err => {
        setStatus('error')
        setMessage(
          err.response?.data?.error ||
          err.response?.data?.errors?.[0] ||
          'This invite link is invalid, expired, or not meant for your account.'
        )
      })
  }, [token, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--surface-ground))] px-4">
      <div className="w-full max-w-sm card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--accent))] mb-5">
          <MessageCircle className="h-7 w-7 text-white" />
        </div>

        {status === 'joining' && (
          <>
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3 text-[hsl(var(--accent))]" />
            <h1 className="text-lg font-semibold">Joining chat…</h1>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">Checking your invite.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-emerald-500" />
            <h1 className="text-lg font-semibold">You're in!</h1>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">
              Added to {roomName}. Taking you to the app…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-8 w-8 mx-auto mb-3 text-red-500" />
            <h1 className="text-lg font-semibold">Couldn't join</h1>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">{message}</p>
            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="btn btn-primary mt-5"
            >
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
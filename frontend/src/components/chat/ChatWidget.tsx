// frontend/src/components/chat/ChatWidget.tsx
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { apiClient } from '../../api/client'
import Avatar from '../shared/Avatar'
import { MessageCircle, X, Send, Minimize2, Maximize2, Plus, UserPlus, Search, Loader2, Reply, SmilePlus, Link2, Check } from 'lucide-react'

interface Reaction { emoji: string; count: number; reacted: boolean }
interface Message {
  id: string; message: string; sender_id: string; sender_name: string; sender_initials: string
  sender_avatar: string | null; timestamp: string
  reply_to: string | null; reply_preview: { sender_name: string; content: string } | null
  reactions: Reaction[]
}
interface Room {
  id: string; name: string; department_name: string; is_direct?: boolean; is_private?: boolean
  unread_count?: number; has_unread?: boolean
}
interface UserOption { id: string; full_name: string; email: string }

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙏']

export default function ChatWidget() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newVisibility, setNewVisibility] = useState<'public' | 'private'>('public')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [nameError, setNameError] = useState('')
  const [dirty, setDirty] = useState(false)

  const [showDM, setShowDM] = useState(false)
  const [dmSearch, setDmSearch] = useState('')
  const [dmUser, setDmUser] = useState<UserOption | null>(null)
  const [startingDM, setStartingDM] = useState(false)
  const [dmError, setDmError] = useState('')

  const [showInvite, setShowInvite] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteEmails, setInviteEmails] = useState('')
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [copied, setCopied] = useState(false)

  const [depts, setDepts] = useState<any[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentUserId = user?.id

  const mapMessage = (m: any): Message => ({
    id: m.id, message: m.content, sender_id: m.sender || '', sender_name: m.sender_name || '',
    sender_initials: m.sender_initials || '?', sender_avatar: m.sender_avatar || null,
    timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    reply_to: m.reply_to || null,
    reply_preview: m.reply_to_preview ? { sender_name: m.reply_to_preview.sender_name, content: m.reply_to_preview.content } : null,
    reactions: m.reactions || [],
  })

  const fetchRooms = () => {
    apiClient.get('/chat-rooms/').then(res => {
      const r = Array.isArray(res.data) ? res.data : (res.data.results || [])
      setRooms(r)
      if (r.length > 0 && !activeRoom) setActiveRoom(r[0])
    }).catch(() => {})
  }

  useEffect(() => { fetchRooms() }, [])
  // Poll room list for unread indicators even while a room is open.
  useEffect(() => {
    const i = setInterval(fetchRooms, 4000)
    return () => clearInterval(i)
  }, [activeRoom])

  useEffect(() => {
    if (!activeRoom) return
    const fetchMessages = async () => {
      try {
        const res = await apiClient.get(`/chat-rooms/${activeRoom.id}/messages/`)
        const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
        setMessages(data.map(mapMessage))
      } catch {}
    }
    fetchMessages()
    const interval = setInterval(fetchMessages, 1500)
    return () => clearInterval(interval)
  }, [activeRoom])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || !activeRoom || sending) return
    setSending(true)
    try {
      await apiClient.post(`/chat-rooms/${activeRoom.id}/send/`, {
        content: input,
        reply_to: replyTo?.id || null,
      })
      setInput(''); setReplyTo(null)
    } catch (err) { console.error(err) }
    finally { setSending(false) }
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!activeRoom) return
    setEmojiPickerFor(null)
    // optimistic update
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m
      const existing = m.reactions.find(r => r.emoji === emoji)
      let reactions: Reaction[]
      if (existing) {
        const count = existing.count + (existing.reacted ? -1 : 1)
        reactions = count <= 0
          ? m.reactions.filter(r => r.emoji !== emoji)
          : m.reactions.map(r => r.emoji === emoji ? { ...r, count, reacted: !r.reacted } : r)
      } else {
        reactions = [...m.reactions, { emoji, count: 1, reacted: true }]
      }
      return { ...m, reactions }
    }))
    try { await apiClient.post(`/chat-rooms/${activeRoom.id}/react/`, { message_id: messageId, emoji }) }
    catch { /* poll will reconcile */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const openCreate = () => {
    apiClient.get('/departments/').then(r => setDepts(r.data.results || r.data)).catch(() => {})
    setShowCreate(true); setNewName(''); setNewDept(''); setNewVisibility('public'); setCreateError(''); setNameError(''); setDirty(false)
    setTimeout(() => nameInputRef.current?.focus(), 100)
  }

  const createRoom = async () => {
    if (!newName.trim() || !newDept) return
    setCreating(true); setCreateError('')
    try {
      const res = await apiClient.post('/chat-rooms/', { name: newName, department: newDept, visibility: newVisibility })
      setShowCreate(false); setNewName(''); setNewDept(''); fetchRooms(); setActiveRoom(res.data)
    } catch (err: any) {
      setCreateError(err.response?.data?.errors?.[0] || 'Failed to create room')
    } finally { setCreating(false) }
  }

  const closeCreate = () => {
    if (dirty && (newName || newDept)) { if (!confirm('Discard changes?')) return }
    setShowCreate(false)
  }

  const openDM = () => {
    apiClient.get('/auth/users/my_team/').then(r => setUsers(r.data || [])).catch(() => {})
    setShowDM(true); setDmUser(null); setDmSearch(''); setDmError('')
  }

  const startDM = async () => {
    if (!dmUser) return
    setStartingDM(true); setDmError('')
    try {
      const res = await apiClient.post('/chat-rooms/direct_message/', { user_id: dmUser.id })
      setShowDM(false); setDmUser(null); fetchRooms(); setActiveRoom(res.data)
    } catch (err: any) {
      setDmError(err.response?.data?.errors?.[0] || 'Failed to start chat')
    } finally { setStartingDM(false) }
  }

  const openInvite = () => {
    setShowInvite(true); setInviteLink(''); setInviteEmails(''); setCopied(false)
  }

  const generateInvite = async () => {
    if (!activeRoom) return
    setGeneratingInvite(true)
    try {
      const allowed = inviteEmails.split(',').map(e => e.trim()).filter(Boolean)
      const res = await apiClient.post(`/chat-rooms/${activeRoom.id}/create_invite/`, {
        allowed_emails: allowed,
        base_url: window.location.origin,
      })
      setInviteLink(res.data.link)
    } catch (err: any) {
      setInviteLink('')
    } finally { setGeneratingInvite(false) }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const filteredUsers = users.filter((u: any) => (u.full_name || '').toLowerCase().includes(dmSearch.toLowerCase()) && u.id !== currentUserId)

  if (!open) {
    const anyUnread = rooms.some(r => r.has_unread)
    return (
      <button onClick={() => setOpen(true)} style={{ position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(79,70,229,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
        <MessageCircle size={24} />
        {anyUnread && <span style={{ position: 'absolute', top: 10, right: 10, width: 12, height: 12, borderRadius: 6, backgroundColor: '#ef4444', border: '2px solid white' }} />}
      </button>
    )
  }

  return (
    <>
      <div style={{ position: 'fixed', bottom: 24, right: 24, width: 520, height: minimized ? 48 : 540, backgroundColor: 'hsl(var(--surface-card))', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.25)', display: 'flex', zIndex: 50, overflow: 'hidden', transition: 'height 0.3s' }}>
        {/* Room list */}
        <div style={{ width: 160, backgroundColor: 'hsl(var(--surface-ground))', borderRight: '1px solid hsl(var(--border-subtle))', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '10px 8px', borderBottom: '1px solid hsl(var(--border-subtle))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'hsl(var(--text-tertiary))', textTransform: 'uppercase' }}>Chats</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={openCreate} style={{ padding: 3, borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'hsl(var(--text-secondary))' }} title="New Group"><Plus size={14} /></button>
              <button onClick={openDM} style={{ padding: 3, borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'hsl(var(--text-secondary))' }} title="Direct Message"><UserPlus size={14} /></button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rooms.map(room => {
              const isActive = activeRoom?.id === room.id
              const unread = room.unread_count || 0
              return (
                <button key={room.id} onClick={() => setActiveRoom(room)} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', cursor: 'pointer', backgroundColor: isActive ? 'hsl(var(--accent-light))' : 'transparent', color: isActive ? '#4f46e5' : 'hsl(var(--text-secondary))', borderLeft: isActive ? '3px solid #4f46e5' : '3px solid transparent', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: room.has_unread && !isActive ? 700 : 600, fontSize: 12, marginBottom: 1, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {room.has_unread && !isActive && <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444', flexShrink: 0 }} />}
                      {room.is_direct ? room.name?.replace('DM: ', '') : room.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'hsl(var(--text-tertiary))' }}>{room.is_private ? 'Private' : (room.department_name || 'Direct')}</div>
                  </div>
                  {unread > 0 && !isActive && <span style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>{unread > 9 ? '9+' : unread}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: 'hsl(var(--surface-card))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#4f46e5', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}><MessageCircle size={16} /><span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeRoom?.name || 'Chat'}</span></div>
            <div style={{ display: 'flex', gap: 2 }}>
              {activeRoom?.is_private && <button onClick={openInvite} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 2 }} title="Invite link"><Link2 size={14} /></button>}
              <button onClick={() => setMinimized(!minimized)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 2 }}>{minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}</button>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
            </div>
          </div>

          {!minimized && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && <p style={{ textAlign: 'center', color: 'hsl(var(--text-tertiary))', fontSize: 13, marginTop: 40 }}>No messages yet.</p>}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId
                  return (
                    <div key={msg.id} className="chat-msg-row" style={{ display: 'flex', gap: 8, flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', position: 'relative' }}>
                      <div style={{ flexShrink: 0 }}><Avatar src={msg.sender_avatar} name={msg.sender_name} size={26} /></div>
                      <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        {/* reply preview banner */}
                        {msg.reply_preview && (
                          <div style={{ fontSize: 11, color: 'hsl(var(--text-secondary))', borderLeft: '2px solid hsl(var(--accent) / 0.4)', paddingLeft: 6, marginBottom: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <b>{msg.reply_preview.sender_name}</b>: {msg.reply_preview.content}
                          </div>
                        )}
                        <div style={{ padding: '8px 10px', borderRadius: 12, backgroundColor: isMe ? '#4f46e5' : 'hsl(var(--surface-ground))', color: isMe ? 'white' : 'hsl(var(--text-primary))', fontSize: 13, position: 'relative' }}>
                          <p style={{ margin: 0, fontSize: 10, opacity: 0.7, fontWeight: 600 }}>{msg.sender_name}</p>
                          <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.message}</p>
                          <p style={{ margin: 0, fontSize: 9, opacity: 0.5, textAlign: 'right' }}>{msg.timestamp}</p>
                          {/* hover actions */}
                          <div className="chat-msg-actions" style={{ position: 'absolute', top: -12, [isMe ? 'left' : 'right']: 4, display: 'flex', gap: 2, background: 'hsl(var(--surface-card))', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', padding: 2 }}>
                            <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3, color: 'hsl(var(--text-secondary))' }} title="Reply"><Reply size={13} /></button>
                            <button onClick={() => setEmojiPickerFor(emojiPickerFor === msg.id ? null : msg.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 3, color: 'hsl(var(--text-secondary))' }} title="React"><SmilePlus size={13} /></button>
                          </div>
                          {emojiPickerFor === msg.id && (
                            <div style={{ position: 'absolute', top: -40, [isMe ? 'left' : 'right']: 0, display: 'flex', gap: 2, background: 'hsl(var(--surface-card))', borderRadius: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', padding: '4px 8px', zIndex: 10 }}>
                              {QUICK_EMOJIS.map(e => <button key={e} onClick={() => toggleReaction(msg.id, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}>{e}</button>)}
                            </div>
                          )}
                        </div>
                        {/* reaction chips */}
                        {msg.reactions.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                            {msg.reactions.map(r => (
                              <button key={r.emoji} onClick={() => toggleReaction(msg.id, r.emoji)} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '1px 6px', borderRadius: 10, border: `1px solid ${r.reacted ? '#4f46e5' : 'hsl(var(--border-subtle))'}`, background: r.reacted ? 'hsl(var(--accent-light))' : 'hsl(var(--surface-card))', color: r.reacted ? '#4f46e5' : 'hsl(var(--text-secondary))', cursor: 'pointer' }}>
                                <span>{r.emoji}</span><span style={{ fontWeight: 600 }}>{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* reply banner above composer */}
              {replyTo && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'hsl(var(--accent-light))', borderTop: '1px solid hsl(var(--border-subtle))', fontSize: 12, color: 'hsl(var(--text-primary))' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Replying to <b>{replyTo.sender_name}</b>: {replyTo.message.slice(0, 40)}</span>
                  <button onClick={() => setReplyTo(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'hsl(var(--text-secondary))', padding: 2, flexShrink: 0 }}><X size={14} /></button>
                </div>
              )}

              <div style={{ padding: 10, borderTop: '1px solid hsl(var(--border-subtle))', display: 'flex', gap: 8 }}>
                <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." disabled={sending} style={{ flex: 1, border: '1px solid hsl(var(--border-subtle))', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))' }} />
                <button onClick={sendMessage} disabled={sending || !input.trim()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: input.trim() ? '#4f46e5' : 'hsl(var(--border-default))', color: 'white', border: 'none', cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.4)' }} onClick={closeCreate}>
          <div role="dialog" aria-modal="true" style={{ width: 480, backgroundColor: 'hsl(var(--surface-card))', borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'hsl(var(--text-primary))' }}>New room</h2>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="hsl(var(--text-secondary))" /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Room name</label>
                <input ref={nameInputRef} value={newName} onChange={(e) => { setNewName(e.target.value.slice(0, 40)); setDirty(true); setNameError('') }} placeholder="e.g. Procurement Review" style={{ width: '100%', border: `1px solid ${nameError ? '#ef4444' : 'hsl(var(--border-subtle))'}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))' }} />
                {nameError && <p style={{ fontSize: 12, color: '#ef4444', margin: '4px 0 0' }}>{nameError}</p>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Department</label>
                <select value={newDept} onChange={(e) => { setNewDept(e.target.value); setDirty(true) }} style={{ width: '100%', border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))' }}>
                  <option value="">Select department</option>
                  {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))', margin: '4px 0 0' }}>Only members of this department can see this room.</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Visibility</label>
                <div style={{ display: 'flex', backgroundColor: 'hsl(var(--surface-ground))', borderRadius: 10, padding: 3, gap: 3 }}>
                  <button onClick={() => setNewVisibility('public')} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: newVisibility === 'public' ? 'hsl(var(--surface-card))' : 'transparent', color: newVisibility === 'public' ? 'hsl(var(--text-primary))' : 'hsl(var(--text-secondary))' }}>Public</button>
                  <button onClick={() => setNewVisibility('private')} style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: newVisibility === 'private' ? 'hsl(var(--surface-card))' : 'transparent', color: newVisibility === 'private' ? 'hsl(var(--text-primary))' : 'hsl(var(--text-secondary))' }}>Private</button>
                </div>
                <p style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))', margin: '4px 0 0' }}>{newVisibility === 'public' ? 'Anyone in the department can join' : 'Only invited members can join — share an invite link after creating'}</p>
              </div>
              {createError && <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{createError}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid hsl(var(--border-subtle))' }}>
              <button onClick={closeCreate} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, cursor: 'pointer', backgroundColor: 'hsl(var(--surface-ground))', color: 'hsl(var(--text-primary))' }}>Cancel</button>
              <button onClick={createRoom} disabled={creating || !newName.trim() || !newDept} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500, cursor: (creating || !newName.trim() || !newDept) ? 'not-allowed' : 'pointer', backgroundColor: (creating || !newName.trim() || !newDept) ? '#c7d2fe' : '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                {creating && <Loader2 size={14} className="animate-spin" />}{creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Link Modal */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.4)' }} onClick={() => setShowInvite(false)}>
          <div role="dialog" aria-modal="true" style={{ width: 440, backgroundColor: 'hsl(var(--surface-card))', borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'hsl(var(--text-primary))' }}>Invite to {activeRoom?.name}</h2>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="hsl(var(--text-secondary))" /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'hsl(var(--text-primary))' }}>Allowed emails <span style={{ color: 'hsl(var(--text-tertiary))' }}>(comma-separated, optional)</span></label>
                <input value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} placeholder="alice@co.com, bob@co.com" style={{ width: '100%', border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))' }} />
                <p style={{ fontSize: 11, color: 'hsl(var(--text-tertiary))', margin: '4px 0 0' }}>Leave empty to allow anyone in your organisation. The link only works for people in your org.</p>
              </div>
              {!inviteLink ? (
                <button onClick={generateInvite} disabled={generatingInvite} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', backgroundColor: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {generatingInvite && <Loader2 size={14} className="animate-spin" />}{generatingInvite ? 'Generating...' : 'Generate invite link'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input readOnly value={inviteLink} style={{ flex: 1, border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px', fontSize: 13, outline: 'none', background: 'hsl(var(--surface-ground))', color: 'hsl(var(--text-primary))' }} />
                  <button onClick={copyLink} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', backgroundColor: copied ? '#10b981' : '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {copied ? <><Check size={14} /> Copied</> : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DM Modal */}
      {showDM && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.4)' }} onClick={() => setShowDM(false)}>
          <div role="dialog" aria-modal="true" style={{ width: 400, backgroundColor: 'hsl(var(--surface-card))', borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
              <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: 'hsl(var(--text-primary))' }}>New message</h2>
              <button onClick={() => setShowDM(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="hsl(var(--text-secondary))" /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={16} color="hsl(var(--text-tertiary))" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} placeholder="Search people..." style={{ width: '100%', border: '1px solid hsl(var(--border-subtle))', borderRadius: 10, padding: '10px 14px 10px 36px', fontSize: 14, outline: 'none', backgroundColor: 'hsl(var(--surface-card))', color: 'hsl(var(--text-primary))' }} />
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {filteredUsers.map((u: any) => (
                  <button key={u.id} onClick={() => setDmUser(u)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: 'none', borderRadius: 10, cursor: 'pointer', backgroundColor: dmUser?.id === u.id ? 'hsl(var(--accent-light))' : 'transparent', textAlign: 'left' }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(u.full_name || '?')[0]}</div>
                    <div><p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: 'hsl(var(--text-primary))' }}>{u.full_name}</p><p style={{ fontSize: 12, color: 'hsl(var(--text-tertiary))', margin: 0 }}>{u.email}</p></div>
                  </button>
                ))}
                {filteredUsers.length === 0 && <p style={{ textAlign: 'center', color: 'hsl(var(--text-tertiary))', fontSize: 13, padding: 20 }}>No users found</p>}
              </div>
              {dmError && <p style={{ fontSize: 13, color: '#ef4444', margin: '8px 0 0' }}>{dmError}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid hsl(var(--border-subtle))' }}>
              <button onClick={() => setShowDM(false)} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, cursor: 'pointer', backgroundColor: 'hsl(var(--surface-ground))', color: 'hsl(var(--text-primary))' }}>Cancel</button>
              <button onClick={startDM} disabled={startingDM || !dmUser} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 500, cursor: (startingDM || !dmUser) ? 'not-allowed' : 'pointer', backgroundColor: (startingDM || !dmUser) ? '#c7d2fe' : '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                {startingDM && <Loader2 size={14} className="animate-spin" />}{startingDM ? 'Starting...' : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
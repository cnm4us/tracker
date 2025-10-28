import { useEffect, useState } from 'react'
import './App.css'
import { api, formatCivilPartsTZ, formatDayMonTZ, formatDuration, ymdInTZ } from './api'
import type { Entry, User } from './api'
import sound from './sound'

type Site = 'clinic' | 'remote'

function renderCivil(d: Date, tz: string) {
  const { hm, period } = formatCivilPartsTZ(d, tz)
  return (<><span>{hm} </span><span className="ampm">{period}</span></>)
}

const containerStyle: React.CSSProperties = {
  maxWidth: 520,
  width: '100%',
  margin: '0 auto',
  padding: '16px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  boxSizing: 'border-box',
}

const authBgStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundImage: "url('/bg/login-1080x1920.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
}

const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }
const btnStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 16,
  minWidth: 96,
}

function useClock() {
  const [now, setNow] = useState<Date>(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'time' | 'settings' | 'login' | 'register' | 'new' | 'edit'>('login')
  const [editing, setEditing] = useState<Entry | null>(null)

  const [site, setSite] = useState<Site>('clinic')
  const [events, setEvents] = useState<string[]>([])
  const [allEvents, setAllEvents] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [notesRows, setNotesRows] = useState(2)

  const [entries, setEntries] = useState<Entry[]>([])
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null)
  const [stopping, setStopping] = useState(false)

  const now = useClock()

  useEffect(() => {
    (async () => {
      try {
        const m = await api.me()
        setUser(m.user)
        setView(m.user ? 'time' : 'login')
      } catch {}
      try {
        const et = await api.eventTypes()
        setAllEvents(et.event_types.filter(e => e.active).map(e => e.name))
      } catch {}
      await refreshEntries()
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshEntries() {
    try {
      const { entries } = await api.list(20)
      setEntries(entries)
      const active = entries.find(e => e.start_iso && !e.stop_iso)
      setActiveEntry(active || null)
    } catch (e: any) {
      // ignore when unauthenticated
    }
  }

  async function onLogin(email: string, password: string) {
    setError(null)
    try {
      const { user } = await api.login(email, password)
      setUser(user)
      setView('time')
      await refreshEntries()
    } catch (e: any) {
      setError(e?.data?.error || 'Login failed')
    }
  }

  async function onRegister(email: string, password: string) {
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { user } = await api.register(email, password, tz)
      setUser(user)
      setView('time')
      await refreshEntries()
    } catch (e: any) {
      setError(e?.data?.error || 'Register failed')
    }
  }

  async function onLogout() {
    await api.logout()
    setUser(null)
    setEntries([])
    setActiveEntry(null)
    setView('login')
  }

  function toggleEvent(name: string) {
    setEvents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  async function clickStart() {
    if (activeEntry) {
      if (!confirm('You already have an active session. Stop it now?')) return
      await api.stop()
      await refreshEntries()
    }
    try {
      await sound.enable(); sound.playStart()
      await api.start(site, events, notes)
      await refreshEntries()
    } catch (e: any) {
      alert(e?.data?.detail || e?.data?.error || 'Start failed')
    }
  }

  async function clickStop() {
    try {
      await sound.enable(); sound.playStop()
      setStopping(true)
      await api.stop(notes)
      setNotes('')
      setEvents([])
      await refreshEntries()
    } catch (e: any) {
      alert(e?.data?.error || 'Stop failed')
    } finally {
      setStopping(false)
    }
  }

  const tz = user?.tz || 'UTC'
  // const toTZ = (iso: string) => new Date(iso)

  if (loading) return <div style={containerStyle}>Loading…</div>

  const isAuthView = !user && (view === 'login' || view === 'register')
  return (
    <div style={isAuthView ? authBgStyle : undefined}>
      <div style={containerStyle}>
      <Header
        user={user}
        view={view}
        onNavigate={(v) => setView(v)}
        onLogout={onLogout}
      />

      {!user ? (
        view === 'register' ? (
          <RegisterScreen error={error} onRegister={onRegister} />
        ) : (
          <AuthScreen error={error} onLogin={onLogin} />
        )
      ) : view === 'settings' ? (
        <SettingsScreen
          user={user}
          onSave={async (tz) => { await api.updateMe(tz); setUser(u => (u ? { ...u, tz } : u)); setView('time') }}
        />
      ) : view === 'new' ? (
        <NewEntryScreen
          defaultSite={site}
          defaultEvents={events}
          allEvents={allEvents}
          tz={tz}
          onCancel={() => setView('time')}
          onCreated={async () => { await refreshEntries(); setView('time') }}
        />
      ) : view === 'edit' && editing ? (
        <NewEntryScreen
          mode="edit"
          entry={editing}
          defaultSite={(editing.site as any) || site}
          defaultEvents={events}
          allEvents={allEvents}
          tz={tz}
          onCancel={() => { setEditing(null); setView('time') }}
          onCreated={async () => { await refreshEntries(); setEditing(null); setView('time') }}
        />
      ) : (
        <>
          <div style={{ marginTop: 8, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, fontSize: 20, fontWeight: 600, opacity: 0.5 }}>{ymdInTZ(now, tz)}</div>
            <div style={{ flex: 1, textAlign: 'right', fontSize: 20, fontWeight: 600, opacity: 0.5 }}>{renderCivil(now, tz)}</div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>Site:</span>
              <label><input type="radio" name="site" checked={site==='clinic'} onChange={()=>setSite('clinic')} /> Clinic</label>
              <label><input type="radio" name="site" checked={site==='remote'} onChange={()=>setSite('remote')} /> Remote</label>
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Events:</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {allEvents.map((name) => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, overflowWrap: 'anywhere' }}>
                  <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} /> {name}
                </label>
              ))}
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <textarea
              value={notes}
              onChange={e=>setNotes(e.target.value)}
              rows={notesRows}
              onFocus={()=>setNotesRows(4)}
              onBlur={()=>setNotesRows(2)}
              className="avoidZoom"
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Optional notes"
            />
          </div>

          <div style={{ ...rowStyle, justifyContent: 'space-between', marginTop: 8, marginBottom: 16 }}>
            <button
              onClick={clickStart}
              className={`btn3d btn-glass ${activeEntry ? 'btn3d-pressed' : ''}`}
              style={{ ...btnStyle, color: 'white', ['--btn-color' as any]: (activeEntry ? '#1976d2' : '#2e7d32') }}
            >
              Start
            </button>
            <button
              onClick={clickStop}
              className={`btn3d btn-glass ${stopping ? 'btn3d-pressed' : ''}`}
              style={{ ...btnStyle, color: 'white', ['--btn-color' as any]: '#d32f2f' }}
            >
              Stop
            </button>
            <button
              onClick={async ()=>{ await sound.enable(); sound.playNew(); setView('new') }}
              className="btn3d btn-glass"
              style={{ ...btnStyle, color: 'white', ['--btn-color' as any]: '#546e7a' }}
            >
              New
            </button>
          </div>

          <h3 style={{ margin: '16px 0 8px' }}>Recent</h3>
          <div className="logsWide">
            {entries.map((e) => {
              let dateForDisplay: Date
              if (e.start_iso) {
                dateForDisplay = new Date(e.start_iso)
              } else if (e.start_local_date) {
                const v = (e as any).start_local_date as string
                // If server serialized DATE as ISO with time, use it directly; else append a midday time
                dateForDisplay = new Date(v.includes('T') ? v : `${v}T12:00:00Z`)
              } else {
                dateForDisplay = new Date()
              }
              const start = e.start_iso ? new Date(e.start_iso) : null
              const stop = e.stop_iso ? new Date(e.stop_iso) : null
              const isActiveRow = !!(start && !stop)
              const dur = (typeof e.duration_min === 'number')
                ? e.duration_min
                : (start && stop ? Math.round((+stop - +start) / 60000) : null)
              return (
                <div key={e.id} className="logsRow" style={{ padding: '8px 0', borderBottom: '1px solid rgba(238,238,238,0.5)' }}>
                  <div className="cellDay" style={{ cursor: 'pointer', textDecoration: 'none', color: '#ffb616' }} onClick={()=>{ setEditing(e); setView('edit') }}>{formatDayMonTZ(dateForDisplay, tz)}</div>
                  <div className="cellNotes" title={e.notes || ''}>{e.notes || ''}</div>
                  <div className={`cellStart ${isActiveRow ? 'pulse' : ''}`}>{start ? renderCivil(start, tz) : '—'}</div>
                  <div className="cellStop">{stop ? renderCivil(stop, tz) : '—'}</div>
                  <div className="cellTotal" style={{ fontVariantNumeric: 'tabular-nums' as any }}>{formatDuration(dur ?? null)}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {user && error && <div style={{ color: 'crimson', marginTop: 12 }}>{error}</div>}
      </div>
    </div>
  )
}

function Header(props: { user: User | null, view: 'time'|'settings'|'login'|'register'|'new'|'edit', onNavigate: (v:'time'|'settings'|'login'|'register'|'new'|'edit')=>void, onLogout: ()=>void }) {
  const [open, setOpen] = useState(false)
  const title =
    props.view === 'settings' ? 'Settings'
    : props.view === 'new' ? 'Manual Entry'
    : props.view === 'edit' ? 'Edit Entry'
    : props.view === 'time' ? 'Timed Entry'
    : props.view === 'register' ? 'Register'
    : 'Login'
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'transparent', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', position: 'relative' }}>
        <button aria-label="menu" onClick={()=>setOpen(o=>!o)} style={{ background: 'transparent', border: 'none', padding: 8 }}>
          <span style={{ display: 'block', width: 24, height: 2, background: '#fff', borderRadius: 1 }} />
          <span style={{ display: 'block', width: 24, height: 2, background: '#fff', borderRadius: 1, marginTop: 5 }} />
          <span style={{ display: 'block', width: 24, height: 2, background: '#fff', borderRadius: 1, marginTop: 5 }} />
        </button>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 20, fontWeight: 700 }}>{title}</div>
        <div style={{ marginLeft: 'auto', width: 40 }} />
      </div>
      {open && (
        <>
          {/* Backdrop with subtle blur */}
          <div
            onClick={()=>setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 40 }}
          />
          {/* Drawer (50% opaque, blurred) */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: '75vw', maxWidth: 420,
              background: 'rgba(0,0,0,0.5)', color: '#fff',
              boxShadow: '2px 0 16px rgba(0,0,0,0.35)', zIndex: 41, padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontWeight: 700 }}>Menu</div>
              <button aria-label="Close menu" onClick={()=>setOpen(false)} style={{ background: 'transparent', color: '#fff', border: 'none', fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>
            {!props.user ? (
              <>
                <button
                  onClick={()=>{ props.onNavigate('login'); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#1976d2' }}
                >
                  Login
                </button>
                <button
                  onClick={()=>{ props.onNavigate('register'); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#455a64' }}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={()=>{ props.onNavigate('time'); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#ffb616' }}
                >
                  Timed Entry
                </button>
                <button
                  onClick={()=>{ props.onNavigate('new'); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#ffb616' }}
                >
                  Manual Entry
                </button>
                <button
                  onClick={()=>{ props.onNavigate('settings'); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#ffb616' }}
                >
                  User Settings
                </button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={()=>{ props.onLogout(); setOpen(false) }}
                  className="btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#d32f2f' }}
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AuthScreen(props: { error: string | null, onLogin: (e:string,p:string)=>void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Login</div>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, marginBottom: 8, background: 'rgba(0,0,0,0.5)', color: '#fff' }} />
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, marginBottom: 8, background: 'rgba(0,0,0,0.5)', color: '#fff' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={()=>props.onLogin(email,password)}
          className="btn3d btn-glass"
          style={{ ...btnStyle, color: 'white', flex: 1, ['--btn-color' as any]: '#1976d2' }}
        >
          Login
        </button>
      </div>
      {props.error && <div style={{ color: 'crimson', marginTop: 12 }}>{props.error}</div>}
    </div>
  )
}

function RegisterScreen(props: { error: string | null, onRegister: (e:string,p:string)=>void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Register</div>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, marginBottom: 8, background: 'rgba(0,0,0,0.5)', color: '#fff' }} />
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, marginBottom: 8, background: 'rgba(0,0,0,0.5)', color: '#fff' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={()=>props.onRegister(email,password)}
          className="btn3d btn-glass"
          style={{ ...btnStyle, color: 'white', flex: 1, ['--btn-color' as any]: '#455a64' }}
        >
          Create Account
        </button>
      </div>
      {props.error && <div style={{ color: 'crimson', marginTop: 12 }}>{props.error}</div>}
    </div>
  )
}

function SettingsScreen(props: { user: User, onSave: (tz:string)=>Promise<void> }) {
  const [tz, setTz] = useState<string>(props.user.tz || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const tzList = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') as string[] : [tz]
  const [saving, setSaving] = useState(false)
  const [sounds, setSounds] = useState<boolean>(() => sound.isEnabled())
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display:'block', fontSize: 18, color: '#fff', marginBottom: 6 }}>Time Zone</label>
      <select
        value={tz}
        onChange={e=>setTz(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '100%',
          padding: 12,
          border: '1px solid #ccc',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 18,
          minHeight: 44,
          boxSizing: 'border-box',
          color: '#ffb616',
        }}
      >
        {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px' }}>
        <input className="brand" id="sounds" type="checkbox" checked={sounds} onChange={(e)=>{ setSounds(e.target.checked); sound.setEnabled(e.target.checked) }} />
        <label htmlFor="sounds">Button Sounds</label>
      </div>
      <button
        disabled={saving}
        onClick={async()=>{ setSaving(true); try { await props.onSave(tz) } finally { setSaving(false) } }}
        className="btn3d btn-glass"
        style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#2e7d32' }}
      >
        Save
      </button>
    </div>
  )
}

function NewEntryScreen(props: { mode?: 'new'|'edit', entry?: Entry, defaultSite: Site, defaultEvents: string[], allEvents: string[], tz?: string, onCancel: ()=>void, onCreated: ()=>Promise<void> }) {
  const tz = props.tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = useClock()
  const toHHMMInTZ = (iso?: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    const fmt = new Intl.DateTimeFormat('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: tz })
    return fmt.format(d) // returns HH:MM in given tz
  }
  const toYMD = (val?: string | null): string => {
    if (!val) return ''
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
    // Try parse as Date string
    const d = new Date(val)
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    // Use UTC parts to avoid tz shift
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const [site, setSite] = useState<Site>((props.entry?.site as Site) || props.defaultSite)
  const [events, setEvents] = useState<string[]>(props.entry?.events || props.defaultEvents)
  const [notes, setNotes] = useState(props.entry?.notes || '')
  const [startDate, setStartDate] = useState<string>(toYMD(props.entry?.start_local_date))
  const [startTime, setStartTime] = useState<string>(toHHMMInTZ(props.entry?.start_iso))
  const [stopDate, setStopDate] = useState<string>('')
  const [stopTime, setStopTime] = useState<string>(toHHMMInTZ(props.entry?.stop_iso))
  const [durH, setDurH] = useState<string>('')
  const [durM, setDurM] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [noteRows, setNoteRows] = useState(2)

  useEffect(() => {
    if (props.entry && props.entry.duration_min != null) {
      const d = props.entry.duration_min
      const hh = Math.floor(d / 60)
      const mm = d % 60
      if (hh > 0) setDurH(String(hh))
      if (mm > 0) setDurM(String(mm))
    }
  }, [props.entry])

  // When editing, fetch events for the entry so we can pre-check them
  useEffect(() => {
    (async () => {
      if (props.mode === 'edit' && props.entry?.id) {
        try {
          const { entry } = await api.getEntry(props.entry.id)
          if (entry?.events) setEvents(entry.events)
          if (entry?.notes) setNotes(entry.notes)
          if (entry?.start_local_date) setStartDate(toYMD(entry.start_local_date))
          if (entry?.start_iso) setStartTime(toHHMMInTZ(entry.start_iso))
          if (entry?.stop_iso) setStopTime(toHHMMInTZ(entry.stop_iso))
        } catch {}
      }
    })()
  }, [props.mode, props.entry?.id])

  function toggleEvent(name: string) {
    setEvents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toIso(date: string, time: string): string | null {
    if (!date || !time) return null
    // Interpret date+time as in user's local timezone, then convert to UTC ISO
    return new Date(`${date}T${time}:00`).toISOString()
  }

  // Derive stop time when duration is provided; assume stop date = start date
  useEffect(() => {
    if (!startDate || !startTime) return
    const h = parseInt(durH || '0', 10)
    const m = parseInt(durM || '0', 10)
    if (isNaN(h) && isNaN(m)) return
    const base = new Date(`${startDate}T${startTime}:00`)
    if (Number.isFinite(h)) base.setHours(base.getHours() + (h || 0))
    if (Number.isFinite(m)) base.setMinutes(base.getMinutes() + (m || 0))
    const hh = String(base.getUTCHours()).padStart(2, '0')
    const mm = String(base.getUTCMinutes()).padStart(2, '0')
    setStopDate(startDate) // per requirement: same day
    setStopTime(`${hh}:${mm}`)
  }, [startDate, startTime, durH, durM])

  async function submitManual() {
    const hasDuration = !!(durH || durM)
    // Duration-only branch: requires start date and hours/minutes; start time optional
    if (hasDuration) {
      if (!startDate) return alert('Please select a start date')
      const h = durH ? parseInt(durH, 10) : null
      const m = durM ? parseInt(durM, 10) : null
      if ((!h && !m) || ((h ?? 0) === 0 && (m ?? 0) === 0)) return alert('Please enter a positive duration')
      setSubmitting(true)
      try {
        if (props.mode === 'edit' && props.entry) {
          await api.updateEntryDuration(props.entry.id, site, events, startDate, h, m, notes || undefined)
        } else {
          await api.manualDuration(site, events, startDate, h, m, notes)
        }
        await props.onCreated()
      } catch (err:any) {
        alert(err?.data?.error || 'Create failed')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Start/Stop branch: requires both times
    const s = toIso(startDate, startTime)
    const e = toIso(stopDate || startDate, stopTime)
    if (!s || !e) return alert('Please fill start and stop time')
    setSubmitting(true)
    try {
      if (props.mode === 'edit' && props.entry) {
        await api.updateEntryTimes(props.entry.id, site, events, s, e, notes || undefined)
      } else {
        await api.manual(site, events, s, e, notes)
      }
      await props.onCreated()
    } catch (err:any) {
      alert(err?.data?.error || 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ marginTop: 8, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, fontSize: 20, fontWeight: 600, opacity: 0.5 }}>{ymdInTZ(now, tz)}</div>
          <div style={{ flex: 1, textAlign: 'right', fontSize: 20, fontWeight: 600, opacity: 0.5 }}>{renderCivil(now, tz)}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Site:</span>
          <label><input type="radio" name="m-site" checked={site==='clinic'} onChange={()=>setSite('clinic')} /> Clinic</label>
          <label><input type="radio" name="m-site" checked={site==='remote'} onChange={()=>setSite('remote')} /> Remote</label>
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Events:</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {props.allEvents.map((name) => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, overflowWrap: 'anywhere' }}>
              <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} /> {name}
            </label>
          ))}
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <textarea
          className="avoidZoom"
          value={notes}
          onChange={e=>setNotes(e.target.value)}
          rows={noteRows}
          onFocus={()=>setNoteRows(4)}
          onBlur={()=>setNoteRows(2)}
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Optional notes"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e=>{ setStartDate(e.target.value); if(!stopDate) setStopDate(e.target.value) }}
            className="pickField"
            style={{ width:'80%', maxWidth:'100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', boxSizing: 'border-box', fontSize: 18, color: '#ffb616' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16, textAlign: 'right' }}>Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e=>setStartTime(e.target.value)}
            className="timeField"
            style={{ width:'80%', maxWidth:'100%', padding: '0 8px', lineHeight: '44px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', boxSizing: 'border-box', fontSize: 18, height: 44, display: 'block', marginLeft: 'auto', WebkitAppearance: 'none' as any, color: '#ffb616' }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Total Time</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={durH} onChange={(e)=>setDurH(e.target.value)} className="pickField" style={{ width: '44%', flex: '0 0 44%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', fontSize: 18, color: '#ffb616' }}>
              <option value="" disabled hidden>hh</option>
              {[...Array(8)].map((_,i)=>(<option key={i+1} value={String(i+1)}>{i+1}</option>))}
            </select>
            <select value={durM} onChange={(e)=>setDurM(e.target.value)} className="pickField" style={{ width: '44%', flex: '0 0 44%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', fontSize: 18, color: '#ffb616' }}>
              <option value="" disabled hidden>mm</option>
              {[15,30,45].map((v)=>(<option key={v} value={String(v)}>{v}</option>))}
            </select>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16, textAlign: 'right' }}>Stop Time</label>
          <input
            type="time"
            value={stopTime}
            onChange={e=>setStopTime(e.target.value)}
            readOnly={!!(durH || durM)}
            className="timeField"
            style={{ width:'80%', maxWidth:'100%', padding: '0 8px', lineHeight: '44px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', boxSizing: 'border-box', fontSize: 18, height: 44, background: 'transparent', display: 'block', marginLeft: 'auto', WebkitAppearance: 'none' as any, color: '#ffb616' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
        <button
          disabled={submitting}
          onClick={async()=>{ await sound.enable(); sound.playStop(); props.onCancel() }}
          className="btn3d btn-glass"
          style={{ ...btnStyle, color: '#fff', ['--btn-color' as any]: '#d32f2f' }}
        >
          Cancel
        </button>
        <button
          disabled={submitting}
          onClick={async()=>{ await sound.enable(); sound.playStart(); await submitManual() }}
          className="btn3d btn-glass"
          style={{ ...btnStyle, color: '#fff', ['--btn-color' as any]: '#2e7d32' }}
        >
          Submit
        </button>
      </div>
    </div>
  )
}

export default App

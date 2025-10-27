import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, Entry, formatCivilTZ, formatDayMonTZ, User, ymdInTZ } from './api'

type Site = 'clinic' | 'remote'

const containerStyle: React.CSSProperties = {
  maxWidth: 520,
  width: '100%',
  margin: '0 auto',
  padding: '16px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
  boxSizing: 'border-box',
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
  const [view, setView] = useState<'time' | 'settings' | 'login' | 'new'>('login')

  const [site, setSite] = useState<Site>('clinic')
  const [events, setEvents] = useState<string[]>([])
  const [allEvents, setAllEvents] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  const [entries, setEntries] = useState<Entry[]>([])
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null)

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
      const active = entries.find(e => e.stop_utc === null)
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
      const stopped = await api.stop()
      await refreshEntries()
    }
    try {
      await api.start(site, events, notes)
      setNotes('')
      await refreshEntries()
    } catch (e: any) {
      alert(e?.data?.error || 'Start failed')
    }
  }

  async function clickStop() {
    try {
      await api.stop()
      await refreshEntries()
    } catch (e: any) {
      alert(e?.data?.error || 'Stop failed')
    }
  }

  const tz = user?.tz || 'UTC'
  const toTZ = (iso: string) => new Date(iso)

  if (loading) return <div style={containerStyle}>Loading…</div>

  return (
    <div style={containerStyle}>
      <Header
        user={user}
        view={view}
        onNavigate={(v) => setView(v)}
        onLogout={onLogout}
      />

      {!user ? (
        <AuthScreen error={error} onLogin={onLogin} onRegister={onRegister} />
      ) : view === 'settings' ? (
        <SettingsScreen
          user={user}
          onSave={async (tz) => { await api.updateMe(tz); setUser(u => (u ? { ...u, tz } : u)) }}
        />
      ) : view === 'new' ? (
        <NewEntryScreen
          defaultSite={site}
          defaultEvents={events}
          allEvents={allEvents}
          onCancel={() => setView('time')}
          onCreated={async () => { await refreshEntries(); setView('time') }}
        />
      ) : (
        <>
          <div style={{ marginTop: 8, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, fontSize: 20, fontWeight: 600 }}>{ymdInTZ(now, tz)}</div>
            <div style={{ flex: 1, textAlign: 'right', fontSize: 20, fontWeight: 600 }}>{formatCivilTZ(now, tz)}</div>
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
              rows={2}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Optional notes"
            />
          </div>

          <div style={{ ...rowStyle, justifyContent: 'space-between', marginTop: 8, marginBottom: 16 }}>
            <button onClick={clickStart} style={{ ...btnStyle, background: activeEntry ? '#1976d2' : '#2e7d32', color: 'white' }}>Start</button>
            <button onClick={clickStop} style={{ ...btnStyle, background: '#d32f2f', color: 'white' }}>Stop</button>
            <button onClick={()=>setView('new')} style={{ ...btnStyle, background: '#546e7a', color: 'white' }}>New</button>
          </div>

          <h3 style={{ margin: '16px 0 8px' }}>Recent</h3>
          <div>
            {entries.map((e) => {
              const start = toTZ(e.start_iso || e.start_utc)
              const stop = e.stop_iso ? toTZ(e.stop_iso) : null
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ width: '40%' }}>{formatDayMonTZ(start, tz)}</div>
                  <div style={{ width: '30%', textAlign: 'center' }}>{formatCivilTZ(start, tz)}</div>
                  <div style={{ width: '30%', textAlign: 'center' }}>{stop ? formatCivilTZ(stop, tz) : '—'}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {user && error && <div style={{ color: 'crimson', marginTop: 12 }}>{error}</div>}
    </div>
  )
}

function Header(props: { user: User | null, view: 'time'|'settings'|'login'|'new', onNavigate: (v:'time'|'settings'|'login'|'new')=>void, onLogout: ()=>void }) {
  const [open, setOpen] = useState(false)
  const title = props.view === 'settings' ? 'Settings' : props.view === 'new' ? 'New Entry' : props.view === 'time' ? 'Time Entry' : 'Login'
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
              <button onClick={()=>{ props.onNavigate('login'); setOpen(false) }} style={{ ...btnStyle, background: '#1976d2', color: '#fff', width: '100%' }}>Login</button>
            ) : (
              <>
                <button onClick={()=>{ props.onNavigate('time'); setOpen(false) }} style={{ ...btnStyle, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', width: '100%', textAlign: 'left' }}>Time Entry</button>
                <button onClick={()=>{ props.onNavigate('new'); setOpen(false) }} style={{ ...btnStyle, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', width: '100%', textAlign: 'left' }}>New Entry</button>
                <button onClick={()=>{ props.onNavigate('settings'); setOpen(false) }} style={{ ...btnStyle, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', width: '100%', textAlign: 'left' }}>User Settings</button>
                <div style={{ flex: 1 }} />
                <button onClick={()=>{ props.onLogout(); setOpen(false) }} style={{ ...btnStyle, background: '#d32f2f', color: '#fff', width: '100%', textAlign: 'left' }}>Logout</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AuthScreen(props: { error: string | null, onLogin: (e:string,p:string)=>void, onRegister:(e:string,p:string)=>void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Login / Register</div>
      <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8 }} />
      <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={()=>props.onLogin(email,password)} style={{ ...btnStyle, background: '#1976d2', color: 'white', flex: 1 }}>Login</button>
        <button onClick={()=>props.onRegister(email,password)} style={{ ...btnStyle, background: '#455a64', color: 'white', flex: 1 }}>Register</button>
      </div>
      {props.error && <div style={{ color: 'crimson', marginTop: 12 }}>{props.error}</div>}
    </div>
  )
}

function SettingsScreen(props: { user: User, onSave: (tz:string)=>Promise<void> }) {
  const [tz, setTz] = useState<string>(props.user.tz || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const tzList = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') as string[] : [tz]
  const [saving, setSaving] = useState(false)
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
        }}
      >
        {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
      <button
        disabled={saving}
        onClick={async()=>{ setSaving(true); try { await props.onSave(tz) } finally { setSaving(false) } }}
        style={{ ...btnStyle, background: '#2e7d32', color: 'white', width: '100%' }}
      >
        Save
      </button>
    </div>
  )
}

function NewEntryScreen(props: { defaultSite: Site, defaultEvents: string[], allEvents: string[], onCancel: ()=>void, onCreated: ()=>Promise<void> }) {
  const [site, setSite] = useState<Site>(props.defaultSite)
  const [events, setEvents] = useState<string[]>(props.defaultEvents)
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')
  const [stopDate, setStopDate] = useState<string>('')
  const [stopTime, setStopTime] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  function toggleEvent(name: string) {
    setEvents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toIso(date: string, time: string): string | null {
    if (!date || !time) return null
    return new Date(`${date}T${time}:00Z`).toISOString()
  }

  async function submitManual() {
    const s = toIso(startDate, startTime)
    const e = toIso(stopDate || startDate, stopTime)
    if (!s || !e) return alert('Please fill start and stop date/time')
    setSubmitting(true)
    try {
      await api.manual(site, events, s, e, notes)
      await props.onCreated()
    } catch (err:any) {
      alert(err?.data?.error || 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
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
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc', resize: 'vertical', boxSizing: 'border-box' }} placeholder="Optional notes" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e=>{ setStartDate(e.target.value); if(!stopDate) setStopDate(e.target.value) }}
            style={{ width:'80%', maxWidth:'100%', padding: '8px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 18, minHeight: 44 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e=>setStartTime(e.target.value)}
            style={{ width:'80%', maxWidth:'100%', padding: '8px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 18, minHeight: 44 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Stop Date</label>
          <input
            type="date"
            value={stopDate}
            onChange={e=>setStopDate(e.target.value)}
            style={{ width:'80%', maxWidth:'100%', padding: '8px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 18, minHeight: 44 }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Stop Time</label>
          <input
            type="time"
            value={stopTime}
            onChange={e=>setStopTime(e.target.value)}
            style={{ width:'80%', maxWidth:'100%', padding: '8px', borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box', fontSize: 18, minHeight: 44 }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
        <button disabled={submitting} onClick={props.onCancel} style={{ ...btnStyle, background: '#eee' }}>Cancel</button>
        <button disabled={submitting} onClick={submitManual} style={{ ...btnStyle, background: '#2e7d32', color: 'white' }}>Submit</button>
      </div>
    </div>
  )
}

export default App

import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, Entry, formatCivilTZ, formatDayMonTZ, User, ymdInTZ } from './api'

type Site = 'clinic' | 'remote'

const containerStyle: React.CSSProperties = {
  maxWidth: 520,
  margin: '0 auto',
  padding: '16px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
      <Header user={user} onLogout={onLogout} onLogin={onLogin} onRegister={onRegister} onUpdateTz={async (tz) => { await api.updateMe(tz); setUser(u => (u ? { ...u, tz } : u)) }} />

      {!user ? (
        <div style={{ marginTop: 24 }}>Please log in or register using the menu.</div>
      ) : (
        <>
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: '#666' }}>Date</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{ymdInTZ(now, tz)}</div>
            <div style={{ fontSize: 14, color: '#666', marginTop: 8 }}>Time ({tz})</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{formatCivilTZ(now, tz)}</div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Site</label>
            <div style={rowStyle}>
              <label><input type="radio" name="site" checked={site==='clinic'} onChange={()=>setSite('clinic')} /> Clinic</label>
              <label><input type="radio" name="site" checked={site==='remote'} onChange={()=>setSite('remote')} /> Remote</label>
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Events</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {allEvents.map((name) => (
                <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={events.includes(name)} onChange={() => toggleEvent(name)} /> {name}
                </label>
              ))}
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc' }} placeholder="Optional notes" />
          </div>

          <div style={{ ...rowStyle, justifyContent: 'space-between', marginTop: 8, marginBottom: 16 }}>
            <button onClick={clickStart} style={{ ...btnStyle, background: activeEntry ? '#1976d2' : '#2e7d32', color: 'white' }}>Start</button>
            <button onClick={clickStop} style={{ ...btnStyle, background: '#d32f2f', color: 'white' }}>Stop</button>
            <ManualEntryButton onCreated={refreshEntries} defaultSite={site} defaultEvents={events} />
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
      {error && <div style={{ color: 'crimson', marginTop: 12 }}>{error}</div>}
    </div>
  )
}

function Header(props: { user: User | null, onLogout: ()=>void, onLogin: (e:string,p:string)=>void, onRegister:(e:string,p:string)=>void, onUpdateTz:(tz:string)=>void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tz, setTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const tzList = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') as string[] : [tz]

  useEffect(() => { if (props.user?.tz) setTz(props.user.tz) }, [props.user])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'white', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        <button aria-label="menu" onClick={()=>setOpen(o=>!o)} style={{ ...btnStyle, background: '#eee', minWidth: 48 }}>☰</button>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Tracker</div>
        <div style={{ marginLeft: 'auto', fontSize: 13 }}>{props.user ? props.user.email : 'Guest'}</div>
      </div>
      {open && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          {!props.user ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Login / Register</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8 }} />
              <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type="password" style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={()=>props.onLogin(email,password)} style={{ ...btnStyle, background: '#1976d2', color: 'white' }}>Login</button>
                <button onClick={()=>props.onRegister(email,password)} style={{ ...btnStyle, background: '#455a64', color: 'white' }}>Register</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>User Settings</div>
              <label style={{ display:'block', fontSize: 12, color: '#555' }}>Time Zone</label>
              <select value={tz} onChange={e=>setTz(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, marginBottom: 8 }}>
                {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <div style={{ display:'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={()=>props.onUpdateTz(tz)} style={{ ...btnStyle, background: '#2e7d32', color: 'white' }}>Save</button>
                <button onClick={props.onLogout} style={{ ...btnStyle, background: '#d32f2f', color: 'white' }}>Logout</button>
              </div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>Navigation</div>
              <div style={{ color: '#666', fontSize: 14 }}>Time Entry (current)</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ManualEntryButton(props: { onCreated: ()=>Promise<void>, defaultSite: Site, defaultEvents: string[] }) {
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState<Site>(props.defaultSite)
  const [events, setEvents] = useState<string[]>(props.defaultEvents)
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState<string>('') // YYYY-MM-DD
  const [startTime, setStartTime] = useState<string>('') // HH:MM
  const [stopDate, setStopDate] = useState<string>('')
  const [stopTime, setStopTime] = useState<string>('')

  function toIso(date: string, time: string): string | null {
    if (!date || !time) return null
    const iso = new Date(`${date}T${time}:00Z`).toISOString()
    return iso
  }

  async function submitManual() {
    const s = toIso(startDate, startTime)
    const e = toIso(stopDate || startDate, stopTime)
    if (!s || !e) return alert('Please fill start and stop date/time')
    try {
      await api.manual(site, events, s, e, notes)
      setOpen(false)
      await props.onCreated()
    } catch (err:any) {
      alert(err?.data?.error || 'Create failed')
    }
  }

  return (
    <>
      <button onClick={()=>setOpen(true)} style={{ ...btnStyle, background: '#546e7a', color: 'white' }}>New</button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 16, width: '100%', maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700 }}>New Entry</div>
              <button onClick={()=>setOpen(false)} style={{ ...btnStyle, background: '#eee', minWidth: 48 }}>✕</button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Site</div>
              <label><input type="radio" name="m-site" checked={site==='clinic'} onChange={()=>setSite('clinic')} /> Clinic</label>
              <label style={{ marginLeft: 12 }}><input type="radio" name="m-site" checked={site==='remote'} onChange={()=>setSite('remote')} /> Remote</label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Notes</div>
              <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ccc' }} placeholder="Optional notes" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <div>
                <label>Start Date</label>
                <input type="date" value={startDate} onChange={e=>{ setStartDate(e.target.value); if(!stopDate) setStopDate(e.target.value) }} style={{ width:'100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label>Start Time</label>
                <input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={{ width:'100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label>Stop Date</label>
                <input type="date" value={stopDate} onChange={e=>setStopDate(e.target.value)} style={{ width:'100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
              <div>
                <label>Stop Time</label>
                <input type="time" value={stopTime} onChange={e=>setStopTime(e.target.value)} style={{ width:'100%', padding: 8, borderRadius: 6, border: '1px solid #ccc' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={()=>setOpen(false)} style={{ ...btnStyle, background: '#eee' }}>Cancel</button>
              <button onClick={submitManual} style={{ ...btnStyle, background: '#2e7d32', color: 'white' }}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App

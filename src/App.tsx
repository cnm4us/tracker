import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { api, formatCivilPartsTZ, formatDayMonTZ, formatDuration, ymdInTZ } from './api'
import type { Entry, User } from './api'
import sound from './sound'
import { dateForDisplay as timeDateForDisplay, durationMinutes as timeDurationMinutes, weekStartSunday, weekEndSaturday, formatMMDD, normalizeYMD, localDateTimeToUTCISO, addDaysYMD, toHHMMInTZ } from './time'

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
  const [view, setView] = useState<'time' | 'settings' | 'login' | 'register' | 'new' | 'edit' | 'search'>('login')
  const [returnView, setReturnView] = useState<'time'|'search'|null>(null)
  type SearchState = { begin: string; end: string; site: 'all'|'clinic'|'remote'; events: string[]; results: Entry[]; scrollY?: number; highlightId?: number }
  // Leave initial search dates empty so Log Search can apply user "Log Search Defaults"
  const [searchState, setSearchState] = useState<SearchState>({ begin: '', end: '', site: 'all', events: [], results: [] })
  const [editing, setEditing] = useState<Entry | null>(null)

  const [site, setSite] = useState<Site>('clinic')
  const [events, setEvents] = useState<string[]>([])
  const [allEvents, setAllEvents] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [notesRows, setNotesRows] = useState(2)

  const [entries, setEntries] = useState<Entry[]>([])
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null)
  const [stopping, setStopping] = useState(false)
  const [totalsEntries, setTotalsEntries] = useState<Entry[]>([])

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
      try { await refreshTotals() } catch {}
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refreshEntries() {
    try {
      const { entries } = await api.list(1000)
      setEntries(entries)
      const active = entries.find(e => e.start_iso && !e.stop_iso)
      setActiveEntry(active || null)
    } catch (e: any) {
      // ignore when unauthenticated
    }
  }

  async function refreshTotals() {
    try {
      const { entries } = await api.list(1000)
      setTotalsEntries(entries)
    } catch {}
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
      await refreshTotals()
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
      await refreshTotals()
    } catch (e: any) {
      alert(e?.data?.error || 'Stop failed')
    } finally {
      setStopping(false)
    }
  }

  const tz = user?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  // const toTZ = (iso: string) => new Date(iso)

  // Totals for header (YTD/MTD/WTD/Today) when viewing Timed Entry
  const todayYMD = ymdInTZ(now, tz)
  const year = todayYMD.slice(0, 4)
  const month = todayYMD.slice(5, 7)
  const ytdStart = `${year}-01-01`
  const mtdStart = `${year}-${month}-01`
  const wtdStart = weekStartSunday(todayYMD)
  const totalsAgg = useMemo(() => {
    let ytd = 0, mtd = 0, wtd = 0, tdy = 0
    for (const e of totalsEntries) {
      let ymd = normalizeYMD((e as any).start_local_date, tz)
      if (!ymd && e.start_iso) ymd = ymdInTZ(new Date(e.start_iso), tz)
      if (!ymd) continue
      const mins = timeDurationMinutes(e.start_iso, e.stop_iso, e.duration_min) || 0
      if (!mins) continue
      if (ymd >= ytdStart && ymd <= todayYMD) ytd += mins
      if (ymd >= mtdStart && ymd <= todayYMD) mtd += mins
      if (ymd >= wtdStart && ymd <= todayYMD) wtd += mins
      if (ymd === todayYMD) tdy += mins
    }
    return { ytd, mtd, wtd, tdy }
  }, [totalsEntries, tz, todayYMD, ytdStart, mtdStart, wtdStart])

  // Filter recent logs for Timed Entry per user setting
  const filteredEntriesTimed = useMemo(() => {
    const tzLocal = tz
    const scope = (user?.recent_logs_scope || 'wtd_prev') as 'wtd'|'wtd_prev'|'mtd'|'mtd_prev'
    const weekStart = (ymd: string) => weekStartSunday(ymd)
    const weekEnd = (ymd: string) => weekEndSaturday(ymd)
    const firstOfMonth = (ymd: string) => ymd.slice(0,8) + '01'
    const prevMonthFirst = (ymd: string): string => {
      const y = parseInt(ymd.slice(0,4),10)
      const m = parseInt(ymd.slice(5,7),10)
      const d = new Date(Date.UTC(y, m-1, 1))
      d.setUTCMonth(d.getUTCMonth()-1)
      const yy = d.getUTCFullYear()
      const mm = String(d.getUTCMonth()+1).padStart(2,'0')
      return `${yy}-${mm}-01`
    }
    const begin = scope === 'wtd' ? weekStart(todayYMD)
      : scope === 'wtd_prev' ? addDaysYMD(weekStart(todayYMD), -7)
      : scope === 'mtd' ? firstOfMonth(todayYMD)
      : /* mtd_prev */ prevMonthFirst(todayYMD)
    const end = scope.startsWith('wtd') ? weekEnd(todayYMD) : todayYMD
    const toYMD = (ent: Entry) => normalizeYMD((ent as any).start_local_date, tzLocal) || (ent.start_iso ? ymdInTZ(new Date(ent.start_iso), tzLocal) : '')
    const isActive = (ent: Entry) => !!(ent.start_iso && !ent.stop_iso)
    const list = entries.filter((ent) => {
      const ymd = toYMD(ent)
      if (!ymd) return false
      if (isActive(ent)) return true
      if (ymd > todayYMD) return true // include future-dated entries
      return (ymd >= begin && ymd <= end)
    })
    return list
  }, [entries, user?.recent_logs_scope, tz, todayYMD])

  const hasMultipleWeeksTimed = useMemo(() => {
    const tzLocal = tz
    const toYMD = (ent: Entry) => normalizeYMD((ent as any).start_local_date, tzLocal) || (ent.start_iso ? ymdInTZ(new Date(ent.start_iso), tzLocal) : '')
    const set = new Set<string>()
    for (const ent of filteredEntriesTimed) { const y = toYMD(ent); if (y) set.add(weekStartSunday(y)) }
    return set.size > 1
  }, [filteredEntriesTimed, tz])

  let prevWeekForRender: string | null = null

  // Sort within the filtered set to ensure:
  // - Primary key: local date desc
  // - Then timed entries before manual entries for same date
  // - Timed: start time desc
  // - Manual: duration desc, then created_at desc
  const sortedEntriesTimed = useMemo(() => {
    const tzLocal = tz
    const ymdOf = (e: Entry) => normalizeYMD((e as any).start_local_date, tzLocal) || (e.start_iso ? ymdInTZ(new Date(e.start_iso), tzLocal) : '')
    return [...filteredEntriesTimed].sort((a, b) => {
      const ya = ymdOf(a)
      const yb = ymdOf(b)
      if (ya !== yb) return ya > yb ? -1 : 1
      const timedA = !!a.start_iso
      const timedB = !!b.start_iso
      if (timedA !== timedB) return timedA ? -1 : 1
      if (timedA && timedB) {
        const ta = a.start_iso ? Date.parse(a.start_iso) : 0
        const tb = b.start_iso ? Date.parse(b.start_iso) : 0
        return tb - ta
      }
      const da = (a.duration_min ?? 0)
      const db = (b.duration_min ?? 0)
      if (da !== db) return db - da
      const ca = (a as any).created_at ? Date.parse((a as any).created_at as any) : 0
      const cb = (b as any).created_at ? Date.parse((b as any).created_at as any) : 0
      return cb - ca
    })
  }, [filteredEntriesTimed, tz])

  const isAuthView = !user && (view === 'login' || view === 'register')

  // Global scroll policy: always start at top on view change,
  // except when returning to Log Search where we restore prior scroll.
  useEffect(() => {
    // If navigating to search and we have a saved scrollY, let LogSearchScreen restore it.
    if (view === 'search' && (searchState.scrollY != null)) return
    try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch {}
  }, [view])

  if (loading) return <div style={containerStyle}>Loading…</div>
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
          onSave={async (tz, scope, searchRange) => {
            await api.updateMe({ tz, recent_logs_scope: scope, search_default_range: searchRange })
            setUser(u => (u ? { ...u, tz, recent_logs_scope: scope, search_default_range: searchRange } as any : u))
            // Clear Log Search dates so next visit uses the new defaults immediately
            setSearchState(s => ({ ...s, begin: '', end: '', results: [] }))
            setView('time')
          }}
        />
      ) : view === 'new' ? (
        <NewEntryScreen
          defaultSite={site}
          defaultEvents={events}
          allEvents={allEvents}
          tz={tz}
          onCancel={() => setView('time')}
          onCreated={async () => { await refreshEntries(); await refreshTotals(); setView('time') }}
        />
      ) : view === 'edit' && editing ? (
        <NewEntryScreen
          mode="edit"
          entry={editing}
          defaultSite={(editing.site as any) || site}
          defaultEvents={events}
          allEvents={allEvents}
          tz={tz}
          onCancel={() => { const rv = returnView || 'time'; setEditing(null); setView(rv); setReturnView(null) }}
          onCreated={async () => {
            await refreshEntries()
            await refreshTotals()
            // If we came from search, refresh that result row in-place
            if (returnView === 'search' && editing?.id) {
              try {
                const { entry } = await api.getEntry(editing.id)
                setSearchState((s) => ({ ...s, results: s.results.map(r => r.id === entry.id ? entry : r) }))
              } catch {}
            }
            const rv = returnView || 'time'
            setEditing(null)
            setView(rv)
            setReturnView(null)
          }}
        />
      ) : view === 'search' ? (
        <LogSearchScreen
          allEvents={allEvents}
          tz={tz}
          user={user}
          initialState={searchState}
          onStateChange={(st)=>setSearchState(st)}
          onOpenEntry={(entry)=>{ try { setSearchState(s=>({ ...s, scrollY: window.scrollY, highlightId: entry.id })) } catch {}; setReturnView('search'); setEditing(entry); setView('edit') }}
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

          <div className="logsWide">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, opacity: 0.25, margin: '16px 0 8px' }}>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Y: {formatDuration(totalsAgg.ytd)}</div>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>M: {formatDuration(totalsAgg.mtd)}</div>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>W: {formatDuration(totalsAgg.wtd)}</div>
              <div style={{ marginLeft: 'auto', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDuration(totalsAgg.tdy)}</div>
            </div>
            {sortedEntriesTimed.map((e) => {
                const dateForDisplay = timeDateForDisplay(e.start_iso, (e as any).start_local_date)
                const start = e.start_iso ? new Date(e.start_iso) : null
                const stop = e.stop_iso ? new Date(e.stop_iso) : null
                const isActiveRow = !!(start && !stop)
                const dur = timeDurationMinutes(e.start_iso, e.stop_iso, e.duration_min)
                const ymd = normalizeYMD((e as any).start_local_date, tz) || (e.start_iso ? ymdInTZ(new Date(e.start_iso), tz) : '') || ''
                const ws = ymd ? weekStartSunday(ymd) : ''
                const strongTop = hasMultipleWeeksTimed && prevWeekForRender && ws && ws !== prevWeekForRender
                prevWeekForRender = ws || prevWeekForRender
                return (
                <div key={e.id} className="logsRow" style={{ padding: '8px 0', borderBottom: '1px solid rgba(238,238,238,0.5)', borderTop: strongTop ? '1px solid rgba(238,238,238,1)' : undefined }}>
                  <div className="cellDay" style={{ cursor: 'pointer', textDecoration: 'none', color: '#ffb616' }} onClick={()=>{ setReturnView('time'); setEditing(e); setView('edit') }}>{formatDayMonTZ(dateForDisplay, tz)}</div>
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

function Header(props: { user: User | null, view: 'time'|'settings'|'login'|'register'|'new'|'edit'|'search', onNavigate: (v:'time'|'settings'|'login'|'register'|'new'|'edit'|'search')=>void, onLogout: ()=>void }) {
  const [open, setOpen] = useState(false)
  const title =
    props.view === 'settings' ? 'Settings'
    : props.view === 'new' ? 'Manual Entry'
    : props.view === 'edit' ? 'Edit Entry'
    : props.view === 'time' ? 'Timed Entry'
    : props.view === 'search' ? 'Log Search'
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
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('login'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#0d47a1' }}
                >
                  Login
                </button>
                <button
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('register'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#0d47a1' }}
                >
                  Register
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('time'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#0d47a1' }}
                >
                  Timed Entry
                </button>
                <button
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('new'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#0d47a1' }}
                >
                  Manual Entry
                </button>
                <button
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('search'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#0d47a1' }}
                >
                  Log Search
                </button>
                <button
                  onClick={async()=>{ await sound.enable(); sound.playNew(); props.onNavigate('settings'); setOpen(false) }}
                  className="btn3d btn-glass"
                  style={{ ...btnStyle, color: '#fff', width: '100%', textAlign: 'left', ['--btn-color' as any]: '#0d47a1' }}
                >
                  User Settings
                </button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={async()=>{ await sound.enable(); sound.playStop(); props.onLogout(); setOpen(false) }}
                  className="btn3d btn-glass"
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

function SettingsScreen(props: { user: User, onSave: (tz:string, recentScope: 'wtd'|'wtd_prev'|'mtd'|'mtd_prev', searchRange: 'wtd'|'wtd_prev'|'prev_week'|'all_weeks'|'mtd'|'mtd_prev'|'prev_month'|'all_months'|'all_records')=>Promise<void> }) {
  const [tz, setTz] = useState<string>(props.user.tz || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [recentScope, setRecentScope] = useState<'wtd'|'wtd_prev'|'mtd'|'mtd_prev'>(props.user.recent_logs_scope || 'wtd_prev')
  const [searchRange, setSearchRange] = useState<'wtd'|'wtd_prev'|'prev_week'|'all_weeks'|'mtd'|'mtd_prev'|'prev_month'|'all_months'|'all_records'>(props.user.search_default_range || 'wtd_prev')
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

      <div style={{ margin: '12px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Recent Logs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <label><input type="radio" name="recent_scope" checked={recentScope==='wtd'} onChange={()=>setRecentScope('wtd')} /> WTD: Current Week Only</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='wtd_prev'} onChange={()=>setRecentScope('wtd_prev')} /> WTD and Previous Week</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='mtd'} onChange={()=>setRecentScope('mtd')} /> MTD: Current Month Only</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='mtd_prev'} onChange={()=>setRecentScope('mtd_prev')} /> MTD and Previous Month</label>
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Log Search Defaults</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <label><input type="radio" name="search_range" checked={searchRange==='wtd'} onChange={()=>setSearchRange('wtd')} /> WTD: Current Week Only</label>
          <label><input type="radio" name="search_range" checked={searchRange==='wtd_prev'} onChange={()=>setSearchRange('wtd_prev')} /> WTD and Previous Completed Week</label>
          <label><input type="radio" name="search_range" checked={searchRange==='prev_week'} onChange={()=>setSearchRange('prev_week')} /> Previous Completed Week</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_weeks'} onChange={()=>setSearchRange('all_weeks')} /> All Completed Weeks</label>
          <label><input type="radio" name="search_range" checked={searchRange==='mtd'} onChange={()=>setSearchRange('mtd')} /> MTD: Current Month Only</label>
          <label><input type="radio" name="search_range" checked={searchRange==='mtd_prev'} onChange={()=>setSearchRange('mtd_prev')} /> MTD and Previous Completed Month</label>
          <label><input type="radio" name="search_range" checked={searchRange==='prev_month'} onChange={()=>setSearchRange('prev_month')} /> Previous Completed Month</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_months'} onChange={()=>setSearchRange('all_months')} /> All Completed Months</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_records'} onChange={()=>setSearchRange('all_records')} /> All Records</label>
        </div>
      </div>
      <button
        disabled={saving}
        onClick={async()=>{ setSaving(true); try { await sound.enable(); sound.playStart(); await props.onSave(tz, recentScope, searchRange) } finally { setSaving(false) } }}
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
  // Ensure form starts at top of the viewport when opened from deep scroll (e.g., Log Search)
  useEffect(() => { try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch {} }, [])
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
  const [startDate, setStartDate] = useState<string>(() => {
    const sd = toYMD(props.entry?.start_local_date)
    if (sd) return sd
    // For Manual Entry (New), default Date to today in user's TZ
    return props.mode === 'edit' ? '' : ymdInTZ(new Date(), tz)
  })
  const [startTime, setStartTime] = useState<string>(toHHMMInTZ(props.entry?.start_iso))
  const [stopDate, setStopDate] = useState<string>('')
  const [stopTime, setStopTime] = useState<string>(toHHMMInTZ(props.entry?.stop_iso))
  const [durH, setDurH] = useState<string>('')
  const [durM, setDurM] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [noteRows, setNoteRows] = useState(2)
  const initialMode: 'times'|'duration' = props.mode === 'edit'
    ? ((props.entry?.start_iso || props.entry?.stop_iso) ? 'times' : 'duration')
    : 'duration'
  const [editMode, setEditMode] = useState<'times'|'duration'>(initialMode)

  // Prefill duration when appropriate
  useEffect(() => {
    const hasDuration = props.entry && props.entry.duration_min != null
    const hasTimes = !!(props.entry?.start_iso || props.entry?.stop_iso)
    // In edit mode, only prefill duration if the entry has no explicit start/stop times (duration-only entries)
    // In new mode, prefill if duration is present
    if (hasDuration && (props.mode !== 'edit' || !hasTimes)) {
      const d = props.entry!.duration_min as number
      const hh = Math.floor(d / 60)
      const mm = d % 60
      setDurH(hh > 0 ? String(hh) : '')
      setDurM(mm > 0 ? String(mm) : '')
    } else {
      // Ensure duration fields are cleared when switching to time-based edit entries
      setDurH('')
      setDurM('')
    }
  }, [props.entry, props.mode])

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
    // Centralized conversion; currently device tz based
    return localDateTimeToUTCISO(date, time, tz)
  }

  // Derive stop time when in duration mode and start/duration provided; assume stop date = start date
  useEffect(() => {
    if (editMode !== 'duration') return
    if (!startDate || !startTime) return
    const h = parseInt(durH || '0', 10)
    const m = parseInt(durM || '0', 10)
    if (isNaN(h) && isNaN(m)) return
    const base = new Date(`${startDate}T${startTime}:00`)
    if (Number.isFinite(h)) base.setHours(base.getHours() + (h || 0))
    if (Number.isFinite(m)) base.setMinutes(base.getMinutes() + (m || 0))
    const hh = String(base.getUTCHours()).padStart(2, '0')
    const mm = String(base.getUTCMinutes()).padStart(2, '0')
    setStopDate(startDate)
    setStopTime(`${hh}:${mm}`)
  }, [editMode, startDate, startTime, durH, durM])

  async function submitManual() {
    if (editMode === 'duration') {
      // Duration-only branch: requires start date and hours/minutes; start time optional
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
    if (editMode === 'times') {
      try {
        const ds = new Date(s)
        const de = new Date(e)
        if (!(ds instanceof Date) || isNaN(ds.getTime()) || !(de instanceof Date) || isNaN(de.getTime())) {
          // continue; server will validate
        } else if (de <= ds) {
          return alert('Stop time must be after start time')
        }
      } catch {}
    }
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

      {/* Mode toggle under Notes */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <span
          onClick={()=>setEditMode('times')}
          style={{
            cursor: 'pointer',
            fontWeight: 400,
            color: '#fff',
            background: editMode==='times' ? '#000' : 'transparent',
            border: editMode==='times' ? '1px solid #fff' : '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            padding: '6px 17px',
            display: 'inline-block',
          }}
        >
          Start/Stop Time
        </span>
        <span
          onClick={()=>setEditMode('duration')}
          style={{
            cursor: 'pointer',
            fontWeight: 400,
            color: '#fff',
            background: editMode==='duration' ? '#000' : 'transparent',
            border: editMode==='duration' ? '1px solid #fff' : '1px solid rgba(255,255,255,0.35)',
            borderRadius: 8,
            padding: '6px 17px',
            display: 'inline-block',
          }}
        >
          Total Time
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e=>{ setStartDate(e.target.value); if(!stopDate) setStopDate(e.target.value) }}
            className="pickField"
            style={{ width:'80%', maxWidth:'100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', boxSizing: 'border-box', fontSize: 18, color: '#ffb616' }}
          />
        </div>
        <div style={{ minWidth: 0, display: editMode==='duration' ? 'none' : 'block' }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16, textAlign: 'right' }}>Start Time</label>
          <input
            type="time"
            value={startTime}
            onChange={e=>setStartTime(e.target.value)}
            className="timeField"
            style={{ width:'80%', maxWidth:'100%', padding: '0 8px', lineHeight: '44px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', boxSizing: 'border-box', fontSize: 18, height: 44, display: 'block', marginLeft: 'auto', WebkitAppearance: 'none' as any, color: '#ffb616' }}
          />
        </div>
        <div style={{ minWidth: 0, display: editMode==='times' ? 'none' : 'block' }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16, textAlign: 'right' }}>Total Time</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '80%', marginLeft: 'auto', justifyContent: 'space-between' }}>
            <select value={durH} onChange={(e)=>setDurH(e.target.value)} className="pickField" style={{ width: '48%', flex: '0 0 48%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', fontSize: 18, color: '#ffb616' }}>
              <option value="" disabled hidden>hh</option>
              {[...Array(8)].map((_,i)=>(<option key={i+1} value={String(i+1)}>{i+1}</option>))}
            </select>
            <select value={durM} onChange={(e)=>setDurM(e.target.value)} className="pickField" style={{ width: '48%', flex: '0 0 48%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', fontSize: 18, color: '#ffb616' }}>
              <option value="" disabled hidden>mm</option>
              {[15,30,45].map((v)=>(<option key={v} value={String(v)}>{v}</option>))}
            </select>
          </div>
        </div>
        <div style={{ minWidth: 0, display: editMode==='duration' ? 'none' : 'block', gridColumn: '2 / 3' }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16, textAlign: 'right' }}>Stop Time</label>
          <input
            type="time"
            value={stopTime}
            onChange={e=>setStopTime(e.target.value)}
            readOnly={editMode==='duration'}
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

type SearchState = { begin: string; end: string; site: 'all'|'clinic'|'remote'; events: string[]; results: Entry[]; scrollY?: number; highlightId?: number }
function LogSearchScreen(props: { allEvents: string[], tz?: string, user?: User | null, initialState?: SearchState, onStateChange?: (st: SearchState)=>void, onOpenEntry: (e: Entry)=>void }) {
  const tz = props.tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  const [begin, setBegin] = useState<string>(props.initialState?.begin || '')
  const [end, setEnd] = useState<string>(props.initialState?.end || '')
  const [site, setSite] = useState<'all'|'clinic'|'remote'>(props.initialState?.site || 'all')
  const [events, setEvents] = useState<string[]>(props.initialState?.events || [])
  const [results, setResults] = useState<Entry[]>(props.initialState?.results || [])
  const [loading, setLoading] = useState(false)
  const [showTotals, setShowTotals] = useState<boolean>(() => {
    try { const v = localStorage.getItem('show_weekly_totals'); return v === null ? true : v !== '0' } catch { return true }
  })

  // Initialize default dates from user setting if not provided
  useEffect(() => {
    if (!begin && !end) {
      (async () => {
        const today = ymdInTZ(new Date(), tz)
        const ws = weekStartSunday(today)
        const firstOfMonth = (ymd: string) => ymd.slice(0,8) + '01'
        const lastOfPrevMonth = (ymd: string): string => {
          const y = parseInt(ymd.slice(0,4),10)
          const m = parseInt(ymd.slice(5,7),10)
          const d = new Date(Date.UTC(y, m-1, 1))
          d.setUTCDate(0) // last day of previous month
          const yy = d.getUTCFullYear()
          const mm = String(d.getUTCMonth()+1).padStart(2,'0')
          const dd = String(d.getUTCDate()).padStart(2,'0')
          return `${yy}-${mm}-${dd}`
        }
        const prevWeekBegin = addDaysYMD(ws, -7)
        const prevWeekEnd = addDaysYMD(ws, -1)
        const range = props.user?.search_default_range || 'wtd_prev'
        let b = ''
        let e = ''
        switch (range) {
          case 'wtd':
            b = ws; e = today; break
          case 'wtd_prev':
            b = prevWeekBegin; e = today; break
          case 'prev_week':
            b = prevWeekBegin; e = prevWeekEnd; break
          case 'all_weeks':
            e = prevWeekEnd; break
          case 'mtd':
            b = firstOfMonth(today); e = today; break
          case 'mtd_prev':
            {
              const firstPrev = firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
              b = firstPrev; e = today
            }
            break
          case 'prev_month':
            {
              const firstPrev = firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
              const lastPrev = lastOfPrevMonth(today)
              b = firstPrev; e = lastPrev
            }
            break
          case 'all_months':
            {
              const lastPrev = lastOfPrevMonth(today)
              e = lastPrev
            }
            break
          case 'all_records':
          default:
            b = ''; e = ''
        }

        // For "all_weeks" and "all_months", compute the earliest entry date to populate begin
        if ((range === 'all_weeks' || range === 'all_months') && !b) {
          try {
            const { entries } = await api.list(1000)
            let minY: string | null = null
            for (const r of entries) {
              const y = normalizeYMD((r as any).start_local_date, tz) || (r.start_iso ? ymdInTZ(new Date(r.start_iso), tz) : '')
              if (!y) continue
              if (!minY || y < minY) minY = y
            }
            if (minY) {
              b = range === 'all_weeks' ? weekStartSunday(minY) : (minY.slice(0,8) + '01')
            }
          } catch {}
          if (!b) {
            // Fallback: use previous completed window start if no entries or error
            b = range === 'all_weeks' ? prevWeekBegin : firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
          }
        }

        // For "all_records", populate both begin and end from record set
        if (range === 'all_records') {
          try {
            const { entries } = await api.list(1000)
            let minY: string | null = null
            let maxY: string | null = null
            for (const r of entries) {
              const y = normalizeYMD((r as any).start_local_date, tz) || (r.start_iso ? ymdInTZ(new Date(r.start_iso), tz) : '')
              if (!y) continue
              if (!minY || y < minY) minY = y
              if (!maxY || y > maxY) maxY = y
            }
            if (minY) b = minY
            if (maxY) e = maxY
          } catch {}
        }

        setBegin(b)
        setEnd(e)
      })()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleEvent(name: string) {
    setEvents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toYMDInTZ(iso?: string | null): string | null {
    if (!iso) return null
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    const y = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: tz }).format(d)
    const m = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone: tz }).format(d)
    const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: tz }).format(d)
    return `${y}-${m}-${day}`
  }

  function withinRange(e: Entry): boolean {
    const ymd = normalizeYMD(e.start_local_date, tz) || toYMDInTZ(e.start_iso) || ''
    if (!ymd) return false
    if (begin && ymd < begin) return false
    if (end) {
      const endNext = addDaysYMD(end, 1)
      if (ymd >= endNext) return false
    }
    return true
  }

  function matchesSite(e: Entry): boolean {
    if (site === 'all') return true
    return (e.site as any) === site
  }

  function matchesEvents(e: Entry): boolean {
    if (!events.length) return true
    if (!e.events || !Array.isArray(e.events)) return false // strict: require event data when filtering
    const selected = new Set(events.map(v => v.trim().toLowerCase()))
    return e.events.some(ev => selected.has(String(ev).trim().toLowerCase()))
  }

  async function onSearch() {
    setLoading(true)
    try {
      const { entries } = await api.list(1000)
      // First pass: filter by date and site only
      const base = entries.filter(e => withinRange(e) && matchesSite(e))
      // If no event filters, we are done
      if (!events.length) {
        setResults(base)
        props.onStateChange?.({ begin, end, site, events, results: base })
        return
      }
      // Hydrate events for accurate event filtering
      const ids = base.map(e => e.id)
      const concurrency = 8
      const detailed: Entry[] = []
      let i = 0
      while (i < ids.length) {
        const slice = ids.slice(i, i + concurrency)
        const chunk = await Promise.all(slice.map(async (id) => {
          try { const { entry } = await api.getEntry(id); return entry as Entry } catch { return null }
        }))
        for (const ent of chunk) if (ent) detailed.push(ent)
        i += concurrency
      }
      const byEvents = detailed.filter(matchesEvents)
      setResults(byEvents)
      props.onStateChange?.({ begin, end, site, events, results: byEvents })
    } finally {
      setLoading(false)
    }
  }

  function csvEscape(val: any): string {
    const s = val == null ? '' : String(val)
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  async function downloadCsv() {
    // If there are no search results at all, show a helpful message
    if (!results.length) {
      try { alert('No records to export'); } catch {}
      return
    }
    // Ensure events are hydrated for all rows
    let rows: Entry[] = results
    if (rows.some(r => !Array.isArray(r.events))) {
      const ids = rows.map(r => r.id)
      const detailed: Entry[] = []
      const concurrency = 8
      for (let i = 0; i < ids.length; i += concurrency) {
        const slice = ids.slice(i, i + concurrency)
        const chunk = await Promise.all(slice.map(async (id) => { try { const { entry } = await api.getEntry(id); return entry as Entry } catch { return null } }))
        for (const ent of chunk) if (ent) detailed.push(ent)
      }
      rows = detailed
    }
    // Exclude active (no stop when start present)
    rows = rows.filter(r => !(r.start_iso && !r.stop_iso))

    // If nothing remains after filtering, let the user know
    if (!rows.length) {
      try { alert('No records to export'); } catch {}
      return
    }

    // Event columns from all active event types for stable headers
    const eventCols = [...props.allEvents].sort((a,b)=>a.localeCompare(b))

    const headers = [
      'User ID','User Email','Record ID','Site',
      ...eventCols,
      'Date Start','Time Start','Date End','Time End','Total Hours','Notes'
    ]
    const userId = props.user?.id ?? ''
    const userEmail = props.user?.email ?? ''
    const tzLocal = tz
    const lines: string[] = []
    lines.push(headers.join(','))
    for (const e of rows) {
      const ymdStart = normalizeYMD(e.start_local_date, tzLocal) || (e.start_iso ? ymdInTZ(new Date(e.start_iso), tzLocal) : '')
      const ymdEnd = e.stop_iso ? ymdInTZ(new Date(e.stop_iso), tzLocal) : (e.start_iso ? ymdInTZ(new Date(e.start_iso), tzLocal) : '')
      const hmStart = e.start_iso ? toHHMMInTZ(e.start_iso, tzLocal) : ''
      const hmEnd = e.stop_iso ? toHHMMInTZ(e.stop_iso, tzLocal) : ''
      const mins = typeof e.duration_min === 'number' ? e.duration_min : (e.start_iso && e.stop_iso ? Math.max(0, Math.round((+new Date(e.stop_iso) - +new Date(e.start_iso)) / 60000)) : 0)
      const hoursDec = (mins/60).toFixed(2)
      const evSet = new Set((e.events || []))
      const row = [
        userId,
        userEmail,
        e.id,
        e.site || '',
        ...eventCols.map(name => evSet.has(name) ? '1' : ''),
        ymdStart,
        hmStart,
        ymdEnd,
        hmEnd,
        hoursDec,
        e.notes || ''
      ]
      lines.push(row.map(csvEscape).join(','))
    }
    const csv = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const beginName = begin || ''
    const endName = end || ''
    a.href = url
    a.download = `time-tracker_${beginName || 'start'}_to_${endName || 'end'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    props.onStateChange?.({ begin, end, site, events, results })
  }, [begin, end, site, events])

  // Restore scroll position and flash the last-edited row when returning from Edit
  useEffect(() => {
    const sc = props.initialState?.scrollY
    const hid = props.initialState?.highlightId
    if ((sc != null && !isNaN(sc)) || (hid != null)) {
      // Wait a frame to ensure DOM is painted
      requestAnimationFrame(() => {
        if (typeof sc === 'number' && !isNaN(sc)) {
          try { window.scrollTo(0, sc) } catch {}
        }
        if (hid != null) {
          try {
            const el = document.querySelector(`[data-entry-id="${hid}"]`) as HTMLElement | null
            if (el) {
              el.classList.add('flash-highlight')
              setTimeout(() => { el.classList.remove('flash-highlight') }, 1200)
            }
          } catch {}
        }
        // Clear markers so it doesn't retrigger on subsequent renders
        props.onStateChange?.({ begin, end, site, events, results, scrollY: undefined, highlightId: undefined })
      })
    }
  }, [results])

  
  const displayRows = useMemo(() => {
    const rows: Array<{ type:'total'; wkStart:string; wkEnd:string; total:number } | { type:'entry'; entry: Entry }> = []
    if (!results.length) return rows
    const toYMD = (e: Entry) => normalizeYMD(e.start_local_date, tz) || toYMDInTZ(e.start_iso) || ''
    const dur = (e: Entry) => timeDurationMinutes(e.start_iso, e.stop_iso, e.duration_min) || 0
    const totals = new Map<string, { total:number; start:string; end:string }>()
    for (const e of results) {
      const ymd = toYMD(e); if (!ymd) continue
      const ws = weekStartSunday(ymd)
      const we = weekEndSaturday(ws)
      const cur = totals.get(ws) || { total: 0, start: ws, end: we }
      cur.total += dur(e)
      totals.set(ws, cur)
    }
    const seen = new Set<string>()
    for (const e of results) {
      const ymd = toYMD(e); const ws = ymd ? weekStartSunday(ymd) : ''
      if (showTotals && ws && !seen.has(ws)) { const t = totals.get(ws)!; rows.push({ type:'total', wkStart:t.start, wkEnd:t.end, total:t.total }); seen.add(ws) }
      rows.push({ type:'entry', entry: e })
    }
    if (showTotals) {
      let g = 0; let minY: string | null = null; let maxY: string | null = null
      for (const e of results) { const y = toYMD(e); if (y) { if (!minY || y < minY) minY = y; if (!maxY || y > maxY) maxY = y } g += dur(e) }
      if (minY && maxY) rows.push({ type:'total', wkStart:minY, wkEnd:maxY, total:g })
    }
    return rows
  }, [results, showTotals])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Beginning Date</label>
          <input type="date" value={begin} onChange={e=>setBegin(e.target.value)} className="pickField" style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', color: '#ffb616' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Ending Date</label>
          <input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="pickField" style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', color: '#ffb616' }} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <span style={{ fontWeight: 600, marginRight: 12 }}>Site:</span>
        <label style={{ marginRight: 12 }}><input type="radio" name="s" checked={site==='all'} onChange={()=>setSite('all')} /> All</label>
        <label style={{ marginRight: 12 }}><input type="radio" name="s" checked={site==='clinic'} onChange={()=>setSite('clinic')} /> Clinic</label>
        <label><input type="radio" name="s" checked={site==='remote'} onChange={()=>setSite('remote')} /> Remote</label>
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

      <button
        onClick={async()=>{ await sound.enable(); sound.playNew(); await onSearch() }}
        className="btn3d btn-glass"
        style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#2e7d32' }}
      >
        Search
      </button>

      <div style={{ marginTop: 16 }}>
        <div className="logsWide" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: '16px 0 8px' }}>Results</h3>
          <button
            onClick={async()=>{ await sound.enable(); sound.playNew(); await downloadCsv() }}
            className="btn3d btn-glass"
            style={{ ...btnStyle, color: '#fff', ['--btn-color' as any]: (results.length > 0 ? '#ffb616' : '#1976d2') }}
          >
            Download CSV
          </button>
        </div>
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input id="toggleTotals" type="checkbox" checked={showTotals} onChange={(e)=>{ setShowTotals(e.target.checked); try { localStorage.setItem('show_weekly_totals', e.target.checked ? '1' : '0') } catch {} }} />
          <label htmlFor="toggleTotals">Show weekly totals</label>
        </div>
        {loading ? (
          <div>Searching…</div>
        ) : results.length === 0 ? (
          <div>No results</div>
        ) : (
          <div className="logsWide">
            {displayRows.map((row, idx) => {
              if (row.type === 'total') {
                const isGrand = (showTotals && idx === displayRows.length - 1)
                const label = isGrand ? 'GRAND TOTAL' : 'WEEK TOTAL'
                return (
                  <div key={`tot-${row.wkStart}-${row.wkEnd}-${idx}`} className="logsRow total" style={{ padding: '8px 0' }}>
                    <div className="totalCell">
                      <div className="totalInner">
                        <div className="totalLeft">{label}</div>
                        <div className="totalCenter">{formatMMDD(row.wkStart)} - {formatMMDD(row.wkEnd)}</div>
                        <div className="totalRight">{formatDuration(row.total)}</div>
                      </div>
                    </div>
                  </div>
                )
              } else {
                const e = row.entry
                const dateForDisplay = timeDateForDisplay(e.start_iso, (e as any).start_local_date)
                const start = e.start_iso ? new Date(e.start_iso) : null
                const stop = e.stop_iso ? new Date(e.stop_iso) : null
                const dur2 = timeDurationMinutes(e.start_iso, e.stop_iso, e.duration_min)
                return (
                <div key={e.id} className="logsRow" data-entry-id={e.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(238,238,238,0.5)' }}>
                    <div className="cellDay" style={{ color: '#ffb616', cursor: 'pointer' }} onClick={()=>props.onOpenEntry(e)}>{formatDayMonTZ(dateForDisplay, tz)}</div>
                    <div className="cellNotes" title={e.notes || ''}>{e.notes || ''}</div>
                    <div className="cellStart">{start ? renderCivil(start, tz) : '—'}</div>
                    <div className="cellStop">{stop ? renderCivil(stop, tz) : '—'}</div>
                    <div className="cellTotal" style={{ fontVariantNumeric: 'tabular-nums' as any }}>{formatDuration(dur2 ?? null)}</div>
                  </div>
                )
              }
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default App

import { useEffect, useMemo, useState } from 'react'
import { api, formatDayMonTZ, formatDuration, ymdInTZ } from '../api'
import type { Entry, User } from '../api'
import { dateForDisplay as timeDateForDisplay, durationMinutes as timeDurationMinutes, weekStartSunday, weekEndSaturday, formatMMDD, normalizeYMD, addDaysYMD, toHHMMInTZ } from '../time'
import sound from '../sound'

const btnStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 16,
  minWidth: 96,
}

type SearchState = { begin: string; end: string; site: 'all'|'clinic'|'remote'; events: string[]; results: Entry[]; scrollY?: number; highlightId?: number }

export default function LogSearchScreen(props: { allEvents: string[], tz?: string, user?: User | null, initialState?: SearchState, onStateChange?: (st: SearchState)=>void, onOpenEntry: (e: Entry)=>void }) {
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
          d.setUTCDate(0)
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
          case 'wtd': b = ws; e = today; break
          case 'wtd_prev': b = prevWeekBegin; e = today; break
          case 'prev_week': b = prevWeekBegin; e = prevWeekEnd; break
          case 'all_weeks': e = prevWeekEnd; break
          case 'mtd': b = firstOfMonth(today); e = today; break
          case 'mtd_prev': {
            const firstPrev = firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
            b = firstPrev; e = today
          } break
          case 'prev_month': {
            const firstPrev = firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
            const lastPrev = lastOfPrevMonth(today)
            b = firstPrev; e = lastPrev
          } break
          case 'all_months': {
            const lastPrev = lastOfPrevMonth(today)
            e = lastPrev
          } break
          case 'all_records':
          default:
            b = ''; e = ''
        }

        if ((range === 'all_weeks' || range === 'all_months') && !b) {
          try {
            const { entries } = await api.list(1000)
            let minY: string | null = null
            for (const r of entries) {
              const y = normalizeYMD((r as any).start_local_date, tz) || (r.start_iso ? ymdInTZ(new Date(r.start_iso), tz) : '')
              if (!y) continue
              if (!minY || y < minY) minY = y
            }
            if (minY) b = range === 'all_weeks' ? weekStartSunday(minY) : (minY.slice(0,8) + '01')
          } catch {}
          if (!b) b = range === 'all_weeks' ? prevWeekBegin : firstOfMonth(addDaysYMD(firstOfMonth(today), -1))
        }

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
    if (!e.events || !Array.isArray(e.events)) return false
    const selected = new Set(events.map(v => v.trim().toLowerCase()))
    return e.events.some(ev => selected.has(String(ev).trim().toLowerCase()))
  }

  async function onSearch() {
    setLoading(true)
    try {
      const { entries } = await api.list(1000)
      const base = entries.filter(e => withinRange(e) && matchesSite(e))
      if (!events.length) {
        setResults(base)
        props.onStateChange?.({ begin, end, site, events, results: base })
        return
      }
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
    if (!results.length) { try { alert('No records to export'); } catch {}; return }
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
    rows = rows.filter(r => !(r.start_iso && !r.stop_iso))
    const eventCols = [...props.allEvents].sort((a,b)=>a.localeCompare(b))
    const headers = [
      'User ID','User Email','Record ID','Site',
      ...eventCols,
      'Events',
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
      const evArr = Array.isArray(e.events) ? (e.events as string[]) : []
      const evSet = new Set(evArr)
      const eventsJoined = evArr.join(', ')
      const row = [
        userId,
        userEmail,
        e.id,
        e.site || '',
        ...eventCols.map(name => evSet.has(name) ? '1' : ''),
        eventsJoined,
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

  useEffect(() => { props.onStateChange?.({ begin, end, site, events, results }) }, [begin, end, site, events])

  // Restore scroll position and flash the last-edited row when returning from Edit
  useEffect(() => {
    const sc = props.initialState?.scrollY
    const hid = props.initialState?.highlightId
    if ((sc != null && !isNaN(sc)) || (hid != null)) {
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

function renderCivil(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { hour12: true, hour: 'numeric', minute: '2-digit', timeZone: tz })
  const parts = fmt.formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value || '0'
  const m = parts.find(p => p.type === 'minute')?.value || '00'
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM'
  const period = /am/i.test(dayPeriod) ? 'am' : 'pm'
  return (<><span>{`${h}:${m}`} </span><span className="ampm">{period}</span></>)
}


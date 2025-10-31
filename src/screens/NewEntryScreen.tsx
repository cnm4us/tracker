import { useEffect, useState } from 'react'
import { api, formatCivilPartsTZ, ymdInTZ, type Entry } from '../api'
import { localDateTimeToUTCISO, toHHMMInTZ } from '../time'
import sound from '../sound'
import { useClock } from '../hooks/useClock'

type Site = 'clinic' | 'remote'

function renderCivil(d: Date, tz: string) {
  const { hm, period } = formatCivilPartsTZ(d, tz)
  return (<><span>{hm} </span><span className="ampm">{period}</span></>)
}

const btnStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 16,
  minWidth: 96,
}

export default function NewEntryScreen(props: {
  mode?: 'new'|'edit',
  entry?: Entry,
  defaultSite: Site,
  defaultEvents: string[],
  allEvents: string[],
  tz?: string,
  onCancel: ()=>void,
  onCreated: ()=>Promise<void>
}) {
  const tz = props.tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = useClock()
  // Ensure form starts at top of the viewport when opened from deep scroll (e.g., Log Search)
  useEffect(() => { try { window.scrollTo({ top: 0, behavior: 'auto' }) } catch {} }, [])

  const toYMD = (val?: string | null): string => {
    if (!val) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
    const d = new Date(val)
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
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
    return props.mode === 'edit' ? '' : ymdInTZ(new Date(), tz)
  })
  const [startTime, setStartTime] = useState<string>(toHHMMInTZ(props.entry?.start_iso, tz))
  const [stopDate, setStopDate] = useState<string>('')
  const [stopTime, setStopTime] = useState<string>(toHHMMInTZ(props.entry?.stop_iso, tz))
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
    if (hasDuration && (props.mode !== 'edit' || !hasTimes)) {
      const d = props.entry!.duration_min as number
      const hh = Math.floor(d / 60)
      const mm = d % 60
      setDurH(hh > 0 ? String(hh) : '')
      setDurM(mm > 0 ? String(mm) : '')
    } else {
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
          if (entry?.start_iso) setStartTime(toHHMMInTZ(entry.start_iso, tz))
          if (entry?.stop_iso) setStopTime(toHHMMInTZ(entry.stop_iso, tz))
        } catch {}
      }
    })()
  }, [props.mode, props.entry?.id, tz])

  function toggleEvent(name: string) {
    setEvents(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toIso(date: string, time: string): string | null {
    if (!date || !time) return null
    return localDateTimeToUTCISO(date, time, tz)
  }

  // Derive stop time during duration mode; assume stop date = start date
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


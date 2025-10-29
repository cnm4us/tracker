export function normalizeYMD(val?: string | null, tz?: string): string {
  if (!val) return ''
  const s = String(val)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.includes('T')) return s.slice(0, 10)
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const y = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: tz || 'UTC' }).format(d)
    const m = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone: tz || 'UTC' }).format(d)
    const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: tz || 'UTC' }).format(d)
    return `${y}-${m}-${day}`
  }
  return ''
}

export function middayUTCFromYMD(ymd: string): Date {
  const s = ymd && ymd.length >= 10 ? ymd.slice(0, 10) : ''
  return new Date(`${s}T12:00:00Z`)
}

export function dateForDisplay(start_iso?: string | null, start_local_date?: string | null): Date {
  if (start_iso) return new Date(start_iso)
  if (start_local_date) return middayUTCFromYMD(normalizeYMD(start_local_date))
  return new Date()
}

export function durationMinutes(start_iso?: string | null, stop_iso?: string | null, duration_min?: number | null): number | null {
  if (typeof duration_min === 'number') return duration_min
  if (start_iso && stop_iso) return Math.max(0, Math.round((+new Date(stop_iso) - +new Date(start_iso)) / 60000))
  return null
}

export function weekStartSunday(ymd: string): string {
  const dt = new Date(ymd + 'T00:00:00Z')
  const wd = dt.getUTCDay() // 0=Sun
  const start = new Date(dt)
  start.setUTCDate(start.getUTCDate() - wd)
  const y = start.getUTCFullYear()
  const m = String(start.getUTCMonth() + 1).padStart(2, '0')
  const d = String(start.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function weekEndSaturday(ymdStart: string): string {
  const end = new Date(ymdStart + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 6)
  const y = end.getUTCFullYear()
  const m = String(end.getUTCMonth() + 1).padStart(2, '0')
  const d = String(end.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatMMDD(ymd: string): string {
  const s = ymd && ymd.length >= 10 ? ymd.slice(0, 10) : ymd
  const parts = s.split('-')
  const m = parts[1]
  const d = parts[2]
  return `${m}/${d}`
}

// pad2 reserved for future use

function buildIsoLikeFromParts(parts: Intl.DateTimeFormatPart[]): string {
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00'
  const y = parts.find(p => p.type === 'year')?.value || '1970'
  const m = parts.find(p => p.type === 'month')?.value || '01'
  const d = parts.find(p => p.type === 'day')?.value || '01'
  const hh = get('hour')
  const mm = get('minute')
  const ss = get('second')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

function tzOffsetMinutesAt(instant: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = fmt.formatToParts(instant)
  const localIso = buildIsoLikeFromParts(parts) + 'Z'
  const localAsUTC = Date.parse(localIso)
  const offsetMs = instant.getTime() - localAsUTC
  return Math.round(offsetMs / 60000)
}

export function localDateTimeToUTCISO(ymd: string, hhmm: string, tz?: string): string | null {
  if (!ymd || !hhmm) return null
  const [y, m, d] = (ymd.length >= 10 ? ymd.slice(0, 10) : ymd).split('-').map(s => parseInt(s, 10))
  const [hh, mm] = hhmm.split(':').map(s => parseInt(s, 10))
  if (!tz) {
    // Fallback to device timezone
    return new Date(`${ymd}T${hhmm}:00`).toISOString()
  }
  // Initial guess as if local were UTC
  let guess = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0)
  // Iterate to account for DST transitions
  for (let i = 0; i < 2; i++) {
    const offMin = tzOffsetMinutesAt(new Date(guess), tz)
    const base = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0)
    const corrected = base - offMin * 60000
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess).toISOString()
}

export type User = { id: number; email: string; tz: string; role: 'user'|'admin'; recent_logs_scope?: 'wtd'|'wtd_prev'|'mtd'|'mtd_prev' }
export type Entry = {
  id: number
  user_id: number
  site: 'clinic'|'remote'
  start_utc: string
  stop_utc: string | null
  notes: string | null
  start_iso?: string
  stop_iso?: string | null
  start_local_date?: string
  duration_min?: number
  events?: string[]
}

const base = '' // same-origin via nginx

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-User-TZ': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      ...(init?.headers || {}),
    },
    ...init,
  })
  const ct = res.headers.get('content-type') || ''
  const data = ct.includes('application/json') ? await res.json() : (await res.text())
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status, data })
  return data as T
}

export const api = {
  // Auth
  me: () => request<{ user: User | null }>('/api/auth/me'),
  register: (email: string, password: string, tz?: string) =>
    request<{ user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, tz }) }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  updateMe: (params: { tz?: string; recent_logs_scope?: 'wtd'|'wtd_prev'|'mtd'|'mtd_prev' }) =>
    request<{ ok: true }>('/api/auth/me', { method: 'PATCH', body: JSON.stringify(params) }),

  // Event types
  eventTypes: () => request<{ event_types: { id: number; name: string; active: number }[] }>('/api/event-types'),

  // Entries
  start: (site: 'clinic'|'remote', events: string[], notes: string) =>
    request<{ id: number; start_utc: string }>('/api/entries/start', {
      method: 'POST',
      body: JSON.stringify({ site, events, notes }),
    }),
  stop: (notes?: string) =>
    request<{ id: number; stop_utc: string }>(
      '/api/entries/stop',
      { method: 'POST', body: JSON.stringify({ notes }) }
    ),
  manual: (site: 'clinic'|'remote', events: string[], start_utc: string, stop_utc: string, notes: string) =>
    request<{ id: number }>('/api/entries', { method: 'POST', body: JSON.stringify({ site, events, start_utc, stop_utc, notes }) }),
  manualDuration: (site: 'clinic'|'remote', events: string[], start_local_date: string, hours: number | null, minutes: number | null, notes: string) =>
    request<{ id: number }>(
      '/api/entries',
      {
        method: 'POST',
        body: JSON.stringify({ site, events, start_local_date, hours, minutes, notes }),
      }
    ),
  updateEntryTimes: (id: number, site: 'clinic'|'remote'|undefined, events: string[]|undefined, start_utc: string, stop_utc: string, notes: string|undefined) =>
    request<{ id: number }>(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify({ site, events, start_utc, stop_utc, notes }) }),
  updateEntryDuration: (id: number, site: 'clinic'|'remote'|undefined, events: string[]|undefined, start_local_date: string, hours: number | null, minutes: number | null, notes: string|undefined) =>
    request<{ id: number }>(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify({ site, events, start_local_date, hours, minutes, notes }) }),
  list: (limit = 20) => request<{ entries: Entry[] }>(`/api/entries?limit=${limit}`),
  getEntry: (id: number) => request<{ entry: Entry }>(`/api/entries/${id}`),
}

export function formatCivil(t: Date): string {
  const h = t.getHours()
  const m = t.getMinutes()
  const am = h < 12
  const hh = ((h + 11) % 12) + 1
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${hh}:${pad(m)} ${am ? 'am' : 'pm'}`
}

export function formatDayMon(t: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const mon = t.getMonth() + 1
  const day = t.getDate()
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${days[t.getDay()]} (${pad(mon)}/${pad(day)})`
}

export function formatCivilTZ(d: Date, tz: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
  const parts = fmt.formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value || '0'
  const m = parts.find(p => p.type === 'minute')?.value || '00'
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM'
  const period = /am/i.test(dayPeriod) ? 'am' : 'pm'
  return `${h}:${m} ${period}`
}

// Returns time parts to allow styling the day period separately
export function formatCivilPartsTZ(d: Date, tz: string): { hm: string; period: 'am'|'pm' } {
  if (!(d instanceof Date) || isNaN(d.getTime())) return { hm: '—', period: 'am' }
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour12: true,
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
  const parts = fmt.formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value || '0'
  const m = parts.find(p => p.type === 'minute')?.value || '00'
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'AM'
  const period = /am/i.test(dayPeriod) ? 'am' : 'pm'
  return { hm: `${h}:${m}`, period }
}

export function formatDayMonTZ(d: Date, tz: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(d)
  const mm = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone: tz }).format(d)
  const dd = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: tz }).format(d)
  // e.g., Mon (10/27)
  return `${wd} (${mm}/${dd})`
}

export function ymdInTZ(d: Date, tz: string): string {
  const y = new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: tz }).format(d)
  const m = new Intl.DateTimeFormat('en-US', { month: '2-digit', timeZone: tz }).format(d)
  const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: tz }).format(d)
  return `${y}-${m}-${day}`
}

export function formatDuration(mins: number | null | undefined): string {
  if (mins == null || mins < 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))
  if (h > 0) return `${h}:${pad2(m)}`
  return `:${pad2(m)}`
}

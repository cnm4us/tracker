import type { Response } from 'express'
import express from 'express'
import { withConn } from '../db'
import type { AuthedRequest } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'

export const entriesRouter = express.Router()

function ymdInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${day}`
}

// Start a new active entry
entriesRouter.post('/start', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { site, events, notes } = req.body || {}
  if (!site || !['clinic', 'remote'].includes(site)) return res.status(400).json({ error: 'site required' })
  const userId = req.user!.id
  const now = new Date()
  try {
    await withConn(async (conn) => {
      // Ensure no active entry exists
      const [active] = await conn.query('SELECT id FROM entries WHERE user_id = ? AND start_utc IS NOT NULL AND stop_utc IS NULL LIMIT 1', [userId])
      if ((active as any[]).length) return res.status(409).json({ error: 'An entry is already active' })

      const userTz = (req.user?.tz || String(req.headers['x-user-tz']) || 'UTC') as string
      const startLocalDate = ymdInTZ(now, userTz)
      const [r] = await conn.query(
        'INSERT INTO entries (user_id, site, start_local_date, start_utc, notes) VALUES (?, ?, ?, ?, ?)',
        [userId, site, startLocalDate, now, notes || null]
      )
      const entryId = (r as any).insertId as number

      if (Array.isArray(events) && events.length) {
        const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
        const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
        const pairs = (events as string[])
          .map((name) => m.get(name))
          .filter(Boolean)
          .map((id) => [entryId, id]) as Array<[number, number]>
        if (pairs.length === 1) {
          await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES (?,?)', pairs[0])
        } else if (pairs.length > 1) {
          const placeholders = pairs.map(() => '(?,?)').join(',')
          const flat: any[] = []
          for (const p of pairs) flat.push(p[0], p[1])
          await conn.query(`INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ${placeholders}`, flat)
        }
      }
      res.status(201).json({ id: entryId, start_utc: now.toISOString() })
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Start failed:', err)
    const anyErr: any = err
    res.status(500).json({ error: 'Start failed', detail: anyErr?.sqlMessage || anyErr?.message || String(anyErr) })
  }
})

// Stop the current active entry
entriesRouter.post('/stop', requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id
  const now = new Date()
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT id, start_utc FROM entries WHERE user_id = ? AND start_utc IS NOT NULL AND stop_utc IS NULL ORDER BY id DESC LIMIT 1', [userId])
      const arr = rows as any[]
      if (!arr.length) return res.status(404).json({ error: 'No active entry' })
      const entry = arr[0]
      const incomingNotes = (req.body && (req.body as any).notes) as string | undefined
      if (incomingNotes !== undefined) {
        await conn.query('UPDATE entries SET stop_utc = ?, duration_min = TIMESTAMPDIFF(MINUTE, start_utc, ?), notes = ? WHERE id = ?', [now, now, incomingNotes, entry.id])
      } else {
        await conn.query('UPDATE entries SET stop_utc = ?, duration_min = TIMESTAMPDIFF(MINUTE, start_utc, ?) WHERE id = ?', [now, now, entry.id])
      }
      res.json({ id: entry.id, stop_utc: now.toISOString() })
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Stop failed:', err)
    const anyErr: any = err
    res.status(500).json({ error: 'Stop failed', detail: anyErr?.sqlMessage || anyErr?.message || String(anyErr) })
  }
})

// Manual create (New)
entriesRouter.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { site, events, start_utc, stop_utc, notes, start_local_date, duration_min, hours, minutes } = req.body || {}
  if (!site || !['clinic', 'remote'].includes(site)) return res.status(400).json({ error: 'site required' })
  let start: Date | null = null
  let stop: Date | null = null
  let dur: number | null = null

  if (start_utc && stop_utc) {
    start = new Date(start_utc)
    stop = new Date(stop_utc)
    if (!(start instanceof Date) || isNaN(start.getTime()) || !(stop instanceof Date) || isNaN(stop.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' })
    }
    if (stop <= start) return res.status(400).json({ error: 'stop must be after start' })
    dur = Math.max(0, Math.floor((+stop - +start) / 60000))
  } else {
    const h = hours != null ? parseInt(String(hours), 10) : NaN
    const m = minutes != null ? parseInt(String(minutes), 10) : NaN
    const dm = duration_min != null ? parseInt(String(duration_min), 10) : NaN
    if (!start_local_date) return res.status(400).json({ error: 'start_local_date required for duration entries' })
    if (isNaN(dm) && isNaN(h) && isNaN(m)) return res.status(400).json({ error: 'duration_min or hours/minutes required' })
    dur = !isNaN(dm) ? dm : ((isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m))
    if (!dur || dur <= 0) return res.status(400).json({ error: 'duration must be positive' })
  }
  const userId = req.user!.id
  try {
    await withConn(async (conn) => {
      const userTz = (req.user?.tz || String(req.headers['x-user-tz']) || 'UTC') as string
      const localDate = start_local_date || (start ? ymdInTZ(start, userTz) : null)
      if (!localDate) return res.status(400).json({ error: 'start_local_date required' })
      const [r] = await conn.query(
        'INSERT INTO entries (user_id, site, start_local_date, start_utc, stop_utc, duration_min, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, site, localDate, start, stop, dur, notes || null]
      )
      const entryId = (r as any).insertId as number
      if (Array.isArray(events) && events.length) {
        const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
        const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
        const pairs = (events as string[])
          .map((name) => m.get(name))
          .filter(Boolean)
          .map((id) => [entryId, id]) as Array<[number, number]>
        if (pairs.length === 1) {
          await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES (?,?)', pairs[0])
        } else if (pairs.length > 1) {
          const placeholders = pairs.map(() => '(?,?)').join(',')
          const flat: any[] = []
          for (const p of pairs) flat.push(p[0], p[1])
          await conn.query(`INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ${placeholders}`, flat)
        }
      }
      res.status(201).json({ id: entryId })
    })
  } catch (err) {
    res.status(500).json({ error: 'Create failed' })
  }
})

// Update existing entry (edit)
entriesRouter.patch('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id)
  const { site, events, start_utc, stop_utc, notes, start_local_date, duration_min, hours, minutes } = req.body || {}
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  const userId = req.user!.id
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM entries WHERE id = ? AND user_id = ? LIMIT 1', [id, userId])
      const arr = rows as any[]
      if (!arr.length) return res.status(404).json({ error: 'Not found' })
      const existing = arr[0]

      let start: Date | null = existing.start_utc ? new Date(existing.start_utc) : null
      let stop: Date | null = existing.stop_utc ? new Date(existing.stop_utc) : null
      let dur: number | null = existing.duration_min || null
      if (start_utc !== undefined) start = start_utc ? new Date(start_utc) : null
      if (stop_utc !== undefined) stop = stop_utc ? new Date(stop_utc) : null
      if (start && stop && stop <= start) return res.status(400).json({ error: 'stop must be after start' })
      const h = hours != null ? parseInt(String(hours), 10) : NaN
      const m = minutes != null ? parseInt(String(minutes), 10) : NaN
      const dm = duration_min != null ? parseInt(String(duration_min), 10) : NaN
      if (!isNaN(dm)) dur = dm
      else if (!isNaN(h) || !isNaN(m)) dur = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
      else if (start && stop) dur = Math.max(0, Math.floor((+stop - +start) / 60000))

      // If a duration was supplied and start/stop were not explicitly provided,
      // convert this entry to duration-only by clearing start/stop.
      const durationSupplied = (!isNaN(dm)) || (!isNaN(h)) || (!isNaN(m))
      if (durationSupplied && start_utc === undefined && stop_utc === undefined) {
        start = null
        stop = null
      }

      const newSite = site && ['clinic', 'remote'].includes(site) ? site : existing.site
      const userTz2 = (req.user?.tz || String(req.headers['x-user-tz']) || 'UTC') as string
      const newLocalDate = start_local_date || (start ? ymdInTZ(start, userTz2) : existing.start_local_date)
      await conn.query('UPDATE entries SET site = ?, start_local_date = ?, start_utc = ?, stop_utc = ?, duration_min = ?, notes = ? WHERE id = ?', [newSite, newLocalDate, start, stop, dur, notes ?? existing.notes, id])

      if (Array.isArray(events)) {
        await conn.query('DELETE FROM entry_events WHERE entry_id = ?', [id])
        if (events.length) {
          const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
          const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
          const pairs = (events as string[])
            .map((name) => m.get(name))
            .filter(Boolean)
            .map((eid) => [id, eid]) as Array<[number, number]>
          if (pairs.length === 1) {
            await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES (?,?)', pairs[0])
          } else if (pairs.length > 1) {
            const placeholders = pairs.map(() => '(?,?)').join(',')
            const flat: any[] = []
            for (const p of pairs) flat.push(p[0], p[1])
            await conn.query(`INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ${placeholders}`, flat)
          }
        }
      }
      res.json({ id })
    })
  } catch (err) {
    res.status(500).json({ error: 'Update failed' })
  }
})

// List recent entries
entriesRouter.get('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id
  const limit = Math.min(Number(req.query.limit ?? 20), 100)
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query(
        `SELECT e.*, 
                DATE_FORMAT(e.start_utc, '%Y-%m-%dT%H:%i:%sZ') as start_iso,
                IFNULL(DATE_FORMAT(e.stop_utc, '%Y-%m-%dT%H:%i:%sZ'), NULL) as stop_iso
         FROM entries e
         WHERE e.user_id = ?
         ORDER BY COALESCE(e.start_utc, TIMESTAMP(e.start_local_date), e.created_at) DESC
         LIMIT ?`,
        [userId, limit]
      )
      res.json({ entries: rows })
    })
  } catch (err) {
    res.status(500).json({ error: 'List failed' })
  }
})
// Get a single entry with events
entriesRouter.get('/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  const userId = req.user!.id
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query(
        `SELECT e.*, 
                DATE_FORMAT(e.start_utc, '%Y-%m-%dT%H:%i:%sZ') as start_iso,
                IFNULL(DATE_FORMAT(e.stop_utc, '%Y-%m-%dT%H:%i:%sZ'), NULL) as stop_iso
         FROM entries e
         WHERE e.id = ? AND e.user_id = ?
         LIMIT 1`,
        [id, userId]
      )
      const arr = rows as any[]
      if (!arr.length) return res.status(404).json({ error: 'Not found' })
      const entry = arr[0]
      const [evRows] = await conn.query(
        `SELECT t.name FROM entry_events ee JOIN event_types t ON t.id = ee.event_type_id WHERE ee.entry_id = ? ORDER BY t.name`,
        [id]
      )
      const events = (evRows as any[]).map(r => r.name)
      res.json({ entry: { ...entry, events } })
    })
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed' })
  }
})

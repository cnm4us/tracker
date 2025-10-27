import type { Response } from 'express'
import express from 'express'
import { withConn } from '../db'
import type { AuthedRequest } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'

export const entriesRouter = express.Router()

// Start a new active entry
entriesRouter.post('/start', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { site, events, notes } = req.body || {}
  if (!site || !['clinic', 'remote'].includes(site)) return res.status(400).json({ error: 'site required' })
  const userId = req.user!.id
  const now = new Date()
  try {
    await withConn(async (conn) => {
      // Ensure no active entry exists
      const [active] = await conn.query('SELECT id FROM entries WHERE user_id = ? AND stop_utc IS NULL LIMIT 1', [userId])
      if ((active as any[]).length) return res.status(409).json({ error: 'An entry is already active' })

      const [r] = await conn.query('INSERT INTO entries (user_id, site, start_utc, notes) VALUES (?, ?, ?, ?)', [userId, site, now, notes || null])
      const entryId = (r as any).insertId as number

      if (Array.isArray(events) && events.length) {
        const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
        const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
        const pairs = (events as string[])
          .map((name) => m.get(name))
          .filter(Boolean)
          .map((id) => [entryId, id])
        if (pairs.length) await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ? as v', [pairs])
      }
      res.status(201).json({ id: entryId, start_utc: now.toISOString() })
    })
  } catch (err) {
    res.status(500).json({ error: 'Start failed' })
  }
})

// Stop the current active entry
entriesRouter.post('/stop', requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id
  const now = new Date()
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT id, start_utc FROM entries WHERE user_id = ? AND stop_utc IS NULL ORDER BY id DESC LIMIT 1', [userId])
      const arr = rows as any[]
      if (!arr.length) return res.status(404).json({ error: 'No active entry' })
      const entry = arr[0]
      await conn.query('UPDATE entries SET stop_utc = ? WHERE id = ?', [now, entry.id])
      res.json({ id: entry.id, stop_utc: now.toISOString() })
    })
  } catch (err) {
    res.status(500).json({ error: 'Stop failed' })
  }
})

// Manual create (New)
entriesRouter.post('/', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { site, events, start_utc, stop_utc, notes } = req.body || {}
  if (!site || !['clinic', 'remote'].includes(site)) return res.status(400).json({ error: 'site required' })
  if (!start_utc || !stop_utc) return res.status(400).json({ error: 'start_utc and stop_utc required' })
  const start = new Date(start_utc)
  const stop = new Date(stop_utc)
  if (!(start instanceof Date) || isNaN(start.getTime()) || !(stop instanceof Date) || isNaN(stop.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' })
  }
  if (stop <= start) return res.status(400).json({ error: 'stop must be after start' })
  const userId = req.user!.id
  try {
    await withConn(async (conn) => {
      const [r] = await conn.query('INSERT INTO entries (user_id, site, start_utc, stop_utc, notes) VALUES (?, ?, ?, ?, ?)', [userId, site, start, stop, notes || null])
      const entryId = (r as any).insertId as number
      if (Array.isArray(events) && events.length) {
        const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
        const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
        const pairs = (events as string[])
          .map((name) => m.get(name))
          .filter(Boolean)
          .map((id) => [entryId, id])
        if (pairs.length) await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ? as v', [pairs])
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
  const { site, events, start_utc, stop_utc, notes } = req.body || {}
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  const userId = req.user!.id
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM entries WHERE id = ? AND user_id = ? LIMIT 1', [id, userId])
      const arr = rows as any[]
      if (!arr.length) return res.status(404).json({ error: 'Not found' })
      const existing = arr[0]

      const start = start_utc ? new Date(start_utc) : new Date(existing.start_utc)
      const stop = stop_utc ? new Date(stop_utc) : (existing.stop_utc ? new Date(existing.stop_utc) : null)
      if (stop && stop <= start) return res.status(400).json({ error: 'stop must be after start' })
      const newSite = site && ['clinic', 'remote'].includes(site) ? site : existing.site
      await conn.query('UPDATE entries SET site = ?, start_utc = ?, stop_utc = ?, notes = ? WHERE id = ?', [newSite, start, stop, notes ?? existing.notes, id])

      if (Array.isArray(events)) {
        await conn.query('DELETE FROM entry_events WHERE entry_id = ?', [id])
        if (events.length) {
          const [eventRows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
          const m = new Map((eventRows as any[]).map((e) => [e.name, e.id]))
          const pairs = (events as string[])
            .map((name) => m.get(name))
            .filter(Boolean)
            .map((eid) => [id, eid])
          if (pairs.length) await conn.query('INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ? as v', [pairs])
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
                DATE_FORMAT(CONVERT_TZ(e.start_utc, '+00:00', '+00:00'), '%Y-%m-%dT%H:%i:%s.%fZ') as start_iso,
                IFNULL(DATE_FORMAT(CONVERT_TZ(e.stop_utc, '+00:00', '+00:00'), '%Y-%m-%dT%H:%i:%s.%fZ'), NULL) as stop_iso
         FROM entries e
         WHERE e.user_id = ?
         ORDER BY e.start_utc DESC
         LIMIT ?`,
        [userId, limit]
      )
      res.json({ entries: rows })
    })
  } catch (err) {
    res.status(500).json({ error: 'List failed' })
  }
})

import express from 'express'
import { withConn } from '../db'
import type { AuthedRequest } from '../middleware/auth'
import { requireAdmin, requireAuth } from '../middleware/auth'

export const eventTypesRouter = express.Router()

// Public read (or requireAuth if you prefer)
eventTypesRouter.get('/', async (_req, res) => {
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT id, name, active FROM event_types ORDER BY name')
      res.json({ event_types: rows })
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to list event types' })
  }
})

// Admin create
eventTypesRouter.post('/', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const { name, active } = req.body || {}
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    await withConn(async (conn) => {
      const [r] = await conn.query('INSERT INTO event_types (name, active) VALUES (?, ?)', [name, active ? 1 : 1])
      res.status(201).json({ id: (r as any).insertId })
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create event type' })
  }
})

// Admin update
eventTypesRouter.patch('/:id', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id)
  const { name, active } = req.body || {}
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    await withConn(async (conn) => {
      await conn.query('UPDATE event_types SET name = COALESCE(?, name), active = COALESCE(?, active) WHERE id = ?', [name ?? null, active === undefined ? null : active ? 1 : 0, id])
      res.json({ id })
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to update event type' })
  }
})


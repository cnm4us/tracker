import type { Request, Response, NextFunction } from 'express'
import { withConn } from '../db'
import { sha256Hex } from '../utils/crypto'

export interface AuthedRequest extends Request {
  user?: {
    id: number
    email: string
    tz: string
    role: 'user' | 'admin'
  }
  sessionId?: number
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const rt = req.cookies?.rt as string | undefined
    if (!rt) return res.status(401).json({ error: 'Not authenticated' })
    const tokenHash = sha256Hex(rt)
    const now = new Date()
    await withConn(async (conn) => {
      const [rows] = await conn.query(
        `SELECT s.id as session_id, u.id, u.email, u.tz, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
         LIMIT 1`,
        [tokenHash, now]
      )
      const arr = rows as any[]
      if (!arr.length) return res.status(401).json({ error: 'Invalid session' })
      const r = arr[0]
      req.user = { id: r.id, email: r.email, tz: r.tz, role: r.role }
      req.sessionId = r.session_id
      next()
    })
  } catch (err) {
    next(err)
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' })
  next()
}


import type { Request, Response } from 'express'
import express from 'express'
import { withConn } from '../db'
import { env } from '../env'
import { generateToken, hashPassword, sha256Hex, verifyPassword } from '../utils/crypto'
import { requireAuth } from '../middleware/auth'

function cookieOptions(req: Request) {
  const isHttps = (req.headers['x-forwarded-proto'] === 'https') || req.protocol === 'https'
  const host = req.hostname
  const isDomain = /\./.test(host)
  return {
    httpOnly: true as const,
    secure: isHttps,
    sameSite: 'lax' as const,
    domain: isDomain ? host : undefined,
    path: '/',
    maxAge: env.refreshTtlSec * 1000,
  }
}

export const authRouter = express.Router()

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password, tz } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  try {
    await withConn(async (conn) => {
      const [existing] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email])
      if ((existing as any[]).length) return res.status(409).json({ error: 'Email already registered' })
      const pwdHash = await hashPassword(password)
      const [result] = await conn.query('INSERT INTO users (email, password_hash, tz, recent_logs_scope) VALUES (?, ?, ?, ?)', [email, pwdHash, tz || 'UTC', 'wtd_prev'])
      const userId = (result as any).insertId as number

      const plain = generateToken(48)
      const tokenHash = sha256Hex(plain)
      const expires = new Date(Date.now() + env.refreshTtlSec * 1000)
      await conn.query(
        'INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)',
        [userId, tokenHash, req.headers['user-agent'] || null, req.ip || null, expires]
      )
      res.cookie('rt', plain, cookieOptions(req))
      res.status(201).json({ user: { id: userId, email, tz: tz || 'UTC', role: 'user' } })
    })
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' })
  }
})

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'email and password required' })
  try {
    await withConn(async (conn) => {
      const [rows] = await conn.query('SELECT id, password_hash, tz, role, recent_logs_scope FROM users WHERE email = ? LIMIT 1', [email])
      const arr = rows as any[]
      if (!arr.length) return res.status(401).json({ error: 'Invalid credentials' })
      const user = arr[0]
      const ok = await verifyPassword(password, user.password_hash.toString())
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

      const plain = generateToken(48)
      const tokenHash = sha256Hex(plain)
      const expires = new Date(Date.now() + env.refreshTtlSec * 1000)
      await conn.query(
        'INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)',
        [user.id, tokenHash, req.headers['user-agent'] || null, req.ip || null, expires]
      )
      res.cookie('rt', plain, cookieOptions(req))
      res.json({ user: { id: user.id, email, tz: user.tz, role: user.role, recent_logs_scope: user.recent_logs_scope || 'wtd_prev' } })
    })
  } catch (err) {
    res.status(500).json({ error: 'Login failed' })
  }
})

authRouter.post('/logout', async (req: Request, res: Response) => {
  const rt = req.cookies?.rt as string | undefined
  if (!rt) return res.json({ ok: true })
  try {
    const tokenHash = sha256Hex(rt)
    await withConn(async (conn) => {
      await conn.query('UPDATE sessions SET revoked_at = NOW(6) WHERE token_hash = ?', [tokenHash])
    })
  } catch {}
  res.clearCookie('rt', { path: '/' })
  res.json({ ok: true })
})

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const rt = req.cookies?.rt as string | undefined
  if (!rt) return res.status(401).json({ error: 'No session' })
  try {
    await withConn(async (conn) => {
      const tokenHash = sha256Hex(rt)
      const [rows] = await conn.query(
        `SELECT s.id, s.user_id, u.email, u.tz, u.role, u.recent_logs_scope FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(6)
         LIMIT 1`,
        [tokenHash]
      )
      const arr = rows as any[]
      if (!arr.length) return res.status(401).json({ error: 'Invalid session' })
      const sess = arr[0]
      // Rotate token
      const plain = generateToken(48)
      const newHash = sha256Hex(plain)
      const expires = new Date(Date.now() + env.refreshTtlSec * 1000)
      await conn.query('UPDATE sessions SET revoked_at = NOW(6) WHERE id = ?', [sess.id])
      await conn.query(
        'INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)',
        [sess.user_id, newHash, req.headers['user-agent'] || null, req.ip || null, expires]
      )
      res.cookie('rt', plain, cookieOptions(req))
      res.json({ user: { id: sess.user_id, email: sess.email, tz: sess.tz, role: sess.role, recent_logs_scope: (sess as any).recent_logs_scope || 'wtd_prev' } })
    })
  } catch (err) {
    res.status(500).json({ error: 'Refresh failed' })
  }
})

authRouter.get('/me', async (req: Request, res: Response) => {
  const rt = req.cookies?.rt as string | undefined
  if (!rt) return res.status(200).json({ user: null })
  try {
    const tokenHash = sha256Hex(rt)
    await withConn(async (conn) => {
      const [rows] = await conn.query(
        `SELECT u.id, u.email, u.tz, u.role, u.recent_logs_scope FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(6)
         LIMIT 1`,
        [tokenHash]
      )
      const arr = rows as any[]
      if (!arr.length) return res.json({ user: null })
      const u = arr[0]
      res.json({ user: { id: u.id, email: u.email, tz: u.tz, role: u.role, recent_logs_scope: u.recent_logs_scope || 'wtd_prev' } })
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

// Update current user settings (tz, recent_logs_scope)
authRouter.patch('/me', requireAuth as any, async (req: Request, res: Response) => {
  const { tz, recent_logs_scope } = req.body || {}
  if (!tz && !recent_logs_scope) return res.status(400).json({ error: 'tz or recent_logs_scope required' })
  const allowed = new Set(['wtd','wtd_prev','mtd','mtd_prev'])
  try {
    await withConn(async (conn) => {
      const token = sha256Hex((req as any).cookies?.rt as string)
      if (tz && recent_logs_scope && allowed.has(String(recent_logs_scope))) {
        await conn.query('UPDATE users SET tz = ?, recent_logs_scope = ? WHERE id = (SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1)', [tz, String(recent_logs_scope), token])
      } else if (tz) {
        await conn.query('UPDATE users SET tz = ? WHERE id = (SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1)', [tz, token])
      } else if (recent_logs_scope && allowed.has(String(recent_logs_scope))) {
        await conn.query('UPDATE users SET recent_logs_scope = ? WHERE id = (SELECT user_id FROM sessions WHERE token_hash = ? LIMIT 1)', [String(recent_logs_scope), token])
      }
      res.json({ ok: true })
    })
  } catch (err) {
    res.status(500).json({ error: 'Update failed' })
  }
})

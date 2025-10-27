import mysql from 'mysql2/promise'
import { env } from './env'

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  charset: 'utf8mb4_unicode_ci',
})

export async function withConn<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection()
  try {
    await conn.query("SET time_zone = '+00:00'")
    return await fn(conn)
  } finally {
    conn.release()
  }
}


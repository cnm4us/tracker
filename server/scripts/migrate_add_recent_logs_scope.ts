#!/usr/bin/env tsx
import { withConn } from '../src/db'

async function main() {
  await withConn(async (conn) => {
    // Add column if it does not exist
    await conn.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS recent_logs_scope ENUM('wtd','wtd_prev','mtd','mtd_prev') NOT NULL DEFAULT 'wtd_prev'
    `)
    console.log('Migration complete: users.recent_logs_scope added (or already exists).')
  })
}

main().catch((err) => { console.error(err); process.exit(1) })


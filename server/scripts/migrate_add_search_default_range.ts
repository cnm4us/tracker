#!/usr/bin/env tsx
import { withConn } from '../src/db'

async function main() {
  await withConn(async (conn) => {
    await conn.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS search_default_range ENUM(
        'wtd','wtd_prev','prev_week','all_weeks',
        'mtd','mtd_prev','prev_month','all_months','all_records'
      ) NOT NULL DEFAULT 'wtd_prev'
    `)
    console.log('Migration complete: users.search_default_range added (or already exists).')
  })
}

main().catch((err) => { console.error(err); process.exit(1) })


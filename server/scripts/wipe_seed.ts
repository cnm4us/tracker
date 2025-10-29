#!/usr/bin/env tsx
import 'dotenv/config'
import { withConn } from '../src/db'
import { env } from '../src/env'

async function main() {
  if (env.nodeEnv === 'production') {
    console.error('Refusing to wipe in production environment.')
    process.exit(1)
  }
  const tag = process.argv.slice(2)[0]
  if (!tag) {
    console.error('Usage: tsx server/scripts/wipe_seed.ts SEED-<batch-id>')
    process.exit(1)
  }
  const marker = `[${tag}]`
  await withConn(async (conn) => {
    // Find entries by tag in notes
    const [rows] = await conn.query('SELECT id FROM entries WHERE notes LIKE ?', [`%${marker}%`])
    const ids = (rows as any[]).map(r => r.id as number)
    if (!ids.length) { console.log('No seeded entries found for tag', tag); return }
    // Delete event links, then entries
    const chunk = 500
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk)
      const placeholders = slice.map(() => '?').join(',')
      await conn.query(`DELETE FROM entry_events WHERE entry_id IN (${placeholders})`, slice)
      await conn.query(`DELETE FROM entries WHERE id IN (${placeholders})`, slice)
    }
    console.log(`Deleted ${ids.length} entries for tag ${tag}`)
  })
}

main().catch((err) => { console.error(err); process.exit(1) })


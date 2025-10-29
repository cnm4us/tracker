#!/usr/bin/env tsx
import 'dotenv/config'
import { withConn } from '../src/db'
import { env } from '../src/env'

type Args = {
  email?: string
  truncate: boolean
  yes: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const has = (k: string) => argv.includes(k)
  const get = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i+1] : undefined }
  return {
    email: get('--user') || get('--email'),
    truncate: has('--truncate'),
    yes: has('--yes') || process.env.CONFIRM === 'NUKE',
  }
}

async function main() {
  if (env.nodeEnv === 'production') {
    console.error('Refusing to run nuke in production environment.')
    process.exit(1)
  }
  const args = parseArgs()
  if (!args.yes) {
    console.error('Refusing to proceed without confirmation. Re-run with --yes (or set CONFIRM=NUKE).')
    process.exit(1)
  }

  await withConn(async (conn) => {
    if (args.truncate) {
      if (args.email) {
        console.error('Cannot use --truncate together with --user; use delete mode instead.')
        process.exit(1)
      }
      console.log('Disabling foreign key checks and TRUNCATE tables entry_events and entries...')
      await conn.query('SET FOREIGN_KEY_CHECKS=0')
      await conn.query('TRUNCATE TABLE entry_events')
      await conn.query('TRUNCATE TABLE entries')
      await conn.query('SET FOREIGN_KEY_CHECKS=1')
      console.log('Done.')
      return
    }

    if (args.email) {
      // Delete for a single user
      const [urows] = await conn.query('SELECT id FROM users WHERE email = ? LIMIT 1', [args.email])
      const users = urows as any[]
      if (!users.length) {
        console.error('User not found:', args.email)
        return
      }
      const userId = users[0].id as number
      console.log('Fetching entries for user id', userId)
      const [erows] = await conn.query('SELECT id FROM entries WHERE user_id = ?', [userId])
      const ids = (erows as any[]).map(r => r.id as number)
      console.log('Found entries:', ids.length)
      if (!ids.length) return
      // Delete event links then entries in chunks
      const chunk = 1000
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk)
        const placeholders = slice.map(() => '?').join(',')
        await conn.query(`DELETE FROM entry_events WHERE entry_id IN (${placeholders})`, slice)
        await conn.query(`DELETE FROM entries WHERE id IN (${placeholders})`, slice)
      }
      console.log('Deleted entries for user:', ids.length)
    } else {
      // Delete all entries across all users without TRUNCATE (keeps FK checks on)
      console.log('Deleting all entry_events via JOIN...')
      await conn.query('DELETE ee FROM entry_events ee JOIN entries e ON e.id = ee.entry_id')
      console.log('Deleting all entries...')
      const [res] = await conn.query('DELETE FROM entries')
      const affected = (res as any).affectedRows ?? 0
      console.log('Deleted entries:', affected)
    }
  })
}

main().catch((err) => { console.error(err); process.exit(1) })


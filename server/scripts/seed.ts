#!/usr/bin/env tsx
import 'dotenv/config'
import { withConn } from '../src/db'
import { env } from '../src/env'
import fs from 'fs'
import path from 'path'

type Args = {
  email: string
  days: number
  min: number
  max: number
  batch: string
  timeRatio: number
  notesFile?: string
  notesPct: number
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const i = argv.indexOf(k)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const email = get('--user') || get('--email')
  if (!email) {
    console.error('Usage: tsx server/scripts/seed.ts --user you@example.com [--days 60] [--min 1] [--max 3] [--batch BATCH_ID] [--timeRatio 0.7] [--notesFile path] [--notesPct 0.7]')
    process.exit(1)
  }
  const days = Number(get('--days') || 60)
  const min = Number(get('--min') || 1)
  const max = Number(get('--max') || 3)
  const timeRatio = Number(get('--timeRatio') || 0.7)
  const batch = get('--batch') || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12)
  const notesFile = get('--notesFile')
  const notesPct = Number(get('--notesPct') || 0.7)
  return { email, days, min, max, batch: `SEED-${batch}`, timeRatio, notesFile, notesPct }
}

function ymdInTZ(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const day = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${day}`
}

function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min }
function choice<T>(arr: T[]): T { return arr[randInt(0, arr.length - 1)] }

async function main() {
  if (env.nodeEnv === 'production') {
    console.error('Refusing to seed in production environment. Set NODE_ENV to development or staging.')
    process.exit(1)
  }
  const args = parseArgs()
  const summary = { created: 0, eventLinks: 0 }
  await withConn(async (conn) => {
    // Resolve user
    const [urows] = await conn.query('SELECT id, tz FROM users WHERE email = ? LIMIT 1', [args.email])
    const users = urows as any[]
    if (!users.length) throw new Error(`User not found: ${args.email}`)
    const userId = users[0].id as number
    const userTz = users[0].tz as string || 'UTC'

    // Fetch active event types
    const [erows] = await conn.query('SELECT id, name FROM event_types WHERE active = 1')
    const events = (erows as any[]).map(r => ({ id: r.id as number, name: String(r.name) }))

    // Load notes pool if provided
    let notesPool: string[] | null = null
    if (args.notesFile) {
      try {
        const p = path.resolve(process.cwd(), args.notesFile)
        const raw = fs.readFileSync(p, 'utf8')
        notesPool = raw
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(s => s && !s.startsWith('#'))
      } catch (e) {
        console.warn('Could not read notesFile, proceeding with defaults:', e)
      }
    }

    const end = new Date() // today
    for (let d = 0; d < args.days; d++) {
      const day = new Date(end)
      day.setDate(end.getDate() - d)
      const k = randInt(args.min, args.max)
      for (let i = 0; i < k; i++) {
        const isTimeBased = Math.random() < args.timeRatio
        const site = Math.random() < 0.7 ? 'clinic' : 'remote'
        const pickedEvents = events.length ? Array.from(new Set(Array.from({ length: randInt(0, 3) }, () => choice(events)).map(e => e.id))) : []
        // Notes: use pool if provided with probability notesPct; otherwise fallback; allow blank sometimes
        const fallback = ['Follow-up', 'Weekly sync', 'Chart catch-up', 'Inbox triage', 'Care coordination', 'Client call', 'Admin']
        let note = ''
        if (Math.random() < args.notesPct) {
          const pool = (notesPool && notesPool.length) ? notesPool : fallback
          note = choice(pool)
        }
        if (note) note = `${note} [${args.batch}]`

        if (isTimeBased) {
          // Pick a time of day in UTC (approx work hours). We'll create a UTC instant and derive start_local_date via tz.
          const base = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), randInt(13, 22), choice([0, 15, 30, 45])))
          const durMin = choice([15, 30, 45, 60, 90, 120, 180])
          const startUtc = base
          const stopUtc = new Date(+startUtc + durMin * 60000)
          const localDate = ymdInTZ(startUtc, userTz)

          const [r] = await conn.query(
            'INSERT INTO entries (user_id, site, start_local_date, start_utc, stop_utc, duration_min, notes) VALUES (?,?,?,?,?,?,?)',
            [userId, site, localDate, startUtc, stopUtc, durMin, note || null]
          )
          const entryId = (r as any).insertId as number
          summary.created++
          if (pickedEvents.length) {
            const vals: any[] = []
            const placeholders = pickedEvents.map(() => '(?,?)').join(',')
            pickedEvents.forEach(eid => { vals.push(entryId, eid) })
            await conn.query(`INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ${placeholders}` as any, vals)
            summary.eventLinks += pickedEvents.length
          }
        } else {
          // Duration-only entry for that local date
          const localDate = ymdInTZ(day, userTz)
          const hours = randInt(1, 4)
          const minutes = choice([0, 15, 30, 45])
          const dur = hours * 60 + minutes
          const [r] = await conn.query(
            'INSERT INTO entries (user_id, site, start_local_date, duration_min, notes) VALUES (?,?,?,?,?)',
            [userId, site, localDate, dur, note || null]
          )
          const entryId = (r as any).insertId as number
          summary.created++
          if (pickedEvents.length) {
            const vals: any[] = []
            const placeholders = pickedEvents.map(() => '(?,?)').join(',')
            pickedEvents.forEach(eid => { vals.push(entryId, eid) })
            await conn.query(`INSERT IGNORE INTO entry_events (entry_id, event_type_id) VALUES ${placeholders}` as any, vals)
            summary.eventLinks += pickedEvents.length
          }
        }
      }
    }
  })

  console.log(`Seed complete: entries=${summary.created}, event_links=${summary.eventLinks}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

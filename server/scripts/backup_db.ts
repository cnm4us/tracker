#!/usr/bin/env tsx
import 'dotenv/config'
import { env } from '../src/env'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

type Mode = 'schema'|'full'

function ts() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with ${code}`))
    })
  })
}

async function main() {
  if (env.nodeEnv === 'production') {
    console.error('Refusing to run DB backups in production by default. Set NODE_ENV to staging/dev or adjust this check if intended.')
  }
  const mode: Mode = (process.argv.includes('--schema') || process.argv.includes('--schema-only')) ? 'schema' : 'full'
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const root = path.resolve(__dirname, '../../')
  const outDir = path.join(root, 'schema_backups')
  ensureDir(outDir)

  const file = path.join(outDir, `${env.db.name}_${ts()}_${mode}.sql`)

  // Build mysqldump args
  const baseArgs = [
    '-h', env.db.host,
    '-P', String(env.db.port),
    '-u', env.db.user,
    `--password=${env.db.password}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--databases', env.db.name,
    '--result-file', file,
  ]
  let args = [...baseArgs, '--set-gtid-purged=OFF']
  if (mode === 'schema') args.push('--no-data')

  console.log(`Writing ${mode} backup to: ${file}`)
  try {
    try {
      await run('mysqldump', args)
    } catch (err) {
      console.warn('mysqldump failed, retrying without --set-gtid-purged...')
      args = args.filter(a => a !== '--set-gtid-purged=OFF')
      try {
        await run('mysqldump', args)
      } catch (err2) {
        console.warn('mysqldump failed again, trying mariadb-dump...')
        await run('mariadb-dump', args)
      }
    }
    console.log('Backup complete.')
  } catch (err: any) {
    console.error('mysqldump failed. Is it installed and on PATH?', err?.message || err)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './env'
import { authRouter } from './routes/auth'
import { entriesRouter } from './routes/entries'
import { eventTypesRouter } from './routes/eventTypes'

export function createApp() {
  const app = express()
  app.set('trust proxy', true)

  app.use(cors({ origin: env.appOrigin, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: env.nodeEnv })
  })

  // Routes
  app.use('/api/auth', authRouter)
  app.use('/api/entries', entriesRouter)
  app.use('/api/event-types', eventTypesRouter)

  return app
}

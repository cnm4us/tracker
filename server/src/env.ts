import 'dotenv/config'

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  // API server port (separate from Vite dev port 3400)
  port: Number(process.env.API_PORT || 3401),
  appOrigin: process.env.APP_ORIGIN || process.env.PUBLIC_URL || 'http://localhost:3400',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'tracker',
  },

  // Session lifetimes
  accessTtlSec: Number(process.env.ACCESS_TTL_SEC || 15 * 60), // 15m
  refreshTtlSec: Number(process.env.REFRESH_TTL_SEC || 90 * 24 * 60 * 60), // 90d
}


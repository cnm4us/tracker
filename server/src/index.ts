import { createApp } from './app'
import { env } from './env'

const app = createApp()

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://127.0.0.1:${env.port}`)
})


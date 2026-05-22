import { cors } from './bakong-lib.mjs'
import { runtimeConfigJs } from './runtime-config.mjs'

/**
 * Serves production config from Vercel env vars (or local .env via server.mjs).
 * Loaded before standalone/bakong.config.js in index.html and boot.js.
 */
export default function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).setHeader('Content-Type', 'text/plain')
    res.end('Method not allowed')
    return
  }

  cors(res)
  res.status(200).setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(runtimeConfigJs())
}

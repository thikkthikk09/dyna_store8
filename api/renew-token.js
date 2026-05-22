import { cors, readJsonBody, renewJwt, sendJson } from './bakong-lib.mjs'

/** POST /api/renew-token — browser-safe JWT renew (same as local server.mjs). */
export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const body = await readJsonBody(req)
  const email = String(body.email || process.env.BAKONG_EMAIL || '').trim()
  if (!email) return sendJson(res, 400, { error: 'email required' })

  const rbk = String(body.token || process.env.BAKONG_REGISTER_TOKEN || '').trim()

  try {
    const data = await renewJwt(
      email,
      body.organization || process.env.BAKONG_ORG,
      body.project || process.env.BAKONG_PROJECT,
      rbk,
    )
    return sendJson(res, 200, data)
  } catch (err) {
    return sendJson(res, 502, { error: String(err.message) })
  }
}

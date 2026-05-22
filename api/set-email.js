import {
  cors,
  ensureServerJwtAvailable,
  jwtStillValid,
  readJsonBody,
  renewJwt,
  sendJson,
} from './bakong-lib.mjs'

/** POST /api/set-email — warm server JWT (body: { email?, forceRenew? }). */
export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const body = await readJsonBody(req)
  const email = String(body.email || process.env.BAKONG_EMAIL || '').trim()
  if (!email) {
    return sendJson(res, 400, {
      error: 'email required (body or BAKONG_EMAIL env on Vercel)',
    })
  }

  const force = Boolean(body.forceRenew)
  let token = await ensureServerJwtAvailable(body.token)

  if (!force && jwtStillValid(token)) {
    return sendJson(res, 200, {
      ok: true,
      hasJwt: true,
      token,
      renewed: false,
      cached: true,
    })
  }

  try {
    const data = await renewJwt(
      email,
      body.organization || process.env.BAKONG_ORG,
      body.project || process.env.BAKONG_PROJECT,
      body.token,
    )
    const jwt =
      data.responseCode === 0 && data.data?.token ? data.data.token : await ensureServerJwtAvailable()
    const hasJwt = String(jwt).startsWith('eyJ')
    return sendJson(res, 200, {
      ok: hasJwt,
      hasJwt,
      token: hasJwt ? jwt : null,
      renewed: data.responseCode === 0,
      message: hasJwt ? 'ready' : data.responseMessage || 'Renew failed',
    })
  } catch (err) {
    return sendJson(res, 502, { error: String(err.message) })
  }
}

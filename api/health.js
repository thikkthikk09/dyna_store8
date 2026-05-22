import { cors, ensureServerJwtAvailable, sendJson } from './bakong-lib.mjs'
import { paymentFunctionConfig } from './payment-handler.mjs'

export const config = paymentFunctionConfig

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })

  const jwt = await ensureServerJwtAvailable()
  const hasJwt = jwt.startsWith('eyJ')
  const site =
    process.env.DYNA_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

  return sendJson(res, 200, {
    ok: true,
    hasToken: hasJwt,
    hasJwt,
    email: process.env.BAKONG_EMAIL || null,
    hosted: true,
    runtime: 'vercel-serverless',
    siteUrl: site,
    paymentRoutes: {
      checkMd5: '/api/check-md5',
      webhook: '/api/webhook',
      paymentCheck: '/api/payment/check',
    },
    hint: hasJwt
      ? null
      : 'Set BAKONG_TOKEN on Vercel, or BAKONG_EMAIL + BAKONG_REGISTER_TOKEN',
  })
}

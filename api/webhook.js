import { handlePaymentVerify, paymentFunctionConfig } from './payment-handler.mjs'

export const config = paymentFunctionConfig

/**
 * Payment gateway callback (server-to-server or redirect).
 * POST /api/webhook  body: { md5, amount?, token? }
 * GET  /api/webhook?md5=...  (simple gateways)
 */
export default async function handler(req, res) {
  return handlePaymentVerify(req, res, { allowGet: true })
}
